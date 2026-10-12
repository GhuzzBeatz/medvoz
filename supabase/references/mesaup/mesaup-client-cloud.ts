import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ID = "mesaup";
const APP_NAME = "MesaUp";
const FUNCTION_SLUG = "mesaup-client-cloud";
const REDIRECT_URI =
  Deno.env.get("MESAUP_SUPABASE_REDIRECT_URI") ??
  `https://wpkaaxarresldcstaatj.supabase.co/functions/v1/${FUNCTION_SLUG}/callback`;
const AUTHORIZE = "https://api.supabase.com/v1/oauth/authorize";
const TOKEN = "https://api.supabase.com/v1/oauth/token";
const MGMT = "https://api.supabase.com/v1";
const PRETTY = Deno.env.get("MESAUP_SUPABASE_DONE_URL") ?? "https://ghzplugin.com.br/conectado.html";
const CLOUD_DEVICE_LIMIT = 5;

const CLIENT_ID =
  Deno.env.get("MESAUP_SUPABASE_CLIENT_ID") ??
  Deno.env.get("SB_OAUTH_CLIENT_ID") ??
  "ed82dff6-3e07-47b1-b2dd-57418b5276bf";
const CLIENT_SECRET =
  Deno.env.get("MESAUP_SUPABASE_CLIENT_SECRET") ??
  Deno.env.get("SB_OAUTH_CLIENT_SECRET") ??
  "";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const TABLES = [
  "mu_config", "mu_mesas", "mu_comandas", "mu_produtos", "mu_clientes",
  "mu_contas_clientes", "mu_garcons", "mu_financeiro", "mu_fornecedores",
  "mu_pedidos_delivery", "mu_pedidos_mesa", "mu_caixas", "mu_vendas", "mu_auditoria",
];

function sqlLiteral(value: string): string {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function buildSetupSql(ctx: { licenseHash: string; orgId: string; projectRef: string }): string {
  const license = sqlLiteral(ctx.licenseHash);
  const org = sqlLiteral(ctx.orgId);
  const project = sqlLiteral(ctx.projectRef);
  const parts: string[] = ["create extension if not exists pgcrypto;"];
  for (const table of TABLES) {
    parts.push(`
create table if not exists public.${table} (
  row_id text primary key,
  license_hash text not null default ${license},
  org_id text not null default ${org},
  project_ref text not null default ${project},
  record jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  source_client text,
  created_at timestamptz not null default now()
);
alter table public.${table} add column if not exists license_hash text not null default ${license};
alter table public.${table} add column if not exists org_id text not null default ${org};
alter table public.${table} add column if not exists project_ref text not null default ${project};
${table === "mu_produtos" ? `alter table public.${table} add column if not exists opcoes_produto jsonb not null default '{}'::jsonb;` : ""}
alter table public.${table} enable row level security;
create index if not exists idx_${table}_license_updated on public.${table}(license_hash, updated_at);
drop policy if exists "${table}_anon_select" on public.${table};
drop policy if exists "${table}_anon_insert" on public.${table};
drop policy if exists "${table}_anon_update" on public.${table};
drop policy if exists "${table}_anon_delete" on public.${table};
drop policy if exists "${table}_anon_all" on public.${table};
create policy "${table}_anon_all" on public.${table}
for all to anon
using (license_hash = ${license} and org_id = ${org} and project_ref = ${project})
with check (license_hash = ${license} and org_id = ${org} and project_ref = ${project});
grant select, insert, update, delete on public.${table} to anon;
grant select, insert, update, delete on public.${table} to authenticated;`);
  }
  parts.push(`
create table if not exists public.mu_app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mu_app_meta enable row level security;
drop policy if exists "mu_app_meta_anon_all" on public.mu_app_meta;
create policy "mu_app_meta_anon_all" on public.mu_app_meta for all to anon using (true) with check (true);
grant select, insert, update, delete on public.mu_app_meta to anon;
grant select, insert, update, delete on public.mu_app_meta to authenticated;
insert into public.mu_app_meta(key, value)
values ('cloud_binding', jsonb_build_object('app', ${sqlLiteral(APP_ID)}, 'license_hash', ${license}, 'org_id', ${org}, 'project_ref', ${project}, 'schema_version', '2.0.0'))
on conflict (key) do update set value = excluded.value, updated_at = now();`);
  return parts.join("\n");
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randToken(len = 48): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return b64url(a);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256b64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return b64url(new Uint8Array(hash));
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

function pretty(status: "ok" | "error", msg?: string): Response {
  const u = new URL(PRETTY);
  u.searchParams.set("status", status);
  if (msg) u.searchParams.set("msg", msg);
  return Response.redirect(u.toString(), 302);
}

function cleanText(value: unknown, max = 180): string {
  return String(value || "").trim().slice(0, max);
}

async function mgmt(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${MGMT}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) {}
  return { ok: r.ok, status: r.status, body: parsed };
}

async function readBody(req: Request): Promise<Record<string, any>> {
  if (req.method !== "POST") return {};
  return await req.json().catch(() => ({}));
}

async function validateLicense(body: Record<string, any>) {
  const license = body.license || {};
  const licenseKey = cleanText(license.license_key, 80).toUpperCase();
  const deviceHash = cleanText(license.device_hash, 160);
  if (!licenseKey || !deviceHash) return { ok: false, error: "missing_license", message: "Valide a licenca do MesaUp antes de conectar o Supabase." };
  const { data, error } = await sb
    .from("ghz_licenses")
    .select("id, app_id, license_key, status, expires_at")
    .eq("license_key", licenseKey)
    .maybeSingle();
  if (error) return { ok: false, error: "license_validation_failed", message: "Nao consegui validar a licenca agora." };
  if (!data) return { ok: false, error: "license_invalid", message: "Chave de ativacao nao encontrada." };
  if (String(data.app_id || "").toLowerCase() === "zapbotcrm") return { ok: false, error: "wrong_app", message: "Esta chave pertence a outra versao do aplicativo." };
  if (data.status !== "active") return { ok: false, error: "license_blocked", message: "Esta licenca esta bloqueada ou cancelada." };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return { ok: false, error: "license_expired", message: "Esta licenca esta expirada." };
  return {
    ok: true,
    licenseHash: await sha256Hex(licenseKey),
    deviceHash,
    deviceName: cleanText(license.device_name, 120),
    deviceOs: cleanText(license.device_os, 180),
  };
}

async function getSession(state: string) {
  const { data } = await sb.from("mesaup_client_cloud_sessions").select("*").eq("state", state).maybeSingle();
  return data;
}

async function updateSession(state: string, patch: Record<string, unknown>) {
  return await sb.from("mesaup_client_cloud_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("state", state);
}

async function bindLicense(licenseHash: string, orgId: string, orgName: string, projectRef: string) {
  const { data: existing, error: findError } = await sb
    .from("mesaup_client_cloud_license_bindings")
    .select("*")
    .eq("app_id", APP_ID)
    .eq("license_hash", licenseHash)
    .maybeSingle();
  if (findError) return { ok: false, message: "Nao consegui conferir o vinculo da licenca." };
  if (existing && existing.org_id !== orgId) {
    return { ok: false, code: "license_org_conflict", message: "Esta licenca ja foi conectada a outra conta Supabase. Use a mesma conta/organizacao ou fale com o suporte GHZ Plugin." };
  }
  if (!existing) {
    const { error } = await sb.from("mesaup_client_cloud_license_bindings").insert({
      app_id: APP_ID,
      license_hash: licenseHash,
      org_id: orgId,
      org_name: orgName,
      project_ref: projectRef,
    });
    if (error) return { ok: false, message: "Nao consegui salvar o vinculo da licenca." };
  } else if (existing.project_ref !== projectRef || existing.org_name !== orgName) {
    await sb.from("mesaup_client_cloud_license_bindings")
      .update({ project_ref: projectRef, org_name: orgName, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  }
  return { ok: true };
}

async function getLicenseBinding(licenseHash: string) {
  const { data, error } = await sb
    .from("mesaup_client_cloud_license_bindings")
    .select("*")
    .eq("app_id", APP_ID)
    .eq("license_hash", licenseHash)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function registerCloudDevice(
  licenseHash: string,
  orgId: string,
  projectRef: string,
  deviceHash: string,
  deviceName: string,
  deviceOs: string,
) {
  if (!deviceHash) return { ok: false, code: "missing_device", message: "Nao consegui identificar este computador." };
  const { data: existing, error: existingError } = await sb
    .from("mesaup_client_cloud_devices")
    .select("id")
    .eq("app_id", APP_ID)
    .eq("license_hash", licenseHash)
    .eq("device_hash", deviceHash)
    .maybeSingle();
  if (existingError) return { ok: false, message: "Nao consegui conferir os computadores conectados." };

  if (existing) {
    const { error } = await sb.from("mesaup_client_cloud_devices")
      .update({
        org_id: orgId,
        project_ref: projectRef,
        device_name: deviceName,
        device_os: deviceOs,
        active: true,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { ok: false, message: "Nao consegui atualizar este computador na nuvem." };
    return { ok: true };
  }

  const { count, error: countError } = await sb
    .from("mesaup_client_cloud_devices")
    .select("id", { count: "exact", head: true })
    .eq("app_id", APP_ID)
    .eq("license_hash", licenseHash)
    .eq("active", true);
  if (countError) return { ok: false, message: "Nao consegui conferir o limite de computadores." };
  if ((count || 0) >= CLOUD_DEVICE_LIMIT) {
    return { ok: false, code: "cloud_device_limit", message: `Esta licenca ja esta conectada em ${CLOUD_DEVICE_LIMIT} computadores pelo Supabase.` };
  }

  const { error } = await sb.from("mesaup_client_cloud_devices").insert({
    app_id: APP_ID,
    license_hash: licenseHash,
    org_id: orgId,
    project_ref: projectRef,
    device_hash: deviceHash,
    device_name: deviceName,
    device_os: deviceOs,
  });
  if (error) return { ok: false, message: "Nao consegui registrar este computador na nuvem." };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    if (path.endsWith("/start")) {
      if (!CLIENT_SECRET) return json({ error: "server_not_ready", message: "O servidor de conexao Supabase ainda nao esta configurado." }, 503);
      const body = await readBody(req);
      const validation: any = await validateLicense(body);
      if (!validation.ok) return json(validation, 401);
      const state = cleanText(body.state || url.searchParams.get("state") || randToken(24), 80);
      const deviceId = cleanText(body.device_id || url.searchParams.get("device_id"), 120);
      const verifier = randToken(48);
      const challenge = await sha256b64url(verifier);
      await sb.from("mesaup_client_cloud_sessions").insert({
        app_id: APP_ID,
        state,
        device_id: deviceId,
        code_verifier: verifier,
        license_hash: validation.licenseHash,
        license_device_hash: validation.deviceHash,
        license_device_name: validation.deviceName,
        license_device_os: validation.deviceOs,
        status: "pending",
      });
      const authorize = new URL(AUTHORIZE);
      authorize.searchParams.set("client_id", CLIENT_ID);
      authorize.searchParams.set("redirect_uri", REDIRECT_URI);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("scope", "all");
      authorize.searchParams.set("code_challenge", challenge);
      authorize.searchParams.set("code_challenge_method", "S256");
      if (req.method === "GET") return Response.redirect(authorize.toString(), 302);
      return json({ ok: true, authorization_url: authorize.toString(), state });
    }

    if (path.endsWith("/callback")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "";
      if (url.searchParams.get("error")) return pretty("error", `Voce cancelou a conexao com o ${APP_NAME}.`);
      if (!code || !state) return pretty("error", "Este link expirou. Volte ao MesaUp e clique em Conectar novamente.");
      const sess = await getSession(state);
      if (!sess) return pretty("error", "A sessao de conexao expirou. Volte ao MesaUp e tente de novo.");
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: sess.code_verifier,
      });
      const tokenRes = await fetch(TOKEN, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}` },
        body: form.toString(),
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenJson.access_token) {
        await updateSession(state, { status: "error", error: `token ${tokenRes.status}` });
        return pretty("error", "Houve um problema ao autorizar sua conta Supabase. Tente novamente pelo MesaUp.");
      }
      await updateSession(state, {
        status: "authorized",
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token ?? null,
        token_expires_at: new Date(Date.now() + Number(tokenJson.expires_in ?? 3600) * 1000).toISOString(),
      });
      return pretty("ok");
    }

    if (path.endsWith("/provision")) {
      const state = cleanText(url.searchParams.get("state"), 80);
      const deviceId = cleanText(url.searchParams.get("device_id"), 120);
      const s = await getSession(state);
      if (!s) return json({ status: "not_found", message: "Sessao nao encontrada." }, 404);
      if (deviceId && s.device_id && deviceId !== s.device_id) return json({ status: "forbidden", error: "device_mismatch", message: "Esta conexao pertence a outro computador." }, 403);
      if (s.status === "done") return json({ status: "done", project_url: s.project_url, anon_key: s.anon_key, project_ref: s.project_ref, org_id: s.org_id, org_name: s.org_name, owner_email: s.org_name, license_hash: s.license_hash });
      if (s.status === "error") return json({ status: "error", error: s.error, message: s.error });
      if (!s.access_token) return json({ status: "need_auth", message: "Aguardando login no navegador." });

      const token = s.access_token;
      if (s.status === "authorized") {
        const orgs = await mgmt(token, "GET", "/organizations");
        if (!orgs.ok) {
          await updateSession(state, { status: "error", error: `organizations ${orgs.status}` });
          return json({ status: "error", error: "Nao consegui listar suas organizacoes Supabase." });
        }
        const orgList = Array.isArray(orgs.body) ? orgs.body : [];
        const existingBinding: any = await getLicenseBinding(s.license_hash);
        let selectedOrg = existingBinding
          ? orgList.find((org: any) => org.id === existingBinding.org_id)
          : null;
        if (existingBinding && !selectedOrg) {
          await updateSession(state, { status: "error", error: "A licenca ja esta ligada a outra organizacao Supabase." });
          return json({ status: "error", error: "license_org_conflict", message: "Esta licenca ja foi conectada a outra organizacao Supabase. Entre na mesma conta/organizacao usada antes." });
        }
        selectedOrg = selectedOrg || orgList[0] || {};
        const orgSlug = cleanText(selectedOrg.slug || selectedOrg.id, 160);
        if (!orgSlug) {
          await updateSession(state, { status: "error", error: "Nao encontrei sua organizacao Supabase." });
          return json({ status: "error", error: "Nao encontrei sua organizacao Supabase." });
        }
        const projects = await mgmt(token, "GET", `/organizations/${encodeURIComponent(orgSlug)}/projects?limit=100`);
        if (!projects.ok) {
          await updateSession(state, { status: "error", error: `organization_projects ${projects.status}` });
          return json({ status: "error", error: "Nao consegui listar seus projetos Supabase." });
        }
        const rawProjects: any = projects.body;
        const list = Array.isArray(rawProjects)
          ? rawProjects
          : Array.isArray(rawProjects?.projects)
            ? rawProjects.projects
            : Array.isArray(rawProjects?.data)
              ? rawProjects.data
              : [];
        const orgNameById = (id: string) => {
          const org = orgList.find((item: any) => item.id === id);
          return cleanText(org?.name || org?.slug || id, 180);
        };
        let project: any = existingBinding?.project_ref
          ? list.find((p: any) => cleanText(p.ref || p.id, 80) === existingBinding.project_ref)
          : null;
        project = project || list.find((p: any) => String(p.name || "").toLowerCase().startsWith("mesaup cloud"));
        let orgId = cleanText(project?.organization_id || selectedOrg.id || list[0]?.organization_id, 120);
        if (!orgId) {
          await updateSession(state, { status: "error", error: "Nao encontrei sua organizacao Supabase." });
          return json({ status: "error", error: "Nao encontrei sua organizacao Supabase." });
        }
        let orgName = orgNameById(orgId);
        if (!project) {
          const create = await mgmt(token, "POST", "/projects", {
            name: "MesaUp Cloud",
            organization_id: orgId,
            region: "sa-east-1",
            db_pass: randToken(20) + "Aa1!",
            plan: "free",
          });
          if (!create.ok) {
            const raw = typeof create.body === "object" ? JSON.stringify(create.body) : String(create.body);
            const friendly = /free|limit|quota|payment|exceed|maximum/i.test(raw)
              ? "Sua conta Supabase atingiu o limite de projetos. Apague um projeto antigo ou use um plano pago."
              : "Nao foi possivel criar o projeto Supabase agora.";
            await updateSession(state, { status: "error", error: `create ${create.status} ${raw}`.slice(0, 500) });
            return json({ status: "error", error: friendly });
          }
          project = create.body;
          orgId = cleanText(project.organization_id || orgId, 120);
          orgName = orgNameById(orgId);
        }
        const projectRef = cleanText(project.ref || project.id, 80);
        const binding: any = await bindLicense(s.license_hash, orgId, orgName, projectRef);
        if (!binding.ok) {
          await updateSession(state, { status: "error", error: binding.message || "Licenca ja vinculada." });
          return json({ status: "error", error: binding.code || "license_binding_failed", message: binding.message });
        }
        const cloudDevice: any = await registerCloudDevice(
          s.license_hash,
          orgId,
          projectRef,
          s.license_device_hash,
          s.license_device_name || "",
          s.license_device_os || "",
        );
        if (!cloudDevice.ok) {
          await updateSession(state, { status: "error", error: cloudDevice.message || "Limite de computadores atingido." });
          return json({ status: "error", error: cloudDevice.code || "cloud_device_failed", message: cloudDevice.message });
        }
        await updateSession(state, { status: "provisioning", project_ref: projectRef, org_id: orgId, org_name: orgName });
        return json({ status: "provisioning", step: "preparando projeto", org_id: orgId, org_name: orgName, project_ref: projectRef });
      }

      if (s.status === "provisioning") {
        const project = await mgmt(token, "GET", `/projects/${s.project_ref}`);
        const status = project.ok ? (project.body as any)?.status : "";
        if (status === "ACTIVE_HEALTHY") {
          await updateSession(state, { status: "setup" });
          return json({ status: "setup", step: "preparando tabelas" });
        }
        return json({ status: "provisioning", step: "aguardando o banco ficar pronto", project_status: status });
      }

      if (s.status === "setup") {
        const setup = await mgmt(token, "POST", `/projects/${s.project_ref}/database/query`, {
          query: buildSetupSql({ licenseHash: s.license_hash, orgId: s.org_id, projectRef: s.project_ref }),
        });
        if (!setup.ok) {
          const raw = typeof setup.body === "object" ? JSON.stringify(setup.body) : String(setup.body);
          await updateSession(state, { status: "error", error: `setup ${setup.status} ${raw}`.slice(0, 500) });
          return json({ status: "error", error: "Nao foi possivel preparar as tabelas no Supabase." });
        }
        const keys = await mgmt(token, "GET", `/projects/${s.project_ref}/api-keys`);
        let anon: string | null = null;
        if (keys.ok && Array.isArray(keys.body)) {
          anon =
            (keys.body.find((k: any) => k.name === "anon") || {}).api_key ||
            (keys.body.find((k: any) => String(k.name || "").includes("publishable")) || {}).api_key ||
            (keys.body.find((k: any) => String(k.api_key || "").startsWith("sb_publishable_")) || {}).api_key ||
            null;
        }
        if (!anon) {
          await updateSession(state, { status: "error", error: "Nao consegui obter a chave publica do projeto." });
          return json({ status: "error", error: "Nao consegui concluir a conexao publica do Supabase." });
        }
        const projectUrl = `https://${s.project_ref}.supabase.co`;
        await updateSession(state, { status: "done", project_url: projectUrl, anon_key: anon, access_token: null, refresh_token: null });
        return json({ status: "done", project_url: projectUrl, anon_key: anon, project_ref: s.project_ref, org_id: s.org_id, org_name: s.org_name, owner_email: s.org_name, license_hash: s.license_hash });
      }

      return json({ status: s.status });
    }

    return json({ ok: true, service: FUNCTION_SLUG, configured: !!CLIENT_SECRET });
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500);
  }
});
