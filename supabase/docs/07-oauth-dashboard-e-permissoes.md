# 07 - OAuth no painel e permissoes

Este documento registra exatamente o que deve ser configurado no OAuth App do Supabase para o broker criar ou reutilizar o projeto do cliente, preparar tabelas e obter a chave publica.

## Onde criar

1. Entre no Supabase Dashboard com a conta GHZ.
2. Abra a organizacao GHZ, sem entrar em um projeto especifico.
3. Abra `Organization Settings`.
4. Entre em `OAuth Apps`.
5. Clique em `Add application` ou `Publish OAuth app`.

Crie um OAuth App por produto. Nao reutilize Client ID entre produtos em producao.

## Campos

Exemplo MesaUp:

```text
Name: MesaUp Client Cloud
Redirect URI: https://wpkaaxarresldcstaatj.supabase.co/functions/v1/mesaup-client-cloud/callback
```

Padrao para app novo:

```text
Name: <APP_NAME> Client Cloud
Redirect URI: https://<CENTRAL_PROJECT_REF>.supabase.co/functions/v1/<BROKER_FUNCTION>/callback
```

O Redirect URI do painel, da Edge Function e do pedido de token deve ser identico, incluindo `/callback`, protocolo e ausencia/presenca de barra final.

## Permissoes obrigatorias

Configure os scopes no OAuth App do Dashboard:

| Grupo | Acesso | Motivo |
| --- | --- | --- |
| Organizations | Read | listar as organizacoes que a conta autorizada pode usar |
| Projects | Read | localizar e reutilizar o projeto ja criado |
| Projects | Write | criar o projeto do app quando ele ainda nao existe |
| Database | Write | executar o SQL que cria/atualiza as tabelas |
| Secrets | Read | obter somente a chave publica/publishable do projeto |

Nao habilite por padrao:

- Auth Read/Write;
- Domains Read/Write;
- Edge Functions Read/Write;
- Environment Read/Write;
- Rest Read/Write;
- Secrets Write;
- Storage Read/Write.

Esses acessos so devem ser adicionados quando um recurso real do produto precisar deles e houver teste/documentacao.

## Mudanca importante do Supabase

Os scopes agora sao definidos no OAuth App do Dashboard. O parametro `scope=all` na URL de autorizacao esta depreciado e nao deve ser usado em novos brokers.

Quando as permissoes de um OAuth App existente forem alteradas, usuarios que ja autorizaram o app precisam revogar/autorizar novamente para receber os novos scopes.

## Secrets da Edge Function

Use nomes por produto, com fallback generico somente quando planejado:

```text
<APP>_SUPABASE_CLIENT_ID
<APP>_SUPABASE_CLIENT_SECRET
<APP>_SUPABASE_REDIRECT_URI
<APP>_SUPABASE_DONE_URL
```

Exemplo MesaUp:

```text
MESAUP_SUPABASE_CLIENT_ID
MESAUP_SUPABASE_CLIENT_SECRET
MESAUP_SUPABASE_REDIRECT_URI
MESAUP_SUPABASE_DONE_URL
```

O Client Secret nunca vai para Electron, HTML, GitHub, log, arquivo `.env.local` distribuido ou banco do cliente.

## Checklist contra erro 403

- OAuth App publicado, nao apenas salvo como rascunho.
- Client ID pertence ao OAuth App correto.
- Client Secret atualizado na Edge Function.
- Redirect URI identico em todos os pontos.
- Organizations Read habilitado.
- Projects Read e Write habilitados.
- Database Write habilitado.
- Secrets Read habilitado.
- Usuario reautorizou depois de uma mudanca de scope.
- Broker lista projetos por organizacao quando a API exigir esse caminho.

## Teste minimo

1. Abra a rota raiz/health da function e confirme `configured=true`.
2. Autorize com conta que ja possui organizacao e projeto.
3. Autorize com conta nova.
4. Confirme que o projeto e reutilizado numa segunda conexao.
5. Confirme que as tabelas foram criadas.
6. Confirme que nenhum token foi exibido no console ou na tela.

Fonte oficial: `https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration` e a pagina `oauth-scopes` ligada a esse guia.
