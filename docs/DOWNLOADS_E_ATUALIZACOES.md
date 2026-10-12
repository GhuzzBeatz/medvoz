# Downloads e atualizacoes

Este documento registra a regra mais importante dos apps GHZ: o cliente e o aplicativo instalado devem ter sempre um caminho fixo para chegar na versao mais atual.

## Principio

O link visivel para o cliente nao deve mudar a cada versao. Quem muda e o arquivo publicado por tras do link.

Exemplo correto:

```text
Cliente recebe sempre:
https://ghzplugin.com.br/baixar/nexhotel.html

Por tras, essa pagina/servico aponta para a release/asset mais atual.
```

Exemplo errado:

```text
Cliente recebe um link direto para:
NexHotel-Setup-1.0.24.exe
```

O nome do instalador pode mudar a cada versao. O link de venda/download nao.

## Dois caminhos oficiais

Hoje o HTML venda usa dois tipos de download.

### Apps com pagina fixa no site

Apps no conjunto `BAIXAR_PAGES` recebem link:

```text
https://ghzplugin.com.br/baixar/{appId}.html
```

Esse caminho e usado para apps que precisam de pagina de download com verificacao de licenca, orientacao de instalacao, video ou experiencia mais completa.

Exemplos identificados no HTML venda:

```text
mesaup
nexhotel
petflow
studioflow
imobcore
medcore
folhapro
spectrapiano
zapdisparo
zapbot
zapbotia
donestok
```

### Apps com download direto pelo servico

Apps fora do conjunto `BAIXAR_PAGES` usam a Edge Function de downloads:

```text
{DOWNLOAD_API}?app={appId}&download=1
```

Esse caminho deve resolver o instalador mais atual sem expor token privado de GitHub no cliente.

## Regra do HTML venda

No gerador de chaves, cada app deve ter:

```js
{
  id: 'nexhotel',
  nome: 'NexHotel',
  desc: 'Hotelaria',
  prefix: 'NEXHTL',
  online: true
}
```

Campos:

- `id`: identificador publico fixo do app. Nao renomear depois de publicado.
- `nome`: nome comercial mostrado ao cliente.
- `desc`: segmento/descricao curta.
- `prefix`: prefixo das chaves.
- `online`: `true` quando usa licenca central/Supabase; `false` quando usa licenca local.
- `downloadId`: usar apenas quando o id de licenca for diferente do id de download.

Ao criar app novo:

1. Definir `appId` publico antes do primeiro release.
2. Cadastrar o app em `APPS`.
3. Decidir se entra em `BAIXAR_PAGES`.
4. Testar a mensagem gerada para Mercado Livre/WhatsApp.
5. Clicar no link gerado e confirmar que baixa/abre a pagina certa.

## Regra do aplicativo instalado

Todo app precisa ter uma aba ou area de atualizacao. Essa area deve usar o mesmo identificador publico do app para buscar:

- versao atual disponivel;
- URL de download;
- data da release;
- notas de versao, quando existir.

O app instalado nao deve depender de um link hardcoded para arquivo `.exe` com versao no nome. Ele deve depender de um manifesto, pagina fixa ou endpoint fixo.

## Manifesto recomendado

Quando o app usa endpoint/manifesto, o retorno ideal e:

```json
{
  "app": "nexhotel",
  "version": "1.0.25",
  "downloadUrl": "https://...",
  "releaseDate": "2026-08-06",
  "notes": "Correcao de bugs e melhorias."
}
```

O app compara `version` com a versao instalada e oferece o download.

## Publicacao semanal

Para apps que atualizam toda semana:

1. Corrigir/implementar.
2. Atualizar `version` no `package.json`.
3. Rodar `npm run check`.
4. Gerar instalador.
5. Publicar a nova release/asset.
6. Confirmar que o endpoint/pagina fixa agora resolve a versao nova.
7. Testar link do HTML venda.
8. Testar aba de atualizacao dentro do app.

## O que nunca fazer

- Nao trocar `https://ghzplugin.com.br/baixar/{appId}.html` depois que cliente ja recebeu esse link.
- Nao colar link direto de release privada no HTML venda.
- Nao colocar token `GITHUB_RELEASE_TOKEN` no frontend ou no app instalado.
- Nao renomear `appId` para ficar mais bonito depois da publicacao.
- Nao alterar `BAIXAR_PAGES` sem testar a geracao de mensagem.
- Nao publicar update sem testar o caminho de download final.

## Checklist de download/update

- [ ] `appId` publico definido e documentado.
- [ ] App cadastrado no HTML venda.
- [ ] Prefixo de chave definido.
- [ ] Link gerado no HTML venda testado.
- [ ] Pagina fixa ou endpoint fixo funcionando.
- [ ] Release/asset publicado no local correto.
- [ ] Aba de atualizacao do app usa identificador fixo.
- [ ] Nenhum token ou segredo exposto no app/HTML.
- [ ] Cliente recebe sempre o mesmo link publico.
