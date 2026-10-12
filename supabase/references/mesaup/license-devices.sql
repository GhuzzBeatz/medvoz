create extension if not exists pgcrypto with schema extensions;

create table if not exists public.mesaup_client_cloud_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  app_id text not null default 'mesaup',
  license_hash text not null,
  org_id text not null,
  project_ref text not null,
  device_hash text not null,
  device_name text,
  device_os text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  unique (app_id, license_hash, device_hash)
);

create index if not exists idx_mesaup_client_cloud_devices_license
  on public.mesaup_client_cloud_devices(app_id, license_hash, active, last_seen_at desc);

alter table public.mesaup_client_cloud_devices enable row level security;

alter table public.mesaup_client_cloud_sessions
  add column if not exists license_device_hash text,
  add column if not exists license_device_name text,
  add column if not exists license_device_os text;

create or replace function public.ghz_validate_license(
  p_license_key text,
  p_device_hash text,
  p_device_name text default ''::text,
  p_device_os text default ''::text,
  p_app_version text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key text := upper(trim(coalesce(p_license_key, '')));
  v_device text := trim(coalesce(p_device_hash, ''));
  v_license public.ghz_licenses%rowtype;
  v_now timestamptz := now();
  v_license_hash text;
  v_cloud_device public.mesaup_client_cloud_devices%rowtype;
begin
  if v_key = '' or v_device = '' then
    return jsonb_build_object('ok', false, 'code', 'missing_data', 'message', 'Licenca local incompleta.');
  end if;

  select * into v_license from public.ghz_licenses where license_key = v_key;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_key', 'message', 'Chave de ativacao nao encontrada.');
  end if;

  if lower(coalesce(v_license.app_id, '')) = 'zapbotcrm' then
    return jsonb_build_object('ok', false, 'code', 'wrong_app', 'message', 'Esta chave pertence a outra versao do aplicativo.');
  end if;

  if v_license.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'blocked', 'message', 'Esta licenca esta bloqueada ou cancelada.');
  end if;

  if v_license.expires_at is not null and v_license.expires_at < v_now then
    return jsonb_build_object('ok', false, 'code', 'expired', 'message', 'Esta licenca esta expirada.');
  end if;

  if coalesce(v_license.device_hash, '') = v_device then
    update public.ghz_licenses
    set device_name = left(coalesce(p_device_name, device_name, ''), 180),
        device_os = left(coalesce(p_device_os, device_os, ''), 180),
        app_version = left(coalesce(p_app_version, app_version, ''), 80),
        last_seen_at = v_now
    where id = v_license.id
    returning * into v_license;

    return jsonb_build_object(
      'ok', true,
      'code', 'valid',
      'mode', 'offline_primary',
      'message', 'Licenca valida.',
      'license_key', v_license.license_key,
      'customer_name', v_license.customer_name,
      'activated_at', v_license.activated_at,
      'last_seen_at', v_license.last_seen_at
    );
  end if;

  v_license_hash := encode(extensions.digest(v_key, 'sha256'), 'hex');

  select * into v_cloud_device
  from public.mesaup_client_cloud_devices
  where app_id = 'mesaup'
    and license_hash = v_license_hash
    and device_hash = v_device
    and active = true
  limit 1;

  if found then
    update public.mesaup_client_cloud_devices
    set last_seen_at = v_now,
        device_name = left(coalesce(p_device_name, device_name, ''), 180),
        device_os = left(coalesce(p_device_os, device_os, ''), 180)
    where id = v_cloud_device.id;

    update public.ghz_licenses
    set app_version = left(coalesce(p_app_version, app_version, ''), 80),
        last_seen_at = v_now
    where id = v_license.id;

    return jsonb_build_object(
      'ok', true,
      'code', 'valid',
      'mode', 'cloud_device',
      'message', 'Licenca valida pela conexao Supabase.',
      'license_key', v_license.license_key,
      'customer_name', v_license.customer_name,
      'activated_at', v_license.activated_at,
      'last_seen_at', v_now,
      'cloud_org_id', v_cloud_device.org_id,
      'cloud_project_ref', v_cloud_device.project_ref
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'code', 'device_mismatch',
    'message', 'Esta chave esta vinculada a outro computador. Para usar em outro computador, conecte o Supabase da mesma conta/organizacao.'
  );
end;
$function$;
