// Template simplificado de sync Supabase para app Electron/Node.
// Ajuste TABLES, dataDir e metodos de leitura/escrita conforme cada app.

const fs = require('fs');
const path = require('path');
const https = require('https');

module.exports = function setupSupabaseSync({ app, ipcMain, tables, tablePrefix }) {
  const TABLES = Array.isArray(tables) ? tables : [];
  const TABLE_PREFIX = tablePrefix || 'app_';
  let cfg = null;
  let timer = null;

  function cfgPath() {
    return path.join(app.getPath('userData'), 'cloud_supabase.json');
  }

  function loadCfg() {
    if (cfg) return cfg;
    try { cfg = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); }
    catch (_) { cfg = {}; }
    return cfg;
  }

  function saveConnection(url, anonKey, ownerEmail) {
    cfg = {
      url: String(url || '').replace(/\/+$/, ''),
      anon_key: String(anonKey || ''),
      owner_email: String(ownerEmail || ''),
      connected_at: new Date().toISOString(),
    };
    fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2), 'utf8');
    return cfg;
  }

  function connected() {
    const c = loadCfg();
    return Boolean(c.url && c.anon_key);
  }

  function request(method, table, { query = '', body = null } = {}) {
    const c = loadCfg();
    return new Promise((resolve, reject) => {
      const u = new URL(`${c.url}/rest/v1/${TABLE_PREFIX}${table}${query}`);
      const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
      const headers = {
        apikey: c.anon_key,
        authorization: `Bearer ${c.anon_key}`,
        'content-type': 'application/json',
        accept: 'application/json',
      };
      if (payload) headers['content-length'] = payload.length;
      const req = https.request(u, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Supabase HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
            return;
          }
          try { resolve(raw ? JSON.parse(raw) : null); }
          catch (_) { resolve(null); }
        });
      });
      req.on('error', reject);
      req.setTimeout(20000, () => req.destroy(new Error('timeout')));
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function syncNow() {
    if (!connected()) return { ok: false, skipped: true };
    // Implementar push/pull por tabela no app real.
    return { ok: true, tables: TABLES.length };
  }

  function start() {
    stop();
    if (!connected()) return;
    syncNow();
    timer = setInterval(syncNow, 5000);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  ipcMain.handle('cloud:state', () => {
    const c = loadCfg();
    return { connected: connected(), url: c.url || '', owner_email: c.owner_email || '', connected_at: c.connected_at || '' };
  });
  ipcMain.handle('cloud:save-connection', (_e, data) => {
    saveConnection(data.url, data.anon_key, data.owner_email);
    start();
    return { ok: true };
  });
  ipcMain.handle('cloud:sync-now', syncNow);

  return { start, stop, connected, syncNow, saveConnection };
};
