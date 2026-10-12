const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const files = [
  'main.js',
  'preload.js',
  'app.config.js',
  'index.html',
  'js/app.js',
  'js/license.js',
  'services/license-service.js',
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
if (!main.includes('OPENAI_API_KEY')) throw new Error('Leitura de chave OpenAI ausente.')
if (!main.includes('audio/transcriptions')) throw new Error('Transcricao OpenAI ausente.')
if (!main.includes('gpt-4o-transcribe-diarize')) throw new Error('Diarizacao ausente.')
if (!main.includes('isSessionAuthorized')) throw new Error('Gate de licenca ausente.')
if (!preload.includes('contextBridge') || !preload.includes('medvozApi')) throw new Error('Preload seguro incompleto.')
if (!index.includes('data-page-panel="atendimento"')) throw new Error('Tela Atendimento ausente.')
if (!index.includes('data-page-panel="atualizacoes"')) throw new Error('Tela Atualizacoes ausente.')
if (!app.includes('navigator.mediaDevices.getUserMedia')) throw new Error('Gravacao por microfone ausente.')
if (!app.includes('validateSample')) throw new Error('Triagem medica antes da transcricao ausente.')
if (!config.includes("appId: 'medvoz'")) throw new Error('appId publico incorreto.')
if (!gitignore.includes('.env.*')) throw new Error('Arquivos .env devem ser ignorados.')

process.stdout.write('MedVoz smoke test passed.\n')
