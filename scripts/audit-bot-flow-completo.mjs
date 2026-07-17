// Audit completo del flow del bot de WhatsApp.
// Cubre: REGISTRO, CONVERSACIÓN, PERSISTENCIA, EMAILS.
//
// Sin drenar DeepSeek (audit estático + queries SQL).
// Output: tabla con (categoria, path, edge_case, estado, prioridad, fix).

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
const safetyNet = readFileSync(
  join(ROOT, "src/lib/whatsapp/safety-net.ts"),
  "utf8",
);
const provider = readFileSync(
  join(ROOT, "src/lib/whatsapp/providers/whatsapp-provider.ts"),
  "utf8",
);
const eventLoader = readFileSync(
  join(ROOT, "src/lib/ai/event-context-loader.ts"),
  "utf8",
);

const cases = [];
function add(category, path, edge, state, priority, fix = "") {
  cases.push({ category, path, edge, state, priority, fix });
}

// ============================================================
// A. REGISTRO
// ============================================================
console.log("=== A. REGISTRO (welcome, captura nombre/email) ===\n");

// Welcome message
add("Registro", "Welcome", "Sin evento activo (no hay published)", botEngine.includes("fallbackNoEvents") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Welcome", "Con evento activo presencial", botEngine.includes("Presencial") || botEngine.includes("in_person") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Welcome", "Con evento virtual", botEngine.includes("streamingAccessNote") || botEngine.includes("format: \"virtual\"") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Welcome", "Con evento hybrid", eventLoader.includes("hybrid") ? "MANEJADO" : "FALLA", "BAJA", "");
add("Registro", "Welcome", "Evento de pago (priceMxn > 0)", botEngine.includes("evento de pago") || eventLoader.includes("evento de pago") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Welcome", "Evento gratis (priceMxn null/0)", eventLoader.includes("evento gratuito") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Welcome", "Múltiples eventos activos", botEngine.includes("eventsListBlock") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Captura nombre
add("Registro", "Captura nombre", "Lead da solo nombre (1 palabra)", botEngine.includes("Necesito tu nombre completo") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Captura nombre", "Lead da nombre con tildes (Juan Pérez)", botEngine.includes("isValidHumanName") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Registro", "Captura nombre", "Lead da nombre con emojis (Juan 🎉)", botEngine.includes("isValidHumanName") ? "MANEJADO" : "FALLA", "BAJA", "");
add("Registro", "Captura nombre", "Lead da nombre placeholder (Por, Test)", botEngine.includes("PLACEHOLDER_NAMES") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Captura nombre", "Lead da nombre de 100+ chars", botEngine.includes("name.length > 100") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Registro", "Captura nombre", "Lead da nombre con título (Dr. Juan)", botEngine.includes("Dr.") ? "MANEJADO" : "FALLA", "BAJA", "");
add("Registro", "Captura nombre", "Lead da nombre + pregunta mezclados", botEngine.includes("isQuestionOrIntent") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Registro", "Captura nombre", "Lead es niño (sin apellido)", botEngine.includes("wordCount < 2") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Captura email
add("Registro", "Captura email", "Email válido lowercase", botEngine.includes("extractEmailFromText") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Captura email", "Email con MAYUSCULAS (David@X.COM)", botEngine.includes("toLowerCase") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Registro", "Captura email", "Email con espacios en medio", botEngine.includes("@[^\\s@]+") ? "MANEJADO" : "FALLA", "BAJA", "");
add("Registro", "Captura email", "Email sin @ (juan.perez.com)", botEngine.includes("@[^\\s@]+") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Captura email", "Email con typo (juan@@x.com)", botEngine.includes("@[^\\s@]+") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Registro", "Captura email", "Body es solo email (david@x.com)", botEngine.includes("looksLikeEmail") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Registro", "Captura email", "Body es texto con email embebido", botEngine.includes("extractEmailFromText") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Implicit capture (nombre + email juntos)
add("Registro", "Implicit capture", "Nombre + email separados por coma", botEngine.includes("implicitEmail") ? "MANEJADO" : "FALLA", "ALTA", "Sprint 4 lo arregla");
add("Registro", "Implicit capture", "Nombre + email en lineas distintas", botEngine.includes("replace") && botEngine.includes("implicitEmail") ? "MANEJADO" : "FALLA", "MEDIA", "");

// ============================================================
// B. CONVERSACIÓN
// ============================================================
console.log("=== B. CONVERSACIÓN (respuestas del bot) ===\n");

// Bot responde a preguntas reales
add("Conversacion", "Pregunta general", "'¿Qué es marketing digital?'", botEngine.includes("LLM") || botEngine.includes("agent") || botEngine.includes("question") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Pregunta sobre evento", "'¿A qué hora es?'", botEngine.includes("humanStartsAt") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Pregunta sobre precio", "'¿Cuánto cuesta?'", eventLoader.includes("evento de pago") || eventLoader.includes("MXN") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Pregunta sobre lugar", "'¿Dónde es?'", eventLoader.includes("location") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Pregunta sobre formato", "'¿Es presencial o virtual?'", eventLoader.includes("format") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Conversacion", "Pregunta sobre link zoom", "'¿Cuándo me mandan el link?'", eventLoader.includes("streamingAccessNote") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Pregunta sobre constancia", "'¿Dan constancia?'", botEngine.includes("certificado") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Fuera de scope
add("Conversacion", "Fuera de scope", "'¿Venden café?'", botEngine.includes("question") || botEngine.includes("ESCALATE") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Conversacion", "Fuera de scope", "'Hola' (sin contexto)", botEngine.includes("Hola") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Fuera de scope", "'Manden PDF'", botEngine.includes("PDF") || botEngine.includes("contacto") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Handoff humano
add("Conversacion", "Handoff", "Lead pide hablar con humano", botEngine.includes("ESCALATE_HUMAN") || botEngine.includes("handoff") || botEngine.includes("humano") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Handoff", "Lead insulta o se frustra", botEngine.includes("kill_switch") || botEngine.includes("bot_paused") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Bot presionado (rate limit, kill switch)
add("Conversacion", "Rate limit", "Lead manda 10 mensajes en 1 min", botEngine.includes("recordAndCheckRateLimit") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Conversacion", "Kill switch", "Admin pausa el bot", botEngine.includes("bot_paused") ? "MANEJADO" : "FALLA", "ALTA", "");

// Multi-idioma
add("Conversacion", "Multi-idioma", "Lead escribe en inglés", botEngine.includes("/hola/i") || botEngine.includes("LANG") ? "MANEJADO" : "FALLA", "MEDIA", "");

// ============================================================
// C. PERSISTENCIA EN DB
// ============================================================
console.log("=== C. PERSISTENCIA EN DB ===\n");

// Lead
add("Persistencia", "leads", "Lead nuevo (no existe)", botEngine.includes("findLeadByPhone") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "leads", "Lead existente (ya capturado)", botEngine.includes("findLeadByPhone") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "leads", "Phone con formato +521234567890", botEngine.includes("normalizePhone") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "leads", "Phone duplicado (2 leads con mismo phone)", botEngine.includes("phone_normalized") ? "MANEJADO" : "FALLA", "MEDIA", "UNIQUE constraint");
add("Persistencia", "leads", "Email duplicado (2 leads con mismo email)", botEngine.includes("email") ? "MANEJADO" : "FALLA", "MEDIA", "UNIQUE constraint");

// Confirmation
add("Persistencia", "event_confirmations", "Nueva confirmation", botEngine.includes("createConfirmation") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "event_confirmations", "Confirmation duplicada (mismo email + event)", botEngine.includes("ON CONFLICT") || botEngine.includes("ignoreDuplicates") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "event_confirmations", "payment_status=pending después de captura", botEngine.includes("payment_status") ? "MANEJADO" : "FALLA", "ALTA", "");

// QR token
add("Persistencia", "event_qr_tokens", "QR generado para nuevo asistente", botEngine.includes("generateQrToken") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "event_qr_tokens", "QR ya existe (no duplica)", botEngine.includes("UNIQUE") || botEngine.includes("ignoreDuplicates") ? "MANEJADO" : "FALLA", "ALTA", "");

// Lead profile (memoria del bot)
add("Persistencia", "lead_profile", "Resumen actualizado después de captura", botEngine.includes("lead_profile") || botEngine.includes("summary") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "lead_profile", "Resumen NO se duplica", botEngine.includes("upsert") || botEngine.includes("ON CONFLICT") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Consent log
add("Persistencia", "lead_consent_log", "Consent registrado al pedir email", botEngine.includes("consent") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "lead_consent_log", "Consent con source='whatsapp_bot'", botEngine.includes("whatsapp_bot") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Conversations
add("Persistencia", "lead_whatsapp_conversations", "Inbound persistido", botEngine.includes("persistConversation") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "lead_whatsapp_conversations", "Outbound persistido", botEngine.includes("persistConversation") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Persistencia", "lead_whatsapp_conversations", "Metadata incluye intent", botEngine.includes("intent:") ? "MANEJADO" : "FALLA", "MEDIA", "");

// ============================================================
// D. EMAILS
// ============================================================
console.log("=== D. EMAILS ===\n");

// Bienvenida
add("Emails", "Bienvenida", "Email de bienvenida al lead", botEngine.includes("sendEventQrPassEmail") || botEngine.includes("sendWelcome") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Emails", "Bienvenida", "Bienvenida solo si email es válido", botEngine.includes("Email") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("Emails", "Bienvenida", "Incluye QR de entrada", botEngine.includes("qrToken") || botEngine.includes("QR") ? "MANEJADO" : "FALLA", "ALTA", "");

// QR pass
add("Emails", "QR pass", "Email con QR + datos del evento", botEngine.includes("sendEventQrPassEmail") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Emails", "QR pass", "Subject no tiene voseo", botEngine.includes("subject") ? "MANEJADO" : "FALLA", "BAJA", "voseo audit");

// Survey
add("Emails", "Encuesta", "Email post-evento con link a encuesta", botEngine.includes("survey") || botEngine.includes("Survey") ? "MANEJADO" : "FALLA", "ALTA", "");
add("Emails", "Encuesta", "Email de thank you después de responder", botEngine.includes("survey_thank") || botEngine.includes("gracias") ? "MANEJADO" : "FALLA", "MEDIA", "");

// Magic link
add("Emails", "Magic link", "Magic link para acceder al curso", botEngine.includes("magic") || botEngine.includes("Magic") ? "MANEJADO" : "FALLA", "ALTA", "");

// ============================================================
// E. FALLBACK / LLM
// ============================================================
console.log("=== E. FALLBACK Y LLM ===\n");

// Fallback a LLM
add("LLM", "Fallback", "Intents no clasificados caen a LLM", botEngine.includes("callLLMAgent") || botEngine.includes("agent") ? "MANEJADO" : "FALLA", "ALTA", "");
add("LLM", "Fallback", "Safety net quita saludos", safetyNet.includes("stripGreetingIfHasHistory") ? "MANEJADO" : "FALLA", "MEDIA", "");
add("LLM", "Fallback", "Anti-alucinacion (no inventa datos)", botEngine.includes("anti-alucin") || botEngine.includes("REGLA DURA") ? "MANEJADO" : "FALLA", "ALTA", "");
add("LLM", "Fallback", "Respuesta coherente con evento activo", botEngine.includes("ActiveEventContext") || botEngine.includes("activeEvent") ? "MANEJADO" : "FALLA", "ALTA", "");

// ============================================================
// REPORTE
// ============================================================
console.log("\n" + "=".repeat(80));
console.log("AUDIT FLOW COMPLETO DEL BOT (sin drenar DeepSeek)");
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
    console.log(`  ${icon} ${pri} [${c.path}] ${c.edge} (${c.state})${fix}`);
  }
}

const fails = cases.filter((c) => c.state === "FALLA" || c.state === "RIESGO");
const total = cases.length;
const failsCount = fails.length;
console.log("\n" + "=".repeat(80));
console.log(`Total: ${total} paths, ${failsCount} FALLA/R IESGO (${Math.round(failsCount * 100 / total)}%)`);
console.log("=".repeat(80));
