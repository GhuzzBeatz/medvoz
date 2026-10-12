const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell } = require('electron')
const config = require('./app.config')
const { createLicenseService } = require('./services/license-service')
const { createUpdateService } = require('./services/update-service')

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
    icon: path.join(__dirname, 'assets', 'medvoz-icon.png'),
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

const MIN_HEALTH_CONFIDENCE = 0.55
// Transcripts already approved in this session. The AI classifier is not deterministic, so
// re-asking about the same text could block a document that was just released.
const approvedTranscripts = new Set()

function transcriptFingerprint(text) {
  return crypto.createHash('sha256').update(String(text || '').replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex')
}

async function classifyTranscript({ transcript, context }) {
  const intake = assertClinicalIntake(context)
  if (!intake.ok) return intake
  const text = String(transcript || '').trim()
  if (text.length < 20) return { ok: false, medical: false, message: 'Transcricao insuficiente para validar o assunto.' }

  const fingerprint = transcriptFingerprint(text)
  if (approvedTranscripts.has(fingerprint)) {
    return { ok: true, medical: true, confidence: 1, category: 'assunto de saude ja validado', cached: true }
  }

  const gate = await callMedVozAi('classify', { transcript: text, context: intake.context })
  // One rule for every step (transcription and documents), so they never disagree.
  if (gate?.ok && gate.medical && Number(gate.confidence ?? 1) < MIN_HEALTH_CONFIDENCE) {
    return {
      ...gate,
      medical: false,
      message: 'O assunto de saude nao ficou claro no audio. Grave uma conversa clinica mais completa ou cole a transcricao.'
    }
  }
  if (gate?.ok && gate.medical) approvedTranscripts.add(fingerprint)
  return gate
}

function clinicianInstructions(clinician, patient) {
  const lines = [
    clinician?.doctorName && `Profissional: ${clinician.doctorName}`,
    clinician?.doctorCrm && `CRM: ${clinician.doctorCrm}`,
    clinician?.doctorSpecialty && `Especialidade: ${clinician.doctorSpecialty}`,
    clinician?.clinicName && `Clinica: ${clinician.clinicName}`,
    patient?.name && patient.name !== 'Paciente sem nome' && `Paciente: ${patient.name}`,
    patient?.birthDate && `Data de nascimento do paciente: ${String(patient.birthDate).split('-').reverse().join('/')}`,
    patient?.age && `Idade do paciente: ${patient.age} anos`,
    patient?.document && `Documento do paciente: ${patient.document}`,
    `Data de hoje: ${new Date().toLocaleDateString('pt-BR')}`
  ].filter(Boolean).map((line) => String(line).slice(0, 200))
  return `\n\n---\nDados fixos para preencher o documento (use exatamente estes dados, sem deixar campos como [nome do medico], [CRM] ou ____ para preencher a mao):\n${lines.join('\n')}\nNao escreva cabecalho, timbrado nem bloco de assinatura no final: o sistema adiciona o timbrado da clinica e a assinatura do profissional automaticamente. Se o nome do paciente nao foi informado, nao invente um nome.`
}

function normalizeDocumentTemplate(template) {
  const name = String(template?.name || '').trim().slice(0, 120)
  const body = String(template?.body || '').trim().slice(0, 6000)
  return name && body ? { name, body } : null
}

async function generateClinicalDocument({ transcript, context, patient, clinician, documentType, template, tone, detailLevel }) {
  // The health gate always runs on the conversation alone, never on the doctor's template text.
  const gate = await classifyTranscript({ transcript, context })
  if (!gate.ok || !gate.medical) {
    return { ok: false, blocked: true, message: gate.message || 'Uso bloqueado: o conteudo nao parece ser relacionado a saude/medicina.' }
  }

  const customTemplate = normalizeDocumentTemplate(template)
  const templateText = customTemplate
    ? `\n\n---\nModelo do profissional "${customTemplate.name}". Monte o documento seguindo exatamente esta estrutura e estas instrucoes, sem inventar dados que nao foram falados:\n${customTemplate.body}`
    : ''
  const result = await callMedVozAi('generate_document', {
    transcript: `${transcript}${templateText}${documentType === 'analise_agente_clinico' ? '' : clinicianInstructions(clinician, patient)}`,
    context,
    patient,
    clinician,
    documentType,
    ...(customTemplate ? { template: customTemplate } : {}),
    tone,
    detailLevel
  })
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

let updateInProgress = false

async function downloadAndInstallUpdate() {
  const updates = createUpdateService({
    appId: config.appId,
    getVersion: () => app.getVersion(),
    releaseEndpoint: config.fallbackUpdateEndpoint,
    requestJson,
    tempDir: app.getPath('temp')
  })
  const result = await updates.downloadLatest((progress) => mainWindow?.webContents.send('update:progress', progress))
  if (!result.ok) return result
  if (!app.isPackaged) return { ...result, dev: true }

  // Open the installer through Windows (no console window) and close MedVoz right away;
  // the installer only checks for a running app when the user clicks Install.
  const openError = await shell.openPath(result.path)
  if (openError) return { ok: false, message: `Nao foi possivel abrir o instalador: ${openError}` }
  setTimeout(() => app.quit(), 600)
  return result
}
ipcMain.handle('update:install', async () => {
  if (!licenseService?.isSessionAuthorized()) return { ok: false, message: 'Valide a licenca para atualizar.' }
  if (updateInProgress) return { ok: false, message: 'A atualizacao ja esta sendo baixada.' }
  updateInProgress = true
  try {
    return await downloadAndInstallUpdate()
  } catch (error) {
    return { ok: false, message: error.message || 'Falha ao baixar a atualizacao.' }
  } finally {
    updateInProgress = false
  }
})

const MAX_PRINT_HTML_BYTES = 12 * 1024 * 1024

async function openPrintableWindow(html) {
  const source = String(html || '')
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_PRINT_HTML_BYTES) throw new Error('Documento vazio ou grande demais para imprimir.')
  // Hidden, script-free window that only renders the printable document.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  await win.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(source, 'utf8').toString('base64')}`)
  return win
}

function safePdfName(name) {
  const cleaned = String(name || 'documento-medvoz').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)
  return `${cleaned || 'documento-medvoz'}.pdf`
}

ipcMain.handle('document:export-pdf', async (_event, payload = {}) => {
  if (!licenseService?.isSessionAuthorized()) return { ok: false, message: 'Valide a licenca para exportar documentos.' }
  let win
  try {
    win = await openPrintableWindow(payload.html)
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar documento em PDF',
      defaultPath: path.join(app.getPath('documents'), safePdfName(payload.fileName)),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.writeFileSync(filePath, pdf)
    shell.openPath(filePath)
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, message: error.message || 'Falha ao gerar PDF.' }
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
  }
})

ipcMain.handle('document:print', async (_event, payload = {}) => {
  if (!licenseService?.isSessionAuthorized()) return { ok: false, message: 'Valide a licenca para imprimir documentos.' }
  let win
  try {
    win = await openPrintableWindow(payload.html)
    const printWindow = win
    return await new Promise((resolve) => {
      printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        resolve(success ? { ok: true } : { ok: false, canceled: reason === 'cancelled', message: reason || 'Impressao cancelada.' })
      })
    })
  } catch (error) {
    return { ok: false, message: error.message || 'Falha ao imprimir.' }
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
  }
})

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

function enableSystemAudioCapture() {
  // Lets "Microfone + som do computador" capture teleconsult audio (Windows loopback).
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (!licenseService?.isSessionAuthorized()) {
      callback({})
      return
    }
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => {
        if (!sources.length) callback({})
        else callback({ video: sources[0], audio: 'loopback' })
      })
      .catch(() => callback({}))
  })
}

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
  enableSystemAudioCapture()
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
