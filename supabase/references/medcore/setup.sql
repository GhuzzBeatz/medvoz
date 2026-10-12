-- MedCore Cloud Supabase Cliente — schema do banco do cliente
-- Rodado automaticamente pelo broker (medcore-connect). Aqui fica versionado.

create table if not exists public.mc_config (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_config enable row level security;
drop policy if exists mc_config_anon_all on public.mc_config;
create policy mc_config_anon_all on public.mc_config for all to anon using (true) with check (true);
create index if not exists idx_mc_config_updated on public.mc_config(updated_at);

create table if not exists public.mc_usuarios (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_usuarios enable row level security;
drop policy if exists mc_usuarios_anon_all on public.mc_usuarios;
create policy mc_usuarios_anon_all on public.mc_usuarios for all to anon using (true) with check (true);
create index if not exists idx_mc_usuarios_updated on public.mc_usuarios(updated_at);

create table if not exists public.mc_medicos (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_medicos enable row level security;
drop policy if exists mc_medicos_anon_all on public.mc_medicos;
create policy mc_medicos_anon_all on public.mc_medicos for all to anon using (true) with check (true);
create index if not exists idx_mc_medicos_updated on public.mc_medicos(updated_at);

create table if not exists public.mc_pacientes (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_pacientes enable row level security;
drop policy if exists mc_pacientes_anon_all on public.mc_pacientes;
create policy mc_pacientes_anon_all on public.mc_pacientes for all to anon using (true) with check (true);
create index if not exists idx_mc_pacientes_updated on public.mc_pacientes(updated_at);

create table if not exists public.mc_agenda (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_agenda enable row level security;
drop policy if exists mc_agenda_anon_all on public.mc_agenda;
create policy mc_agenda_anon_all on public.mc_agenda for all to anon using (true) with check (true);
create index if not exists idx_mc_agenda_updated on public.mc_agenda(updated_at);

create table if not exists public.mc_prontuarios (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_prontuarios enable row level security;
drop policy if exists mc_prontuarios_anon_all on public.mc_prontuarios;
create policy mc_prontuarios_anon_all on public.mc_prontuarios for all to anon using (true) with check (true);
create index if not exists idx_mc_prontuarios_updated on public.mc_prontuarios(updated_at);

create table if not exists public.mc_asos (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_asos enable row level security;
drop policy if exists mc_asos_anon_all on public.mc_asos;
create policy mc_asos_anon_all on public.mc_asos for all to anon using (true) with check (true);
create index if not exists idx_mc_asos_updated on public.mc_asos(updated_at);

create table if not exists public.mc_financeiro (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_financeiro enable row level security;
drop policy if exists mc_financeiro_anon_all on public.mc_financeiro;
create policy mc_financeiro_anon_all on public.mc_financeiro for all to anon using (true) with check (true);
create index if not exists idx_mc_financeiro_updated on public.mc_financeiro(updated_at);

create table if not exists public.mc_estoque (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_estoque enable row level security;
drop policy if exists mc_estoque_anon_all on public.mc_estoque;
create policy mc_estoque_anon_all on public.mc_estoque for all to anon using (true) with check (true);
create index if not exists idx_mc_estoque_updated on public.mc_estoque(updated_at);

create table if not exists public.mc_medicamentos (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_medicamentos enable row level security;
drop policy if exists mc_medicamentos_anon_all on public.mc_medicamentos;
create policy mc_medicamentos_anon_all on public.mc_medicamentos for all to anon using (true) with check (true);
create index if not exists idx_mc_medicamentos_updated on public.mc_medicamentos(updated_at);

create table if not exists public.mc_exames_banco (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_exames_banco enable row level security;
drop policy if exists mc_exames_banco_anon_all on public.mc_exames_banco;
create policy mc_exames_banco_anon_all on public.mc_exames_banco for all to anon using (true) with check (true);
create index if not exists idx_mc_exames_banco_updated on public.mc_exames_banco(updated_at);

create table if not exists public.mc_solicitacoes_exames (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_solicitacoes_exames enable row level security;
drop policy if exists mc_solicitacoes_exames_anon_all on public.mc_solicitacoes_exames;
create policy mc_solicitacoes_exames_anon_all on public.mc_solicitacoes_exames for all to anon using (true) with check (true);
create index if not exists idx_mc_solicitacoes_exames_updated on public.mc_solicitacoes_exames(updated_at);

create table if not exists public.mc_receituarios_salvos (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_receituarios_salvos enable row level security;
drop policy if exists mc_receituarios_salvos_anon_all on public.mc_receituarios_salvos;
create policy mc_receituarios_salvos_anon_all on public.mc_receituarios_salvos for all to anon using (true) with check (true);
create index if not exists idx_mc_receituarios_salvos_updated on public.mc_receituarios_salvos(updated_at);

create table if not exists public.mc_locais (row_id text primary key, record jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);
alter table public.mc_locais enable row level security;
drop policy if exists mc_locais_anon_all on public.mc_locais;
create policy mc_locais_anon_all on public.mc_locais for all to anon using (true) with check (true);
create index if not exists idx_mc_locais_updated on public.mc_locais(updated_at);

create table if not exists public.mc_app_meta (key text primary key, value text, updated_at timestamptz not null default now());
alter table public.mc_app_meta enable row level security;
drop policy if exists mc_app_meta_anon_all on public.mc_app_meta;
create policy mc_app_meta_anon_all on public.mc_app_meta for all to anon using (true) with check (true);
create table if not exists public.mc_schema_migrations (version text primary key, name text, applied_at timestamptz not null default now());
alter table public.mc_schema_migrations enable row level security;
drop policy if exists mc_sm_anon_all on public.mc_schema_migrations;
create policy mc_sm_anon_all on public.mc_schema_migrations for all to anon using (true) with check (true);
insert into public.mc_schema_migrations(version,name) values ('1.0.0','initial') on conflict (version) do nothing;
insert into public.mc_app_meta(key,value) values ('schema_version','1.0.0') on conflict (key) do update set value=excluded.value, updated_at=now();

-- ============================================================================
-- v1.1.0 — Fundação OCUPACIONAL (SST). Mesmo padrão (jsonb + metadados de sync).
-- Os campos de cada entidade ficam no `record` (jsonb), definidos pelas telas.
--   empresas         : empresas clientes (razão social, CNPJ, contato)
--   funcionarios     : vínculo pessoa↔empresa↔cargo (admissão, status)
--   cargos           : cargos/funções (nome, descrição, GHE)
--   riscos           : catálogo de riscos (físico/químico/biológico/ergon./acidente)
--   cargo_riscos     : matriz cargo↔risco
--   risco_exames     : risco→exame obrigatório (+ periodicidade em meses)
--   exames_periodicos: controle de exames por funcionário (realizado/vencimento/status)
--   convocacoes      : log de convocações/lembretes enviados
--   anexos           : referências de arquivos no Storage (path, mime, tamanho)
--   pcmso            : documento PCMSO por empresa/ano
--   esocial_eventos  : eventos eSocial gerados (S-2220/S-2210/S-2240)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'empresas','funcionarios','cargos','riscos','cargo_riscos','risco_exames',
    'exames_periodicos','convocacoes','anexos','pcmso','esocial_eventos',
    'setores','unidades','convenios'
  ] loop
    execute format('create table if not exists public.mc_%s (row_id text primary key, record jsonb not null default ''{}''::jsonb, updated_at timestamptz not null default now(), deleted_at timestamptz, version bigint not null default 1, source_client text);', t);
    execute format('alter table public.mc_%s enable row level security;', t);
    execute format('drop policy if exists mc_%s_anon_all on public.mc_%s;', t, t);
    execute format('create policy mc_%s_anon_all on public.mc_%s for all to anon using (true) with check (true);', t, t);
    execute format('create index if not exists idx_mc_%s_updated on public.mc_%s(updated_at);', t, t);
  end loop;
end $$;
insert into public.mc_schema_migrations(version,name) values ('1.1.0','ocupacional') on conflict (version) do nothing;
insert into public.mc_app_meta(key,value) values ('schema_version','1.1.0') on conflict (key) do update set value=excluded.value, updated_at=now();
