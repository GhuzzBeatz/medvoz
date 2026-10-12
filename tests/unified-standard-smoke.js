const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const required = [
  'docs/CRIAR_NOVO_APP.md',
  'docs/DOWNLOADS_E_ATUALIZACOES.md',
  'supabase/app-cloud.config.example.json',
  'supabase/docs/07-oauth-dashboard-e-permissoes.md',
  'supabase/docs/08-licenca-e-multiplos-computadores.md',
  'supabase/docs/09-fluxo-completo-e-testes.md',
  'supabase/references/mesaup/mesaup-client-cloud.ts',
  'supabase/references/mesaup/client-cloud.js',
  'supabase/references/mesaup/license-devices.sql',
  'supabase/references/medcore/medcore-connect.ts',
  'supabase/templates/prompts/prompt-integrar-app.md'
]

function read(file) {
  const full = path.join(root, file)
  if (!fs.existsSync(full)) throw new Error(`Arquivo obrigatorio ausente: ${file}`)
  return fs.readFileSync(full, 'utf8')
}

required.forEach(read)

const readme = read('README.md')
const oauth = read('supabase/docs/07-oauth-dashboard-e-permissoes.md')
const devices = read('supabase/docs/08-licenca-e-multiplos-computadores.md')
const flow = read('supabase/docs/09-fluxo-completo-e-testes.md')
const prompt = read('supabase/templates/prompts/prompt-integrar-app.md')
const config = JSON.parse(read('supabase/app-cloud.config.example.json'))
const appConfig = require('../app.config.js')

if (!readme.includes('unico repositorio') && !readme.includes('unico lugar')) throw new Error('README nao apresenta o repositorio unificado.')
if (!oauth.includes('Organizations | Read') || !oauth.includes('Projects | Write') || !oauth.includes('Database | Write') || !oauth.includes('Secrets | Read')) throw new Error('Scopes minimos do OAuth nao estao documentados.')
if (!oauth.includes('scope=all') || !oauth.includes('depreciado')) throw new Error('Mudanca de scopes do Supabase nao esta documentada.')
if (!devices.includes('Segundo ao quinto computador') || !devices.includes('Organizacao diferente')) throw new Error('Regra de licenca multi-PC incompleta.')
if (!flow.includes('nunca substituir um arquivo local inteiro por uma resposta vazia')) throw new Error('Protecao dos dados locais ausente.')
if (!prompt.includes('segundo PC sem Supabase bloqueado') || !prompt.includes('organizacao diferente bloqueada')) throw new Error('Prompt nao exige testes de protecao da licenca.')
if (config.maxCloudDevices !== 5 || appConfig.cloud.maxDevices !== 5) throw new Error('Limite padrao de dispositivos deve ser 5.')
if (!appConfig.cloud.requiredOnAdditionalDevices) throw new Error('Supabase deve ser obrigatorio nos computadores adicionais.')

const forbiddenValuePatterns = [
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  /\bsba_[A-Za-z0-9_-]{16,}\b/,
  /\bsbp_[A-Za-z0-9_-]{16,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/
]

for (const file of required.concat(['README.md', 'app.config.js'])) {
  const content = read(file)
  if (forbiddenValuePatterns.some(pattern => pattern.test(content))) throw new Error(`Possivel secret real encontrado em ${file}`)
}

process.stdout.write('Unified GHZ/Supabase standard smoke test passed.\n')
