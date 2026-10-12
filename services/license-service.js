function createLicenseService({ app, appId, licenseApiUrl, dataDir, crypto, fs, os, requestJson }) {
  let sessionAuthorized = false

  function ensureDataDir() {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  function machineGuid() {
    try {
      if (process.platform !== 'win32') return ''
      const cp = require('child_process')
      const out = cp.execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf8',
        windowsHide: true
      })
      const match = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)
      return match ? match[1].trim() : ''
    } catch (error) {
      return ''
    }
  }

  function getDeviceInfo() {
    let username = ''
    try { username = os.userInfo().username } catch (error) {}
    const base = [machineGuid(), os.hostname(), username, os.platform(), os.arch()].join('|')
    return {
      device_hash: crypto.createHash('sha256').update(`ghz-license-v1|${base}`).digest('hex'),
      device_name: os.hostname(),
      device_os: `${os.type()} ${os.release()} ${os.arch()}`,
      app_version: app.getVersion()
    }
  }

  function statePath() {
    return `${dataDir}/license-state.json`
  }

  function readState() {
    try {
      ensureDataDir()
      return JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    } catch (error) {
      return {
        active: false,
        license_key: '',
        customer_name: '',
        last_error: '',
        validated_at: ''
      }
    }
  }

  function saveState(state) {
    ensureDataDir()
    const next = { ...readState(), ...state }
    fs.writeFileSync(statePath(), JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  function publicState(state = readState()) {
    return {
      active: Boolean(state.active),
      customer_name: state.customer_name || '',
      license_last4: state.license_key ? String(state.license_key).slice(-4) : '',
      last_error: state.last_error || '',
      validated_at: state.validated_at || ''
    }
  }

  async function licenseRequest(action, payload = {}) {
    const url = new URL(licenseApiUrl)
    url.searchParams.set('action', action)
    return requestJson(url.toString(), payload)
  }

  async function activate(payload = {}) {
    const licenseKey = String(payload.license_key || payload || '').trim().toUpperCase()
    if (!licenseKey) return { ok: false, code: 'missing_license', message: 'Informe a chave de licenca.' }

    const device = getDeviceInfo()
    const result = await licenseRequest('activate', {
      p_app_id: appId,
      p_license_key: licenseKey,
      p_device_hash: device.device_hash,
      p_device_name: device.device_name,
      p_device_os: device.device_os,
      p_app_version: device.app_version,
      p_customer_phone: String(payload.phone || '')
    })

    if (!result?.ok) {
      sessionAuthorized = false
      saveState({ active: false, license_key: licenseKey, last_error: result?.message || 'Licenca invalida.' })
      return result || { ok: false, message: 'Licenca invalida.' }
    }

    const saved = saveState({
      active: true,
      license_key: licenseKey,
      customer_name: result.customer_name || result.client_name || '',
      last_error: '',
      validated_at: new Date().toISOString()
    })
    sessionAuthorized = true
    return { ...result, ...publicState(saved), source: 'online' }
  }

  async function validate() {
    const state = readState()
    const licenseKey = String(state.license_key || '').trim().toUpperCase()
    if (!licenseKey) {
      sessionAuthorized = false
      return { ok: false, code: 'missing_license', message: 'Licenca nao ativada.' }
    }

    const device = getDeviceInfo()
    const result = await licenseRequest('validate', {
      p_app_id: appId,
      p_license_key: licenseKey,
      p_device_hash: device.device_hash,
      p_device_name: device.device_name,
      p_device_os: device.device_os,
      p_app_version: device.app_version
    })

    if (!result?.ok) {
      sessionAuthorized = false
      saveState({ active: false, last_error: result?.message || 'Licenca invalida ou sem internet.' })
      return result || { ok: false, message: 'Licenca invalida ou sem internet.' }
    }

    const saved = saveState({
      active: true,
      customer_name: result.customer_name || state.customer_name || '',
      last_error: '',
      validated_at: new Date().toISOString()
    })
    sessionAuthorized = true
    return { ...result, ...publicState(saved), source: 'online' }
  }

  function getPublicDeviceInfo() {
    const device = getDeviceInfo()
    return {
      device_hash_preview: device.device_hash.slice(0, 12),
      device_name: device.device_name,
      device_os: device.device_os
    }
  }

  function getAiAuthPayload() {
    const state = readState()
    const device = getDeviceInfo()
    return {
      license_key: String(state.license_key || '').trim().toUpperCase(),
      device_hash: device.device_hash,
      device_name: device.device_name,
      device_os: device.device_os,
      app_version: device.app_version
    }
  }

  return {
    activate,
    validate,
    readState: () => publicState(),
    getPublicDeviceInfo,
    getAiAuthPayload,
    isSessionAuthorized: () => sessionAuthorized
  }
}

module.exports = { createLicenseService }
