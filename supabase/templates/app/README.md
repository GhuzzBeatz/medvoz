# Template - Sync no App Desktop

Use este modelo para criar o motor de sincronizacao do app.

O arquivo `supabase-sync.js` e um esqueleto. A referencia completa validada esta em `../../references/mesaup/client-cloud.js`.

Regras:

- receber `project_url` e `anon_key` do broker;
- salvar localmente em arquivo ignorado pelo Git;
- nunca salvar service_role;
- sincronizar em segundo plano;
- manter app funcionando offline.
- mesclar dados remotos e locais sem apagar historico;
- filtrar por licenca, organizacao e projeto;
- disparar sync depois de cada gravacao local relevante.
