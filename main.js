const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const config = require('./app.config')
const { createLicenseService } = require('./services/license-service')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
let mainWindow = null
let licenseService = null
const appRootUrl = pathToFileURL(`${__dirname}${path.sep}`).href
const licensePageUrl = pathToFileURL(path.join(__dirname, 'pages', 'licenca.html')).href
const SUPPORT_URL = 'https://ghzplugin.com.br/suporte/'

if (!gotSingleInstanceLock) app.quit()

function getOpenAiStatus() {
  return {
    configured: Boolean(config.aiProxyUrl),
    mode: 'proxy',
    message: config.aiProxyUrl ? 'IA integrada pelo servidor GHZ.' : 'Servidor de IA nao configurado.'
  }
}

function requestJson(urlValue, payload, timeoutMs = 25000) {
  return new Promise((resolve) => {
    let url
    try {
      url = new URL(urlValue)
    } catch (error) {
      resolve({ ok: false, message: 'Endpoint invalido.' })
      return
    }

    const body = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null
    const client = url.protocol === 'http:' ? http : https
    const req = client.request(url, {
      method: body ? 'POST' : 'GET',
      headers: body
        ? {
            'content-type': 'application/json',
            'content-length': body.length,
            'user-agent': `${config.appId}-${app.getVersion()}`
          }
        : { 'user-agent': `${config.appId}-${app.getVersion()}` }
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        try {
          const data = raw ? JSON.parse(raw) : {}
          resolve(res.statusCode >= 200 && res.statusCode < 300 ? data : { ok: false, message: data.message || `HTTP ${res.statusCode}` })
        } catch (error) {
          resolve({ ok: false, message: 'Resposta invalida do servidor.' })
        }
      })
    })
    req.on('error', (error) => resolve({ ok: false, message: error.message || 'Falha de conexao.' }))
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Tempo limite de conexao.')))
    if (body) req.write(body)
    req.end()
  })
}

function isSupportUrl(url) {
  return /^https:\/\/wa\.me(?:\/|$)/i.test(String(url || '')) || String(url || '') === SUPPORT_URL
}

function isAllowedExternalUrl(url) {
  return isSupportUrl(url)
    || /^https:\/\/ghzplugin\.com\.br(?:\/|$)/i.test(String(url || ''))
    || /^https:\/\/wpkaaxarresldcstaatj\.supabase\.co\/functions\/v1\/ghz-app-downloads(?:\/|\?|$)/i.test(String(url || ''))
    || /^https:\/\/github\.com\/GhuzzBeatz\/medvoz(?:\/|$)/i.test(String(url || ''))
}

function isLicensePage(url) {
  return String(url || '') === licensePageUrl
}

function isAuthorizedPage(url) {
  if (!licenseService?.isSessionAuthorized()) return false
  return String(url || '').startsWith(appRootUrl)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    frame: false,
    show: false,
    backgroundColor: config.contentBackground,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLicensePage(url) || isAuthorizedPage(url)) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) shell.openExternal(url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.loadFile(path.join(__dirname, 'pages', 'licenca.html'))
}

function bytesToBase64(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || [])
  return buffer.toString('base64')
}

async function callMedVozAi(action, payload = {}, timeoutMs = 180000) {
  if (!config.aiProxyUrl) return { ok: false, code: 'missing_ai_proxy', message: 'Servidor de IA nao configurado.' }
  if (!licenseService?.isSessionAuthorized()) return { ok: false, code: 'license_invalid', message: 'Valide a licenca para usar a IA.' }

  const result = await requestJson(config.aiProxyUrl, {
    app: config.appId,
    app_version: app.getVersion(),
    action,
    license: licenseService.getAiAuthPayload(),
    payload
  }, timeoutMs)

  if (!result?.ok) {
    return {
      ok: false,
      code: result?.error || result?.code || 'ai_proxy_error',
      message: result?.message || 'Falha no servidor de IA.'
    }
  }
  return result
}

function normalizeClinicalContext(context = {}) {
  return {
    patientName: String(context.patientName || '').trim(),
    specialty: String(context.specialty || '').trim(),
    visitType: String(context.visitType || '').trim(),
    reason: String(context.reason || '').trim(),
    consent: Boolean(context.consent),
    mode: String(context.mode || '').trim()
  }
}

function assertClinicalIntake(context) {
  const normalized = normalizeClinicalContext(context)
  if (!normalized.consent) return { ok: false, message: 'Confirme o consentimento para gravar/transcrever.' }
  if (!normalized.specialty || !normalized.visitType || !normalized.reason) {
    return { ok: false, message: 'Preencha especialidade, tipo e motivo clinico antes de transcrever.' }
  }
  return { ok: true, context: normalized }
}

async function transcribeBuffer(payload) {
  const intake = assertClinicalIntake(payload?.context)
  if (!intake.ok) return intake

  const bytes = payload?.audioBytes
  const byteLength = bytes?.byteLength || bytes?.length || 0
  if (!bytes || byteLength === 0) return { ok: false, message: 'Audio vazio.' }
  const audioBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (!audioBuffer.byteLength) return { ok: false, message: 'Audio vazio.' }

  const mimeType = payload.mimeType || 'audio/webm'
  const fileName = payload.fileName || 'consulta.webm'
  return callMedVozAi('transcribe', {
    audioBase64: bytesToBase64(audioBuffer),
    mimeType,
    fileName,
    diarize: Boolean(payload.diarize),
    context: intake.context
  })
}

async function classifyTranscript({ transcript, context }) {
  const intake = assertClinicalIntake(context)
  if (!intake.ok) return intake
  const text = String(transcript || '').trim()
  if (text.length < 20) return { ok: false, medical: false, message: 'Transcricao insuficiente para validar o assunto.' }

  return callMedVozAi('classify', { transcript: text, context: intake.context })
}

async function generateClinicalDocument({ transcript, context, patient, documentType, tone, detailLevel }) {
  const gate = await classifyTranscript({ transcript, context })
  if (!gate.ok || !gate.medical || Number(gate.confidence || 0) < 0.55) {
    return { ok: false, blocked: true, message: 'Uso bloqueado: o conteudo nao parece ser relacionado a saude/medicina.' }
  }

  const result = await callMedVozAi('generate_document', { transcript, context, patient, documentType, tone, detailLevel })
  return result.ok ? { ...result, gate } : result
}

async function analyzeClinicalQuality({ transcript, document, context }) {
  return callMedVozAi('quality_review', { transcript, document, context })
}

ipcMain.handle('app:get-config', () => ({ ...config, version: app.getVersion(), supportUrl: SUPPORT_URL }))
ipcMain.handle('app:open-support', async () => {
  await shell.openExternal(SUPPORT_URL)
  return { ok: true }
})
ipcMain.handle('app:open-external', async (_event, url) => {
  if (!isAllowedExternalUrl(url)) return { ok: false, message: 'URL nao autorizada.' }
  await shell.openExternal(url)
  return { ok: true }
})
ipcMain.handle('app:check-updates', async () => {
  const primary = await requestJson(config.updateEndpoint)
  if (primary?.ok) return { installedVersion: app.getVersion(), downloadPage: config.downloadPage, ...primary, source: 'ghz' }

  const fallback = await requestJson(config.fallbackUpdateEndpoint)
  return {
    installedVersion: app.getVersion(),
    downloadPage: config.downloadPage,
    primary_error: primary?.message || primary?.code || 'Endpoint GHZ indisponivel.',
    ...fallback,
    source: fallback?.tag_name ? 'github' : 'fallback'
  }
})
ipcMain.handle('ai:get-openai-status', async () => getOpenAiStatus())

ipcMain.handle('license:get-state', async () => licenseService.readState())
ipcMain.handle('license:device-info', async () => licenseService.getPublicDeviceInfo())
ipcMain.handle('license:validate', async () => licenseService.validate())
ipcMain.handle('license:activate', async (_event, payload) => {
  const result = await licenseService.activate(payload)
  if (!result?.ok) return result || { ok: false, message: 'Licenca invalida.' }
  await mainWindow.loadFile(path.join(__dirname, 'index.html'))
  return result
})

ipcMain.handle('ai:transcribe-audio', async (_event, payload) => transcribeBuffer(payload))
ipcMain.handle('ai:classify-transcript', async (_event, payload) => classifyTranscript(payload))
ipcMain.handle('ai:generate-clinical-document', async (_event, payload) => generateClinicalDocument(payload))
ipcMain.handle('ai:analyze-clinical-quality', async (_event, payload) => analyzeClinicalQuality(payload))

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  const appDataDir = path.join(app.getPath('userData'), config.appId)
  licenseService = createLicenseService({
    app,
    appId: config.appId,
    licenseApiUrl: config.licenseApiUrl,
    dataDir: appDataDir,
    crypto,
    fs,
    os,
    requestJson
  })
  createWindow()
  const result = await licenseService.validate()
  if (result?.ok) await mainWindow.loadFile(path.join(__dirname, 'index.html'))
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
