import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==== Config fixa ====
const REDIRECT_URI = "https://wpkaaxarresldcstaatj.supabase.co/functions/v1/medcore-connect/callback";
const AUTHORIZE = "https://api.supabase.com/v1/oauth/authorize";
const TOKEN = "https://api.supabase.com/v1/oauth/token";
const MGMT = "https://api.supabase.com/v1";

const CLIENT_ID = "ed82dff6-3e07-47b1-b2dd-57418b5276bf";
// Preferir SEMPRE a variavel de ambiente (secret). O valor fixo abaixo eh so um
// fallback temporario ate SB_OAUTH_CLIENT_SECRET estar setada nos secrets do
// projeto — quando estiver, remover este fallback (deixar `?? ""`).
const CLIENT_SECRET = Deno.env.get("SB_OAUTH_CLIENT_SECRET") ?? "";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Tabelas de dados do MedCore no Supabase do cliente (cada uma guarda o
// registro em jsonb + metadados de sincronizacao, espelhando o app offline).
const TABLES = [
  // núcleo clínico já existente
  "config", "usuarios", "medicos", "pacientes", "agenda", "prontuarios",
  "asos", "financeiro", "estoque", "medicamentos", "exames_banco",
  "solicitacoes_exames", "receituarios_salvos", "locais",
  // núcleo ocupacional (SST) — fundação nova
  "empresas", "funcionarios", "cargos", "riscos", "cargo_riscos",
  "risco_exames", "exames_periodicos", "convocacoes", "anexos",
  "pcmso", "esocial_eventos",
  // cadastros auxiliares (estrutura organizacional)
  "setores", "unidades", "convenios",
];

function buildSetupSql(): string {
  const parts: string[] = [];
  for (const t of TABLES) {
    parts.push(
      `create table if not exists public.mc_${t} (` +
      `row_id text primary key, record jsonb not null default '{}'::jsonb, ` +
      `updated_at timestamptz not null default now(), deleted_at timestamptz, ` +
      `version bigint not null default 1, source_client text);`,
      `alter table public.mc_${t} enable row level security;`,
      `drop policy if exists mc_${t}_anon_all on public.mc_${t};`,
      `create policy mc_${t}_anon_all on public.mc_${t} for all to anon using (true) with check (true);`,
      `create index if not exists idx_mc_${t}_updated on public.mc_${t}(updated_at);`,
    );
  }
  parts.push(
    `create table if not exists public.mc_app_meta (key text primary key, value text, updated_at timestamptz not null default now());`,
    `alter table public.mc_app_meta enable row level security;`,
    `drop policy if exists mc_app_meta_anon_all on public.mc_app_meta;`,
    `create policy mc_app_meta_anon_all on public.mc_app_meta for all to anon using (true) with check (true);`,
    `create table if not exists public.mc_schema_migrations (version text primary key, name text, applied_at timestamptz not null default now());`,
    `alter table public.mc_schema_migrations enable row level security;`,
    `drop policy if exists mc_sm_anon_all on public.mc_schema_migrations;`,
    `create policy mc_sm_anon_all on public.mc_schema_migrations for all to anon using (true) with check (true);`,
    `insert into public.mc_schema_migrations(version,name) values ('1.0.0','initial') on conflict (version) do nothing;`,
    `insert into public.mc_app_meta(key,value) values ('schema_version','1.1.0') on conflict (key) do update set value=excluded.value, updated_at=now();`,
  );
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
async function sha256b64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return b64url(new Uint8Array(hash));
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
// O Supabase reescreve text/html -> text/plain no dominio *.supabase.co, entao
// nao da pra servir HTML bonito daqui. Solucao: redirecionar para uma pagina
// estatica hospedada (que serve HTML de verdade). Contrato de URL:
//   ?status=ok  |  ?status=error&msg=<texto>
const PRETTY = "https://ghzplugin.com.br/conectado.html";
function pretty(status: "ok" | "error", msg?: string): Response {
  const u = new URL(PRETTY);
  u.searchParams.set("status", status);
  if (msg) u.searchParams.set("msg", msg);
  return Response.redirect(u.toString(), 302);
}

async function mgmt(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${MGMT}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let b: any = text;
  try { b = JSON.parse(text); } catch (_) { /* keep text */ }
  return { ok: r.ok, status: r.status, body: b };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    // ---- inicia o fluxo ----
    if (path.endsWith("/start")) {
      if (!CLIENT_SECRET) return pretty("error", "O servidor está finalizando a configuração. Volte ao MedCore e tente novamente em alguns segundos.");
      const device_id = url.searchParams.get("device_id") ?? "";
      // o app pode passar ?session=XXX e usar esse mesmo valor como state pra acompanhar.
      const state = url.searchParams.get("session") || randToken(24);
      const verifier = randToken(48);
      const challenge = await sha256b64url(verifier);
      await sb.from("medcore_connect_sessions").insert({ state, device_id, code_verifier: verifier, status: "pending" });
      const a = new URL(AUTHORIZE);
      a.searchParams.set("client_id", CLIENT_ID);
      a.searchParams.set("redirect_uri", REDIRECT_URI);
      a.searchParams.set("response_type", "code");
      a.searchParams.set("state", state);
      a.searchParams.set("code_challenge", challenge);
      a.searchParams.set("code_challenge_method", "S256");
      return Response.redirect(a.toString(), 302);
    }

    // ---- callback: troca code por token ----
    if (path.endsWith("/callback")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (url.searchParams.get("error")) return pretty("error", "Você cancelou a conexão. Volte ao MedCore e clique em Conectar novamente quando quiser.");
      if (!code || !state) return pretty("error", "Este link expirou ou está incompleto. Volte ao MedCore e tente conectar de novo.");
      const { data: sess } = await sb.from("medcore_connect_sessions").select("*").eq("state", state).maybeSingle();
      if (!sess) return pretty("error", "A sessão de conexão expirou. Volte ao MedCore e clique em Conectar novamente.");
      const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: sess.code_verifier });
      const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
      const tr = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "authorization": `Basic ${basic}` }, body: form.toString() });
      const tj = await tr.json().catch(() => ({}));
      if (!tr.ok || !tj.access_token) {
        await sb.from("medcore_connect_sessions").update({ status: "error", error: `token ${tr.status}: ${JSON.stringify(tj).slice(0, 300)}`, updated_at: new Date().toISOString() }).eq("state", state);
        return pretty("error", "Houve um problema ao autorizar sua conta Supabase. Volte ao MedCore e tente novamente. Se continuar, fale com o suporte GHZ Plugin.");
      }
      // Obs.: a Management API NAO expoe o e-mail da conta via OAuth
      // (/v1/profile responde 401 "does not support oauth access yet").
      // Por isso identificamos a conta pela ORGANIZACAO (capturada no provision).
      const expires_at = new Date(Date.now() + Number(tj.expires_in ?? 3600) * 1000).toISOString();
      await sb.from("medcore_connect_sessions").update({
        status: "authorized", access_token: tj.access_token, refresh_token: tj.refresh_token ?? null,
        token_expires_at: expires_at, updated_at: new Date().toISOString(),
      }).eq("state", state);
      return pretty("ok");
    }

    // ---- provisionamento (o app faz polling; avanca 1 etapa por chamada) ----
    if (path.endsWith("/provision")) {
      const state = url.searchParams.get("state") ?? "";
      const forceNew = url.searchParams.get("force_new") === "1";
      const { data: s } = await sb.from("medcore_connect_sessions").select("*").eq("state", state).maybeSingle();
      if (!s) return json({ status: "not_found" }, 404);
      if (s.status === "done") return json({ status: "done", project_url: s.project_url, anon_key: s.anon_key, project_ref: s.project_ref });
      if (s.status === "error") return json({ status: "error", error: s.error });
      if (!s.access_token) return json({ status: "need_auth" }, 400);
      const tok = s.access_token;
      const upd = (o: Record<string, unknown>) => sb.from("medcore_connect_sessions").update({ ...o, updated_at: new Date().toISOString() }).eq("state", state);

      if (s.status === "authorized") {
        const pr = await mgmt(tok, "GET", "/projects");
        if (!pr.ok) { await upd({ status: "error", error: `list ${pr.status}` }); return json({ status: "error", error: "Nao consegui listar seus projetos." }); }
        const list = Array.isArray(pr.body) ? pr.body : [];
        const orgs = await mgmt(tok, "GET", "/organizations");
        const orgList = (orgs.ok && Array.isArray(orgs.body)) ? orgs.body : [];
        const orgNameById = (id: any) => { const o = orgList.find((x: any) => x.id === id); return o ? String(o.name || o.slug || "").slice(0, 180) : ""; };
        let proj = forceNew ? null : list.find((p: any) => String(p.name || "").toLowerCase().startsWith("medcore cloud"));
        if (proj) { await upd({ project_ref: proj.ref ?? proj.id, owner_email: orgNameById(proj.organization_id), status: "provisioning" }); return json({ status: "provisioning", step: "projeto encontrado" }); }
        let orgId: string | null = orgList[0]?.id ?? (list[0] ? list[0].organization_id : null);
        if (!orgId) { await upd({ status: "error", error: "no_org" }); return json({ status: "error", error: "Nao encontrei sua organizacao Supabase." }); }
        const orgName = orgNameById(orgId);
        const dbpass = randToken(20) + "Aa1!";
        const cr = await mgmt(tok, "POST", "/projects", { name: "MedCore Cloud", organization_id: orgId, region: "sa-east-1", db_pass: dbpass, plan: "free" });
        if (!cr.ok) {
          const msg = typeof cr.body === "object" ? JSON.stringify(cr.body) : String(cr.body);
          const friendly = /free|limit|quota|payment|exceed|maximum/i.test(msg)
            ? "Sua conta Supabase atingiu o limite de projetos do plano gratuito. Apague um projeto antigo ou use um plano pago."
            : "Nao foi possivel criar o banco. Tente novamente.";
          await upd({ status: "error", error: `create ${cr.status} ${msg}`.slice(0, 400) });
          return json({ status: "error", error: friendly });
        }
        const ref = cr.body.ref ?? cr.body.id;
        await upd({ project_ref: ref, owner_email: orgName, status: "provisioning" });
        return json({ status: "provisioning", step: "criando projeto" });
      }

      if (s.status === "provisioning") {
        const pj = await mgmt(tok, "GET", `/projects/${s.project_ref}`);
        const st = pj.ok ? pj.body.status : null;
        if (st === "ACTIVE_HEALTHY") { await upd({ status: "setup" }); return json({ status: "setup", step: "preparando banco" }); }
        return json({ status: "provisioning", step: "aguardando o banco subir", project_status: st });
      }

      if (s.status === "setup") {
        const ref = s.project_ref;
        const q = await mgmt(tok, "POST", `/projects/${ref}/database/query`, { query: buildSetupSql() });
        if (!q.ok) {
          const msg = typeof q.body === "object" ? JSON.stringify(q.body) : String(q.body);
          await upd({ status: "error", error: `setup ${q.status} ${msg}`.slice(0, 400) });
          return json({ status: "error", error: "Nao foi possivel preparar as tabelas." });
        }
        const ak = await mgmt(tok, "GET", `/projects/${ref}/api-keys`);
        let anon: string | null = null;
        if (ak.ok && Array.isArray(ak.body)) {
          anon = (ak.body.find((k: any) => k.name === "anon") || {}).api_key
            || (ak.body.find((k: any) => String(k.name || "").includes("publishable")) || {}).api_key
            || (ak.body.find((k: any) => String(k.api_key || "").startsWith("sb_publishable_")) || {}).api_key
            || null;
        }
        const purl = `https://${ref}.supabase.co`;
        await upd({ status: "done", project_url: purl, anon_key: anon });
        await sb.from("medcore_connect_sessions").update({ access_token: null }).eq("state", state);
        return json({ status: "done", project_url: purl, anon_ok: !!anon, project_ref: ref });
      }

      return json({ status: s.status });
    }

    // ---- status (app faz polling; devolve a config quando pronta) ----
    if (path.endsWith("/status")) {
      const state = url.searchParams.get("state") ?? "";
      const device_id = url.searchParams.get("device_id") ?? "";
      const { data: s } = await sb.from("medcore_connect_sessions").select("status,device_id,project_url,anon_key,project_ref,owner_email,error").eq("state", state).maybeSingle();
      if (!s) return json({ status: "not_found" }, 404);
      if (device_id && s.device_id && device_id !== s.device_id) return json({ status: "forbidden" }, 403);
      return json(s);
    }

    return json({ ok: true, service: "medcore-connect", configured: !!CLIENT_SECRET });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
