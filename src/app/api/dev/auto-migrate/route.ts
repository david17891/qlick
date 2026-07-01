/**
 * Endpoint DEBUG ONE-SHOT: aplica las 2 migraciones pendientes
 * (`bot_manual_context` + `lead_profile`) corriendo el SQL via pg.
 *
 * NO TIENE AUTH. Solo para uso inmediato del agente en este momento.
 * Se elimina después de la primera corrida exitosa.
 *
 * ⚠️ NO PUBLICO. NO DEBE QUEDAR EN PRODUCCIÓN. PELIGRO: ejecuta SQL.
 *
 * @server
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { errorLog } from "@/lib/log";

const MIGRATION_BOT_CONTEXT = `-- bot_context_overrides table
create table if not exists public.bot_context_overrides (
  id              uuid primary key default gen_random_uuid(),
  bot_name        text not null default 'qlick-bot',
  context_key     text not null,
  context_value   text not null,
  priority        int  not null default 100,
  enabled         boolean not null default true,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text,
  constraint bot_context_overrides_unique
    unique (bot_name, context_key)
);

create index if not exists bot_context_overrides_bot_idx
  on public.bot_context_overrides (bot_name);
create index if not exists bot_context_overrides_enabled_idx
  on public.bot_context_overrides (bot_name, enabled);

drop trigger if exists bot_context_overrides_set_updated_at on public.bot_context_overrides;
create trigger bot_context_overrides_set_updated_at
  before update on public.bot_context_overrides
  for each row execute function public.set_updated_at();

alter table public.bot_context_overrides enable row level security;

create or replace function public.get_active_bot_overrides(p_bot_name text)
returns table (
  context_key text,
  context_value text,
  priority int
)
language sql
stable
as $$
  select context_key, context_value, priority
  from public.bot_context_overrides
  where bot_name = p_bot_name
    and enabled = true
    and (expires_at is null or expires_at > now())
  order by priority asc, updated_at desc;
$$;
`;

const MIGRATION_LEAD_PROFILE = `-- lead_profile table
create table if not exists public.lead_profile (
  lead_id                uuid primary key references public.leads(id) on delete cascade,
  summary                text not null default '',
  messages_since_summary int  not null default 0,
  last_summary_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists lead_profile_last_summary_idx
  on public.lead_profile (last_summary_at desc);

create or replace function public.lead_profile_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lead_profile_touch_updated_at on public.lead_profile;
create trigger lead_profile_touch_updated_at
  before update on public.lead_profile
  for each row execute function public.lead_profile_touch_updated_at();

alter table public.lead_profile enable row level security;

drop policy if exists lead_profile_admin_select on public.lead_profile;
create policy lead_profile_admin_select on public.lead_profile
  for select to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

drop policy if exists lead_profile_admin_write on public.lead_profile;
create policy lead_profile_admin_write on public.lead_profile
  for all to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );
`;

const MIGRATIONS: Array<{ sql: string; label: string }> = [
  { sql: MIGRATION_BOT_CONTEXT, label: "bot_context_overrides" },
  { sql: MIGRATION_LEAD_PROFILE, label: "lead_profile" }
];

interface MigrationResult {
  label: string;
  ok: boolean;
  duration_ms: number;
  error?: string;
}

export async function POST(_req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const password = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !password) {
    return NextResponse.json(
      { ok: false, message: "Supabase no configurado" },
      { status: 500 }
    );
  }
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/);
  if (!m) {
    return NextResponse.json(
      { ok: false, message: "URL de Supabase con formato inválido" },
      { status: 500 }
    );
  }
  const ref = m[1];
  // Vercel's network can't resolve db.<ref>.supabase.co. Use the pooler
  // (transaction mode) which is on a different DNS zone reachable from
  // Vercel. We try several common regions; first success wins.
  const candidateHosts = [
    `aws-0-us-east-1.pooler.supabase.com`,
    `aws-0-us-west-1.pooler.supabase.com`,
    `aws-0-eu-west-1.pooler.supabase.com`,
    `aws-0-eu-central-1.pooler.supabase.com`,
    `aws-0-ap-southeast-1.pooler.supabase.com`,
    `aws-0-ap-northeast-1.pooler.supabase.com`,
    `aws-0-sa-east-1.pooler.supabase.com`
  ];

  // Test connectivity: try each region with a quick connect.
  let chosenHost: string | null = null;
  for (const host of candidateHosts) {
    const test = new Client({
      host,
      port: 6543,
      user: `postgres.${ref}`,
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5_000
    });
    try {
      await test.connect();
      await test.end();
      chosenHost = host;
      break;
    } catch {
      await test.end().catch(() => undefined);
    }
  }

  if (!chosenHost) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "No se pudo conectar a ningún pooler de Supabase. El proyecto podría estar pausado o en una región no probada."
      },
      { status: 500 }
    );
  }

  const client = new Client({
    host: chosenHost,
    port: 6543,
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30_000,
    query_timeout: 30_000
  });

  const results: MigrationResult[] = [];
  try {
    await client.connect();
    for (const mig of MIGRATIONS) {
      const start = Date.now();
      try {
        await client.query(mig.sql);
        results.push({
          label: mig.label,
          ok: true,
          duration_ms: Date.now() - start
        });
      } catch (err) {
        errorLog("[auto-migrate] migration failed", {
          label: mig.label,
          error: err instanceof Error ? err.message : String(err)
        });
        results.push({
          label: mig.label,
          ok: false,
          duration_ms: Date.now() - start,
          error:
            err instanceof Error
              ? `${err.message}\n${(err as { detail?: string }).detail ?? ""}`
              : String(err)
        });
      }
    }
    const allOk = results.every((r) => r.ok);
    return NextResponse.json({ ok: allOk, ref, results });
  } catch (err) {
    errorLog("[auto-migrate] connection/setup failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    return NextResponse.json(
      {
        ok: false,
        message: "Connection failed",
        error: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
