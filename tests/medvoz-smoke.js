const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const files = [
  'main.js',
  'preload.js',
  'app.config.js',
  'index.html',
  'js/app.js',
  'js/mic-visualizer.js',
  'js/live-transcription.js',
  'js/speaker-turns.js',
  'js/ui-kit.js',
  'js/features.js',
  'js/license.js',
  'services/license-service.js',
  'services/update-service.js',
  'pages/licenca.html',
  'css/style.css',
  'components/ghz-window-bar.js',
  'components/ghz-support.js'
]

for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Arquivo ausente: ${file}`)
}

const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8')
const config = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8')
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')

if (!main.includes('requestSingleInstanceLock')) throw new Error('Single-instance lock ausente.')
if (!main.includes('callMedVozAi')) throw new Error('Proxy seguro de IA ausente.')
if (main.includes('ai:save-openai-key')) throw new Error('Cliente nao deve configurar chave OpenAI local.')
if (!main.includes('fallbackUpdateEndpoint')) throw new Error('Fallback de atualizacao GitHub ausente.')
if (!config.includes('medvoz-ai')) throw new Error('Endpoint de IA MedVoz ausente.')
if (!main.includes('isSessionAuthorized')) throw new Error('Gate de licenca ausente.')
if (!preload.includes('contextBridge') || !preload.includes('medvozApi')) throw new Error('Preload seguro incompleto.')
if (preload.includes('saveOpenAiKey')) throw new Error('Preload nao deve expor salvamento de chave OpenAI.')
if (!index.includes('data-page-panel="atendimento"')) throw new Error('Tela Atendimento ausente.')
if (!index.includes('data-page-panel="atualizacoes"')) throw new Error('Tela Atualizacoes ausente.')
if (!index.includes('id="btnOpenUpdate"')) throw new Error('Botao de download de atualizacao ausente.')
if (index.includes('id="openaiKey"')) throw new Error('Cliente nao deve ver campo de chave OpenAI.')
if (!index.includes('id="doctorCrm"') || !index.includes('data-whatsapp-label="WhatsApp"')) throw new Error('Ajustes do medico ou suporte WhatsApp ausentes.')
if (!app.includes('navigator.mediaDevices.getUserMedia')) throw new Error('Gravacao por microfone ausente.')
if (!app.includes('validateSample')) throw new Error('Triagem medica antes da transcricao ausente.')
if (!app.includes('ensureRecordingReady')) throw new Error('Finalizacao segura do audio ausente.')
if (!app.includes('autoValidateAndTranscribe')) throw new Error('Transcricao automatica ao encerrar ausente.')
if (!app.includes('getClinicianDraft')) throw new Error('Dados fixos do medico ausentes.')
if (!app.includes('guardedValidateSample')) throw new Error('Validacao sem gate OpenAI local.')
if (!config.includes("appId: 'medvoz'")) throw new Error('appId publico incorreto.')
if (!config.includes('ghz-app-downloads?app=medvoz')) throw new Error('Endpoint central GHZ para MedVoz ausente.')
if (!index.includes('js/features.js') || !index.includes('id="docEditor"') || !index.includes('data-page-panel="lixeira"')) throw new Error('Recursos do workspace ausentes no HTML.')
if (!main.includes('document:export-pdf') || !preload.includes('exportPdf')) throw new Error('Exportacao de PDF ausente.')
if (!main.includes('update:install') || !preload.includes('installUpdate')) throw new Error('Atualizacao dentro do app ausente.')
if (!index.includes('js/speaker-turns.js') || !app.includes('assignSpeakerRoles') || !app.includes('startSpeakerTurns')) throw new Error('Separacao medico/paciente ausente.')
if (!app.includes('DOCUMENT_TYPES') || !app.includes('retorno_trabalho') || !index.includes('id="patientBirth"') || !index.includes('id="docExtra"')) throw new Error('Documentos ou ficha do paciente incompletos.')
if (index.includes('id="openaiStatus"')) throw new Error('Status do servidor GHZ nao deve aparecer ao cliente.')
if (main.includes('cmd.exe')) throw new Error('Atualizacao nao deve abrir janela de CMD.')
if (!main.includes('approvedTranscripts')) throw new Error('Cache de transcricoes aprovadas ausente.')
if (!main.includes('setDisplayMediaRequestHandler')) throw new Error('Captura do som do computador ausente.')
if (!gitignore.includes('.env.*')) throw new Error('Arquivos .env devem ser ignorados.')

process.stdout.write('MedVoz smoke test passed.\n')
