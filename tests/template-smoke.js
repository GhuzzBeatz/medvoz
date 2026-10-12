const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const requiredFiles = [
  'main.js', 'preload.js', 'index.html', 'app.config.js',
  'css/style.css', 'css/license.css', 'js/app.js', 'js/license.js',
  'pages/licenca.html', 'services/license-service.js',
  'components/ghz-support.js', 'components/ghz-window-bar.js', 'assets/ghz-logo.png'
]

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Arquivo obrigatorio ausente: ${file}`)
}

const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const support = fs.readFileSync(path.join(root, 'components', 'ghz-support.js'), 'utf8')
const windowBar = fs.readFileSync(path.join(root, 'components', 'ghz-window-bar.js'), 'utf8')
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
const licensePage = fs.readFileSync(path.join(root, 'pages', 'licenca.html'), 'utf8')
const licenseJs = fs.readFileSync(path.join(root, 'js', 'license.js'), 'utf8')
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8')
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
const aiStandardPath = path.join(root, 'docs', 'ai-support-standard.md')
if (!fs.existsSync(aiStandardPath)) throw new Error('Padrao de Ajuda IA ausente: docs/ai-support-standard.md')
const aiStandard = fs.readFileSync(aiStandardPath, 'utf8')

if (!main.includes('requestSingleInstanceLock')) throw new Error('Single-instance lock ausente.')
if (!main.includes("'pages', 'licenca.html'")) throw new Error('Licenca nao abre antes do aplicativo.')
if (!main.includes('sessionAuthorized')) throw new Error('Gate do processo principal ausente.')
if (!main.includes('app.getVersion()') || !main.includes('app:open-support')) throw new Error('Versao/suporte da tela de licenca devem vir do processo principal.')
if (!main.includes('https://ghzplugin.com.br/suporte/')) throw new Error('URL oficial de suporte ausente no processo principal.')
if (appConfig.includes('appVersion')) throw new Error('Nao duplique versao no app.config.js; use package/app.getVersion().')
if (!preload.includes('openSupport')) throw new Error('Preload deve expor abertura segura do suporte.')
if (!licensePage.includes('appVersion') || !licensePage.includes('Abrir suporte')) throw new Error('Tela de licenca deve mostrar versao e botao de suporte.')
if (!licenseJs.includes('Versao ${config.version}') || !licenseJs.includes('window.ghzApp.openSupport()')) throw new Error('Tela de licenca deve preencher versao oficial e abrir suporte.')
if (!index.includes('class="sidebar"') || !index.includes('class="workspace"')) throw new Error('Layout base incompleto.')
if (!support.includes('background:transparent') || support.includes('Atendimento e suporte')) throw new Error('Suporte nao segue o padrao integrado.')
if (support.includes('ghz-support-head') || support.includes('ghz-support-logo') || support.includes('GHZ Plugin')) throw new Error('Suporte deve ser minimalista, sem cabecalho, foto ou marca.')
if (!support.includes("dataset.mode || 'whatsapp'") || !support.includes("mode === 'ai'")) throw new Error('Suporte deve permitir modo WhatsApp padrao e modo IA opcional.')
if (!support.includes("siteLabel = script?.dataset.siteLabel || 'Suporte'")) throw new Error('Rodape deve trocar Site por Suporte por padrao.')
if (!support.includes('https://ghzplugin.com.br/suporte/')) throw new Error('Rodape deve apontar para a URL especifica de suporte.')
if (!windowBar.includes('ghz-winbar') || !index.includes('components/ghz-window-bar.js')) throw new Error('Barra de janela padrao ausente.')
if (!readme.includes('Supabase Secrets') || !readme.includes('Nao pergunte ao usuario se pode salvar a chave localmente')) throw new Error('README deve orientar IA via Supabase Secrets, sem pergunta sobre chave local.')
if (!aiStandard.includes('Nunca commitar chaves') || !aiStandard.includes("Deno.env.get('OPENAI_API_KEY')")) throw new Error('Padrao IA deve exigir segredo no Supabase e leitura por Edge Function.')
if (!aiStandard.includes('nao salva essa chave em `.env.local`')) throw new Error('Padrao IA deve bloquear uso de .env.local para chave OpenAI do app.')

process.stdout.write('Template smoke test passed.\n')
