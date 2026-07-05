#!/usr/bin/env node
// scripts/reset-all.mjs
//
// Wipe TOTAL del estado de Qlick para empezar un test E2E desde cero.
// Borra TODOS los eventos + leads + tablas relacionadas (excepto admin
// users + auth.users + system logs).
//
// PELIGROSO: este script BORRA DATOS. Solo usar cuando:
//   1. David lo pide explícitamente ("resetear todo")
//   2. Estas en dev/staging, NO en production
//   3. Confirmaste que no hay leads/eventos reales que importar
//
// PRIVACIDAD: cero PII. Solo borra data — nunca escribe.
// Idempotente: si no hay nada que borrar, devuelve ok.
//
// Lo que limpia:
//   - events (TODOS)
//   - event_confirmations, event_attendees, event_qr_tokens
//   - event_surveys, event_survey_tokens
//   - event_reminder_log, event_email_log
//   - event_staff_links
//   - leads (TODOS)
//   - lead_profile, lead_whatsapp_log, lead_whatsapp_conversations
//   - lead_consent_log, lead_event_links
//   - handoff_requests
//   - admin_audit_log (opcional, default true)
//
// Lo que NO limpia:
//   - auth.users (credenciales de auth, separadas)
//   - public.users / admin_users (cuentas admin reales)
//   - Config / env / migrations / functions / triggers
//
// Uso:
//   node scripts/reset-all.mjs                # wipe total
//   node scripts/reset-all.mjs --dry-run      # muestra qué se va a borrar
//   node scripts/reset-all.mjs --keep-audit   # NO borra admin_audit_log

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const KEEP_AUDIT = args.includes("--keep-audit");
const YES = args.includes("--yes");

// ─────────────────────────────────────────────────────────────
// Env loader
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
// Si NEXT_PUBLIC_SUPABASE_URL esta vacio (caso comun post `vercel env pull`),
// construimos desde SUPABASE_PROJECT_REF. Regla dura del api-box skill.
const SUPABASE_URL =
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== ""
    ? env.NEXT_PUBLIC_SUPABASE_URL
    : env.SUPABASE_PROJECT_REF
      ? `https://${env.SUPABASE_PROJECT_REF}.supabase.co`
      : "";
const SERVICE_ROLE = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("ERROR: faltan env vars. Asegurate de tener .env.local con:");
  console.error("  NEXT_PUBLIC_SUPABASE_URL o SUPABASE_PROJECT_REF");
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

async function countAll(table) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) {
    err(`No pude contar ${table}: ${error.code ?? error.message}`);
    return 0;
  }
  return count ?? 0;
}

async function wipe(table, label) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000"); // safety: never match
  if (error) {
    err(`${label}: ${error.code ?? error.message}`);
    return 0;
  }
  ok(`${label}: ${count ?? "?"} borrado(s)`);
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────
// 1. Conteo pre-wipe
// ─────────────────────────────────────────────────────────────
console.log("=== RESET TOTAL DE QLICK ===");
console.log(`Modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "WRITE (borra)"}`);
console.log(`Mantiene audit log: ${KEEP_AUDIT ? "SI" : "NO"}`);
console.log("");

step("Conteo de registros pre-wipe");
const tables = {
  // Eventos y derivados (orden: leaves → root)
  events: await countAll("events"),
  event_confirmations: await countAll("event_confirmations"),
  event_attendees: await countAll("event_attendees"),
  event_qr_tokens: await countAll("event_qr_tokens"),
  event_surveys: await countAll("event_surveys"),
  event_survey_tokens: await countAll("event_survey_tokens"),
  event_reminder_log: await countAll("event_reminder_log"),
  event_email_log: await countAll("event_email_log"),
  event_staff_links: await countAll("event_staff_links"),
  // Leads y derivados
  leads: await countAll("leads"),
  lead_profile: await countAll("lead_profile"),
  lead_whatsapp_log: await countAll("lead_whatsapp_log"),
  lead_whatsapp_conversations: await countAll("lead_whatsapp_conversations"),
  lead_consent_log: await countAll("lead_consent_log"),
  lead_event_links: await countAll("lead_event_links"),
  handoff_requests: await countAll("handoff_requests"),
  admin_audit_log: await countAll("admin_audit_log")
};

const total = Object.values(tables).reduce((a, b) => a + b, 0);
console.log(`\n  Total: ${total} registros`);
for (const [t, n] of Object.entries(tables)) {
  console.log(`    ${t}: ${n}`);
}

if (DRY_RUN) {
  console.log("\nDRY RUN: nada se borró. Correr sin --dry-run para aplicar.");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// 2. Confirmacion de seguridad (solo si hay datos y NO --yes)
// ─────────────────────────────────────────────────────────────
if (total > 0 && !YES) {
  console.log(`\n⚠️  Vas a borrar ${total} registros.`);
  console.log("   Presiona ENTER para confirmar, Ctrl+C para cancelar.");
  // Read a line from stdin to confirm
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question("   > ", resolve));
  rl.close();
}

// ─────────────────────────────────────────────────────────────
// 3. Wipe en orden (FK-safe)
// ─────────────────────────────────────────────────────────────
step("Borrando child rows (FK hacia leads/events)");

// 3.1 Survey + log (no tienen FK fuerte pero las borramos primero)
await wipe("event_reminder_log", "event_reminder_log");
await wipe("event_email_log", "event_email_log");
await wipe("event_survey_tokens", "event_survey_tokens");
await wipe("event_surveys", "event_surveys");
await wipe("event_qr_tokens", "event_qr_tokens");
await wipe("event_attendees", "event_attendees");
await wipe("event_confirmations", "event_confirmations");
await wipe("event_staff_links", "event_staff_links");

// 3.2 Lead-related (FK hacia leads)
await wipe("lead_event_links", "lead_event_links");
await wipe("lead_consent_log", "lead_consent_log");
await wipe("lead_whatsapp_conversations", "lead_whatsapp_conversations");
await wipe("lead_whatsapp_log", "lead_whatsapp_log");
await wipe("lead_profile", "lead_profile");
await wipe("handoff_requests", "handoff_requests");

// 3.3 Events (ya sin children)
await wipe("events", "events");

// 3.4 Leads (ya sin children)
await wipe("leads", "leads");

// 3.5 Audit log (opcional)
if (!KEEP_AUDIT) {
  await wipe("admin_audit_log", "admin_audit_log");
}

// ─────────────────────────────────────────────────────────────
// 4. Resumen
// ─────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
console.log(`Reset completo: ${pass} OK, ${fail} error(es)`);
if (fail > 0) {
  console.log("\n⚠️  Hubo errores. Revisa arriba qué tablas fallaron.");
  process.exit(1);
}
console.log("\n✓ Base limpia. Listo para crear evento nuevo desde /admin/eventos.");
process.exit(0);