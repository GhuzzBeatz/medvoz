# Checklist para criar novo app GHZ

Use este checklist quando pedir ou iniciar qualquer novo aplicativo.

## 1. Identidade

- [ ] Nome comercial definido.
- [ ] Segmento/objetivo definido.
- [ ] `appId` publico curto, minusculo e fixo definido.
- [ ] Prefixo de chave definido.
- [ ] Cores do app definidas.
- [ ] Logo/abreviacao definida para `app.config.js`.

## 2. Base tecnica

- [ ] App criado a partir deste padrao ou conferido contra ele.
- [ ] `main.js` usa `app.requestSingleInstanceLock()`.
- [ ] `BrowserWindow` usa `frame: false`.
- [ ] `contextIsolation: true`.
- [ ] `nodeIntegration: false`.
- [ ] `sandbox: true`.
- [ ] DevTools desativado em build instalado.
- [ ] Navegacao externa bloqueada por padrao.
- [ ] Links de suporte abrem com `shell.openExternal`.

## 3. Interface

- [ ] Sidebar fixa na esquerda.
- [ ] Conteudo principal na direita.
- [ ] Barra GHZ de janela no rodape da sidebar.
- [ ] Suporte GHZ abaixo/junto do rodape da sidebar.
- [ ] Logo GHZ no suporte.
- [ ] WhatsApp oficial no suporte.
- [ ] Site oficial no suporte.
- [ ] Tema claro/escuro funcionando.
- [ ] Sem barra nativa do Windows.
- [ ] Sem botoes duplicados de janela.

## 4. Licenca

- [ ] App abre primeiro em `pages/licenca.html`.
- [ ] `index.html` so carrega depois da licenca valida.
- [ ] Validacao real implementada em `services/license-service.js`.
- [ ] Falha de rede nao libera app.
- [ ] Chave invalida nao libera app.
- [ ] Nenhum admin token dentro do app instalado.
- [ ] `appId` da licenca bate com o `appId` publico.

## 5. HTML venda / gerador de chaves

- [ ] App cadastrado no array `APPS`.
- [ ] `id`, `nome`, `desc`, `prefix` e `online` preenchidos.
- [ ] `downloadId` definido se for diferente do `id`.
- [ ] App colocado em `BAIXAR_PAGES`, se tiver pagina fixa.
- [ ] Mensagem Mercado Livre gerada corretamente.
- [ ] Mensagem WhatsApp gerada corretamente.
- [ ] Link final testado manualmente.

## 6. Download e atualizacao

- [ ] Link publico fixo definido.
- [ ] App instalado tem aba/area de atualizacao.
- [ ] Update usa manifesto, endpoint ou pagina fixa.
- [ ] Update nao aponta direto para `.exe` temporario.
- [ ] Versao instalada aparece para o usuario.
- [ ] Nova versao e detectada corretamente.
- [ ] Download da nova versao abre pelo link oficial.

## 7. Build e release

- [ ] `package.json` atualizado.
- [ ] `build.appId` definido.
- [ ] `build.productName` definido.
- [ ] `version` atualizado.
- [ ] `npm install` executado se necessario.
- [ ] `npm run check` aprovado.
- [ ] `npm run dist` gerou instalador.
- [ ] Instalador testado em maquina limpa ou perfil limpo.
- [ ] Release/asset publicado no local correto.
- [ ] Link fixo aponta para a versao atual.

## 8. Documentacao do novo app

- [ ] README do app criado.
- [ ] Regras especificas do app documentadas.
- [ ] Endpoints usados documentados sem segredos.
- [ ] Tabelas/Supabase documentadas sem chaves privadas.
- [ ] Fluxo de licenca documentado.
- [ ] Fluxo de update documentado.
- [ ] Catalogo deste repositorio atualizado.

## 9. Bloqueios antes de publicar

Nao publicar se algum item abaixo for verdadeiro:

- [ ] Link de download ainda muda por versao.
- [ ] App abre sem licenca valida.
- [ ] Existe token privado no codigo.
- [ ] `dist_installer/` ou instalador esta sendo commitado no Git.
- [ ] Suporte GHZ foi removido.
- [ ] Barra nativa do Windows voltou.
- [ ] `appId` nao foi definido.
- [ ] HTML venda nao gera mensagem correta.
