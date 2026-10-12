# 05 - Checklist por App

Use este checklist antes de publicar uma integracao Supabase em qualquer app.

## Identidade

- [ ] `APP_ID` definido.
- [ ] `APP_SLUG` proprio do app.
- [ ] Prefixo de licenca definido.
- [ ] Nome da Edge Function definido.
- [ ] Nome do projeto criado no Supabase do cliente definido.
- [ ] Prefixo de tabelas definido.

## Seguranca

- [ ] Nenhum `service_role` no app.
- [ ] Nenhum client secret no app.
- [ ] Nenhum token real no Git.
- [ ] `.env`, conexoes locais e chaves ignoradas no `.gitignore`.
- [ ] Broker usa `Deno.env.get()` para segredos.
- [ ] RLS ativado nas tabelas criadas.
- [ ] Termo de responsabilidade exibido para o cliente.

## Banco do cliente

- [ ] Projeto criado/localizado corretamente.
- [ ] Tabelas criadas com prefixo do app.
- [ ] `app_meta` criado.
- [ ] `schema_migrations` criado.
- [ ] anon key obtida e salva localmente.

## App desktop

- [ ] Tela de conectar Supabase criada.
- [ ] Configuracoes mostram status da nuvem.
- [ ] Botao desconectar/trocar conta funciona.
- [ ] Botao sincronizar agora funciona.
- [ ] App funciona sem internet.
- [ ] App funciona sem Supabase conectado.

## Sync

- [ ] Criar registro no PC 1 aparece no PC 2.
- [ ] Alterar registro no PC 2 aparece no PC 1.
- [ ] Exclusao logica sincroniza.
- [ ] Conflito simples nao duplica dados.
- [ ] Dados financeiros nao somem nem duplicam.
- [ ] Log de erro nao mostra segredo.

## Release

- [ ] Build local passou.
- [ ] Testes passaram.
- [ ] Instalador abre.
- [ ] Manifesto do app aponta para repo correto.
- [ ] Release esta no canal correto.
- [ ] Cliente antigo consegue atualizar.

## IA/Documentacao

- [ ] Base de conhecimento atualizada se houver Ajuda IA.
- [ ] FAQ explica como conectar Supabase.
- [ ] FAQ explica limites do plano gratuito do Supabase.
- [ ] FAQ explica responsabilidade dos dados.
