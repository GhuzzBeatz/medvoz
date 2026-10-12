const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const APP_ID = 'mesaup'
const APP_NAME = 'MESAUP'
const DEFAULT_BROKER_URL = 'https://wpkaaxarresldcstaatj.supabase.co/functions/v1/mesaup-client-cloud'
const BROKER_URL = (process.env.MESAUP_CLIENT_CLOUD_BROKER || DEFAULT_BROKER_URL).replace(/\/+$/, '')

const TABLES = [
  { local: 'config', remote: 'mu_config', type: 'object' },
  { local: 'mesas', remote: 'mu_mesas', type: 'array' },
  { local: 'comandas', remote: 'mu_comandas', type: 'array' },
  { local: 'estoque', remote: 'mu_produtos', type: 'array' },
  { local: 'clientes', remote: 'mu_clientes', type: 'array' },
  { local: 'contas_clientes', remote: 'mu_contas_clientes', type: 'array' },
  { local: 'garcons', remote: 'mu_garcons', type: 'array' },
  { local: 'financeiro', remote: 'mu_financeiro', type: 'array' },
  { local: 'fornecedores', remote: 'mu_fornecedores', type: 'array' },
  { local: 'pedidos_delivery', remote: 'mu_pedidos_delivery', type: 'array' },
  { local: 'pedidos_mesa', remote: 'mu_pedidos_mesa', type: 'array' },
  { local: 'caixas', remote: 'mu_caixas', type: 'array' },
  { local: 'vendas', remote: 'mu_vendas', type: 'array' },
  { local: 'auditoria', remote: 'mu_auditoria', type: 'array' }
]

const EXPECTED_TABLES = TABLES.map(t => t.remote)

function gerarSqlClienteCloud() {
  return `-- ${APP_NAME} - estrutura inicial para Supabase do cliente
-- Este SQL deve ser executado pelo broker/Edge Function com permissao de dono do projeto.
-- O app cliente nunca recebe chave administrativa, senha do banco ou token privado.

create extension if not exists pgcrypto;

${EXPECTED_TABLES.map(table => `create table if not exists public.${table} (
  row_id text primary key,
  license_hash text not null,
  org_id text not null,
  project_ref text not null,
  record jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  source_client text,
  created_at timestamptz not null default now()
);

alter table public.${table} enable row level security;
${table === 'mu_produtos' ? `alter table public.${table} add column if not exists opcoes_produto jsonb not null default '{}'::jsonb;` : ''}
create index if not exists idx_${table}_license_updated on public.${table}(license_hash, updated_at);

drop policy if exists "${table}_anon_select" on public.${table};
drop policy if exists "${table}_anon_insert" on public.${table};
drop policy if exists "${table}_anon_update" on public.${table};
drop policy if exists "${table}_anon_delete" on public.${table};
drop policy if exists "${table}_anon_all" on public.${table};

create policy "${table}_anon_all" on public.${table} for all to anon using (license_hash is not null) with check (license_hash is not null);

grant select, insert, update, delete on public.${table} to anon;
grant select, insert, update, delete on public.${table} to authenticated;`).join('\n\n')}
`
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text) } catch (_) { return fallback }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function getStatePath(app) {
  return path.join(app.getPath('userData'), 'mesaup_client_cloud.json')
}

function readState(app) {
  const file = getStatePath(app)
  const state = fs.existsSync(file) ? safeJsonParse(fs.readFileSync(file, 'utf8'), {}) : {}
  if (!state.device_id) state.device_id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  return state
}

function writeState(app, state) {
  const file = getStatePath(app)
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  return state
}

function publicState(state) {
  return {
    enabled: !!state.enabled,
    connected: !!(state.enabled && state.project_url && state.anon_key && state.license_hash && state.org_id),
    status: state.status || 'desconectado',
    owner_email: state.owner_email || state.org_name || '',
    org_id: state.org_id || '',
    org_name: state.org_name || state.owner_email || '',
    project_ref: state.project_ref || '',
    project_url: state.project_url || '',
    license_bound: !!state.license_hash,
    last_sync: state.last_sync || '',
    last_error: state.last_error || '',
    broker_url: BROKER_URL,
    pending: !!state.oauth_state
  }
}

function requestJson(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        const json = safeJsonParse(data, null)
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg = json?.error || json?.message || data || `HTTP ${res.statusCode}`
          reject(new Error(msg))
          return
        }
        resolve(json || {})
      })
    })
    req.on('error', reject)
    req.setTimeout(25000, () => req.destroy(new Error('Tempo limite ao conectar na nuvem do cliente.')))
    if (body) req.write(body)
    req.end()
  })
}

function readLocalFile(dataDir, name, fallback) {
  const file = path.join(dataDir, `${name}.json`)
  if (!fs.existsSync(file)) return fallback
  return safeJsonParse(fs.readFileSync(file, 'utf8'), fallback)
}

function writeLocalFile(dataDir, name, value) {
  ensureDir(dataDir)
  fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value, null, 2), 'utf8')
}

function rowIdFor(item, index, localName) {
  const id = item?.id || item?.codigo || item?.numero || item?.nome || item?.created_at || item?.data
  return String(id ? id : `${localName}-${index + 1}`)
}

function rowsFromLocal(dataDir, table, sourceClient) {
  const data = readLocalFile(dataDir, table.local, table.type === 'array' ? [] : {})
  const meta = sourceClient && typeof sourceClient === 'object' ? sourceClient : { device_id: String(sourceClient || '') }
  const base = {
    license_hash: meta.license_hash || '',
    org_id: meta.org_id || '',
    project_ref: meta.project_ref || '',
    source_client: meta.device_id || ''
  }
  if (table.type === 'object') {
    return [{ row_id: table.local, record: data || {}, updated_at: new Date().toISOString(), ...base }]
  }
  const list = Array.isArray(data) ? data : []
  return list.map((item, index) => ({
    row_id: rowIdFor(item, index, table.local),
    record: item || {},
    updated_at: item?.updated_at || item?.data_atualizacao || item?.created_at || new Date().toISOString(),
    ...base
  }))
}

async function upsertRows(state, table, rows) {
  if (!rows.length) return { table: table.remote, count: 0 }
  const url = `${String(state.project_url).replace(/\/+$/, '')}/rest/v1/${table.remote}`
  await requestJson(url, {
    method: 'POST',
    headers: {
      apikey: state.anon_key,
      Authorization: `Bearer ${state.anon_key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }
  }, JSON.stringify(rows))
  return { table: table.remote, count: rows.length }
}

function hasLocalData(dataDir) {
  return TABLES.some(table => {
    const data = readLocalFile(dataDir, table.local, table.type === 'array' ? [] : {})
    return table.type === 'array'
      ? Array.isArray(data) && data.length > 0
      : data && typeof data === 'object' && Object.keys(data).length > 0
  })
}

async function fetchCloudRows(state, table) {
  const base = String(state.project_url).replace(/\/+$/, '')
  const params = new URLSearchParams({
    select: 'row_id,record,updated_at',
    license_hash: `eq.${state.license_hash}`,
    org_id: `eq.${state.org_id}`,
    project_ref: `eq.${state.project_ref}`
  })
  const url = `${base}/rest/v1/${table.remote}?${params.toString()}`
  const rows = await requestJson(url, {
    method: 'GET',
    headers: {
      apikey: state.anon_key,
      Authorization: `Bearer ${state.anon_key}`,
      Accept: 'application/json'
    }
  })
  return Array.isArray(rows) ? rows : []
}

async function syncCloudToLocal(app, getDataDir) {
  const state = readState(app)
  if (!state.enabled || !state.project_url || !state.anon_key || !state.license_hash || !state.org_id || !state.project_ref) {
    return { ok: false, mensagem: 'Nuvem do cliente ainda nao conectada.' }
  }
  const dataDir = getDataDir()
  const summary = []
  for (const table of TABLES) {
    const rows = await fetchCloudRows(state, table)
    if (table.type === 'object') {
      const local = readLocalFile(dataDir, table.local, {})
      const remote = rows[0]?.record && typeof rows[0].record === 'object' ? rows[0].record : {}
      writeLocalFile(dataDir, table.local, { ...remote, ...local })
      summary.push({ table: table.remote, count: rows.length })
      continue
    }

    const localList = readLocalFile(dataDir, table.local, [])
    const merged = new Map()
    rows.forEach(row => {
      if (row?.record && typeof row.record === 'object') merged.set(String(row.row_id || row.record.id || merged.size + 1), row.record)
    })
    ;(Array.isArray(localList) ? localList : []).forEach((item, index) => {
      merged.set(rowIdFor(item, index, table.local), item)
    })
    writeLocalFile(dataDir, table.local, Array.from(merged.values()))
    summary.push({ table: table.remote, count: rows.length })
  }
  state.last_sync = new Date().toISOString()
  state.last_error = ''
  writeState(app, state)
  return { ok: true, mensagem: 'Dados da nuvem mesclados com este computador sem apagar dados locais.', summary }
}

async function syncBothDirections(app, getDataDir) {
  const dataDir = getDataDir()
  if (hasLocalData(dataDir)) {
    await syncCloudToLocal(app, getDataDir).catch(() => null)
    return syncLocalToCloud(app, getDataDir)
  }
  await syncCloudToLocal(app, getDataDir)
  return syncLocalToCloud(app, getDataDir)
}

async function syncLocalToCloud(app, getDataDir) {
  const state = readState(app)
  if (!state.enabled || !state.project_url || !state.anon_key || !state.license_hash || !state.org_id || !state.project_ref) {
    return { ok: false, mensagem: 'Nuvem do cliente ainda nao conectada.' }
  }

  const dataDir = getDataDir()
  const summary = []
  const errors = []
  const source = {
    device_id: state.device_id,
    license_hash: state.license_hash,
    org_id: state.org_id,
    project_ref: state.project_ref
  }
  for (const table of TABLES) {
    try {
      const rows = rowsFromLocal(dataDir, table, source)
      summary.push(await upsertRows(state, table, rows))
    } catch (err) {
      errors.push({ table: table.remote, message: err.message })
      summary.push({ table: table.remote, count: 0, error: err.message })
    }
  }
  state.last_sync = new Date().toISOString()
  state.status = errors.length ? 'sincronizado_com_alerta' : 'sincronizado'
  state.last_error = errors.map(e => `${e.table}: ${e.message}`).join(' | ')
  writeState(app, state)
  if (errors.length) {
    return {
      ok: false,
      mensagem: 'Sincronizacao parcial: alguns dados foram enviados, mas uma ou mais tabelas retornaram erro.',
      summary,
      errors
    }
  }
  return { ok: true, mensagem: 'Dados locais sincronizados com a nuvem do cliente.', summary }
}

function setupClientCloud({ app, ipcMain, shell, getDataDir, appId = APP_ID, getLicensePayload = () => ({}) } = {}) {
  if (!app || !ipcMain || !shell || !getDataDir) throw new Error('client-cloud precisa de app, ipcMain, shell e getDataDir.')

  ipcMain.handle('client-cloud:state', async () => publicState(writeState(app, readState(app))))

  ipcMain.handle('client-cloud:start-oauth', async (event, payload = {}) => {
    const state = readState(app)
    const license = { ...(getLicensePayload() || {}) }
    if (payload && typeof payload === 'object' && payload.license_key) {
      license.license_key = String(payload.license_key || '').trim().toUpperCase()
    }
    if (!license.license_key || !license.device_hash) {
      state.status = 'licenca_necessaria'
      state.last_error = 'Valide a licenca do MesaUp antes de conectar o Supabase.'
      writeState(app, state)
      return publicState(state)
    }

    state.oauth_state = crypto.randomBytes(18).toString('hex')
    state.status = 'aguardando_login'
    state.last_error = ''
    writeState(app, state)

    const startUrl = `${BROKER_URL}/start`
    const result = await requestJson(startUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      app: appId,
      state: state.oauth_state,
      device_id: state.device_id,
      license
    }))
    const url = result.authorization_url || `${BROKER_URL}/start?app=${encodeURIComponent(appId)}&state=${encodeURIComponent(state.oauth_state)}&device_id=${encodeURIComponent(state.device_id)}`
    await shell.openExternal(url)
    return publicState(state)
  })

  ipcMain.handle('client-cloud:poll', async () => {
    const state = readState(app)
    if (!state.oauth_state) return publicState(state)

    try {
      const url = `${BROKER_URL}/provision?app=${encodeURIComponent(appId)}&state=${encodeURIComponent(state.oauth_state)}&device_id=${encodeURIComponent(state.device_id)}`
      const result = await requestJson(url)
      state.status = result.status || state.status || 'aguardando_login'
      if (result.error) {
        state.last_error = result.message || result.error
        state.status = 'erro_conexao'
        writeState(app, state)
        return publicState(state)
      }
      state.last_error = ''
      if (result.project_url && result.anon_key) {
        state.enabled = true
        state.project_url = result.project_url
        state.anon_key = result.anon_key
        state.owner_email = result.owner_email || result.org_name || ''
        state.org_id = result.org_id || ''
        state.org_name = result.org_name || result.owner_email || ''
        state.project_ref = result.project_ref || ''
        state.license_hash = result.license_hash || ''
        state.oauth_state = ''
        state.status = 'conectado'
        writeState(app, state)
        await syncBothDirections(app, getDataDir).catch(err => {
          state.last_error = err.message
          state.status = 'conectado_com_erro_sync'
          writeState(app, state)
        })
      } else {
        writeState(app, state)
      }
      return publicState(readState(app))
    } catch (err) {
      state.last_error = err.message
      state.status = 'erro_conexao'
      writeState(app, state)
      return publicState(state)
    }
  })

  ipcMain.handle('client-cloud:sync-now', async () => syncBothDirections(app, getDataDir))

  ipcMain.handle('client-cloud:disconnect', async () => {
    const state = readState(app)
    const fresh = { device_id: state.device_id, enabled: false, status: 'desconectado', last_sync: state.last_sync || '' }
    writeState(app, fresh)
    return publicState(fresh)
  })

  return { getState: () => publicState(readState(app)), syncNow: () => syncLocalToCloud(app, getDataDir) }
}

setupClientCloud.APP_ID = APP_ID
setupClientCloud.APP_NAME = APP_NAME
setupClientCloud.BROKER_URL = BROKER_URL
setupClientCloud.TABLES = TABLES
setupClientCloud.EXPECTED_TABLES = EXPECTED_TABLES
setupClientCloud.gerarSqlClienteCloud = gerarSqlClienteCloud
setupClientCloud.publicState = publicState
setupClientCloud.rowsFromLocal = rowsFromLocal
setupClientCloud.syncCloudToLocal = syncCloudToLocal

module.exports = setupClientCloud

