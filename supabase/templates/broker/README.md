# Template - Broker OAuth Supabase

`index.ts` e apenas um esqueleto conceitual e nao esta pronto para deploy. Para uma implementacao completa, comece por `../../references/mesaup/mesaup-client-cloud.ts` e adapte cada identificador, migration, tabela e mensagem.

Principios:

- Client Secret somente em variavel de ambiente.
- Service role somente na Edge Function.
- App desktop recebe somente URL + anon key do projeto do cliente.
- Nunca servir HTML sensivel pelo broker; redirecionar para pagina estatica de sucesso/erro.
- Usar PKCE, validar `state` e vincular a sessao ao dispositivo.
- Configurar scopes no OAuth App do Dashboard; nao usar `scope=all` em brokers novos.
- Reutilizar organizacao/projeto ja vinculado antes de criar outro.
- Bloquear organizacao diferente e mais de cinco dispositivos.

Veja `../../docs/03-passo-a-passo-integracao.md`, `../../docs/07-oauth-dashboard-e-permissoes.md` e `../../docs/08-licenca-e-multiplos-computadores.md` antes de implementar.
