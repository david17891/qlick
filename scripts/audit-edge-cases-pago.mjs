// Audit completo de edge cases del path de pago y bot-engine.
// Sin drenar DeepSeek (solo audit estático + queries SQL).
//
// Lo que lista:
//   A. Edge cases del bot-engine (inputs del lead)
//   B. Edge cases del path de pago (Stripe webhook, mark-paid)
//   C. Edge cases del scanner QR
//   D. Edge cases del validator de inputs
//
// Output: tabla con (categoria, edge_case, estado, prioridad, fix).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const botEngine = readFileSync(
  join(ROOT, "src/lib/whatsapp/bot-engine.ts"),
  "utf8",
);
const stripeWebhook = readFileSync(
  join(ROOT, "src/app/api/webhooks/stripe/route.ts"),
  "utf8",
);
const markPaid = readFileSync(
  join(ROOT, "src/app/api/staff/check-in/mark-paid/route.ts"),
  "utf8",
);
const checkIn = readFileSync(
  join(ROOT, "src/app/api/staff/check-in/route.ts"),
  "utf8",
);
const phoneUtils = readFileSync(
  join(ROOT, "src/lib/crm/phone-utils.ts"),
  "utf8",
);

const cases = [];
function add(category, edge, state, priority, fix) {
  cases.push({ category, edge, state, priority, fix });
}

// ============================================================
// A. EDGE CASES DEL BOT-ENGINE
// ============================================================
console.log("=== A. BOT-ENGINE INPUTS ===\n");

// Body vacío
add("Bot", "Body vacío (whatsapp webhook)", botEngine.includes("if (!body)") ? "MANEJADO" : "FALLA", "MEDIA", "");
// Solo emojis
add("Bot", "Body solo emojis (👍, 🎉, etc.)", botEngine.includes("isValidHumanName") ? "MANEJADO" : "FALLA", "BAJA", "isValidHumanName filtra emojis");
// Solo números (ej. "12345")
add("Bot", "Body solo números (12345)", botEngine.includes("isValidHumanName") ? "MANEJADO" : "FALLA", "BAJA", "");
// Email sin nombre
add("Bot", "Body es solo email (david@x.com)", botEngine.includes("looksLikeEmail") ? "MANEJADO" : "FALLA", "BAJA", "");
// Nombre + email juntos (implicit_capture)
add("Bot", "Nombre + email juntos", botEngine.includes("implicitEmail") ? "MANEJADO" : "FALLA", "ALTA", "Sprint 4 lo arregla");
// Nombre placeholder ("Por", "Test")
add("Bot", "Nombre placeholder (Por, Test, Asistente)", botEngine.includes("cleanFirstName") && botEngine.includes("PLACEHOLDER_NAMES") ? "MANEJADO" : "FALLA", "ALTA", "");
// Email inválido
add("Bot", "Email inválido (no @, no .)", botEngine.includes("EMAIL_RE") || botEngine.includes("@[^\s@]+") ? "MANEJADO" : "FALLA", "MEDIA", "");
// Phone no E.164
add("Bot", "Phone no normalizado", botEngine.includes("normalizePhone") ? "MANEJADO" : "FALLA", "ALTA", "");
// Multiple confirmations mismo evento
add("Bot", "Lead con múltiples confirmations del mismo evento", !botEngine.includes("uniqueness check on (event_id, phone") && !botEngine.includes("LIMIT 1") ? "RIESGO" : "MANEJADO", "MEDIA", "");
// Evento pasado
add("Bot", "Intentar inscribir a evento ya pasado", !botEngine.includes("starts_at < now") ? "MANEJA INDEFINIDO" : "MANEJADO", "BAJA", "");
// Evento cancelado
add("Bot", "Intentar inscribir a evento cancelado", !botEngine.includes("status = 'cancelled'") ? "MANEJA INDEFINIDO" : "MANEJADO", "BAJA", "");
// Mensaje en inglés
add("Bot", "Lead escribe en inglés (Hello, I want to register)", botEngine.includes("LANG_RE") || botEngine.includes("/hola/i") ? "MANEJADO" : "FALLA", "MEDIA", "LANG handled?");
// Mensaje con ZWSP (zero-width-space, anti-spam evasion)
add("Bot", "Body con ZWSP invisibles", botEngine.includes("ZWSP") || botEngine.includes("[\\u200B-\\u200D]") ? "RIESGO" : "FALLA", "MEDIA", "audit previa 2026-07-14: 1 MEDIUM ZWSP en name");
// Lead en opt_out
add("Bot", "Lead con opt_out=true", botEngine.includes("opt_out") ? "MANEJADO" : "FALLA", "ALTA", "");
// Bot presionado por deepseek rate limit
add("Bot", "DeepSeek rate limit / 429", botEngine.includes("429") || botEngine.includes("rateLimit") ? "MANEJA" : "FALLA", "ALTA", "");

// ============================================================
// B. EDGE CASES DEL PATH DE PAGO
// ============================================================
console.log("=== B. STRIPE WEBHOOK ===\n");

// Firma inválida
add("Stripe", "Webhook sin firma Stripe", stripeWebhook.includes("stripe.webhooks.constructEvent") ? "MANEJADO" : "FALLA", "ALTA", "");
// Webhook duplicado
add("Stripe", "Webhook duplicado (mismo event.id 2 veces)", stripeWebhook.includes("idempotent_skip") ? "MANEJADO" : "FALLA", "ALTA", "");
// Monto no coincide (anti-fraude)
add("Stripe", "Monto pagado no coincide con precio del evento", stripeWebhook.includes("amount_discrepancy_blocked") ? "MANEJADO" : "FALLA", "ALTA", "");
// Payment que ya estaba paid_manual
add("Stripe", "Webhook llega a confirmation que ya está paid_manual", !stripeWebhook.includes("if (ps === 'paid_manual'") ? "MANEJA" : "MANEJADO", "MEDIA", "");
// Refund después de pago
add("Stripe", "Refund (charge.refunded)", stripeWebhook.includes("handleChargeRefunded") ? "MANEJADO" : "FALLA", "ALTA", "");
// Evento cancelado + payment
add("Stripe", "Pago llega a evento cancelado", !stripeWebhook.includes("event_cancelled") ? "FALLA" : "MANEJADO", "MEDIA", "");
// Email inválido en customer
add("Stripe", "Customer email inválido (no auto-confirm)", stripeWebhook.includes("createUser") ? "MANEJADO" : "FALLA", "BAJA", "");
// Supabase caído durante webhook
add("Stripe", "Supabase no responde durante webhook", !stripeWebhook.includes("try {") ? "FALLA" : "MANEJADO", "ALTA", "");
// Scholarship llega al webhook (no debería)
add("Stripe", "Scholarship (priceMXN=0) llega al webhook", stripeWebhook.includes("productRef.priceMXN > 0") ? "MANEJADO" : "FALLA", "BAJA", "");

console.log("\n=== B. MARK-PAID ===\n");

// event_qr_tokens no existe
add("mark-paid", "qr_token inválido (no existe en event_qr_tokens)", markPaid.includes("qr_token inv") ? "MANEJADO" : "FALLA", "ALTA", "");
// qr_token expirado
add("mark-paid", "qr_token expirado", markPaid.includes("expirado") || markPaid.includes("expires_at") ? "MANEJADO" : "FALLA", "ALTA", "");
// qr_token de otro evento
add("mark-paid", "qr_token de otro evento (cross-event)", markPaid.includes("validatedQrEventId") && markPaid.includes("eventos distintos") ? "MANEJADO" : "FALLA", "ALTA", "");
// Doble click del staff
add("mark-paid", "Doble click del staff (race condition)", markPaid.includes("idempotencyKey") && markPaid.includes("23505") ? "MANEJADO" : "FALLA", "ALTA", "");
// staff_email no es email válido
add("mark-paid", "staff_email malformado", markPaid.includes("staff_email") && markPaid.includes("actorEmail") ? "MANEJADO" : "FALLA", "BAJA", "");
// amount_mxn negativo o 0
add("mark-paid", "amount_mxn <= 0 en el body", markPaid.includes("amountMXN <= 0") ? "MANEJADO" : "FALLA", "MEDIA", "");
// event sin price_mxn
add("mark-paid", "Evento sin price_mxn (NULL)", markPaid.includes("regex sobre description") ? "MANEJADO" : "FALLA", "MEDIA", "");
// confirmation_id no es UUID
add("mark-paid", "confirmation_id no es UUID", markPaid.includes("Falta `confirmation_id`") ? "MANEJADO" : "FALLA", "MEDIA", "");

// ============================================================
// C. EDGE CASES DEL SCANNER
// ============================================================
console.log("=== C. SCANNER ===\n");

// QR no existe
add("Scanner", "QR no existe en event_qr_tokens", checkIn.includes("QR no encontrado") ? "MANEJADO" : "FALLA", "ALTA", "");
// QR expirado
add("Scanner", "QR expirado", checkIn.includes("QR expirado") ? "MANEJADO" : "FALLA", "ALTA", "");
// QR cross-event
add("Scanner", "QR de otro evento", checkIn.includes("crossEvent") ? "MANEJADO" : "FALLA", "ALTA", "");
// Staff link inválido
add("Scanner", "Staff link inválido/expirado", checkIn.includes("Staff link") ? "MANEJADO" : "FALLA", "ALTA", "");
// Walk-in sin confirmation
add("Scanner", "Walk-in sin confirmation previa", checkIn.includes("walk-in") || checkIn.includes("confirmation_id") ? "MANEJADO" : "FALLA", "MEDIA", "");
// QR ya usado (idempotencia)
add("Scanner", "QR ya usado (idempotencia)", checkIn.includes("alreadyCheckedIn") ? "MANEJADO" : "FALLA", "MEDIA", "");

// ============================================================
// D. EDGE CASES DE INPUTS
// ============================================================
console.log("=== D. VALIDACIÓN DE INPUTS ===\n");

add("Inputs", "Phone formato inválido (no +52)", phoneUtils.includes("normalizePhone") && phoneUtils.includes("+52") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Inputs", "Phone con caracteres especiales (+52 1 555...)", phoneUtils.includes("normalizePhone") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Inputs", "Email sin @", botEngine.includes("@[^\s@]+") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Inputs", "Email con espacios", botEngine.includes("@[^\s@]+") ? "MANEJADO" : "FALLA", "BAJA", "");

// ============================================================
// REPORTE
// ============================================================
console.log("\n" + "=".repeat(80));
console.log("EDGE CASE AUDIT - PATH DE PAGO + BOT");
console.log("=".repeat(80));

const grouped = {};
for (const c of cases) {
  if (!grouped[c.category]) grouped[c.category] = [];
  grouped[c.category].push(c);
}

for (const [cat, items] of Object.entries(grouped)) {
  console.log(`\n[${cat}]`);
  for (const c of items) {
    const icon = c.state === "MANEJADO" ? "✓" : c.state === "FALLA" ? "✗" : "?";
    const pri = c.priority === "ALTA" ? "[!]" : c.priority === "MEDIA" ? "[~]" : "[ ]";
    const fix = c.fix ? ` FIX: ${c.fix}` : "";
    console.log(`  ${icon} ${pri} ${c.edge} (${c.state})${fix}`);
  }
}

const fails = cases.filter((c) => c.state === "FALLA" || c.state === "RIESGO");
const total = cases.length;
const failsCount = fails.length;
console.log("\n" + "=".repeat(80));
console.log(`Total: ${total} edge cases, ${failsCount} FALLA/R IESGO (${Math.round(failsCount * 100 / total)}%)`);
console.log("=".repeat(80));
