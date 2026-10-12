Trabalhe no aplicativo [CAMINHO_DO_APP] usando `GHZ_APP_STANDARD` como repositorio oficial unico.

Antes de editar:

- leia o contexto do aplicativo;
- leia `docs/CRIAR_NOVO_APP.md` do padrao;
- leia `supabase/docs/07-oauth-dashboard-e-permissoes.md`;
- leia `supabase/docs/08-licenca-e-multiplos-computadores.md`;
- compare as referencias funcionais do MesaUp e MedCore;
- liste arquivos que serao alterados e explique a arquitetura.

Dados do produto:

```text
APP_NAME=
APP_ID=
APP_SLUG=
LICENSE_PREFIX=
BROKER_FUNCTION=
CLIENT_TABLE_PREFIX=
CLIENT_PROJECT_NAME=
CLIENT_PROJECT_REGION=sa-east-1
TABLES=
UPDATE_ENDPOINT=
```

Objetivo:

1. O aplicativo deve continuar funcionando localmente e preservar todos os dados existentes.
2. O primeiro computador pode usar a licenca sem Supabase.
3. Do segundo ao quinto computador, a mesma licenca so entra depois de conectar a mesma conta/organizacao Supabase.
4. A licenca nao pode ser vinculada a organizacoes diferentes.
5. O cliente nao digita Project URL, anon key, senha tecnica ou SQL.
6. O botao Conectar Supabase abre OAuth no navegador com PKCE.
7. O broker reutiliza organizacao/projeto ja vinculado e so cria projeto quando necessario.
8. O broker cria/atualiza tabelas automaticamente com SQL idempotente e RLS.
9. A primeira sincronizacao mescla dados locais e remotos sem apagar historico.
10. Cada gravacao local importante agenda sync em segundo plano.
11. Licenca e auto-update atuais nao podem quebrar.
12. Textos da interface devem ser simples para usuario leigo.

OAuth App no Dashboard:

- Organizations: Read;
- Projects: Read e Write;
- Database: Write;
- Secrets: Read;
- nao usar `scope=all` em implementacao nova;
- nao pedir outras permissoes sem necessidade comprovada.

Seguranca obrigatoria:

- nunca colocar `service_role`, OAuth Client Secret, token GitHub, senha ou chave privada no Electron;
- secrets somente na Edge Function;
- nunca exibir token em log ou mensagem;
- validar `state`, PKCE, licenca e dispositivo no servidor;
- usar hash da licenca em vinculos;
- manter RLS nas tabelas expostas;
- nao confiar em `user_metadata` para autorizacao.

Secrets esperados:

```text
<APP>_SUPABASE_CLIENT_ID
<APP>_SUPABASE_CLIENT_SECRET
<APP>_SUPABASE_REDIRECT_URI
<APP>_SUPABASE_DONE_URL
```

Testes obrigatorios:

- primeiro PC offline;
- primeira conexao com dados locais antigos;
- reconexao reutilizando projeto;
- segundo PC sem Supabase bloqueado;
- segundo PC na mesma organizacao liberado;
- organizacao diferente bloqueada;
- sexto PC bloqueado;
- conta Supabase nova;
- internet indisponivel depois da ativacao;
- schema repetido sem apagar dados;
- atualizador interno e instalador validados;
- busca por secrets antes do commit.

Nao gere setup, nao faça commit e nao publique ate receber autorizacao explicita. Ao final, informe arquivos alterados, testes, secrets pendentes e resultado de cada fluxo.
