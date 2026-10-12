# 03 - Passo a Passo para Integrar em um App

Use este roteiro sempre que for colocar Supabase proprio do cliente em um novo aplicativo.

## 1. Definir identificadores do app

Antes de mexer no codigo, preencher:

```text
APP_NAME=
APP_ID=
APP_SLUG=
LICENSE_PREFIX=
BROKER_FUNCTION_NAME=
CLIENT_TABLE_PREFIX=
TABLES=
```

Exemplo MesaUp:

```text
APP_NAME=MesaUp
APP_ID=mesaup
APP_SLUG=mesaup
LICENSE_PREFIX=MESAUP
BROKER_FUNCTION_NAME=mesaup-connect
CLIENT_TABLE_PREFIX=mu_
TABLES=config,mesas,comandas,produtos,clientes,garcons,financeiro,fornecedores,pedidos_delivery,pedidos_mesa
```

## 2. Criar OAuth App no Supabase

No Supabase:

1. Abrir organizacao.
2. Ir em OAuth Apps.
3. Criar novo OAuth App.
4. Definir Redirect URI:

```text
https://<PROJETO_GHZ>.supabase.co/functions/v1/<BROKER_FUNCTION_NAME>/callback
```

5. Copiar Client ID.
6. Gerar Client Secret.
7. Salvar Client Secret somente nos secrets da Edge Function.

## 3. Criar broker do app

Copiar `templates/broker/index.ts` e ajustar:

- `APP_NAME`;
- `BROKER_FUNCTION_NAME`;
- `CLIENT_ID`;
- `REDIRECT_URI`;
- `TABLES`;
- prefixo das tabelas;
- nome do projeto criado no Supabase do cliente.

O broker deve:

- iniciar OAuth;
- receber callback;
- provisionar projeto;
- rodar SQL;
- devolver URL + anon key.

## 4. Preparar SQL do cliente

Usar `templates/sql/client_schema_template.sql` como base.

Cada tabela deve ter:

- `row_id` como chave primaria;
- `record jsonb` com os dados do app;
- `updated_at`;
- `deleted_at`;
- `version`;
- `source_client`.

## 5. Adicionar tela de conexao no app

Criar uma tela do tipo:

- explicacao sobre Supabase do cliente;
- checkbox de aceite/responsabilidade;
- botao `Conectar Supabase`;
- status de conexao;
- botao `Desconectar`.

O app deve abrir o navegador no broker:

```text
<BROKER_URL>/start?session=<SESSION_ID>&device_id=<DEVICE_ID>
```

Depois deve fazer polling em:

```text
<BROKER_URL>/provision?state=<SESSION_ID>
<BROKER_URL>/status?state=<SESSION_ID>
```

## 6. Adicionar motor de sync

Usar `templates/app/supabase-sync.js` como base.

O sync deve:

- ler dados locais;
- transformar cada registro em linha JSONB;
- enviar alteracoes para Supabase;
- baixar alteracoes de outros dispositivos;
- resolver conflito por `version` e `updated_at`;
- trabalhar offline sem travar o app.

## 7. Integrar com o db local

Toda vez que o app salvar algo importante, chamar:

```js
notificarSync()
```

Exemplos:

- produto criado;
- mesa alterada;
- comanda fechada;
- pagamento recebido;
- pedido delivery aceito;
- fornecedor atualizado.

## 8. Configuracoes no app

Em Configuracoes, mostrar:

- Supabase conectado/desconectado;
- nome da conta/organizacao;
- data da conexao;
- ultimo sync;
- botao sincronizar agora;
- botao desconectar/trocar conta.

## 9. Testes obrigatorios

Antes de publicar:

- conectar Supabase novo;
- criar dados no PC 1;
- abrir PC 2 e sincronizar;
- alterar no PC 2 e ver no PC 1;
- ficar offline e voltar;
- testar conflito simples;
- testar desconexao;
- validar que nao existe segredo no app.

## 10. Publicacao

So publicar depois de:

- testes locais passarem;
- build gerar instalador;
- update manifest apontar para o app correto;
- licenca validar;
- broker estar com secrets configurados;
- RLS estar ativo nas tabelas do cliente.
