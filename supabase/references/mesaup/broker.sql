create extension if not exists pgcrypto with schema extensions;

create table if not exists public.mesaup_client_cloud_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  app_id text not null default 'mesaup',
  state text not null unique,
  device_id text,
  code_verifier text not null,
  license_hash text not null,
  status text not null default 'pending',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  org_id text,
  org_name text,
  project_ref text,
  project_url text,
  anon_key text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mesaup_client_cloud_sessions_state
  on public.mesaup_client_cloud_sessions(state);

create index if not exists idx_mesaup_client_cloud_sessions_license
  on public.mesaup_client_cloud_sessions(app_id, license_hash, created_at desc);

alter table public.mesaup_client_cloud_sessions enable row level security;

create table if not exists public.mesaup_client_cloud_license_bindings (
  id uuid primary key default extensions.gen_random_uuid(),
  app_id text not null default 'mesaup',
  license_hash text not null,
  org_id text not null,
  org_name text,
  project_ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, license_hash)
);

create index if not exists idx_mesaup_client_cloud_bindings_org
  on public.mesaup_client_cloud_license_bindings(app_id, org_id);

alter table public.mesaup_client_cloud_license_bindings enable row level security;
