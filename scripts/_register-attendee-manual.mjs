#!/usr/bin/env node
// scripts/_register-attendee-manual.mjs
//
// FIX urgente (sesion David 2026-07-07 ~22:00): David atendio a una
// persona por WhatsApp directo (no via bot), tomo la conversacion desde
// su WhatsApp, y necesito registrar a:
//
//   Gabriela Terán — terangabriela467@gmail.com
//
// al evento AA4E ("Marketing + IA para Emprendedores", 11 jul 11 AM).
//
// Este script es la version CLI del "registro manual" del admin:
//
//   1. Resuelve el evento por short_code (4 chars) o slug.
//   2. Crea o actualiza el lead (consent_to_contact=true).
//   3. Crea la confirmation en event_confirmations (idempotente).
//   4. Genera token de QR en event_qr_tokens.
//   5. Envia email de QR pass al correo.
//
// Uso:
//   node --experimental-strip-types scripts/_register-attendee-manual.mjs \
//     --event AA4E \
//     --name "Gabriela Terán" \
//     --email terangabriela467@gmail.com \
//     [--phone "+52..."] \
//     [--no-email]  # no envia el correo (default: si)
//
// Salida:
//   - JSON con el resultado de cada paso.
//   - Exit code 0 si OK, 1 si falla.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizePhone } from "../src/lib/crm/phone-utils.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────
// Mini parser de .env.local
// ─────────────────────────────────────────────────────────────
function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET =
  env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error("Faltan env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY).");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// CLI parser (mínimo — flags con valor)
// ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function readArg(flag, fallback = null) {
  const prefix = `${flag}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return fallback;
}
function hasFlag(flag) {
  return args.includes(flag);
}

const EVENT_IDENTIFIER = readArg("--event");
const NAME = readArg("--name");
const EMAIL = readArg("--email");
const PHONE = readArg("--phone");
const SEND_EMAIL = !hasFlag("--no-email");
const DRY_RUN = hasFlag("--dry-run");

if (!EVENT_IDENTIFIER || !NAME || !EMAIL) {
  console.error(
    "Uso:\n  node --experimental-strip-types scripts/_register-attendee-manual.mjs \\\n    --event <slug|shortCode> \\\n    --name \"<nombre completo>\" \\\n    --email <email> \\\n    [--phone \"<+52XXXXXXXXXX>\"] \\\n    [--no-email] \\\n    [--dry-run]"
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Cliente Supabase (service role)
// ─────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
  global: {
    fetch: (url, options = {}) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(20_000) }),
  },
});

const phoneNormalized = PHONE ? normalizePhone(PHONE) : null;
const emailLower = EMAIL.trim().toLowerCase();

const report = { steps: [] };
function step(name, data) {
  report.steps.push({ name, ...data });
  // eslint-disable-next-line no-console
  console.log(`[${name}]`, JSON.stringify(data));
}

// ─────────────────────────────────────────────────────────────
// 1. Resolver evento (acepta slug o short_code)
// ─────────────────────────────────────────────────────────────
const { data: evt, error: evtErr } = await supabase
  .from("events")
  .select("id, slug, short_code, title, starts_at, ends_at, location, format, streaming_url, streaming_provider, streaming_access_note")
  .eq("status", "published")
  .or(`slug.eq.${EVENT_IDENTIFIER},short_code.eq.${EVENT_IDENTIFIER.toUpperCase()}`)
  .limit(1)
  .maybeSingle();

if (evtErr) {
  step("resolve_event", { ok: false, error: evtErr.message });
  process.exit(1);
}
if (!evt) {
  step("resolve_event", { ok: false, error: "evento no encontrado o no publicado" });
  process.exit(1);
}
step("resolve_event", {
  ok: true,
  id: evt.id,
  slug: evt.slug,
  shortCode: evt.short_code,
  title: evt.title,
  startsAt: evt.starts_at,
  endsAt: evt.ends_at,
  location: evt.location,
});

if (DRY_RUN) {
  step("dry_run_exit", { ok: true, message: "--dry-run: detenemos antes de escribir." });
  console.log("\nReporte final:", JSON.stringify(report, null, 2));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// 2. Crear o actualizar lead (consent=true)
// ─────────────────────────────────────────────────────────────
let lead = null;
let leadCreated = false;
try {
  // Buscar por email primero (indice unico).
  const { data: existing, error: lookupErr } = await supabase
    .from("leads")
    .select("id, name, email, consent_to_contact, phone_normalized, whatsapp_status")
    .eq("email", emailLower)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  lead = existing;
  leadCreated = false;

  if (!lead) {
    // Crear lead nuevo.
      const { data: created, error: insertErr } = await supabase
      .from("leads")
      .insert({
        name: NAME.trim(),
        email: emailLower,
        phone_normalized: phoneNormalized,
        consent_to_contact: true,
        whatsapp_status: "no_contactado",
        // Enum public.lead_source: website/whatsapp/facebook_ads/
        // instagram_ads/referral/event/manual/organic/other.
        source: "manual",
      })
      .select("id, name, email")
      .maybeSingle();
    if (insertErr) throw insertErr;
    lead = created;
    leadCreated = true;
    step("create_lead", { ok: true, id: lead.id, created: true });
  } else {
    // Update: nombre + phone + consent si falta.
    const patch = {};
    if (!lead.name || lead.name !== NAME.trim()) patch.name = NAME.trim();
    if (phoneNormalized && lead.phone_normalized !== phoneNormalized) {
      patch.phone_normalized = phoneNormalized;
    }
    if (!lead.consent_to_contact) patch.consent_to_contact = true;
    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", lead.id);
      if (updErr) throw updErr;
      step("update_lead", { ok: true, id: lead.id, fields: Object.keys(patch) });
    } else {
      step("find_lead", { ok: true, id: lead.id, created: false });
    }
  }
} catch (leadErr) {
  step("lead_error", { ok: false, error: leadErr.message });
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// 3. Crear confirmation en event_confirmations (idempotente)
// ─────────────────────────────────────────────────────────────
let confirmationId = null;
try {
  // Primero buscamos si ya existe.
  let existingConf = null;
  if (emailLower) {
    const { data } = await supabase
      .from("event_confirmations")
      .select("id, name, email, phone_normalized")
      .eq("event_id", evt.id)
      .ilike("email", emailLower)
      .maybeSingle();
    existingConf = data;
  }
  if (!existingConf && phoneNormalized) {
    const { data } = await supabase
      .from("event_confirmations")
      .select("id, name, email, phone_normalized")
      .eq("event_id", evt.id)
      .eq("phone_normalized", phoneNormalized)
      .maybeSingle();
    existingConf = data;
  }
  if (existingConf) {
    confirmationId = existingConf.id;
    step("find_confirmation", { ok: true, id: confirmationId, created: false });
  } else {
    const { data, error: confErr } = await supabase
      .from("event_confirmations")
      .insert({
        event_id: evt.id,
        name: NAME.trim(),
        email: emailLower,
        phone_raw: PHONE || null,
        phone_normalized: phoneNormalized,
        // Enum public.event_confirmation_source: imported_excel/public_form/manual.
        source: "manual",
      })
      .select("id")
      .maybeSingle();
    if (confErr) throw confErr;
    confirmationId = data.id;
    step("create_confirmation", { ok: true, id: confirmationId, created: true });
  }
} catch (confErr) {
  step("confirmation_error", { ok: false, error: confErr.message });
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// 4. Generar QR token (idempotente: reusar si ya existe vigente)
// ─────────────────────────────────────────────────────────────
let qrToken = null;
let qrUrl = null;
try {
  // Sentinel UNIQUE para attendees sin telefono (ej. registros via
  // admin manual). La columna attendee_phone_normalized es NOT NULL en
  // event_qr_tokens, pero un lead puede tener solo email.
  const phoneSentinel = phoneNormalized || `+1manual${emailLower.replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
  // Buscar token vigente del lead para este evento.
  const { data: existingToken } = await supabase
    .from("event_qr_tokens")
    .select("token, expires_at")
    .eq("event_id", evt.id)
    .eq("attendee_phone_normalized", phoneSentinel)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const baseUrl =
    env.NEXT_PUBLIC_APP_URL ||
    // FIX 2026-07-07 (sesion David "QR apunta a localhost"): fallback
    // explicito al dominio canonico cuando NEXT_PUBLIC_APP_URL no esta
    // seteada (caso comun en .env.local sin sync desde Vercel).
    "https://www.qlick.digital";
  if (existingToken && existingToken.expires_at && new Date(existingToken.expires_at) > new Date()) {
    qrToken = existingToken.token;
    qrUrl = `${baseUrl}/check-in/${qrToken}`;
    step("find_qr_token", { ok: true, token: qrToken, url: qrUrl, created: false });
  } else {
    // Generar uno nuevo.
    const token = randomBytes(24).toString("base64url").slice(0, 32);
    const endsAt = evt.ends_at ? new Date(evt.ends_at) : new Date();
    const expiresAt = new Date(endsAt.getTime() + 6 * 60 * 60 * 1000);
    // NOTA: event_qr_tokens NO tiene columna lead_id (verificado en
    // migration 20260629223747_whatsapp_funnel_v1.sql). El bot-engine
    // usa el fallback por attendee_phone_normalized. Aqui replicamos
    // el mismo path.
    const { data, error: qrErr } = await supabase
      .from("event_qr_tokens")
      .insert({
        event_id: evt.id,
        attendee_phone_normalized: phoneSentinel,
        attendee_name: NAME.trim(),
        attendee_email: emailLower,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select("token")
      .maybeSingle();
    if (qrErr) throw qrErr;
    qrToken = data.token;
    qrUrl = `${baseUrl}/check-in/${qrToken}`;
    step("create_qr_token", { ok: true, token: qrToken, url: qrUrl, created: true });
  }
} catch (qrErr) {
  step("qr_token_error", { ok: false, error: qrErr.message });
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// 5. Enviar email de QR pass
// ─────────────────────────────────────────────────────────────
let emailResult = null;
if (SEND_EMAIL) {
  try {
    const { sendEventQrPassEmail } = await import("../src/lib/email/event-qr-pass.ts");
    const result = await sendEventQrPassEmail(
      {
        attendeeName: NAME.trim(),
        attendeeEmail: emailLower,
        eventTitle: evt.title,
        eventStartsAt: evt.starts_at,
        eventLocation: evt.location,
        qrImageUrl: `${env.NEXT_PUBLIC_APP_URL || "https://www.qlick.digital"}/api/event-qr/${qrToken}.png`,
        checkInUrl: qrUrl,
        format: evt.format || "in_person",
        streamingAccessNote: evt.streaming_access_note || undefined,
      },
      {
        eventId: evt.id,
        eventQrTokenId: null,
      }
    );
    emailResult = { ok: result.ok, error: result.error || null };
    step("send_email", emailResult);
  } catch (emailErr) {
    step("send_email_error", { ok: false, error: emailErr.message });
    // No exit 1 — el QR ya está generado; el email es best-effort.
  }
}

// ─────────────────────────────────────────────────────────────
// Reporte final
// ─────────────────────────────────────────────────────────────
console.log("\n=== Resumen ===");
console.log(JSON.stringify(
  {
    event: { id: evt.id, slug: evt.slug, title: evt.title, starts_at: evt.starts_at },
    lead: { id: lead.id, created: leadCreated, name: NAME.trim(), email: emailLower },
    confirmation: { id: confirmationId, created: report.steps.find((s) => s.name === "create_confirmation")?.created || false },
    qr: { token: qrToken, url: qrUrl },
    email: emailResult,
  },
  null,
  2
));
console.log("\nProceso terminado OK.");
