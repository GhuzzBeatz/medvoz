# Prompt para criar novo projeto GHZ

Use este texto quando quiser pedir a criacao de um novo aplicativo.

```text
Crie um novo aplicativo GHZ seguindo integralmente o repositorio GHZ_APP_STANDARD.

Repositorio/pasta de referencia:
C:\Users\gusta\Documents\SOFTWARES QUE CRIEI\_GHZ_APP_STANDARD

Leia antes:
- README.md
- docs/APP_STANDARD.md
- docs/DOWNLOADS_E_ATUALIZACOES.md
- docs/CHECKLIST_NOVO_APP.md
- docs/CATALOGO_APPS.md

O novo app precisa obrigatoriamente:
- ser Electron para Windows;
- usar janela sem barra nativa do Windows;
- manter sidebar fixa esquerda e conteudo na direita;
- usar components/ghz-window-bar.js para tema/minimizar/maximizar/fechar;
- usar components/ghz-support.js com WhatsApp, site e logo GHZ;
- abrir primeiro pages/licenca.html;
- validar licenca no processo principal;
- falhar fechado quando a licenca nao validar;
- ter aba/area de atualizacao;
- usar appId publico fixo para licenca, download e update;
- ter link fixo no HTML venda;
- nao alterar URLs de download/update/Supabase/GitHub durante ajustes visuais;
- nao subir node_modules, dist, dist_installer, instaladores ou segredos.

Dados do novo app:
- Nome:
- Segmento:
- App ID publico:
- Prefixo da chave:
- Tipo de licenca: Supabase ou local
- Tipo de download: pagina fixa ghzplugin.com.br/baixar/{appId}.html ou endpoint de download
- Cores:
- Telas/modulos:
- Regras especificas:

Antes de finalizar:
- rode npm run check;
- confirme que o link fixo de download esta documentado;
- atualize o README do app;
- informe o que foi criado, como testar e o que ainda precisa publicar no GitHub/site.
```

## Prompt curto

```text
Crie este app seguindo o padrao em C:\Users\gusta\Documents\SOFTWARES QUE CRIEI\_GHZ_APP_STANDARD. Preserve janela sem barra nativa, winbar GHZ, suporte GHZ, licenca antes do app, appId fixo, link fixo no HTML venda e aba de atualizacao. Leia o README e os docs antes de implementar.
```
