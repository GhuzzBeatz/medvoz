// Template conceitual de broker OAuth para Supabase do cliente.
// Ajustar por app antes de usar em producao.
// NUNCA colocar Client Secret ou service_role fixo neste arquivo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_NAME = "<APP_NAME>";
const TABLE_PREFIX = "<TABLE_PREFIX>"; // exemplo: mu_
const TABLES = ["config", "produtos", "clientes"];

const REDIRECT_URI = "https://<PROJETO_GHZ>.supabase.co/functions/v1/<BROKER_FUNCTION_NAME>/callback";
const AUTHORIZE = "https://api.supabase.com/v1/oauth/authorize";
const TOKEN = "https://api.supabase.com/v1/oauth/token";
const MGMT = "https://api.supabase.com/v1";

const CLIENT_ID = "<SUPABASE_OAUTH_CLIENT_ID_PUBLICO>";
const CLIENT_SECRET = Deno.env.get("SB_OAUTH_CLIENT_SECRET")!;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function buildSetupSql(): string {
  const sql: string[] = [];
  for (const t of TABLES) {
    const table = `${TABLE_PREFIX}${t}`;
    sql.push(`
      create table if not exists public.${table} (
        row_id text primary key,
        record jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        deleted_at timestamptz,
        version bigint not null default 1,
        source_client text
      );
      alter table public.${table} enable row level security;
      drop policy if exists ${table}_anon_all on public.${table};
      create policy ${table}_anon_all on public.${table}
      for all to anon using (true) with check (true);
      create index if not exists idx_${table}_updated on public.${table}(updated_at);
    `);
  }
  return sql.join("\n");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname.endsWith("/health")) {
    return json({ ok: true, app: APP_NAME, configured: Boolean(CLIENT_SECRET) });
  }

  // Implementar /start, /callback, /provision e /status seguindo docs/03.
  return json({ ok: false, message: "Template. Complete as rotas antes de usar." }, 501);
});
