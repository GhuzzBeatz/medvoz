# Padrao obrigatorio de aplicativos GHZ

Este documento descreve como todo aplicativo GHZ deve ser construido. Ele deve ser lido antes de criar, corrigir, redesenhar ou publicar qualquer novo app.

## Objetivo do padrao

Todo app GHZ precisa parecer parte da mesma familia de produtos e, ao mesmo tempo, manter sua identidade propria. O padrao evita que cada projeto nasca diferente, com link quebrado, licenca improvisada, suporte duplicado ou layout inconsistente.

O app pode mudar de segmento, telas e cores, mas nao pode mudar as regras estruturais abaixo sem decisao explicita.

## Tecnologia base

- Plataforma principal: Electron para Windows.
- Linguagens principais: JavaScript, HTML e CSS.
- Build recomendado: `electron-builder` com alvo NSIS para Windows.
- Processo principal: `main.js`.
- Ponte segura entre renderer e main: `preload.js`.
- Configuracao de identidade do app: `app.config.js`.
- Validacao de licenca: `services/license-service.js`.

## Estrutura esperada

```text
app.config.js
main.js
preload.js
package.json
index.html
pages/licenca.html
css/
js/
components/
services/
assets/
tests/
```

Pastas geradas, dependencias e instaladores nao fazem parte do codigo-fonte do padrao:

```text
node_modules/
dist/
dist_installer/
*.exe
*.zip
*.log
.env
```

## Interface obrigatoria

Todo aplicativo deve usar a estrutura visual GHZ:

- Janela sem barra nativa do Windows (`frame: false` no `BrowserWindow`).
- Sidebar fixa na esquerda.
- Conteudo principal na direita.
- Tema claro/escuro persistido em `localStorage`.
- Barra compacta GHZ no rodape da sidebar, acima do suporte.
- Botoes de janela compactos: alternar tema, minimizar, maximizar/restaurar e fechar.
- Suporte GHZ fixo no rodape da sidebar.
- Logo/foto da marca GHZ no suporte.
- WhatsApp e site oficial sempre acessiveis.
- Layout sem cartao extra envolvendo o suporte.

O template atual monta esses blocos com:

- `components/ghz-window-bar.js`
- `components/ghz-support.js`
- `assets/ghz-logo.png`
- `css/style.css`

## Barra de janela GHZ

A barra oficial fica em `components/ghz-window-bar.js` e deve ser montada no rodape da sidebar.

```html
<script
  src="components/ghz-window-bar.js"
  data-target=".menu-footer"
  data-accent="var(--accent)"
  data-theme-key="ghz-app-theme"
></script>
```

Regras:

- Nao voltar a barra nativa do Windows.
- Nao duplicar botoes de minimizar/maximizar/fechar fora do padrao.
- Nao remover a troca de tema.
- Nao deixar a barra em cima do conteudo principal.
- Nao trocar `frame: false` por `frame: true` sem decisao explicita.

## Suporte GHZ

O suporte oficial fica em `components/ghz-support.js`.

```html
<script
  src="components/ghz-support.js"
  data-target=".menu-footer-support"
  data-accent="var(--accent)"
></script>
```

Regras:

- Manter WhatsApp oficial: `https://wa.me/5511948981459`.
- Manter suporte oficial: `https://ghzplugin.com.br/suporte/`.
- Abrir links externos no navegador padrao.
- Nao colocar suporte em modal escondido.
- Nao remover a logo GHZ.
- Nao criar suporte diferente por app sem necessidade real.

## Licenca obrigatoria

Todo app comercial precisa abrir primeiro a tela de licenca.

Fluxo correto:

1. `main.js` carrega `pages/licenca.html`.
2. O usuario informa a chave.
3. O renderer chama o processo principal via `preload.js`.
4. `main.js` valida a chave usando `services/license-service.js`.
5. Somente com resposta valida o app carrega `index.html`.

Regra de seguranca: a licenca deve ser fail-closed. Erro de rede, resposta invalida ou provedor nao configurado nunca libera o aplicativo.

Nao fazer:

- Nao validar licenca somente no HTML.
- Nao liberar app apenas com `localStorage`.
- Nao deixar `index.html` acessivel antes da sessao autorizada.
- Nao colocar token administrativo dentro do app instalado.

## Processo principal seguro

O `BrowserWindow` deve manter:

```js
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  devTools: !app.isPackaged
}
```

Tambem manter:

- `app.requestSingleInstanceLock()`;
- bloqueio de navegacao indevida em `will-navigate`;
- bloqueio de novas janelas com `setWindowOpenHandler`;
- `shell.openExternal` somente para URLs confiaveis;
- DevTools ativo apenas em desenvolvimento.

## Navegacao e conteudo web

Se o app precisar abrir paginas externas ou conteudo do site GHZ dentro da interface, usar `BrowserView`/webview isolado e seguro, com:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`;
- `webSecurity: true`;
- lista de dominios permitidos.

Nao usar `iframe` com Node habilitado.

## Identidade por aplicativo

Cada app deve ter identidade propria em:

- `app.config.js`: `appName`, `appLogoText`, cores;
- `package.json`: `name`, `version`, `build.appId`, `build.productName`;
- HTML venda: `id`, `nome`, `prefix`, `online`, `downloadId` quando necessario;
- sistema de licencas: `app_id` publico;
- sistema de download/update: mesmo `app_id` publico.

O `app_id` publico deve ser curto, minusculo e estavel, por exemplo:

```text
mesaup
nexhotel
medcore
folhapro
zapdisparo
zapbot
zapbotia
cleanboost
```

Depois de publicado, esse identificador nao deve ser renomeado.

## Atualizacao obrigatoria

Todo app novo precisa ter uma aba ou area de atualizacao. Essa area deve:

- mostrar versao instalada;
- indicar quando existe nova versao;
- usar o link/manifesto fixo do app;
- abrir o download oficial;
- nunca apontar direto para arquivo temporario;
- nunca depender do nome exato do asset se houver proxy/manifesto oficial.

Detalhes ficam em `docs/DOWNLOADS_E_ATUALIZACOES.md`.

## Build e publicacao

Antes de publicar:

1. Atualizar `version` em `package.json`.
2. Exibir versao na interface via `app.getVersion()` ou `package.json`, sem duplicar manualmente.
3. Rodar `npm run check`.
4. Gerar instalador com `npm run dist`.
5. Publicar instalador no local oficial do app.
6. Testar download pelo HTML venda.
7. Testar atualizacao/download dentro do app.
8. Confirmar que o link publico nao mudou.

## Regras absolutas

- Nunca quebrar link fixo de download.
- Nunca trocar `app_id` publico depois de publicado.
- Nunca subir instalador pesado no codigo-fonte.
- Nunca commitar `.env`, tokens ou senhas.
- Nunca liberar app sem licenca valida.
- Nunca remover suporte GHZ.
- Nunca restaurar barra nativa do Windows sem decisao explicita.
- Nunca alterar URLs de Supabase, GitHub, manifestos ou paginas de download durante ajustes apenas visuais.
