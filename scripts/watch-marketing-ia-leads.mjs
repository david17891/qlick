// scripts/watch-marketing-ia-leads.mjs
//
// Watcher: detecta leads nuevos del evento "Marketing + IA para Emprendedores"
// para notificación cada 30 min vía cron Qlick.
//
// Event ID: eeb2070e-9b64-4715-a684-b3c308e9d0b2
// Slug: marketing-ia-para-emprendedores
//
// Tablas que monitorea:
// - leads (master)  ∩  lead_event_links (event_id match)  → nuevos leads vinculados
// - event_confirmations (event_id match)                   → nuevos confirmados (pre-lead)
// - event_qr_tokens (event_id match)                      → nuevos QR tokens emitidos
// - event_attendees (event_id match)                      → nuevos check-ins
//
// Uso:
//   node --env-file=.env.local scripts/watch-marketing-ia-leads.mjs [sinceISO]
//   # sinceISO opcional — default = ahora - 30 min

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error(JSON.stringify({ error: "missing_env", keys: Object.keys(env) }));
  process.exit(1);
}

const EVENT_ID = "eeb2070e-9b64-4715-a684-b3c308e9d0b2";
const SINCE_ARG = process.argv[2];

// Default window = 30 minutes
const now = new Date();
const sinceDefault = new Date(now.getTime() - 30 * 60_000);
const sinceISO = SINCE_ARG || sinceDefault.toISOString();

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// 1) Verify event exists & grab title/slug/starts_at
const { data: event, error: eventErr } = await sb
  .from("events")
  .select("id, slug, title, status, starts_at, ends_at")
  .eq("id", EVENT_ID)
  .maybeSingle();

if (eventErr) {
  console.error(JSON.stringify({ error: "event_query_failed", detail: eventErr.message }));
  process.exit(1);
}
if (!event) {
  console.error(JSON.stringify({ error: "event_not_found", event_id: EVENT_ID }));
  process.exit(1);
}

// 2) Leads nuevos vinculados a este evento vía lead_event_links
const { data: linkRows, error: linkErr } = await sb
  .from("lead_event_links")
  .select(`
    id,
    link_type,
    link_id,
    created_at,
    lead:leads (
      id,
      name,
      email,
      phone,
      phone_normalized,
      status,
      source,
      created_at
    )
  `)
  .eq("event_id", EVENT_ID)
  .gte("created_at", sinceISO)
  .order("created_at", { ascending: true });

if (linkErr) {
  console.error(JSON.stringify({ error: "lead_links_query_failed", detail: linkErr.message }));
  process.exit(1);
}

// 3) Confirmaciones nuevas (sign-ups) para este evento
const { data: confirmRows, error: confirmErr } = await sb
  .from("event_confirmations")
  .select("id, name, email, phone_normalized, source, confirmed_at, import_batch_id")
  .eq("event_id", EVENT_ID)
  .gte("confirmed_at", sinceISO)
  .order("confirmed_at", { ascending: true });

if (confirmErr) {
  console.error(JSON.stringify({ error: "confirmations_query_failed", detail: confirmErr.message }));
  process.exit(1);
}

// 4) QR tokens nuevos emitidos
const { data: qrRows, error: qrErr } = await sb
  .from("event_qr_tokens")
  .select("id, attendee_phone_normalized, attendee_email, attendee_name, checked_in_at, checked_in_by, expires_at, created_at")
  .eq("event_id", EVENT_ID)
  .gte("created_at", sinceISO)
  .order("created_at", { ascending: true });

if (qrErr) {
  console.error(JSON.stringify({ error: "qr_tokens_query_failed", detail: qrErr.message }));
  process.exit(1);
}

// 5) Check-ins nuevos (asistencia real)
const { data: attendRows, error: attendErr } = await sb
  .from("event_attendees")
  .select("id, name, email, phone_normalized, source, checked_in_at, checked_in_by, import_batch_id")
  .eq("event_id", EVENT_ID)
  .gte("checked_in_at", sinceISO)
  .order("checked_in_at", { ascending: true });

if (attendErr) {
  console.error(JSON.stringify({ error: "attendees_query_failed", detail: attendErr.message }));
  process.exit(1);
}

// 6) Totales históricos
const [{ data: allLinks }, { data: allConfirms }, { data: allQrs }, { data: allAttend }] = await Promise.all([
  sb.from("lead_event_links").select("id").eq("event_id", EVENT_ID),
  sb.from("event_confirmations").select("id").eq("event_id", EVENT_ID),
  sb.from("event_qr_tokens").select("id").eq("event_id", EVENT_ID),
  sb.from("event_attendees").select("id").eq("event_id", EVENT_ID),
]);

const output = {
  checked_at: now.toISOString(),
  since: sinceISO,
  event: {
    id: event.id,
    slug: event.slug,
    title: event.title,
    status: event.status,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
  },
  totals: {
    lead_event_links: allLinks?.length ?? 0,
    confirmations: allConfirms?.length ?? 0,
    qr_tokens: allQrs?.length ?? 0,
    attendees: allAttend?.length ?? 0,
  },
  new_in_window: {
    leads_via_links: (linkRows || []).length,
    confirmations: (confirmRows || []).length,
    qr_tokens: (qrRows || []).length,
    attendees: (attendRows || []).length,
  },
  details: {
    leads_via_links: (linkRows || []).map((r) => ({
      link_id: r.id,
      link_type: r.link_type,
      linked_record_id: r.link_id,
      link_created_at: r.created_at,
      lead_id: r.lead?.id,
      name: r.lead?.name,
      email: r.lead?.email,
      phone: r.lead?.phone,
      status: r.lead?.status,
      source: r.lead?.source,
      lead_created_at: r.lead?.created_at,
    })),
    confirmations: (confirmRows || []),
    qr_tokens: (qrRows || []),
    attendees: (attendRows || []),
  },
};

console.log(JSON.stringify(output, null, 2));