# 01 - Arquitetura da Integracao Supabase

## Objetivo

Criar um padrao unico para que qualquer aplicativo desktop da GHZ Plugin consiga usar Supabase sem centralizar os dados operacionais do cliente na conta da GHZ.

O modelo recomendado e:

- GHZ Plugin: controla licencas, atualizacoes e broker de conexao.
- Cliente: controla o projeto Supabase onde ficam os dados reais do app.
- Aplicativo desktop: funciona localmente e sincroniza com o Supabase do cliente quando a nuvem estiver ativada.

## Componentes

### 1. App desktop

Exemplos: MesaUp, MedCore, FolhaPro.

Responsabilidades:

- guardar dados locais para funcionamento offline;
- validar licenca com o backend GHZ;
- abrir a tela de conexao Supabase;
- salvar localmente somente `project_url` e `anon_key` do projeto do cliente;
- sincronizar dados locais com tabelas `app_*` ou `mc_*` do cliente;
- nunca guardar segredos administrativos.

### 2. Projeto Supabase GHZ

Responsabilidades:

- guardar licencas;
- hospedar Edge Functions de broker;
- validar app, licenca e dispositivo;
- opcionalmente servir manifest de atualizacao;
- manter secrets somente no servidor.

O projeto GHZ pode ter:

- `ghz_licenses`;
- `ghz_license_devices`;
- `ghz_license_events`;
- Edge Function de update/download;
- Edge Function de broker OAuth.

### 3. Broker OAuth

E uma Edge Function que roda no projeto GHZ.

Responsabilidades:

- iniciar login OAuth do Supabase;
- receber callback;
- trocar `code` por token usando client secret no servidor;
- criar ou localizar projeto Supabase do cliente;
- rodar SQL inicial no projeto do cliente;
- obter a chave publica/anon do projeto;
- devolver ao app somente URL + anon key.

### 4. Projeto Supabase do cliente

Responsabilidades:

- armazenar dados reais do estabelecimento/empresa;
- sincronizar entre computadores;
- permitir dashboard web/mobile do dono;
- permitir integracoes futuras.

Cada cliente deve ter seu proprio projeto. Isso reduz risco de vazamento entre clientes.

## Fluxo de conexao

1. Cliente abre o app.
2. App valida licenca no projeto GHZ.
3. App mostra botao `Conectar Supabase`.
4. App abre navegador no broker GHZ com uma sessao temporaria.
5. Cliente autoriza a conta Supabase dele.
6. Broker cria/localiza projeto do cliente.
7. Broker prepara as tabelas.
8. Broker devolve `project_url` e `anon_key`.
9. App salva essa conexao localmente.
10. App inicia sincronizacao.

## Modo local + modo nuvem

O app deve continuar funcionando sem Supabase.

Recomendacao:

- Modo local: dados ficam no computador.
- Modo nuvem: dados locais sincronizam com Supabase do cliente.
- Se a internet cair: app continua local e tenta sincronizar depois.

## Nomes por app

Cada app deve ter identificadores proprios:

- `APP_ID`: identificador interno do app.
- `APP_SLUG`: usado no canal de atualizacao.
- `LICENSE_PREFIX`: prefixo da licenca.
- `BROKER_FUNCTION_NAME`: nome da Edge Function.
- `CLIENT_TABLE_PREFIX`: prefixo das tabelas no projeto do cliente.

Exemplo MesaUp:

- `APP_ID=mesaup`
- `APP_SLUG=mesaup`
- `LICENSE_PREFIX=MESAUP`
- `BROKER_FUNCTION_NAME=mesaup-connect`
- `CLIENT_TABLE_PREFIX=mu_`

## Decisao importante

Nao misturar dados de todos os clientes em um unico banco publico.

Para produtos vendidos a muitos clientes, o mais seguro e:

- cada cliente usa o Supabase dele;
- a GHZ nao precisa manter dado operacional;
- os custos de banco ficam com o cliente;
- a responsabilidade de armazenamento fica mais clara.
