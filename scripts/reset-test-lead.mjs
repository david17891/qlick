#!/usr/bin/env node
// scripts/reset-test-lead.mjs
//
// Reset del estado de un lead de testing en Supabase.
// Limpia TODOS los registros asociados a un teléfono para que David pueda
// volver a correr el ciclo E2E (register → check-in → survey → score)
// desde cero, sin arrastrar data vieja.
//
// PRIVACIDAD: solo afecta leads con phone sintético (los que David usa
// para testing). NO debe correr contra leads con datos reales.
//
// Lo que limpia por teléfono normalizado:
//   - leads (DELETE)
//   - lead_profile (DELETE, cascade)
//   - lead_whatsapp_log (DELETE)
//   - lead_whatsapp_conversations (DELETE)
//   - handoff_requests (DELETE)
//   - event_confirmations (DELETE — las del phone)
//   - event_attendees (DELETE — las del phone)
//   - event_survey_tokens (DELETE — los del phone)
//   - event_surveys (DELETE — los del phone; via token)
//   - lead_event_links (DELETE — via lead)
//
// Uso:
//   node scripts/reset-test-lead.mjs --phone=+526532935492
//   node scripts/reset-test-lead.mjs --phone=+526532935492 --dry-run
//
// Flags:
//   --phone=E164   Teléfono a resetear (REQUERIDO).
//   --dry-run      Solo muestra qué se va a borrar, no escribe.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}
const PHONE = arg("phone");
const DRY_RUN = args.includes("--dry-run");

if (!PHONE) {
  console.error("ERROR: falta --phone=+52XXXXXXXXXX");
  console.error("");
  console.error("Uso:");
  console.error("  node scripts/reset-test-lead.mjs --phone=+526532935492");
  console.error("  node scripts/reset-test-lead.mjs --phone=+526532935492 --dry-run");
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────
// Env loader (mismo patron que seed-demo.mjs)
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
const SERVICE_ROLE = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("ERROR: faltan env vars. Asegurate de tener .env.local con:");
  console.error("  NEXT_PUBLIC_SUPABASE_URL");
  console.error("  SUPABASE_SECRET_KEY");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;

function step(name) {
  console.log(`\n→ ${name}`);
}
function ok(msg) {
  pass++;
  console.log(`  ✓ ${msg}`);
}
function err(msg) {
  fail++;
  console.error(`  ✗ ${msg}`);
}

// ─────────────────────────────────────────────────────────────
// 1. Buscar leads por phone_normalized
// ─────────────────────────────────────────────────────────────
step(`Buscando leads con phone_normalized=${PHONE}`);
const { data: leads, error: leadsErr } = await supabase
  .from("leads")
  .select("id, email, status, score, qualification")
  .eq("phone_normalized", PHONE);

if (leadsErr) {
  err(`Error leyendo leads: ${leadsErr.code ?? leadsErr.message}`);
  process.exit(1);
}
if (!leads || leads.length === 0) {
  console.log(`  (sin leads para este phone — nada que limpiar)`);
  process.exit(0);
}
ok(`${leads.length} lead(s) encontrado(s)`);
const leadIds = leads.map((l) => l.id);

// ─────────────────────────────────────────────────────────────
// 2. Contar tablas relacionadas ANTES del reset
// ─────────────────────────────────────────────────────────────
step("Conteo de registros a limpiar (pre-reset)");

const counts = {};
async function count(table, filter) {
  const { count: n, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .match(filter);
  if (error) {
    err(`No pude contar ${table}: ${error.code ?? error.message}`);
    return 0;
  }
  return n ?? 0;
}

counts.lead_profile = await count("lead_profile", { lead_id: leadIds });
counts.lead_whatsapp_log = await count("lead_whatsapp_log", { lead_id: leadIds });
counts.lead_whatsapp_conversations = await count("lead_whatsapp_conversations", {
  lead_id: leadIds
});
counts.handoff_requests = await count("handoff_requests", { lead_id: leadIds });
counts.event_confirmations = await count("event_confirmations", {
  phone_normalized: PHONE
});
counts.event_attendees = await count("event_attendees", {
  phone_normalized: PHONE
});
counts.event_survey_tokens_by_phone = await count("event_survey_tokens", {
  phone_normalized: PHONE
});
counts.lead_event_links = await count("lead_event_links", { lead_id: leadIds });

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`  Total a limpiar: ${total} registros`);
console.log(`  ${JSON.stringify(counts)}`);

if (DRY_RUN) {
  console.log("\nDRY RUN: nada se borró. Correr sin --dry-run para aplicar.");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// 3. DELETE en orden (FK constraints)
// ─────────────────────────────────────────────────────────────
step("Limpiando tablas relacionadas");

async function del(table, filter, label) {
  const { error, count: n } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .match(filter);
  if (error) {
    err(`${label}: ${error.code ?? error.message}`);
    return 0;
  }
  ok(`${label}: ${n ?? "?"} borrado(s)`);
  return n ?? 0;
}

// 3.1 child rows primero (FK hacia leads)
await del("lead_event_links", { lead_id: leadIds }, "lead_event_links");
await del("lead_profile", { lead_id: leadIds }, "lead_profile");
await del("lead_whatsapp_log", { lead_id: leadIds }, "lead_whatsapp_log");
await del(
  "lead_whatsapp_conversations",
  { lead_id: leadIds },
  "lead_whatsapp_conversations"
);
await del("handoff_requests", { lead_id: leadIds }, "handoff_requests");

// 3.2 event rows por phone (no por lead — pueden tener lead_id null en walk-ins)
await del("event_survey_tokens", { phone_normalized: PHONE }, "event_survey_tokens (phone)");
await del("event_attendees", { phone_normalized: PHONE }, "event_attendees (phone)");
await del("event_confirmations", { phone_normalized: PHONE }, "event_confirmations (phone)");

// 3.3 event_surveys por respondent_phone (no tienen FK directa a lead)
await del(
  "event_surveys",
  { phone_normalized: PHONE },
  "event_surveys (phone)"
);

// 3.4 leads al final (despues de que no haya FK pointing to it)
await del("leads", { id: leadIds }, "leads");

// ─────────────────────────────────────────────────────────────
// 4. Resumen
// ─────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
console.log(`Reset completo: ${pass} OK, ${fail} error(es)`);
if (fail > 0) process.exit(1);
process.exit(0);