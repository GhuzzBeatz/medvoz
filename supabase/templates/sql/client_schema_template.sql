-- Template de schema para o Supabase do cliente.
-- Troque <prefixo> e <colecao> conforme o app.

create table if not exists public.<prefixo><colecao> (
  row_id text primary key,
  record jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  source_client text
);

alter table public.<prefixo><colecao> enable row level security;

drop policy if exists <prefixo><colecao>_anon_all on public.<prefixo><colecao>;

create policy <prefixo><colecao>_anon_all
on public.<prefixo><colecao>
for all
to anon
using (true)
with check (true);

create index if not exists idx_<prefixo><colecao>_updated
on public.<prefixo><colecao>(updated_at);

create table if not exists public.<prefixo>app_meta (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.<prefixo>app_meta enable row level security;

drop policy if exists <prefixo>app_meta_anon_all on public.<prefixo>app_meta;

create policy <prefixo>app_meta_anon_all
on public.<prefixo>app_meta
for all
to anon
using (true)
with check (true);
