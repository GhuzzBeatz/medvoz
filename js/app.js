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
  selectedPatientId: null,
  autoProcessing: false,
  customTemplates: JSON.parse(localStorage.getItem('medvoz.templates') || '[]'),
  trash: JSON.parse(localStorage.getItem('medvoz.trash') || '[]'),
  agentChat: JSON.parse(localStorage.getItem('medvoz.agentChat') || '[]'),
  editingTemplateId: null,
  rawStreams: [],
  mixContext: null,
  importedFileName: null,
  liveText: '',
  liveGateOk: false,
  finalTranscriptSet: false
}

let latestUpdateUrl = ''

const TRASH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'
const MAX_IMPORT_BYTES = 25 * 1024 * 1024
const SLICEABLE_AUDIO = /webm|ogg|mpeg|mp3|wav|flac/i
const AUDIO_TYPES_BY_EXTENSION = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac'
}

// Every document type has a fixed structure sent to the AI, so the result is always complete
// and consistent. `base` is the document type the GHZ AI server already knows.
const DOCUMENT_TYPES = {
  soap: {
    title: 'SOAP', base: 'soap',
    summary: 'Registro de prontuario com Subjetivo, Objetivo, Avaliacao e Plano.',
    hint: 'Ex.: destacar sinais vitais, incluir CID',
    structure: 'S (Subjetivo): queixa principal e historia relatada.\nO (Objetivo): exame fisico, sinais vitais e exames citados.\nA (Avaliacao): hipoteses diagnosticas.\nP (Plano): conduta, exames, prescricoes, orientacoes e retorno.\nUse apenas o que foi falado; escreva "nao informado" quando faltar dado.'
  },
  evolucao: {
    title: 'Evolucao', base: 'evolucao',
    summary: 'Evolucao clinica de prontuario, direta e revisavel.',
    hint: 'Ex.: comparar com a consulta anterior',
    structure: 'Evolucao clinica desde o ultimo atendimento.\nExame fisico.\nAvaliacao.\nConduta.\nRetorno.\nTexto objetivo, em topicos curtos.'
  },
  receita: {
    title: 'Receita e conduta', base: 'receita',
    summary: 'Receituario com posologia completa e orientacoes, sem inventar doses.',
    hint: 'Ex.: dipirona 1 g de 6/6 h por 3 dias',
    structure: 'Receituario em lista numerada. Para cada medicamento: nome e concentracao, via de uso, posologia (dose e frequencia), duracao e quantidade.\nSe a dose ou a duracao nao foi dita, escreva [definir] no lugar; nunca invente doses.\nDepois: orientacoes nao medicamentosas e retorno.'
  },
  atestado: {
    title: 'Atestado', base: 'atestado',
    summary: 'Atestado de afastamento em linguagem formal.',
    hint: 'Ex.: 2 dias de afastamento, incluir CID',
    structure: 'Texto formal de atestado: "Atesto, para os devidos fins, que [paciente] esteve sob meus cuidados nesta data e necessita de afastamento de suas atividades por N (numero por extenso) dia(s), a partir de [data]."\nInclua CID somente se o profissional pedir.\nSem detalhes clinicos alem do necessario. Use [preencher] para o que nao foi dito.'
  },
  encaminhamento: {
    title: 'Encaminhamento', base: 'encaminhamento',
    summary: 'Encaminhamento com motivo, resumo clinico e pergunta ao especialista.',
    hint: 'Ex.: para cardiologia, prioridade alta',
    structure: 'Para: especialidade ou servico.\nMotivo do encaminhamento.\nResumo clinico.\nExames ja realizados (se citados).\nSolicitacao ou pergunta ao especialista.\nPrioridade, se informada.'
  },
  exames: {
    title: 'Solicitacao de exames', base: 'exames',
    summary: 'Lista numerada dos exames com indicacao clinica.',
    hint: 'Ex.: hemograma, TSH, ressonancia de cranio',
    structure: 'Lista numerada com CADA exame solicitado, um por linha, com nome padronizado (ex.: 1. Hemograma completo).\nDepois: "Indicacao clinica:" com a justificativa e a hipotese diagnostica (CID se citado).\nSe nenhum exame especifico foi dito, liste os exames iniciais pertinentes ao quadro e escreva "(sugerido - confirmar)" ao lado de cada um.\nNao escreva paragrafos longos; o foco e a lista de exames.'
  },
  lme: {
    title: 'LME', base: 'lme',
    summary: 'Rascunho de LME com campos pendentes em destaque.',
    hint: 'Ex.: medicamento e CID',
    structure: 'Rascunho de LME (Laudo para Solicitacao de Medicamentos): medicamento(s) e quantidade por mes, CID-10, diagnostico, anamnese resumida, tratamentos previos.\nMarque com [preencher] os campos obrigatorios nao informados.'
  },
  spsadt: {
    title: 'Guia SP/SADT', base: 'spsadt',
    summary: 'Guia SP/SADT em formato de rascunho conferivel.',
    hint: 'Ex.: convenio e procedimentos',
    structure: 'Rascunho de guia SP/SADT: indicacao clinica, CID, procedimentos/exames solicitados em lista (com codigo TUSS se citado), carater (eletivo/urgencia).\nMarque com [preencher] os campos nao informados.'
  },
  aso: {
    title: 'ASO - Saude ocupacional', base: 'atestado',
    summary: 'Atestado de Saude Ocupacional com tipo de exame e conclusao apto/inapto.',
    hint: 'Ex.: admissional, empresa X, funcao auxiliar, apto',
    structure: 'Atestado de Saude Ocupacional (ASO), conforme NR-7:\nEmpresa e funcao do trabalhador.\nTipo de exame: admissional, periodico, retorno ao trabalho, mudanca de riscos ocupacionais ou demissional.\nRiscos ocupacionais.\nExames complementares realizados.\nConclusao: APTO ou INAPTO para a funcao.\nCampos de assinatura do medico examinador e do trabalhador.\nUse [preencher] para o que nao foi dito.'
  },
  retorno_trabalho: {
    title: 'Retorno ao trabalho', base: 'atestado',
    summary: 'Parecer de aptidao para retorno as atividades apos afastamento.',
    hint: 'Ex.: apto a partir de segunda, sem esforco por 15 dias',
    structure: 'Atestado de aptidao para retorno ao trabalho: o paciente foi avaliado nesta data apos afastamento (motivo e periodo, se citados) e encontra-se APTO ou INAPTO para retornar as atividades a partir de [data].\nRestricoes ou recomendacoes, se houver.\nUse [preencher] para o que nao foi dito.'
  },
  comparecimento: {
    title: 'Declaracao de comparecimento', base: 'atestado',
    summary: 'Declara que o paciente compareceu ao atendimento, com horario.',
    hint: 'Ex.: das 14h as 15h, acompanhante: mae',
    structure: 'Declaracao de comparecimento: declaro que [paciente] compareceu a atendimento nesta data, no periodo de [inicio] as [fim].\nSem diagnostico e sem CID.\nUse [preencher] para horarios nao informados.'
  },
  relatorio: {
    title: 'Relatorio medico', base: 'evolucao',
    summary: 'Relatorio completo do caso para pericia, convenio ou outro profissional.',
    hint: 'Ex.: para pericia do INSS',
    structure: 'Relatorio medico: historia clinica, exame fisico, exames realizados, diagnostico/hipoteses (CID se citado), tratamento realizado, situacao atual e recomendacoes.\nLinguagem formal e objetiva.'
  },
  orientacoes: {
    title: 'Orientacoes ao paciente', base: 'evolucao',
    summary: 'Orientacoes em linguagem simples para entregar ao paciente.',
    hint: 'Ex.: dieta, como tomar o remedio',
    structure: 'Orientacoes ao paciente em linguagem simples, em topicos curtos:\nO que e o problema.\nComo usar os medicamentos citados.\nCuidados em casa.\nSinais de alerta para procurar atendimento.\nQuando retornar.'
  }
}

const templates = Object.entries(DOCUMENT_TYPES).map(([value, item]) => [value, item.title, item.summary])

function ageFromBirth(birthDate) {
  const date = birthDate ? new Date(`${birthDate}T00:00:00`) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const beforeBirthday = now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 130 ? String(age) : ''
}

function formatBirthDate(birthDate) {
  return birthDate ? birthDate.split('-').reverse().join('/') : ''
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => Array.from(document.querySelectorAll(selector))

function today() {
  return new Date().toLocaleDateString('pt-BR')
}

function saveStore() {
  localStorage.setItem('medvoz.visits', JSON.stringify(store.visits.slice(0, 300)))
  localStorage.setItem('medvoz.patients', JSON.stringify(store.patients))
  localStorage.setItem('medvoz.settings', JSON.stringify(store.settings))
  localStorage.setItem('medvoz.templates', JSON.stringify(store.customTemplates))
  localStorage.setItem('medvoz.trash', JSON.stringify(store.trash))
  localStorage.setItem('medvoz.agentChat', JSON.stringify(store.agentChat.slice(-60)))
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
  // Only the fields typed in the Atendimento form; clinical data lives in the patient record.
  const birthDate = $('#patientBirth').value
  return {
    name: $('#patientName').value.trim(),
    birthDate,
    age: ageFromBirth(birthDate),
    document: $('#patientDoc').value.trim(),
    phone: $('#patientPhone').value.trim(),
    specialty: $('#specialty').value
  }
}

function getPatientForAi() {
  // Patient data sent to the AI: form fields plus the clinical data already saved for this patient.
  const draft = getPatientDraft()
  const saved = currentVisitPatient() || store.patients.find((patient) => patient.key && patient.key === patientKey(draft))
  return {
    name: draft.name,
    birthDate: draft.birthDate,
    age: draft.age || saved?.age || '',
    document: draft.document,
    phone: draft.phone,
    allergies: saved?.allergies || '',
    medications: saved?.medications || '',
    conditions: saved?.conditions || ''
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

function getClinicianDraft() {
  return {
    clinicName: store.settings.clinicName || '',
    doctorName: store.settings.doctorName || '',
    doctorCrm: store.settings.doctorCrm || '',
    doctorSpecialty: store.settings.doctorSpecialty || '',
    footerText: store.settings.footerText || ''
  }
}

const SIGNATURE_RULE = '______________________________'

function formatCrm(crm) {
  const value = String(crm || '').trim()
  return value && !/crm/i.test(value) ? `CRM ${value}` : value
}

function signatureBlock() {
  // Signature area at the end of every document; the letterhead already carries the clinic.
  const clinician = getClinicianDraft()
  const detail = [formatCrm(clinician.doctorCrm), clinician.doctorSpecialty].filter(Boolean).join(' · ')
  const lines = [clinician.doctorName, detail].filter(Boolean)
  return lines.length ? `\n\n${SIGNATURE_RULE}\n${lines.join('\n')}` : ''
}

function stripAiSignature(text) {
  // The app adds its own signature; drop sign-off lines the AI may have written at the end.
  const clinician = getClinicianDraft()
  const markers = [clinician.doctorName, clinician.doctorCrm, clinician.doctorSpecialty, clinician.clinicName]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.length >= 3)
  const lines = String(text || '').replace(/\s+$/, '').split('\n')
  while (lines.length) {
    const last = lines[lines.length - 1].trim().toLowerCase()
    const isSignOff = !last
      || /^_{3,}$/.test(last)
      || /^(assinatura|carimbo)/.test(last)
      || markers.some((marker) => last.includes(marker))
    if (!isSignOff) break
    lines.pop()
  }
  return lines.join('\n')
}

function fillDocumentPlaceholders(text) {
  // Safety net in case the AI still leaves blanks for data the app already knows.
  const clinician = getClinicianDraft()
  const patient = getPatientForAi()
  const known = [
    [/\[\s*(nome (do|da) (m[eé]dic[oa]|profissional)|m[eé]dic[oa]|profissional)\s*\]/gi, clinician.doctorName],
    [/\[\s*(n[uú]mero (do|de) )?crm[^\]]*\]/gi, formatCrm(clinician.doctorCrm)],
    [/\[\s*especialidade[^\]]*\]/gi, clinician.doctorSpecialty],
    [/\[\s*(nome (da|do) )?(cl[ií]nica|consult[oó]rio|estabelecimento)\s*\]/gi, clinician.clinicName],
    [/\[\s*(nome (do|da) )?paciente\s*\]/gi, patient.name],
    [/\[\s*data de nascimento\s*\]/gi, formatBirthDate(patient.birthDate)],
    [/\[\s*idade\s*\]/gi, patient.age ? `${patient.age} anos` : ''],
    [/\[\s*(cpf|rg|documento)[^\]]*\]/gi, patient.document],
    [/\[\s*data( (de hoje|atual|do atendimento))?\s*\]/gi, today()]
  ]
  return known.reduce((result, [pattern, value]) => (value ? result.replace(pattern, value) : result), String(text || ''))
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
  // MP4/M4A keep their index at the end of the file, so a partial slice is not playable.
  const canSlice = !store.importedFileName || SLICEABLE_AUDIO.test(sourceBlob.type || '')
  const blob = sampleOnly && canSlice
    ? sourceBlob.slice(0, Math.min(sourceBlob.size, 900000), sourceBlob.type || 'audio/webm')
    : sourceBlob
  const recordedName = sampleOnly ? 'amostra-medvoz.webm' : 'consulta-medvoz.webm'
  return {
    audioBytes: await blobToBytes(blob),
    mimeType: blob.type || 'audio/webm',
    fileName: store.importedFileName ? `${sampleOnly ? 'amostra-' : ''}${store.importedFileName}` : recordedName,
    diarize: !sampleOnly,
    context: getContext()
  }
}

function checkClinicalIntake(action) {
  const context = getContext()
  if (!context.reason || !context.specialty || !context.visitType) {
    status($('#gateStatus'), `Preencha especialidade, tipo e motivo clinico antes de ${action}.`, 'status-error')
    return false
  }
  if (!context.consent) {
    status($('#gateStatus'), `Confirme o consentimento antes de ${action}.`, 'status-error')
    return false
  }
  return true
}

function releaseCaptureStreams() {
  store.rawStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
  store.rawStreams = []
  if (store.mixContext) store.mixContext.close().catch(() => {})
  store.mixContext = null
  store.micStream = null
  store.systemStream = null
}

async function openRecordingStream() {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
  store.rawStreams = [mic]
  store.micStream = mic
  store.systemStream = null
  if ($('#audioSource').value !== 'mixed') return mic

  let system
  try {
    system = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
  } catch (error) {
    releaseCaptureStreams()
    throw new Error('Nao foi possivel capturar o som do computador. Tente novamente ou use somente o microfone.')
  }
  system.getVideoTracks().forEach((track) => track.stop())
  store.rawStreams.push(system)
  if (!system.getAudioTracks().length) {
    releaseCaptureStreams()
    throw new Error('O som do computador nao foi liberado. Use somente o microfone ou tente novamente.')
  }

  // Keep the sources apart for speaker separation, and mix them into one recording track.
  store.systemStream = new MediaStream(system.getAudioTracks())
  store.mixContext = new AudioContext()
  const destination = store.mixContext.createMediaStreamDestination()
  store.mixContext.createMediaStreamSource(mic).connect(destination)
  store.mixContext.createMediaStreamSource(new MediaStream(system.getAudioTracks())).connect(destination)
  return destination.stream
}

function setLiveUi(active) {
  $('#liveBadge').hidden = !active
  if (!active) return
  $('#liveStatus').hidden = false
}

function liveStatus(text, className = '') {
  const el = $('#liveStatus')
  el.hidden = !text
  status(el, text, className)
  el.classList.add('live-status')
}

function startLiveTranscription(stream) {
  store.liveText = ''
  store.liveGateOk = false
  if (!$('#liveToggle').checked || !window.MedVozLive) {
    liveStatus('')
    return
  }
  setLiveUi(true)
  window.MedVozLive.start(stream, {
    getContext,
    onText: (text) => {
      store.liveText = text
      store.liveGateOk = true
      if (store.finalTranscriptSet) return
      const area = $('#transcriptText')
      const atBottom = area.scrollTop + area.clientHeight >= area.scrollHeight - 24
      area.value = text
      if (atBottom) area.scrollTop = area.scrollHeight
    },
    onStatus: (text, className) => liveStatus(text, className),
    onBlocked: (message) => {
      store.liveText = ''
      store.liveGateOk = false
      $('#transcriptText').value = ''
      setLiveUi(false)
      liveStatus(message, 'status-error')
    }
  })
}

async function finishLiveTranscription() {
  if (!window.MedVozLive) return
  const result = await window.MedVozLive.stop()
  store.liveText = result.text
  store.liveGateOk = result.gateOk
  $('#liveBadge').hidden = true
  liveStatus('')
  if (!store.finalTranscriptSet && result.gateOk && result.text) $('#transcriptText').value = result.text
}

function startSpeakerTurns() {
  // Teleconsult: microphone = doctor, computer sound = patient (see js/speaker-turns.js).
  store.liveText = ''
  store.liveGateOk = false
  const showLive = $('#liveToggle').checked
  setLiveUi(showLive)
  window.MedVozTurns.start(store.micStream, store.systemStream, {
    getContext,
    onText: (text) => {
      store.liveText = text
      store.liveGateOk = true
      if (!showLive || store.finalTranscriptSet) return
      $('#transcriptText').value = text
    },
    onStatus: (text, className) => liveStatus(text, className),
    onBlocked: (message) => {
      store.liveText = ''
      store.liveGateOk = false
      $('#transcriptText').value = ''
      setLiveUi(false)
      liveStatus(message, 'status-error')
    }
  })
}

async function applyTeleconsultTranscript(result) {
  // Returns true when the teleconsult transcript was handled; false falls back to the full transcription.
  $('#liveBadge').hidden = true
  liveStatus('')
  if (result?.blocked) {
    store.finalTranscriptSet = true
    $('#transcriptText').value = ''
    status($('#gateStatus'), 'Nao foi encontrado assunto especifico de medicina/saude. A transcricao nao foi liberada.', 'status-error')
    setRecordingUi(false)
    return true
  }
  const tooManyFailures = result && result.failures > Math.max(1, Math.round(result.turns * 0.1))
  if (!result?.text || !result.turns || tooManyFailures) return false
  if (!(await ensureOpenAiConfigured())) return true
  status($('#gateStatus'), 'Validando a transcricao da teleconsulta...', 'status-warn')
  const gate = await window.medvozApi.classifyTranscript({ transcript: result.text, context: getContext() })
  store.gate = gate
  if (!gate?.ok || !gate.medical) {
    if (gate?.medical !== false) return false
    store.finalTranscriptSet = true
    $('#transcriptText').value = ''
    status($('#gateStatus'), gate.message || 'Nao foi encontrado assunto especifico de medicina/saude. A transcricao nao foi liberada.', 'status-error')
    setRecordingUi(false)
    return true
  }
  store.finalTranscriptSet = true
  store.liveText = result.text
  store.liveGateOk = true
  $('#transcriptText').value = result.text
  status($('#gateStatus'), 'Transcricao da teleconsulta pronta: microfone = medico, som do computador = paciente.', 'status-ok')
  saveVisit({ silent: true })
  setRecordingUi(false)
  return true
}

function recordedMs() {
  const running = store.startedAt ? Date.now() - store.startedAt : 0
  return (store.elapsedMs || 0) + running
}

function renderTimer() {
  $('#recordTimer').textContent = formatTimer(recordedMs())
}

function startTimer() {
  stopTimer()
  store.startedAt = Date.now()
  store.timer = setInterval(renderTimer, 500)
}

function stopTimer() {
  // Freezes the elapsed time; safe to call any number of times.
  if (store.startedAt) store.elapsedMs = (store.elapsedMs || 0) + (Date.now() - store.startedAt)
  store.startedAt = null
  clearInterval(store.timer)
  store.timer = null
}

async function startRecording() {
  if (store.starting || (store.recorder && store.recorder.state !== 'inactive')) return
  if (!checkClinicalIntake('gravar')) return

  // Lock the button right away: opening mic + system audio can take a moment.
  store.starting = true
  $('#btnStartRecord').disabled = true
  $('#recordStatus').textContent = 'Preparando microfone...'
  try {
    window.MedVozLive?.cancel()
    window.MedVozTurns?.cancel()
    store.stream = await openRecordingStream()
  } catch (error) {
    $('#btnStartRecord').disabled = false
    $('#recordStatus').textContent = 'Pronto para gravar'
    throw error
  } finally {
    store.starting = false
  }
  store.chunks = []
  store.audioBlob = null
  store.recordingReady = false
  store.stopPromise = null
  store.gate = null
  store.autoProcessing = false
  store.importedFileName = null
  startNewVisit()
  store.finalTranscriptSet = false
  $('#transcriptText').value = ''
  $('#btnPauseRecord').textContent = 'Pausar'
  $('#btnImportAudio').disabled = true
  $('#audioSource').disabled = true
  $('#liveToggle').disabled = true
  const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
  store.recorder = new MediaRecorder(store.stream, { mimeType: preferredMime })
  store.recorder.ondataavailable = (event) => {
    if (event.data?.size) store.chunks.push(event.data)
  }
  store.recorder.onstop = () => {
    stopTimer()
    renderTimer()
    store.stream?.getTracks().forEach((track) => track.stop())
    releaseCaptureStreams()
    $('#btnImportAudio').disabled = false
    $('#audioSource').disabled = false
    $('#liveToggle').disabled = false
    store.audioBlob = new Blob(store.chunks, { type: store.recorder?.mimeType || preferredMime })
    store.recordingReady = store.audioBlob.size > 0
    setRecordingUi(false)
    $('#recordStatus').textContent = store.recordingReady ? 'Gravacao encerrada' : 'Gravacao sem audio'
    if (store.recordingReady) {
      status($('#gateStatus'), `Audio pronto (${Math.round(store.audioBlob.size / 1024)} KB). Validando e transcrevendo automaticamente...`, 'status-warn')
    } else {
      status($('#gateStatus'), 'Nenhum audio foi capturado. Tente gravar novamente.', 'status-error')
    }
  }
  store.recorder.start(1000)
  if (store.systemStream && window.MedVozTurns) startSpeakerTurns()
  else startLiveTranscription(store.stream)
  store.elapsedMs = 0
  startTimer()
  renderTimer()
  $('#recordStatus').textContent = 'Gravando consulta'
  setRecordingUi(true)
}

function pauseRecording() {
  if (!store.recorder) return
  if (store.recorder.state === 'recording') {
    store.recorder.pause()
    window.MedVozLive?.pause()
    window.MedVozTurns?.pause()
    stopTimer()
    renderTimer()
    $('#recordStatus').textContent = 'Gravacao pausada'
    $('#btnPauseRecord').textContent = 'Retomar'
  } else if (store.recorder.state === 'paused') {
    store.recorder.resume()
    window.MedVozLive?.resume()
    window.MedVozTurns?.resume()
    startTimer()
    $('#recordStatus').textContent = 'Gravando consulta'
    $('#btnPauseRecord').textContent = 'Pausar'
  }
}

function stopRecording() {
  stopTimer()
  if (!store.recorder) return
  renderTimer()
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
  const turnsFinish = window.MedVozTurns?.isActive() ? window.MedVozTurns.stop() : null
  store.liveFinish = turnsFinish ? null : finishLiveTranscription().catch(() => {})
  store.stopPromise
    .then(async () => {
      if (turnsFinish && (await applyTeleconsultTranscript(await turnsFinish))) return
      return autoValidateAndTranscribe()
    })
    .catch((error) => status($('#gateStatus'), error.message || 'Falha ao finalizar audio.', 'status-error'))
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
    status($('#gateStatus'), gate.message || 'Nao foi encontrado assunto especifico de medicina/saude. A transcricao nao foi liberada.', 'status-error')
    return
  }
  $('#btnFullTranscribe').disabled = false
  status($('#gateStatus'), `Liberado: ${gate.category} (${Math.round((gate.confidence || 0) * 100)}% de confianca).`, 'status-ok')
  return gate
}

async function transcribeFull() {
  status($('#gateStatus'), 'Preparando audio completo para transcricao...', 'status-warn')
  const payload = await buildAudioPayload(false)
  status($('#gateStatus'), 'Transcrevendo audio completo com IA...', 'status-warn')
  const result = await window.medvozApi.transcribeAudio(payload)
  if (!result.ok) {
    if (store.liveFinish) await store.liveFinish
    if (store.liveGateOk && store.liveText) {
      $('#transcriptText').value = store.liveText
      status($('#gateStatus'), `${result.message || 'Falha na transcricao completa.'} Mantida a transcricao ao vivo (sem separacao por participante).`, 'status-warn')
      return
    }
    status($('#gateStatus'), result.message || 'Falha na transcricao completa.', 'status-error')
    return
  }
  // Validate exactly the text shown on screen, the same text later used to generate documents.
  const transcriptText = renderTranscript(result)
  const gate = await window.medvozApi.classifyTranscript({ transcript: transcriptText, context: getContext() })
  store.gate = gate
  if (!gate.ok || !gate.medical) {
    store.finalTranscriptSet = true
    $('#transcriptText').value = ''
    status($('#gateStatus'), gate.message || 'Nao foi encontrado assunto especifico de medicina/saude. A transcricao nao foi liberada.', 'status-error')
    return
  }
  store.finalTranscriptSet = true
  $('#transcriptText').value = transcriptText
  status($('#gateStatus'), 'Transcricao completa liberada para documentacao clinica.', 'status-ok')
  saveVisit({ silent: true })
  return result
}

async function autoValidateAndTranscribe() {
  if (store.autoProcessing || !store.recordingReady || !store.audioBlob?.size) return
  store.autoProcessing = true
  try {
    if (!(await ensureOpenAiConfigured())) return
    // Keep the approved live text on screen while the final transcription is prepared.
    if (!store.liveGateOk) $('#transcriptText').value = ''
    status($('#gateStatus'), 'Validando se o audio e de atendimento em saude...', 'status-warn')
    const gate = await validateSample()
    if (!gate?.ok || !gate.medical) {
      if (gate && gate.medical === false) {
        store.finalTranscriptSet = true
        $('#transcriptText').value = ''
      }
      return
    }
    status($('#gateStatus'), 'Assunto de saude confirmado. Transcrevendo conversa completa...', 'status-warn')
    await transcribeFull()
  } catch (error) {
    if (!store.liveGateOk) $('#transcriptText').value = ''
    status(
      $('#gateStatus'),
      error.message || 'Nao foi possivel transcrever. A transcricao e exclusiva para assuntos de medicina/saude.',
      'status-error'
    )
  } finally {
    store.autoProcessing = false
    setRecordingUi(false)
  }
}

function audioTypeFor(file) {
  const extension = String(file.name || '').split('.').pop().toLowerCase()
  if (file.type && !/^video\/mp4$/i.test(file.type)) return file.type
  return AUDIO_TYPES_BY_EXTENSION[extension] || file.type || 'audio/webm'
}

function readAudioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    const done = (value) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : 0)
    audio.onerror = () => done(0)
    audio.src = url
  })
}

async function importAudioFile(file) {
  if (!file) return
  if (store.recorder && store.recorder.state !== 'inactive') {
    status($('#gateStatus'), 'Encerre a gravacao atual antes de importar um audio.', 'status-error')
    return
  }
  if (!checkClinicalIntake('importar o audio')) return
  if (file.size > MAX_IMPORT_BYTES) {
    status($('#gateStatus'), `Arquivo grande demais (${Math.round(file.size / 1048576)} MB). O limite e 25 MB por audio.`, 'status-error')
    return
  }

  window.MedVozLive?.cancel()
  window.MedVozTurns?.cancel()
  const type = audioTypeFor(file)
  store.audioBlob = new Blob([file], { type })
  store.chunks = [store.audioBlob]
  store.recordingReady = store.audioBlob.size > 0
  store.importedFileName = file.name
  startNewVisit()
  store.stopPromise = null
  store.gate = null
  store.liveText = ''
  store.liveGateOk = false
  store.liveFinish = null
  store.finalTranscriptSet = false
  $('#liveBadge').hidden = true
  liveStatus('')
  $('#transcriptText').value = ''
  $('#recordStatus').textContent = `Audio importado: ${file.name}`
  const seconds = await readAudioDuration(store.audioBlob)
  $('#recordTimer').textContent = seconds ? formatTimer(seconds * 1000) : '--:--'
  setRecordingUi(false)
  status($('#gateStatus'), `Audio importado (${Math.round(file.size / 1024)} KB). Validando e transcrevendo automaticamente...`, 'status-warn')
  await autoValidateAndTranscribe()
}

const DOCTOR_CUES = /\b(vamos|vou (te |lhe )?(pedir|passar|solicitar|prescrever|receitar|examinar|encaminhar|auscultar)|receit|prescri|prescrev|solicit|encaminh|exames?\b|comprimidos?|\d+\s?mg\b|de \d+ em \d+ horas|retorno|respire|deite|abra a boca|pode (sentar|deitar|tirar)|desde quando|h[aá] quanto tempo|sente (alguma|dor)|tem (alergia|febre|dor)|alguma alergia|me (conta|fala|diz)|o que (te )?trouxe|como (voc[eê]|a senhora|o senhor) (est[aá]|ficou|tem)|press[aã]o|diagn[oó]stic|orienta[cç]|sinais de alarme|conduta)/gi
const PATIENT_CUES = /\b(eu (sinto|senti|tenho|tive|estou|t[oô]|fiquei|tomei|tomo|acho|n[aã]o consigo)|t[oô] (sentindo|com)|me d[oó]i|d[oó]i (muito|aqui|bastante)|doutora?\b|dr\.?a?\b|minha (dor|cabe[cç]a|barriga|press[aã]o|m[aã]e|filh)|meu (est[oô]mago|peito|filho|marido)|comecei a|faz (uns|umas|tr[eê]s|dois|duas|uma|um) (dia|dias|semana|semanas|m[eê]s|meses))/gi
const KNOWN_ROLE = /m[eé]dic|paciente|doutor|acompanhante|enfermeir/i

function countMatches(text, pattern) {
  pattern.lastIndex = 0
  return (String(text || '').match(pattern) || []).length
}

function assignSpeakerRoles(segments) {
  // In-person visits: the AI separates voices (A, B...) but does not know who is who.
  // Score each voice by what it says and name the doctor and the patient.
  const speakers = []
  segments.forEach((segment) => {
    const name = String(segment.speaker || '').trim()
    if (name && !speakers.includes(name)) speakers.push(name)
  })
  if (speakers.length < 2 || speakers.some((name) => KNOWN_ROLE.test(name))) return segments

  const stats = new Map(speakers.map((name, order) => [name, { order, words: 0, questions: 0, doctor: 0, patient: 0 }]))
  segments.forEach((segment) => {
    const item = stats.get(String(segment.speaker || '').trim())
    if (!item) return
    const text = String(segment.text || '')
    item.words += text.split(/\s+/).filter(Boolean).length
    item.questions += (text.match(/\?/g) || []).length
    item.doctor += countMatches(text, DOCTOR_CUES)
    item.patient += countMatches(text, PATIENT_CUES)
  })
  const doctorScore = (item) => item.questions * 1.2 + item.doctor * 2 - item.patient * 2 + (item.order === 0 ? 0.5 : 0)
  const ranked = [...stats.entries()].sort((a, b) => doctorScore(b[1]) - doctorScore(a[1]))
  const doctor = ranked[0][0]
  const patient = ranked.slice(1).sort((a, b) => (b[1].patient - b[1].doctor + b[1].words / 1000) - (a[1].patient - a[1].doctor + a[1].words / 1000))[0][0]
  const names = new Map(speakers.map((name) => [name, name === doctor ? 'Medico' : name === patient ? 'Paciente' : 'Acompanhante']))
  return segments.map((segment) => ({ ...segment, speaker: names.get(String(segment.speaker || '').trim()) || segment.speaker }))
}

function renderTranscript(result) {
  if (Array.isArray(result.segments) && result.segments.length) {
    return assignSpeakerRoles(result.segments).map((segment) => {
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
  const { documentType, template, isCustom } = resolveDocumentType()
  const result = await window.medvozApi.generateClinicalDocument({
    transcript,
    context: getContext(),
    patient: getPatientForAi(),
    clinician: getClinicianDraft(),
    documentType,
    template,
    tone: $('#tone').value,
    detailLevel: $('#detailLevel').value
  })
  if (!result.ok) {
    $('#clinicalDocument').value = result.message || 'Falha ao gerar documento.'
    return
  }
  const body = stripAiSignature(fillDocumentPlaceholders(result.document || ''))
  const title = isCustom ? template.name : (result.title || template.name)
  // Each generated document is a new entry in the visit history, saved automatically.
  store.currentDocId = null
  $('#clinicalDocument').value = `${title}\n\n${body}${signatureBlock()}`
  renderQuality(result.gaps, result.warnings)
  saveVisit({ silent: true })
}

function patientKey(draft) {
  return String(draft.document || draft.phone || draft.name || '').trim().toLowerCase()
}

function currentVisitPatient() {
  const visit = store.visits.find((item) => item.id === store.currentVisitId)
  return visit ? store.patients.find((patient) => patient.id === visit.patientId) || null : null
}

function upsertPatient(draft, preferredId = null) {
  const key = patientKey(draft)
  let patient = preferredId ? store.patients.find((item) => item.id === preferredId) : null
  if (!patient && key) patient = store.patients.find((item) => item.key === key)
  if (!patient) {
    patient = { id: Date.now(), createdAt: new Date().toISOString() }
    store.patients.unshift(patient)
  }
  // Never wipe saved data (allergies, medications...) with empty form fields.
  Object.entries(draft).forEach(([field, value]) => {
    if (value !== '' && value != null) patient[field] = value
  })
  patient.unnamed = !draft.name && !(patient.name && !patient.unnamed)
  if (!patient.name || patient.unnamed) patient.name = draft.name || 'Paciente sem nome'
  patient.key = key || `sem-nome-${patient.id}`
  return patient
}

function documentTitleOf(text) {
  return String(text || '').split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 90) || 'Documento'
}

function visitDocuments(visit) {
  // Visits saved before 1.0.10 had a single document field.
  if (!Array.isArray(visit.documents)) {
    visit.documents = visit.document
      ? [{ id: visit.id, type: visit.documentType || 'soap', title: documentTitleOf(visit.document), text: visit.document, html: visit.documentHtml || '', at: visit.createdAt || new Date(visit.id).toISOString() }]
      : []
  }
  return visit.documents
}

function saveVisit({ silent = false } = {}) {
  const draft = getPatientDraft()
  const current = store.visits.find((item) => item.id === store.currentVisitId)
  const currentPatient = current ? store.patients.find((item) => item.id === current.patientId) : null
  const keepPatient = currentPatient && (currentPatient.unnamed || currentPatient.key === patientKey(draft) || !patientKey(draft))
  const patient = upsertPatient(draft, keepPatient ? currentPatient.id : null)
  const visit = current || { id: Date.now(), date: today(), createdAt: new Date().toISOString() }
  const documents = visitDocuments(visit)
  const docText = $('#clinicalDocument').value.trim()
  const docHtml = typeof getDocumentHtml === 'function' ? getDocumentHtml() : ''
  const isRealDocument = docText && !/^(Gerando documento clinico|Falha|Uso bloqueado)/.test(docText)
  if (isRealDocument) {
    let entry = documents.find((item) => item.id === store.currentDocId)
    if (!entry) {
      entry = { id: Date.now() + 1, at: new Date().toISOString() }
      documents.unshift(entry)
      store.currentDocId = entry.id
    }
    Object.assign(entry, { type: $('#documentType').value, title: documentTitleOf(docText), text: docText, html: docHtml, updatedAt: new Date().toISOString() })
  }
  Object.assign(visit, {
    patientId: patient.id,
    context: getContext(),
    transcript: $('#transcriptText').value.trim() || visit.transcript || '',
    documentType: documents[0]?.type || $('#documentType').value,
    document: documents[0]?.text || '',
    documentHtml: documents[0]?.html || '',
    gate: store.gate || visit.gate || null,
    updatedAt: new Date().toISOString()
  })
  if (!current) store.visits.unshift(visit)
  store.currentVisitId = visit.id
  store.selectedPatientId = patient.id
  saveStore()
  renderAll()
  if (silent) {
    if (!store.autoSaveNotified) window.ui?.toast('Atendimento salvo automaticamente no historico do paciente.', 'info')
    store.autoSaveNotified = true
    return visit
  }
  switchPage('pacientes')
  window.ui?.toast(`Atendimento de ${patient.name} salvo.`)
  return visit
}

function startNewVisit() {
  // A new recording or imported audio is a new visit; documents generated after it go into it.
  store.currentVisitId = null
  store.currentDocId = null
  store.autoSaveNotified = false
}

function openVisit(visitId, documentId = null) {
  const visit = store.visits.find((item) => item.id === visitId)
  if (!visit) return
  const patient = store.patients.find((item) => item.id === visit.patientId)
  const context = visit.context || {}
  const documents = visitDocuments(visit)
  const doc = documents.find((item) => item.id === documentId) || documents[0] || null
  store.currentVisitId = visit.id
  store.currentDocId = doc ? doc.id : null
  store.autoSaveNotified = true
  store.finalTranscriptSet = true
  store.gate = visit.gate || null
  $('#patientName').value = patient && !patient.unnamed ? patient.name : (context.patientName || '')
  $('#patientBirth').value = patient?.birthDate || ''
  $('#patientDoc').value = patient?.document || ''
  $('#patientPhone').value = patient?.phone || ''
  if (context.specialty) $('#specialty').value = context.specialty
  if (context.visitType) $('#visitType').value = context.visitType
  $('#visitReason').value = context.reason || ''
  $('#recordConsent').checked = Boolean(context.consent)
  $('#transcriptText').value = visit.transcript || ''
  $('#clinicalDocument').value = doc?.text || ''
  if (doc?.type && Array.from($('#documentType').options).some((option) => option.value === doc.type)) $('#documentType').value = doc.type
  if (doc?.html && typeof setDocumentHtml === 'function') setDocumentHtml(doc.html)
  $('#recordTimer').textContent = '00:00'
  $('#recordStatus').textContent = `Atendimento de ${visit.date} aberto`
  status($('#gateStatus'), visit.transcript ? 'Transcricao carregada. Escolha um documento e clique em Gerar para criar outro.' : 'Este atendimento foi salvo sem transcricao.', visit.transcript ? 'status-ok' : 'status-warn')
  switchPage('atendimento')
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
    documentType: resolveDocumentType().documentType,
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

function renderDashboard() {
  const todayVisits = store.visits.filter((visit) => visit.date === today()).length
  $('#statToday').textContent = todayVisits
  $('#statPatients').textContent = store.patients.length
  $('#statDocs').textContent = store.visits.reduce((total, visit) => total + visitDocuments(visit).length, 0)
  $('#statGaps').textContent = $$('#qualityPanel .list-item').length || 0
  $('#recentVisits').innerHTML = store.visits.slice(0, 6).map((visit) => visitItem(visit)).join('') || emptyItem('Sem atendimentos', 'Comece pelo modulo Atendimento.')
}

function visitItem(visit) {
  const patient = store.patients.find((item) => item.id === visit.patientId)
  const context = visit.context || {}
  return `<div class="list-item"><div><h3>${escapeHtml(patient?.name || context.patientName || 'Paciente')}</h3><p>${escapeHtml(visit.date)} - ${escapeHtml(context.specialty)} - ${escapeHtml(context.visitType)}</p></div><div class="button-row"><button class="secondary-button compact" data-open-visit="${visit.id}">Abrir</button><button class="secondary-button compact icon-only danger-text" data-delete-visit="${visit.id}" title="Mover para a lixeira" aria-label="Mover atendimento para a lixeira">${TRASH_ICON}</button></div></div>`
}

function emptyItem(title, text) {
  return `<div class="list-item"><div><h3>${title}</h3><p>${text}</p></div></div>`
}

function renderPatients(filter = '') {
  const term = filter.toLowerCase()
  const patients = store.patients.filter((patient) => String(patient.name || '').toLowerCase().includes(term) || String(patient.document || '').includes(term))
  $('#patientList').innerHTML = patients.map((patient) => {
    const count = store.visits.filter((visit) => visit.patientId === patient.id).length
    return `<div class="list-item"><div><h3>${escapeHtml(patient.name)}</h3><p>${count} atendimento(s) - ${escapeHtml(patient.phone || patient.document || 'sem contato')}</p></div><button class="secondary-button compact" data-open-patient="${patient.id}">Ver</button></div>`
  }).join('') || emptyItem('Nenhum paciente', 'Salve um atendimento para criar o cadastro.')
}

function renderPatientDetail(patientId = store.selectedPatientId) {
  const patient = store.patients.find((item) => item.id === patientId)
  if (typeof renderPatientRecord === 'function') {
    store.selectedPatientId = patient ? patient.id : null
    renderPatientRecord(patient)
    return
  }
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
    ...visits.map((visit) => `- ${visit.date}: ${visit.context?.specialty || ''} / ${visit.context?.reason || ''}`)
  ].join('\n')
}

function baseTemplateTitle(value) {
  return templates.find(([key]) => key === value)?.[1] || value
}

function resolveDocumentType() {
  // Returns the type the AI server knows plus the structure the document must follow.
  const value = $('#documentType').value
  const extra = $('#docExtra')?.value.trim() || ''
  const custom = value.startsWith('custom:') ? store.customTemplates.find((item) => `custom:${item.id}` === value) : null
  const definition = DOCUMENT_TYPES[custom ? custom.base : value] || DOCUMENT_TYPES.soap
  const template = custom
    ? { name: custom.name, body: custom.body }
    : { name: definition.title, body: definition.structure }
  if (extra) template.body += `\n\nPedido do profissional para este documento (siga com prioridade e inclua exatamente): ${extra}`
  return { documentType: definition.base, template, isCustom: Boolean(custom) }
}

function updateDocExtraHint() {
  const value = $('#documentType').value
  const custom = value.startsWith('custom:') ? store.customTemplates.find((item) => `custom:${item.id}` === value) : null
  const definition = DOCUMENT_TYPES[custom ? custom.base : value] || DOCUMENT_TYPES.soap
  $('#docExtra').placeholder = `Detalhes para este documento (opcional). ${definition.hint}`
}

function renderDocumentTypeOptions() {
  const select = $('#documentType')
  const current = select.value
  if (!select.querySelector('option[data-builtin]')) {
    select.innerHTML = Object.entries(DOCUMENT_TYPES)
      .map(([value, item]) => `<option value="${value}" data-builtin>${escapeHtml(item.title)}</option>`)
      .join('')
  }
  select.querySelector('optgroup[data-custom]')?.remove()
  if (store.customTemplates.length) {
    const group = document.createElement('optgroup')
    group.label = 'Meus modelos'
    group.dataset.custom = 'true'
    store.customTemplates.forEach((template) => {
      const option = document.createElement('option')
      option.value = `custom:${template.id}`
      option.textContent = template.name
      group.appendChild(option)
    })
    select.appendChild(group)
  }
  select.value = Array.from(select.options).some((option) => option.value === current) ? current : 'soap'
  updateDocExtraHint()
}

function renderTemplates() {
  const custom = store.customTemplates.map((template) => `
    <article class="template-card is-custom">
      <span class="template-tag">Meu modelo &middot; ${escapeHtml(baseTemplateTitle(template.base))}</span>
      <h3>${escapeHtml(template.name)}</h3>
      <p>${escapeHtml(template.body.length > 180 ? `${template.body.slice(0, 180)}...` : template.body)}</p>
      <div class="button-row">
        <button class="primary-button compact" data-template="custom:${template.id}">Usar</button>
        <button class="secondary-button compact" data-edit-template="${template.id}">Editar</button>
        <button class="secondary-button compact danger-text" data-delete-template="${template.id}">Excluir</button>
      </div>
    </article>
  `).join('')
  const builtIn = templates.map(([value, title, prompt]) => `
    <article class="template-card">
      <span class="template-tag">Modelo pronto</span>
      <h3>${title}</h3>
      <p>${prompt}</p>
      <div class="button-row">
        <button class="secondary-button compact" data-template="${value}">Usar</button>
        <button class="secondary-button compact" data-customize-template="${value}">Personalizar</button>
      </div>
    </article>
  `).join('')
  $('#templateGrid').innerHTML = custom + builtIn
  renderDocumentTypeOptions()
}

function openTemplateEditor(template = null, preset = null) {
  store.editingTemplateId = template?.id || null
  $('#templateEditorTitle').textContent = template ? 'Editar modelo' : 'Novo modelo'
  $('#tplName').value = template?.name || preset?.name || ''
  $('#tplBase').value = template?.base || preset?.base || 'soap'
  $('#tplBody').value = template?.body || preset?.body || ''
  status($('#tplStatus'), '')
  $('#templateEditor').hidden = false
  $('#templateEditor').scrollIntoView({ behavior: 'smooth', block: 'start' })
  $('#tplName').focus()
}

function closeTemplateEditor() {
  store.editingTemplateId = null
  $('#templateEditor').hidden = true
}

function saveTemplate() {
  const name = $('#tplName').value.trim()
  const body = $('#tplBody').value.trim()
  if (!name || !body) {
    status($('#tplStatus'), 'Preencha o nome e a estrutura do modelo.', 'status-error')
    return
  }
  const data = { name, base: $('#tplBase').value, body, updatedAt: new Date().toISOString() }
  const existing = store.customTemplates.find((item) => item.id === store.editingTemplateId)
  if (existing) Object.assign(existing, data)
  else store.customTemplates.unshift({ id: Date.now(), ...data })
  saveStore()
  closeTemplateEditor()
  renderTemplates()
  renderAll()
  window.ui?.toast(existing ? 'Modelo atualizado.' : 'Modelo criado. Ele ja aparece no Atendimento.')
}

async function deleteTemplate(id) {
  const template = store.customTemplates.find((item) => item.id === id)
  if (!template) return
  const confirmed = await window.ui.confirm({
    title: 'Excluir modelo?',
    message: `O modelo "${template.name}" sera excluido. Documentos ja gerados com ele nao mudam.`,
    confirmLabel: 'Excluir',
    danger: true
  })
  if (!confirmed) return
  store.customTemplates = store.customTemplates.filter((item) => item.id !== id)
  saveStore()
  renderTemplates()
  renderAll()
  window.ui.toast('Modelo excluido.')
}

function renderSettings() {
  $('#clinicName').value = store.settings.clinicName || ''
  $('#doctorName').value = store.settings.doctorName || ''
  $('#doctorCrm').value = store.settings.doctorCrm || ''
  $('#doctorSpecialty').value = store.settings.doctorSpecialty || ''
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
  if (typeof renderExtras === 'function') renderExtras()
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
  const latest = result.version || result.latest_version || result.tag_name || ''
  const installed = result.installedVersion || store.config.version
  const wasAvailable = store.updateAvailable
  store.updateAvailable = Boolean(latest && compareVersions(latest, installed) > 0)
  $('#btnOpenUpdate').disabled = !store.updateAvailable && !latestUpdateUrl
  updateDownloadButtonLabel(result)
  $('#updateStatus').textContent = [
    `Versao instalada: ${installed}`,
    `Ultima disponivel: ${latest || 'nao informada'}`,
    store.updateAvailable ? 'Nova versao disponivel. Clique em "Baixar e instalar": o download acontece aqui mesmo e o MedVoz fecha sozinho para instalar.' : 'Voce ja esta na versao mais recente.',
    `Notas: ${result.notes || result.body || result.message || 'Sem notas disponiveis.'}`
  ].filter(Boolean).join('\n')
  if (store.updateAvailable && !wasAvailable) {
    window.ui?.toast(`Nova versao ${normalizeUpdateVersion(latest)} disponivel.`, 'info', {
      duration: 10000,
      action: { label: 'Atualizar', onClick: () => { switchPage('atualizacoes'); openLatestUpdate() } }
    })
  }
}

function showUpdateProgress(text, percent) {
  $('#updateProgress').hidden = false
  $('#updateProgressText').textContent = text
  $('#updateProgressBar').style.width = `${Math.max(0, Math.min(100, percent))}%`
}

async function openLatestUpdate() {
  if (store.updateAvailable && window.ghzApp.installUpdate) return installUpdateInApp()
  if (!latestUpdateUrl) await checkUpdates()
  if (store.updateAvailable && window.ghzApp.installUpdate) return installUpdateInApp()
  if (!latestUpdateUrl) return
  await window.ghzApp.openExternal(latestUpdateUrl)
}

async function installUpdateInApp() {
  if (store.recorder && store.recorder.state !== 'inactive') {
    window.ui?.toast('Encerre a gravacao antes de atualizar.', 'warn')
    return
  }
  const button = $('#btnOpenUpdate')
  button.disabled = true
  $('#btnCheckUpdates').disabled = true
  showUpdateProgress('Iniciando download...', 0)
  const unsubscribe = window.ghzApp.onUpdateProgress(({ received, total, version }) => {
    const mb = (bytes) => (bytes / 1048576).toFixed(1)
    const percent = total ? (received / total) * 100 : 0
    showUpdateProgress(`Baixando versao ${version}: ${mb(received)} de ${total ? mb(total) : '?'} MB (${Math.round(percent)}%)`, percent)
  })
  try {
    const result = await window.ghzApp.installUpdate()
    if (result?.ok) {
      showUpdateProgress(result.dev
        ? `Download verificado (modo desenvolvimento, instalador nao executado): ${result.path}`
        : 'Download concluido. Abrindo o instalador e fechando o MedVoz...', 100)
      return
    }
    $('#updateProgress').hidden = true
    window.ui?.toast(result?.message || 'Nao foi possivel baixar a atualizacao.', result?.upToDate ? 'info' : 'error', latestUpdateUrl && !result?.upToDate
      ? { action: { label: 'Baixar pelo navegador', onClick: () => window.ghzApp.openExternal(latestUpdateUrl) } }
      : undefined)
  } finally {
    unsubscribe()
    button.disabled = false
    $('#btnCheckUpdates').disabled = false
  }
}

function applyOpenAiStatusToGate(result) {
  if (!result?.configured) {
    status($('#gateStatus'), result?.message || 'Servidor de IA nao configurado.', 'status-warn')
  } else if ($('#gateStatus').textContent.includes('Servidor de IA')) {
    status($('#gateStatus'), 'Grave e clique em Encerrar para transcrever automaticamente.', 'status-ok')
  }
}

async function refreshOpenAiStatusEverywhere() {
  const result = await window.medvozApi.getOpenAiStatus()
  const el = $('#openaiStatus')
  if (el) {
    el.textContent = result.message || (result.configured ? '' : 'Servidor de IA nao configurado.')
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
  $('#btnOpenUpdate').textContent = latest && compareVersions(latest, installed) > 0 ? 'Baixar e instalar' : 'Abrir download'
}

async function askAgent() {
  // The chat UI lives in features.js.
  if (typeof sendAgentMessage === 'function') return sendAgentMessage()
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
  $('#btnCopyDoc').addEventListener('click', () => {
    if (typeof copyDocument === 'function') return copyDocument()
    return navigator.clipboard.writeText($('#clinicalDocument').value)
  })
  $('#btnSaveVisit').addEventListener('click', () => saveVisit())
  $('#documentType').addEventListener('change', updateDocExtraHint)
  $('#btnCheckUpdates').addEventListener('click', checkUpdates)
  $('#btnOpenUpdate').addEventListener('click', openLatestUpdate)
  $('#btnAskAgent').addEventListener('click', guardedAskAgent)
  $('#btnPasteTranscript').addEventListener('click', async () => {
    $('#transcriptText').value = await navigator.clipboard.readText()
  })
  $('#btnSaveSettings').addEventListener('click', async () => {
    store.settings = {
      ...store.settings,
      clinicName: $('#clinicName').value.trim(),
      doctorName: $('#doctorName').value.trim(),
      doctorCrm: $('#doctorCrm').value.trim(),
      doctorSpecialty: $('#doctorSpecialty').value.trim(),
      footerText: $('#footerText').value.trim(),
      detailLevel: $('#detailLevel').value,
      tone: $('#tone').value
    }
    saveStore()
    renderAll()
    window.ui?.toast('Ajustes salvos.')
    await refreshOpenAiStatusEverywhere()
  })
  $('#btnDemo').addEventListener('click', () => {
    $('#patientName').value = 'Marina Alves'
    $('#patientBirth').value = '1978-03-14'
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
    const remove = event.target.closest('[data-delete-visit]')
    if (remove && typeof trashVisit === 'function') {
      trashVisit(Number(remove.dataset.deleteVisit))
      return
    }
    const button = event.target.closest('[data-open-visit]')
    if (!button) return
    openVisit(Number(button.dataset.openVisit))
  })
  $('#templateGrid').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-template]')
    if (edit) {
      openTemplateEditor(store.customTemplates.find((item) => item.id === Number(edit.dataset.editTemplate)))
      return
    }
    const remove = event.target.closest('[data-delete-template]')
    if (remove) {
      deleteTemplate(Number(remove.dataset.deleteTemplate))
      return
    }
    const customize = event.target.closest('[data-customize-template]')
    if (customize) {
      const [value, title, prompt] = templates.find(([key]) => key === customize.dataset.customizeTemplate)
      openTemplateEditor(null, { name: `${title} (meu modelo)`, base: value, body: prompt })
      return
    }
    const button = event.target.closest('[data-template]')
    if (!button) return
    $('#documentType').value = button.dataset.template
    switchPage('atendimento')
  })
  $('#btnNewTemplate').addEventListener('click', () => openTemplateEditor())
  $('#btnCancelTemplate').addEventListener('click', closeTemplateEditor)
  $('#btnSaveTemplate').addEventListener('click', saveTemplate)
  $('#btnImportAudio').addEventListener('click', () => $('#audioFile').click())
  $('#audioFile').addEventListener('change', (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    importAudioFile(file).catch((error) => status($('#gateStatus'), error.message, 'status-error'))
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
