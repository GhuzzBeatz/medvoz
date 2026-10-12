const store = {
  visits: JSON.parse(localStorage.getItem('medvoz.visits') || '[]'),
  patients: JSON.parse(localStorage.getItem('medvoz.patients') || '[]'),
  settings: JSON.parse(localStorage.getItem('medvoz.settings') || '{}'),
  config: null,
  gate: null,
  recorder: null,
  stream: null,
  chunks: [],
  audioBlob: null,
  recordingReady: false,
  stopPromise: null,
  startedAt: null,
  timer: null,
  selectedPatientId: null
}

let latestUpdateUrl = ''

const templates = [
  ['SOAP', 'Gere um registro SOAP objetivo com S, O, A e P. Destaque lacunas e itens a validar.'],
  ['Evolucao', 'Gere uma evolucao clinica de prontuario, direta e revisavel.'],
  ['Receita/conduta', 'Prepare conduta, orientacoes e campos para prescricao sem inventar doses ausentes.'],
  ['Atestado', 'Monte atestado com campos editaveis e linguagem profissional.'],
  ['Encaminhamento', 'Gere encaminhamento com motivo, resumo clinico e pergunta ao especialista.'],
  ['Solicitacao de exames', 'Liste exames sugeridos pelo contexto e justificativa clinica quando citada.'],
  ['LME', 'Organize rascunho de LME com campos pendentes em destaque.'],
  ['SP/SADT', 'Prepare guia SP/SADT em formato de rascunho conferivel.']
]

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => Array.from(document.querySelectorAll(selector))

function today() {
  return new Date().toLocaleDateString('pt-BR')
}

function saveStore() {
  localStorage.setItem('medvoz.visits', JSON.stringify(store.visits.slice(0, 300)))
  localStorage.setItem('medvoz.patients', JSON.stringify(store.patients))
  localStorage.setItem('medvoz.settings', JSON.stringify(store.settings))
}

function setTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark'
  document.body.dataset.theme = normalized
  $('#themeIcon').textContent = normalized === 'dark' ? 'SUN' : 'MOON'
  $('#themeLabel').textContent = normalized === 'dark' ? 'Modo Claro' : 'Modo Escuro'
  localStorage.setItem('ghz-app-theme', normalized)
}

function switchPage(page) {
  $$('.nav-button').forEach((item) => item.classList.toggle('active', item.dataset.page === page))
  $$('[data-page-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.pagePanel === page))
}

function getContext() {
  return {
    patientName: $('#patientName').value.trim(),
    specialty: $('#specialty').value,
    visitType: $('#visitType').value,
    reason: $('#visitReason').value.trim(),
    consent: $('#recordConsent').checked,
    mode: $('#visitType').value
  }
}

function getPatientDraft() {
  return {
    name: $('#patientName').value.trim() || 'Paciente sem nome',
    age: $('#patientAge').value.trim(),
    document: $('#patientDoc').value.trim(),
    phone: $('#patientPhone').value.trim(),
    allergies: '',
    medications: '',
    conditions: ''
  }
}

function status(el, text, className = '') {
  el.textContent = text
  el.className = `inline-status ${className}`.trim()
}

function formatTimer(ms) {
  const seconds = Math.floor(ms / 1000)
  const min = String(Math.floor(seconds / 60)).padStart(2, '0')
  const sec = String(seconds % 60).padStart(2, '0')
  return `${min}:${sec}`
}

function setRecordingUi(recording, paused = false) {
  $('#btnStartRecord').disabled = recording && !paused
  $('#btnPauseRecord').disabled = !recording
  $('#btnStopRecord').disabled = !recording
  $('#btnGateSample').disabled = recording || !store.recordingReady || !store.audioBlob?.size
  $('#btnFullTranscribe').disabled = recording || !store.recordingReady || !store.audioBlob?.size || !store.gate?.medical
}

async function blobToBytes(blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

async function ensureRecordingReady() {
  if (store.recorder && store.recorder.state !== 'inactive') {
    stopRecording()
  }
  if (store.stopPromise) await store.stopPromise
  if (!store.audioBlob && store.chunks.length) {
    store.audioBlob = new Blob(store.chunks, { type: store.chunks[0]?.type || 'audio/webm' })
    store.recordingReady = store.audioBlob.size > 0
  }
  if (!store.recordingReady || !store.audioBlob?.size) {
    throw new Error('Audio vazio. Grave, encerre e tente validar novamente.')
  }
}

async function buildAudioPayload(sampleOnly = false) {
  await ensureRecordingReady()
  const sourceBlob = store.audioBlob || new Blob(store.chunks, { type: store.chunks[0]?.type || 'audio/webm' })
  if (!sourceBlob.size) throw new Error('Audio vazio. Encerre a gravacao e tente validar novamente.')
  const blob = sampleOnly
    ? sourceBlob.slice(0, Math.min(sourceBlob.size, 900000), sourceBlob.type || 'audio/webm')
    : sourceBlob
  return {
    audioBytes: await blobToBytes(blob),
    mimeType: blob.type || 'audio/webm',
    fileName: sampleOnly ? 'amostra-medvoz.webm' : 'consulta-medvoz.webm',
    diarize: !sampleOnly,
    context: getContext()
  }
}

async function startRecording() {
  const context = getContext()
  if (!context.reason || !context.specialty || !context.visitType) {
    status($('#gateStatus'), 'Preencha especialidade, tipo e motivo clinico antes de gravar.', 'status-error')
    return
  }
  if (!context.consent) {
    status($('#gateStatus'), 'Confirme o consentimento antes de gravar.', 'status-error')
    return
  }

  store.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  store.chunks = []
  store.audioBlob = null
  store.recordingReady = false
  store.stopPromise = null
  store.gate = null
  const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
  store.recorder = new MediaRecorder(store.stream, { mimeType: preferredMime })
  store.recorder.ondataavailable = (event) => {
    if (event.data?.size) store.chunks.push(event.data)
  }
  store.recorder.onstop = () => {
    store.stream?.getTracks().forEach((track) => track.stop())
    store.audioBlob = new Blob(store.chunks, { type: store.recorder?.mimeType || preferredMime })
    store.recordingReady = store.audioBlob.size > 0
    setRecordingUi(false)
    $('#recordStatus').textContent = store.recordingReady ? 'Gravacao encerrada' : 'Gravacao sem audio'
    status(
      $('#gateStatus'),
      store.recordingReady
        ? `Audio pronto (${Math.round(store.audioBlob.size / 1024)} KB). Clique em Validar assunto.`
        : 'Nenhum audio foi capturado. Tente gravar novamente.',
      store.recordingReady ? 'status-ok' : 'status-error'
    )
  }
  store.recorder.start(1000)
  store.startedAt = Date.now()
  store.timer = setInterval(() => {
    $('#recordTimer').textContent = formatTimer(Date.now() - store.startedAt)
  }, 500)
  $('#recordStatus').textContent = 'Gravando consulta'
  setRecordingUi(true)
}

function pauseRecording() {
  if (!store.recorder) return
  if (store.recorder.state === 'recording') {
    store.recorder.pause()
    $('#recordStatus').textContent = 'Gravacao pausada'
    $('#btnPauseRecord').textContent = 'Retomar'
  } else if (store.recorder.state === 'paused') {
    store.recorder.resume()
    $('#recordStatus').textContent = 'Gravando consulta'
    $('#btnPauseRecord').textContent = 'Pausar'
  }
}

function stopRecording() {
  if (!store.recorder) return
  clearInterval(store.timer)
  if (store.recorder.state === 'inactive') return
  $('#recordStatus').textContent = 'Finalizando audio...'
  $('#btnPauseRecord').disabled = true
  $('#btnStopRecord').disabled = true
  try {
    store.recorder.requestData()
  } catch (error) {}
  store.stopPromise = new Promise((resolve) => {
    store.recorder.addEventListener('stop', resolve, { once: true })
  })
  store.recorder.stop()
}

async function validateSample() {
  status($('#gateStatus'), 'Preparando audio e validando assunto medico...', 'status-warn')
  const payload = await buildAudioPayload(true)
  const sample = await window.medvozApi.transcribeAudio(payload)
  if (!sample.ok) {
    status($('#gateStatus'), sample.message || 'Falha na transcricao da amostra.', 'status-error')
    return
  }
  const gate = await window.medvozApi.classifyTranscript({ transcript: sample.text, context: getContext() })
  store.gate = gate
  if (!gate.ok || !gate.medical) {
    $('#btnFullTranscribe').disabled = true
    status($('#gateStatus'), gate.message || `Bloqueado: ${gate.reason || 'conteudo fora de saude.'}`, 'status-error')
    return
  }
  $('#btnFullTranscribe').disabled = false
  status($('#gateStatus'), `Liberado: ${gate.category} (${Math.round((gate.confidence || 0) * 100)}% de confianca).`, 'status-ok')
}

async function transcribeFull() {
  status($('#gateStatus'), 'Preparando audio completo para transcricao...', 'status-warn')
  const payload = await buildAudioPayload(false)
  status($('#gateStatus'), 'Transcrevendo audio completo com IA...', 'status-warn')
  const result = await window.medvozApi.transcribeAudio(payload)
  if (!result.ok) {
    status($('#gateStatus'), result.message || 'Falha na transcricao completa.', 'status-error')
    return
  }
  const gate = await window.medvozApi.classifyTranscript({ transcript: result.text, context: getContext() })
  store.gate = gate
  if (!gate.ok || !gate.medical) {
    $('#transcriptText').value = ''
    status($('#gateStatus'), gate.message || 'Uso bloqueado apos validacao completa.', 'status-error')
    return
  }
  $('#transcriptText').value = renderTranscript(result)
  status($('#gateStatus'), 'Transcricao completa liberada para documentacao clinica.', 'status-ok')
}

function renderTranscript(result) {
  if (Array.isArray(result.segments) && result.segments.length) {
    return result.segments.map((segment) => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : ''
      return `${speaker}${segment.text || ''}`.trim()
    }).join('\n')
  }
  return result.text || ''
}

async function generateDocument() {
  const transcript = $('#transcriptText').value.trim()
  if (!transcript) {
    $('#qualityPanel').innerHTML = '<div class="list-item"><div><h3>Sem transcricao</h3><p>Transcreva ou cole o texto antes de gerar documento.</p></div></div>'
    return
  }
  $('#clinicalDocument').value = 'Gerando documento clinico...'
  const result = await window.medvozApi.generateClinicalDocument({
    transcript,
    context: getContext(),
    patient: getPatientDraft(),
    documentType: $('#documentType').value,
    tone: $('#tone').value,
    detailLevel: $('#detailLevel').value
  })
  if (!result.ok) {
    $('#clinicalDocument').value = result.message || 'Falha ao gerar documento.'
    return
  }
  const footer = store.settings.footerText ? `\n\n${store.settings.footerText}` : ''
  $('#clinicalDocument').value = `${result.title}\n\n${result.document}${footer}`
  renderQuality(result.gaps, result.warnings)
}

function renderQuality(gaps = [], warnings = []) {
  const items = [
    ...warnings.map((text) => ['Alerta', text]),
    ...gaps.map((text) => ['Lacuna', text])
  ]
  $('#qualityPanel').innerHTML = items.length
    ? items.map(([title, text]) => `<div class="list-item"><div><h3>${title}</h3><p>${escapeHtml(text)}</p></div></div>`).join('')
    : '<div class="list-item"><div><h3>Sem pendencias criticas</h3><p>Revise clinicamente antes de usar no prontuario.</p></div></div>'
}

async function reviewQuality() {
  const result = await window.medvozApi.analyzeClinicalQuality({
    transcript: $('#transcriptText').value,
    document: $('#clinicalDocument').value,
    documentType: $('#documentType').value,
    context: getContext()
  })
  if (!result.ok) {
    renderQuality([], [result.message || 'Falha na revisao.'])
    return
  }
  $('#qualityPanel').innerHTML = `
    <div class="list-item"><div><h3>Nota ${Math.round(result.score || 0)}/100</h3><p>${escapeHtml(result.conciseSummary || '')}</p></div></div>
    ${(result.issues || []).map((item) => `<div class="list-item"><div><h3>Ponto de atencao</h3><p>${escapeHtml(item)}</p></div></div>`).join('')}
    ${(result.checklist || []).map((item) => `<div class="list-item"><div><h3>Checklist</h3><p>${escapeHtml(item)}</p></div></div>`).join('')}
  `
}

function upsertPatient(draft) {
  const key = (draft.document || draft.phone || draft.name).toLowerCase()
  let patient = store.patients.find((item) => item.key === key)
  if (!patient) {
    patient = { id: Date.now(), key, ...draft, createdAt: new Date().toISOString() }
    store.patients.unshift(patient)
  } else {
    Object.assign(patient, draft)
  }
  return patient
}

function saveVisit() {
  const patient = upsertPatient(getPatientDraft())
  const visit = {
    id: Date.now(),
    patientId: patient.id,
    date: today(),
    context: getContext(),
    transcript: $('#transcriptText').value.trim(),
    documentType: $('#documentType').value,
    document: $('#clinicalDocument').value.trim(),
    gate: store.gate
  }
  store.visits.unshift(visit)
  saveStore()
  renderAll()
  switchPage('pacientes')
}

function renderDashboard() {
  const todayVisits = store.visits.filter((visit) => visit.date === today()).length
  $('#statToday').textContent = todayVisits
  $('#statPatients').textContent = store.patients.length
  $('#statDocs').textContent = store.visits.filter((visit) => visit.document).length
  $('#statGaps').textContent = $$('#qualityPanel .list-item').length || 0
  $('#recentVisits').innerHTML = store.visits.slice(0, 6).map((visit) => visitItem(visit)).join('') || emptyItem('Sem atendimentos', 'Comece pelo modulo Atendimento.')
}

function visitItem(visit) {
  const patient = store.patients.find((item) => item.id === visit.patientId)
  return `<div class="list-item"><div><h3>${escapeHtml(patient?.name || visit.context.patientName || 'Paciente')}</h3><p>${visit.date} - ${escapeHtml(visit.context.specialty)} - ${escapeHtml(visit.context.visitType)}</p></div><button class="secondary-button compact" data-open-visit="${visit.id}">Abrir</button></div>`
}

function emptyItem(title, text) {
  return `<div class="list-item"><div><h3>${title}</h3><p>${text}</p></div></div>`
}

function renderPatients(filter = '') {
  const term = filter.toLowerCase()
  const patients = store.patients.filter((patient) => patient.name.toLowerCase().includes(term) || patient.document.includes(term))
  $('#patientList').innerHTML = patients.map((patient) => {
    const count = store.visits.filter((visit) => visit.patientId === patient.id).length
    return `<div class="list-item"><div><h3>${escapeHtml(patient.name)}</h3><p>${count} atendimento(s) - ${escapeHtml(patient.phone || patient.document || 'sem contato')}</p></div><button class="secondary-button compact" data-open-patient="${patient.id}">Ver</button></div>`
  }).join('') || emptyItem('Nenhum paciente', 'Salve um atendimento para criar o cadastro.')
}

function renderPatientDetail(patientId = store.selectedPatientId) {
  const patient = store.patients.find((item) => item.id === patientId)
  if (!patient) {
    $('#patientDetailTitle').textContent = 'Selecione um paciente'
    $('#patientDetail').textContent = 'O resumo, consultas e documentos aparecem aqui.'
    return
  }
  store.selectedPatientId = patient.id
  const visits = store.visits.filter((visit) => visit.patientId === patient.id)
  $('#patientDetailTitle').textContent = patient.name
  $('#patientDetail').textContent = [
    `Idade: ${patient.age || 'nao informada'}`,
    `Documento: ${patient.document || 'nao informado'}`,
    `Telefone: ${patient.phone || 'nao informado'}`,
    '',
    'Linha do tempo:',
    ...visits.map((visit) => `- ${visit.date}: ${visit.context.specialty} / ${visit.context.reason}`)
  ].join('\n')
}

function renderTemplates() {
  $('#templateGrid').innerHTML = templates.map(([title, prompt]) => `
    <article class="template-card">
      <h3>${title}</h3>
      <p>${prompt}</p>
      <button class="secondary-button compact" data-template="${title.toLowerCase()}">Usar</button>
    </article>
  `).join('')
}

function renderSettings() {
  $('#clinicName').value = store.settings.clinicName || ''
  $('#doctorName').value = store.settings.doctorName || ''
  $('#footerText').value = store.settings.footerText || ''
  $('#detailLevel').value = store.settings.detailLevel || 'objetivo'
  $('#tone').value = store.settings.tone || 'clinico direto'
}

async function renderLicenseBox() {
  const license = await window.ghzApp.getLicenseState()
  const device = await window.ghzApp.getDeviceInfo()
  $('#licenseBox').textContent = [
    `Licenca: ${license.active ? 'ativa' : 'pendente'}`,
    `Cliente: ${license.customer_name || 'nao informado'}`,
    `Final: ${license.license_last4 || '----'}`,
    `Dispositivo: ${device.device_name} (${device.device_hash_preview})`,
    `Ultima validacao: ${license.validated_at || 'nao validada'}`
  ].join('\n')
}

function renderAll() {
  renderDashboard()
  renderPatients($('#patientSearch')?.value || '')
  renderPatientDetail()
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]))
}

async function checkUpdates() {
  $('#updateStatus').textContent = 'Verificando atualizacoes...'
  $('#btnOpenUpdate').disabled = true
  const result = await window.ghzApp.checkForUpdates()
  const asset = Array.isArray(result.assets) ? result.assets.find((item) => String(item.name || '').endsWith('.exe')) : null
  const downloadUrl = result.download_url || result.downloadUrl || asset?.browser_download_url || result.html_url || result.downloadPage || store.config.downloadPage
  latestUpdateUrl = downloadUrl || ''
  $('#btnOpenUpdate').disabled = !latestUpdateUrl
  updateDownloadButtonLabel(result)
  $('#updateStatus').textContent = [
    `Versao instalada: ${result.installedVersion || store.config.version}`,
    `Ultima disponivel: ${result.version || result.latest_version || result.tag_name || 'nao informada'}`,
    `Fonte: ${result.source || 'nao informada'}`,
    result.primary_error ? `Endpoint GHZ: ${result.primary_error}` : '',
    `Download fixo: ${downloadUrl || 'indisponivel'}`,
    `Notas: ${result.notes || result.body || result.message || 'Sem notas disponiveis.'}`
  ].filter(Boolean).join('\n')
}

async function openLatestUpdate() {
  if (!latestUpdateUrl) await checkUpdates()
  if (!latestUpdateUrl) return
  await window.ghzApp.openExternal(latestUpdateUrl)
}

function applyOpenAiStatusToGate(result) {
  if (!result?.configured) {
    status($('#gateStatus'), result?.message || 'Servidor de IA nao configurado.', 'status-warn')
  } else if ($('#gateStatus').textContent.includes('Servidor de IA')) {
    status($('#gateStatus'), 'IA integrada pelo servidor GHZ. Grave, encerre e valide o assunto.', 'status-ok')
  }
}

async function refreshOpenAiStatusEverywhere() {
  const result = await window.medvozApi.getOpenAiStatus()
  const el = $('#openaiStatus')
  if (el) {
    el.textContent = result.message || (result.configured ? 'IA integrada pelo servidor GHZ.' : 'Servidor de IA nao configurado.')
    el.className = `inline-status ${result.configured ? 'status-ok' : 'status-warn'}`
  }
  applyOpenAiStatusToGate(result)
  return result
}

async function ensureOpenAiConfigured() {
  const result = await refreshOpenAiStatusEverywhere()
  return Boolean(result?.configured)
}

async function renderOpenAiStatus() {
  await refreshOpenAiStatusEverywhere()
}

async function guardedAction(action) {
  if (!(await ensureOpenAiConfigured())) return
  return action()
}

async function guardedValidateSample() {
  return guardedAction(validateSample)
}

async function guardedTranscribeFull() {
  return guardedAction(transcribeFull)
}

async function guardedGenerateDocument() {
  return guardedAction(generateDocument)
}

async function guardedReviewQuality() {
  return guardedAction(reviewQuality)
}

async function guardedAskAgent() {
  return guardedAction(askAgent)
}

function normalizeUpdateVersion(value) {
  return String(value || '').replace(/^v/i, '')
}

function compareVersions(a, b) {
  const left = normalizeUpdateVersion(a).split('.').map(Number)
  const right = normalizeUpdateVersion(b).split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff) return diff
  }
  return 0
}

function updateDownloadButtonLabel(result) {
  const latest = result.version || result.latest_version || result.tag_name || ''
  const installed = result.installedVersion || store.config.version
  $('#btnOpenUpdate').textContent = latest && compareVersions(latest, installed) > 0 ? 'Baixar atualizacao' : 'Abrir download'
}

async function askAgent() {
  const prompt = $('#agentPrompt').value.trim()
  if (!prompt) return
  $('#agentAnswer').textContent = 'Analisando contexto clinico...'
  const result = await window.medvozApi.generateClinicalDocument({
    transcript: `${$('#transcriptText').value}\n\nPergunta do agente: ${prompt}`,
    context: getContext(),
    patient: getPatientDraft(),
    documentType: 'analise_agente_clinico',
    tone: $('#tone').value,
    detailLevel: $('#detailLevel').value
  })
  $('#agentAnswer').textContent = result.ok ? `${result.title}\n\n${result.document}` : (result.message || 'Falha na analise.')
}

function bindEvents() {
  $$('.nav-button').forEach((button) => button.addEventListener('click', () => switchPage(button.dataset.page)))
  $$('[data-jump]').forEach((button) => button.addEventListener('click', () => switchPage(button.dataset.jump)))
  $('#themeButton').addEventListener('click', () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'))
  $('#minimizeButton').addEventListener('click', () => window.ghzApp.minimize())
  $('#maximizeButton').addEventListener('click', () => window.ghzApp.maximize())
  $('#closeButton').addEventListener('click', () => window.ghzApp.close())

  $('#btnStartRecord').addEventListener('click', () => startRecording().catch((error) => status($('#gateStatus'), error.message, 'status-error')))
  $('#btnPauseRecord').addEventListener('click', pauseRecording)
  $('#btnStopRecord').addEventListener('click', stopRecording)
  $('#btnGateSample').addEventListener('click', () => guardedValidateSample().catch((error) => status($('#gateStatus'), error.message, 'status-error')))
  $('#btnFullTranscribe').addEventListener('click', () => guardedTranscribeFull().catch((error) => status($('#gateStatus'), error.message, 'status-error')))
  $('#btnGenerateDoc').addEventListener('click', () => guardedGenerateDocument())
  $('#btnQuality').addEventListener('click', () => guardedReviewQuality())
  $('#btnCopyDoc').addEventListener('click', () => navigator.clipboard.writeText($('#clinicalDocument').value))
  $('#btnSaveVisit').addEventListener('click', saveVisit)
  $('#btnCheckUpdates').addEventListener('click', checkUpdates)
  $('#btnOpenUpdate').addEventListener('click', openLatestUpdate)
  $('#btnAskAgent').addEventListener('click', guardedAskAgent)
  $('#btnPasteTranscript').addEventListener('click', async () => {
    $('#transcriptText').value = await navigator.clipboard.readText()
  })
  $('#btnSaveSettings').addEventListener('click', async () => {
    store.settings = {
      clinicName: $('#clinicName').value.trim(),
      doctorName: $('#doctorName').value.trim(),
      footerText: $('#footerText').value.trim(),
      detailLevel: $('#detailLevel').value,
      tone: $('#tone').value
    }
    saveStore()
    await refreshOpenAiStatusEverywhere()
  })
  $('#btnDemo').addEventListener('click', () => {
    $('#patientName').value = 'Marina Alves'
    $('#patientAge').value = '48'
    $('#patientPhone').value = '(11) 99999-0000'
    $('#visitReason').value = 'Retorno por dor epigastrica e revisao de tratamento'
    $('#recordConsent').checked = true
    $('#transcriptText').value = 'Medico: Marina, como voce ficou desde a ultima consulta? Paciente: Melhorei da dor epigastrica com a dieta e a medicacao. Nao tive vomitos nem febre. Medico: Teve alguma alergia ou efeito colateral? Paciente: Nao, nenhuma alergia conhecida. Medico: Vamos manter as orientacoes, revisar sinais de alarme e programar retorno.'
  })
  $('#patientSearch').addEventListener('input', (event) => renderPatients(event.target.value))
  $('#patientList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-patient]')
    if (!button) return
    renderPatientDetail(Number(button.dataset.openPatient))
  })
  $('#recentVisits').addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-visit]')
    if (!button) return
    const visit = store.visits.find((item) => item.id === Number(button.dataset.openVisit))
    const patient = store.patients.find((item) => item.id === visit?.patientId)
    if (!visit) return
    $('#patientName').value = patient?.name || visit.context.patientName || ''
    $('#patientAge').value = patient?.age || ''
    $('#patientDoc').value = patient?.document || ''
    $('#patientPhone').value = patient?.phone || ''
    $('#specialty').value = visit.context.specialty
    $('#visitType').value = visit.context.visitType
    $('#visitReason').value = visit.context.reason
    $('#recordConsent').checked = Boolean(visit.context.consent)
    $('#transcriptText').value = visit.transcript
    $('#clinicalDocument').value = visit.document
    switchPage('atendimento')
  })
  $('#templateGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-template]')
    if (!button) return
    $('#documentType').value = button.dataset.template.includes('soap') ? 'soap' : $('#documentType').value
    switchPage('atendimento')
  })
}

async function initializeApp() {
  store.config = await window.ghzApp.getConfig()
  document.title = store.config.appName
  document.documentElement.style.setProperty('--accent', store.config.accent)
  document.documentElement.style.setProperty('--sidebar-bg', store.config.sidebarBackground)
  document.documentElement.style.setProperty('--content-bg', store.config.contentBackground)
  document.querySelectorAll('[data-app-name]').forEach((element) => { element.textContent = store.config.appName })
  document.querySelectorAll('[data-app-logo]').forEach((element) => { element.textContent = store.config.appLogoText || 'MED' })
  setTheme(localStorage.getItem('ghz-app-theme') || 'dark')
  renderTemplates()
  renderSettings()
  renderAll()
  renderLicenseBox()
  renderOpenAiStatus()
  checkUpdates()
}

bindEvents()
initializeApp().catch(() => {})
