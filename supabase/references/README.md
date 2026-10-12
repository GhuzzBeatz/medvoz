# Referencias funcionais

Esta pasta preserva implementacoes que ja funcionaram em producao/teste real.

## MesaUp

Contem o broker OAuth, migrations de vinculo/dispositivos e cliente de sincronizacao usados como base para:

- primeiro computador local;
- computadores adicionais via mesma organizacao Supabase;
- limite de cinco dispositivos;
- criacao/reuso de projeto;
- criacao automatica de tabelas;
- sincronizacao bidirecional.

O arquivo foi copiado como referencia historica e ainda pode conter o parametro depreciado `scope=all`. Em implementacoes novas, configure scopes no Dashboard e nao envie esse parametro, conforme `../docs/07-oauth-dashboard-e-permissoes.md`.

## MedCore

Contem a implementacao anterior que comprovou o fluxo de OAuth, criacao do projeto e banco do proprio cliente.

## Como reutilizar

Nao copie cegamente. Compare as duas referencias e adapte:

- nome e ID do app;
- prefixo e tabelas;
- migration central;
- mensagens do usuario;
- URL do broker e callback;
- provedor real de licenca;
- endpoint de atualizacao.

Nunca copie Client ID como padrao de outro produto. Crie um OAuth App separado.
