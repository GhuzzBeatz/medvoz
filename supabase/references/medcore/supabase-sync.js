// MedCore Cloud Supabase Cliente — motor de sincronizacao.
// Sincroniza os arquivos JSON locais (mesmos do db.js) com o Supabase DO CLIENTE,
// usando so a chave publica (anon) + tabelas mc_* (RLS liberado pra anon).
// Nunca contem service_role. A conexao (url + anon) vem do assistente "Conectar Supabase".
const fs = require('fs')
const path = require('path')
const https = require('https')

module.exports = function setupSupabaseSync({ app, ipcMain }) {
  const TABLES = [
    // núcleo clínico já existente
    'config', 'usuarios', 'medicos', 'pacientes', 'agenda', 'prontuarios',
    'asos', 'financeiro', 'estoque', 'medicamentos', 'exames_banco',
    'solicitacoes_exames', 'receituarios_salvos', 'locais',
    // núcleo ocupacional (SST) — fundação nova
    'empresas', 'funcionarios', 'cargos', 'riscos', 'cargo_riscos',
    'risco_exames', 'exames_periodicos', 'convocacoes', 'anexos',
    'pcmso', 'esocial_eventos',
    // cadastros auxiliares (estrutura organizacional)
    'setores', 'unidades', 'convenios',
  ]
  const SYNC_META = ['_row_id', '_updated_at', '_deleted_at', '_version', '_source_client']
  const sync = {
    timer: null,
    running: false,
    pushSince: {},
    pullSince: {},
    last: {
      ok: null,
      at: '',
      message: '',
      pushed: 0,
      pulled: 0,
      reason: ''
    }
  }
  let cfg = null

  // ---- config da conexao (fica no userData; so url + anon) ----
  // O arquivo é criptografado com o cofre do SO (Electron safeStorage / DPAPI no
  // Windows), amarrado a este PC/usuário: se copiarem o arquivo pra outra máquina,
  // ele não abre. Fallback: se o SO não suportar cifra, grava em texto (como antes),
  // pra nunca deixar o app sem conectar. Retrocompatível: lê arquivos antigos em
  // texto e re-grava criptografado na primeira vez.
  const ENC_PREFIX = 'MCENC1:'
  function safeStore() { try { return require('electron').safeStorage } catch (_) { return null } }
  function cifraDisponivel() { const s = safeStore(); try { return !!(s && s.isEncryptionAvailable && s.isEncryptionAvailable()) } catch (_) { return false } }
  function cfgPath() { return path.join(app.getPath('userData'), 'cloud_supabase.json') }
  function writeCfg(obj) {
    const plano = JSON.stringify(obj || {}, null, 2)
    try {
      if (cifraDisponivel()) {
        const enc = safeStore().encryptString(plano) // Buffer
        fs.writeFileSync(cfgPath(), ENC_PREFIX + enc.toString('base64'), 'utf8')
        return
      }
    } catch (_) { /* cai pro texto abaixo */ }
    fs.writeFileSync(cfgPath(), plano, 'utf8')
  }
  function loadCfg() {
    if (cfg) return cfg
    let raw = ''
    try { raw = fs.readFileSync(cfgPath(), 'utf8') } catch (_) { cfg = {}; return cfg }
    if (raw && raw.startsWith(ENC_PREFIX)) {
      // arquivo criptografado
      try {
        const buf = Buffer.from(raw.slice(ENC_PREFIX.length), 'base64')
        cfg = JSON.parse(safeStore().decryptString(buf))
      } catch (_) { cfg = {} }
      return cfg
    }
    // arquivo antigo em texto -> lê e re-grava criptografado (migração automática)
    try { cfg = JSON.parse(raw) } catch (_) { cfg = {} }
    if (cfg && cfg.url && cifraDisponivel()) { try { writeCfg(cfg) } catch (_) {} }
    return cfg
  }
  function saveConnection(url, anonKey, ownerEmail) {
    // guarda so URL + anon (chave publica) + e-mail do login (pra suporte). NUNCA guarda secret.
    cfg = {
      url: String(url || '').replace(/\/+$/, ''),
      anon_key: String(anonKey || ''),
      owner_email: String(ownerEmail || ''),
      connected_at: new Date().toISOString(),
    }
    writeCfg(cfg)
    return cfg
  }
  function disconnect() { try { fs.unlinkSync(cfgPath()) } catch (_) {} cfg = null; stop() }
  function connected() { const c = loadCfg(); return !!(c && c.url && c.anon_key) }
  function deviceId() { return String(process.env.MEDCORE_DEVICE_ID || 'pc').slice(0, 40) }

  // ---- arquivos locais (mesmos do db.js) ----
  function dataDir() { return String(process.env.MEDCORE_DATA_DIR || '').trim() || path.join(app.getPath('userData'), 'data') }
  function tableFile(t) { return path.join(dataDir(), `${t}.json`) }
  function readArray(t) { try { const a = JSON.parse(fs.readFileSync(tableFile(t), 'utf8')); return Array.isArray(a) ? a : [] } catch (_) { return [] } }
  function readConfigObj() { try { const o = JSON.parse(fs.readFileSync(tableFile('config'), 'utf8')); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {} } catch (_) { return {} } }
  function writeArray(t, arr) { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(tableFile(t), JSON.stringify(arr, null, 2), 'utf8') } catch (_) {} }
  function writeConfigObj(o) { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(tableFile('config'), JSON.stringify(o, null, 2), 'utf8') } catch (_) {} }

  function recordSyncResult(result) {
    const r = result || {}
    sync.last = {
      ok: r.ok === true,
      at: new Date().toISOString(),
      message: r.message ? String(r.message).slice(0, 300) : (r.ok ? 'Sincronizacao concluida.' : 'Sincronizacao nao concluida.'),
      pushed: Number(r.pushed || 0),
      pulled: Number(r.pulled || 0),
      reason: String(r.reason || '')
    }
    return result
  }

  function tableCounts() {
    const counts = {}
    for (const t of TABLES) {
      if (t === 'config') {
        counts[t] = Object.keys(readConfigObj()).length
      } else {
        counts[t] = readArray(t).filter((r) => !r || !r._deleted_at).length
      }
    }
    return counts
  }

  function diagnostics() {
    const c = loadCfg()
    return {
      connected: connected(),
      running: !!sync.running,
      url: c.url || '',
      owner_email: c.owner_email || '',
      connected_at: c.connected_at || '',
      last_sync_at: sync.last.at || '',
      last_sync_ok: sync.last.ok,
      last_sync_message: sync.last.message || '',
      last_pushed: sync.last.pushed || 0,
      last_pulled: sync.last.pulled || 0,
      license_limit_devices: 5,
      data_tables: tableCounts()
    }
  }

  function stripMeta(row) { const o = { ...row }; SYNC_META.forEach(k => delete o[k]); return o }
  function stripConfigMeta(c) { const o = { ...c }; delete o.__sync_updated_at; delete o.__sync_version; delete o.__sync_deleted_at; return o }
  function isNewer(inUpd, inVer, curUpd, curVer) {
    const iv = Number(inVer || 1), cv = Number(curVer || 1)
    if (iv !== cv) return iv > cv
    return String(inUpd || '') >= String(curUpd || '')
  }

  // ---- REST do Supabase (anon) ----
  function rest(method, table, { query = '', body = null, prefer = '' } = {}) {
    const c = loadCfg()
    return new Promise((resolve, reject) => {
      if (!c.url || !c.anon_key) { reject(new Error('nao conectado')); return }
      let u
      try { u = new URL(`${c.url}/rest/v1/${table}${query}`) } catch (e) { reject(new Error('url invalida')); return }
      const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
      const headers = {
        apikey: c.anon_key,
        authorization: `Bearer ${c.anon_key}`,
        'content-type': 'application/json',
        accept: 'application/json',
      }
      if (prefer) headers.prefer = prefer
      if (payload) headers['content-length'] = payload.length
      const req = https.request(u, { method, headers }, (res) => {
        const chunks = []
        res.on('data', (d) => chunks.push(d))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`)
            err.status = res.statusCode
            reject(err); return
          }
          let json = null
          try { json = raw ? JSON.parse(raw) : null } catch (_) {}
          resolve(json)
        })
      })
      req.on('error', reject)
      req.setTimeout(20000, () => req.destroy(new Error('tempo limite ao falar com o Supabase')))
      if (payload) req.write(payload)
      req.end()
    })
  }

  // ---- PUSH: linhas locais mudadas -> mc_<t> (upsert por row_id) ----
  function rowsToPushForTable(t) {
    const since = sync.pushSince[t] || ''
    const out = []
    if (t === 'config') {
      const c = readConfigObj()
      const upd = String(c.__sync_updated_at || '')
      if (upd && upd > since) out.push({ row_id: '__config__', record: stripConfigMeta(c), updated_at: upd, deleted_at: c.__sync_deleted_at || null, version: Number(c.__sync_version || 1), source_client: deviceId() })
      return out
    }
    for (const r of readArray(t)) {
      const upd = String(r._updated_at || '')
      if (upd && r._row_id && upd > since) out.push({ row_id: String(r._row_id), record: stripMeta(r), updated_at: upd, deleted_at: r._deleted_at || null, version: Number(r._version || 1), source_client: r._source_client || deviceId() })
    }
    return out
  }

  async function pushTable(t) {
    const rows = rowsToPushForTable(t)
    if (!rows.length) return 0
    await rest('POST', `mc_${t}`, { body: rows, prefer: 'resolution=merge-duplicates,return=minimal' })
    for (const r of rows) { const u = String(r.updated_at || ''); if (u && (!sync.pushSince[t] || u > sync.pushSince[t])) sync.pushSince[t] = u }
    return rows.length
  }

  // ---- PULL: mc_<t> mudadas desde o ultimo pull -> arquivos locais ----
  async function pullTable(t) {
    const since = sync.pullSince[t] || ''
    const q = since
      ? `?select=row_id,record,updated_at,deleted_at,version,source_client&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`
      : `?select=row_id,record,updated_at,deleted_at,version,source_client&order=updated_at.asc`
    const rows = await rest('GET', `mc_${t}`, { query: q })
    if (!Array.isArray(rows) || !rows.length) return 0
    let applied = 0
    if (t === 'config') {
      const inc = rows[rows.length - 1]
      const cur = readConfigObj()
      if (isNewer(inc.updated_at, inc.version, cur.__sync_updated_at, cur.__sync_version)) {
        const merged = { ...(inc.record || {}) }
        merged.__sync_updated_at = inc.updated_at
        merged.__sync_version = Number(inc.version || 1)
        merged.__sync_deleted_at = inc.deleted_at || null
        writeConfigObj(merged)
        applied++
      }
      for (const inc2 of rows) { if (!sync.pullSince[t] || inc2.updated_at > sync.pullSince[t]) sync.pullSince[t] = inc2.updated_at }
      return applied
    }
    const list = readArray(t)
    const idxById = new Map()
    list.forEach((row, i) => idxById.set(String(row._row_id), i))
    for (const inc of rows) {
      const rid = String(inc.row_id)
      const built = { ...(inc.record || {}), _row_id: rid, _updated_at: inc.updated_at, _deleted_at: inc.deleted_at || null, _version: Number(inc.version || 1), _source_client: inc.source_client || '' }
      if (idxById.has(rid)) {
        const cur = list[idxById.get(rid)]
        if (isNewer(inc.updated_at, inc.version, cur._updated_at, cur._version)) list[idxById.get(rid)] = built
      } else {
        list.push(built); idxById.set(rid, list.length - 1)
      }
      if (!sync.pullSince[t] || inc.updated_at > sync.pullSince[t]) sync.pullSince[t] = inc.updated_at
      applied++
    }
    writeArray(t, list)
    return applied
  }

  // tabela ainda nao provisionada no Supabase do cliente (ex.: schema novo antes
  // de reconectar) -> pular essa tabela e continuar, sem travar o sync todo.
  function tabelaFaltando_(e) {
    const s = e && e.status
    const m = String(e && e.message || '')
    return s === 404 || /does not exist|42P01|not found|could not find the table|PGRST205|PGRST202/i.test(m)
  }

  async function cycle(reason) {
    if (sync.running || !connected()) return { ok: false, skipped: true }
    sync.running = true
    let pushed = 0, pulled = 0
    try {
      for (const t of TABLES) { try { pushed += await pushTable(t) } catch (e) { if (tabelaFaltando_(e)) continue; return recordSyncResult({ ok: false, code: 'offline', message: String(e && e.message || e), reason: reason || 'auto' }) } }
      for (const t of TABLES) { try { pulled += await pullTable(t) } catch (e) { if (tabelaFaltando_(e)) continue; return recordSyncResult({ ok: false, code: 'offline', message: String(e && e.message || e), reason: reason || 'auto' }) } }
      return recordSyncResult({ ok: true, pushed, pulled, reason: reason || 'auto' })
    } finally { sync.running = false }
  }

  function start() {
    stop()
    if (!connected()) return
    cycle('start')
    sync.timer = setInterval(() => cycle('interval'), 4000)
  }
  function stop() { if (sync.timer) clearInterval(sync.timer); sync.timer = null }

  // sincroniza uma vez ja (ex.: quando o renderer avisa que mudou algo)
  let debounce = null
  function notifyChanged() { if (!connected()) return; clearTimeout(debounce); debounce = setTimeout(() => cycle('change'), 600) }

  // ---- IPC ----
  ipcMain.handle('cloud:state', () => { const c = loadCfg(); return { connected: connected(), url: c.url || '', owner_email: c.owner_email || '', connected_at: c.connected_at || '' } })
  ipcMain.handle('cloud:save-connection', (_e, { url, anon_key, owner_email }) => { saveConnection(url, anon_key, owner_email); start(); return { ok: true } })
  ipcMain.handle('cloud:sync-now', async () => cycle('manual'))
  ipcMain.handle('cloud:diagnostics', () => diagnostics())
  ipcMain.handle('cloud:disconnect', () => { disconnect(); return { ok: true } })
  ipcMain.on('cloud:notify-changed', () => notifyChanged())

  return { start, stop, connected, saveConnection, disconnect, cycle, notifyChanged, cfgPath, diagnostics }
}
