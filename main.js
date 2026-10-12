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
let appDataDir = null
const appRootUrl = pathToFileURL(`${__dirname}${path.sep}`).href
const licensePageUrl = pathToFileURL(path.join(__dirname, 'pages', 'licenca.html')).href
const SUPPORT_URL = 'https://ghzplugin.com.br/suporte/'

if (!gotSingleInstanceLock) app.quit()

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const values = {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return values
}

function getOpenAiKey() {
  const userEnvPath = appDataDir ? path.join(appDataDir, '.env.local') : ''
  const userEnv = userEnvPath ? readEnvFile(userEnvPath) : {}
  const env = readEnvFile(path.join(__dirname, '.env.local'))
  return process.env.OPENAI_API_KEY || userEnv.OPENAI_API_KEY || env.OPENAI_API_KEY || ''
}

function maskSecret(value) {
  const text = String(value || '')
  if (!text) return ''
  return `${text.slice(0, 7)}...${text.slice(-4)}`
}

function saveOpenAiKey(value) {
  const key = String(value || '').trim()
  if (!key) return { ok: false, message: 'Informe a chave OpenAI.' }
  if (!/^sk-/.test(key)) return { ok: false, message: 'A chave OpenAI parece invalida.' }
  fs.mkdirSync(appDataDir, { recursive: true })
  fs.writeFileSync(path.join(appDataDir, '.env.local'), `OPENAI_API_KEY=${key}\n`, 'utf8')
  return { ok: true, masked: maskSecret(key) }
}

function getOpenAiStatus() {
  const key = getOpenAiKey()
  return { configured: Boolean(key), masked: maskSecret(key) }
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
  return isSupportUrl(url) || /^https:\/\/ghzplugin\.com\.br(?:\/|$)/i.test(String(url || ''))
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

async function callOpenAi(pathname, body, isMultipart = false) {
  const apiKey = getOpenAiKey()
  if (!apiKey) return { ok: false, code: 'missing_openai_key', message: 'OPENAI_API_KEY nao configurada.' }

  const response = await fetch(`https://api.openai.com/v1/${pathname}`, {
    method: 'POST',
    headers: isMultipart
      ? { authorization: `Bearer ${apiKey}` }
      : { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: isMultipart ? body : JSON.stringify(body)
  })

  const text = await response.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch (error) { data = { text } }
  if (!response.ok) return { ok: false, code: 'openai_error', message: data?.error?.message || `OpenAI HTTP ${response.status}` }
  return { ok: true, data }
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

  const form = new FormData()
  const mimeType = payload.mimeType || 'audio/webm'
  const fileName = payload.fileName || 'consulta.webm'
  form.append('file', new Blob([audioBuffer], { type: mimeType }), fileName)
  form.append('model', payload.diarize ? 'gpt-4o-transcribe-diarize' : config.transcriptionModel)
  form.append('language', 'pt')
  if (payload.diarize) {
    form.append('response_format', 'diarized_json')
  } else {
    form.append('prompt', 'Transcreva em portugues do Brasil. O audio deve ser de consulta, reuniao clinica, odontologia, saude ocupacional, psicologia, prontuario, discussao de caso ou atendimento de saude.')
  }

  const result = await callOpenAi('audio/transcriptions', form, true)
  if (!result.ok) return result
  const data = result.data || {}
  return {
    ok: true,
    text: data.text || '',
    segments: data.segments || [],
    language: data.language || 'pt',
    duration: data.duration || null,
    usage: data.usage || null
  }
}

async function classifyTranscript({ transcript, context }) {
  const intake = assertClinicalIntake(context)
  if (!intake.ok) return intake
  const text = String(transcript || '').trim()
  if (text.length < 20) return { ok: false, medical: false, message: 'Transcricao insuficiente para validar o assunto.' }

  const result = await callOpenAi('responses', {
    model: config.reasoningModel,
    input: [
      {
        role: 'system',
        content: 'Classifique se o texto pertence a medicina, odontologia, psicologia, saude ocupacional, reuniao clinica, prontuario, gestao de cuidado, faturamento/guia de saude ou area correlata. Responda somente JSON valido.'
      },
      {
        role: 'user',
        content: JSON.stringify({ context: intake.context, transcript: text.slice(0, 12000) })
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'medical_gate',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            medical: { type: 'boolean' },
            confidence: { type: 'number' },
            category: { type: 'string' },
            reason: { type: 'string' }
          },
          required: ['medical', 'confidence', 'category', 'reason']
        }
      }
    }
  })
  if (!result.ok) return result

  const output = result.data?.output_text || result.data?.output?.[0]?.content?.[0]?.text || '{}'
  try {
    const parsed = JSON.parse(output)
    return { ok: true, ...parsed }
  } catch (error) {
    return { ok: false, medical: false, message: 'Nao foi possivel validar o assunto da transcricao.' }
  }
}

async function generateClinicalDocument({ transcript, context, patient, documentType, tone, detailLevel }) {
  const gate = await classifyTranscript({ transcript, context })
  if (!gate.ok || !gate.medical || Number(gate.confidence || 0) < 0.55) {
    return { ok: false, blocked: true, message: 'Uso bloqueado: o conteudo nao parece ser relacionado a saude/medicina.' }
  }

  const result = await callOpenAi('responses', {
    model: config.reasoningModel,
    input: [
      {
        role: 'system',
        content: 'Voce e um assistente de documentacao clinica para profissionais de saude no Brasil. Gere rascunhos claros, revisaveis e sem inventar dados. Preserve incertezas, destaque lacunas, nao substitua julgamento clinico e nao crie diagnostico/conduta que nao esteja sustentado pelo texto.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          documentType,
          tone,
          detailLevel,
          context,
          patient,
          transcript
        })
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'clinical_document',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            document: { type: 'string' },
            gaps: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } },
            suggestedFollowUp: { type: 'string' }
          },
          required: ['title', 'document', 'gaps', 'warnings', 'suggestedFollowUp']
        }
      }
    }
  })
  if (!result.ok) return result

  const output = result.data?.output_text || result.data?.output?.[0]?.content?.[0]?.text || '{}'
  try {
    return { ok: true, gate, ...JSON.parse(output) }
  } catch (error) {
    return { ok: false, message: 'Nao foi possivel montar o documento clinico.' }
  }
}

async function analyzeClinicalQuality({ transcript, document, context }) {
  const result = await callOpenAi('responses', {
    model: config.reasoningModel,
    input: [
      {
        role: 'system',
        content: 'Avalie qualidade de documentacao clinica. Procure lacunas, contradicoes, excesso de texto, itens medico-legais, plano pouco claro e campos ausentes. Responda JSON valido.'
      },
      { role: 'user', content: JSON.stringify({ transcript, document, context }) }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'quality_review',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            score: { type: 'number' },
            conciseSummary: { type: 'string' },
            issues: { type: 'array', items: { type: 'string' } },
            checklist: { type: 'array', items: { type: 'string' } }
          },
          required: ['score', 'conciseSummary', 'issues', 'checklist']
        }
      }
    }
  })
  if (!result.ok) return result
  const output = result.data?.output_text || result.data?.output?.[0]?.content?.[0]?.text || '{}'
  try { return { ok: true, ...JSON.parse(output) } } catch (error) { return { ok: false, message: 'Falha ao avaliar qualidade.' } }
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
  const result = await requestJson(config.updateEndpoint)
  return { installedVersion: app.getVersion(), downloadPage: config.downloadPage, ...result }
})
ipcMain.handle('ai:get-openai-status', async () => getOpenAiStatus())
ipcMain.handle('ai:save-openai-key', async (_event, value) => saveOpenAiKey(value))

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
  appDataDir = path.join(app.getPath('userData'), config.appId)
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
