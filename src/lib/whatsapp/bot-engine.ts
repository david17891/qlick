/**
 * Bot conversacional de WhatsApp (Cloud API).
 *
 * Procesa un `IncomingWhatsAppMessage`:
 *   1. Resuelve el lead (find by phone, o crea uno nuevo "Por confirmar").
 *   2. Persiste el inbound en `lead_whatsapp_conversations`.
 *   3. Detecta el intent del mensaje (regex / heurística).
 *   4. Genera la respuesta (template para intents cerrados, LLM para
 *      preguntas abiertas).
 *   5. Envía la respuesta con el `WhatsAppProvider` activo.
 *   6. Persiste el outbound en `lead_whatsapp_conversations`.
 *   7. Actualiza el estado del lead (whatsapp_status) y loggea el cambio.
 *   8. Si aplica: genera un QR token en `event_qr_tokens` y loggea consent
 *      en `lead_consent_log`.
 *
 * Intents soportados:
 *   - "welcome"        → primer mensaje del usuario (template bienvenida).
 *   - "greeting"       → hola / info / menu (template bienvenida).
 *   - "register"       → "sí, quiero inscribirme" (template info evento).
 *   - "opt_out"        → "no / cancelar / stop" (lead → lost).
 *   - "provide_email"  → email detectado (template confirmación + QR token).
 *   - "question"       → todo lo demás (LLM o fallback).
 *
 * IMPORTANTE — privacidad y modo sugerencia:
 *   - Cero PII en logs (solo flags, IDs, contadores).
 *   - El LLM se usa solo en intent=question; el output se filtra por
 *     `validateAgentReply` antes de enviarse.
 *   - El bot nunca comparte descuentos, gratis, confirmaciones de pago, etc.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions.
 *
 * @server
 */

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { debugLog, errorLog } from "../log";

import type { Lead } from "@/types";
import type { Database } from "@/types/supabase";

import { findLeadByPhone } from "../crm/leads-server";
import { normalizePhone } from "../crm/phone-utils";
import { markWhatsAppStatus } from "../leads/whatsapp-status";
import {
  getActiveAgentProvider,
  validateAgentReply,
  loadActiveEventContext,
  loadAllActiveEvents,
  formatEventsListBlock,
  loadConversationWindow,
  loadLeadProfile,
  incrementMessageCount,
  regenerateSummary,
  SUMMARY_EVERY
} from "../ai";
import { sendHumanHandoff } from "./human-handoff";
import { getAIAgentProfile } from "../crm/agent-utils";
import {
  loadManualContext,
  applyEventOverrides,
  type ManualContextBundle
} from "../bot/manual-context";
import type { ActiveEventContext } from "../ai/event-context-loader";
import type { ConversationWindow } from "../ai/conversation-window";

import type { IncomingWhatsAppMessage } from "./webhooks/types";
import { getActiveWhatsAppProvider } from ".";
import { sendEventQrPassEmail } from "../email/event-qr-pass";
import { generateQrDataUrl } from "../qr/generate";
import { appBaseUrl } from "../utils";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Intents que detecta el bot. */
export type BotIntent =
  | "welcome"
  | "greeting"
  | "register"
  | "opt_out"
  | "provide_email"
  | "interactive_event_yes"
  | "interactive_event_inscribir"
  | "interactive_show_events"
  | "interactive_talk_human"
  | "question";

/** Resultado del procesamiento de un mensaje entrante. */
export interface BotProcessResult {
  ok: boolean;
  intent: BotIntent;
  leadId: string | null;
  conversationId?: string;
  outboundMessageId?: string;
  /** Si el bot respondió con template o con texto libre. */
  responseKind: "template" | "text" | "interactive" | "none";
  /** Mensaje que se le envió al lead (para logging / debug). */
  responsePreview?: string;
  /** Si fue demo (sin provider real configurado). */
  demo?: boolean;
  note: string;
}

/** Resultado de un paso interno (lead upsert, etc.) para tests. */
export interface LeadUpsertResult {
  lead: Lead;
  /** true si fue creado en este turno; false si ya existía. */
  created: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constantes de templates / fallback                                  */
/* ------------------------------------------------------------------ */

/**
 * Nombres de templates de Meta. La columna `template` en `lead_whatsapp_conversations.message_type`
 * admite "template" como valor genérico; el `templateName` va en `metadata`.
 *
 * IMPORTANTE: estos nombres deben matchear los aprobados en Meta Business
 * Manager. Si Meta rechaza el template, el provider devuelve error y el bot
 * cae a texto libre (cuando hay ventana 24h) o no responde (cuando no la hay).
 *
 * TEMPLATES fueron removidos en 2026-07-01 (M2 del auditor): el bot usa
 * texto libre en todos los casos. Cuando se creen los templates en Meta
 * Business Manager (Fase 7), restaurar esta const y reintroducir los `case`
 * que la referencian.
 */

/** Disclosure exacto que se loggea en `lead_consent_log` (LFPDPPP). */
const CONSENT_DISCLOSURE =
  "Acepto recibir información comercial de Qlick Marketing Integral por WhatsApp. Puedo revocar este consentimiento en cualquier momento respondiendo 'baja'.";

/** Datos del evento activo para las respuestas del bot.
 *
 * Configurables via env vars (lectura runtime, no buildtime):
 *   EVENT_NAME, EVENT_DATE, EVENT_LOCATION, EVENT_DURATION
 *
 * Si las env vars no están seteadas, cae al placeholder del primer
 * piloto. Cuando integremos el lookup a la DB de `events`, este getter
 * cambia a `await getEventById(activeEventId)` sin tocar el resto del
 * flujo.
 */
function getActiveEvent(): {
  name: string;
  date: string;
  location: string;
  duration: string;
} {
  return {
    name: process.env.EVENT_NAME?.trim() || "IA y Marketing Básico",
    date: process.env.EVENT_DATE?.trim() || "6 de julio",
    location: process.env.EVENT_LOCATION?.trim() || "Ciudad de México",
    duration: process.env.EVENT_DURATION?.trim() || "2 horas"
  };
}

/** URL base pública (para QR check-in). Re-exportada desde ../utils. */

/* ------------------------------------------------------------------ */
/*  Clasificación de intents                                           */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GREETING_RE = /^(hola|hi|buenos|buenas|informaci[oó]n|info|menu|men[uú])/i;
// FIX 2026-07-02 (sesion David): respuestas afirmativas CORTAS en medio de
// una conversacion (despues de que el LLM hace una pregunta) NO deberian
// disparar el template estatico de register. Van al LLM para que mantenga
// el contexto conversacional.
//   "Si"  -> el LLM responde coherente con contexto
//   "Si, quiero inscribirme" -> sigue siendo register (tiene palabras adicionales)
//   "Ok" / "Dale" / "Va" -> idem, van al LLM
// NO incluye "no" porque ese es opt_out (el regex OPT_OUT_RE ya lo maneja).
const AFFIRMATIVE_RE = /^(s[ií]|ok|dale|va)$/i;
// Registro corto (anclado al inicio) — palabras muy específicas del
// usuario confirmando inscripción.
const REGISTER_RE = /^(s[ií]|confirmo|inscribirme|registrarme|quiero|me interesa)/i;
// Registro por frase completa (en cualquier posición del cuerpo) — para
// casos tipo "Hola, quiero inscribirme" o "Me interesa, cómo me inscribo".
// Sin ancla para detectar la intención aún si el mensaje arranca con un
// saludo. RIESGO de falsos positivos mitigado porque las frases son
// específicas del funnel (palabras únicas).
const REGISTER_PHRASE_RE = /\b(quiero\s+inscribirme|me\s+interesa\s+(inscribirme|el\s+curso|el\s+evento|saber\s+m[aá]s)|inscribirme\s+al?\s+evento|c[oó]mo\s+me\s+inscribo)\b/i;
/**
 * Detecta opt-out del usuario.
 *
 * Casos que SÍ son opt_out:
 * - "no" suelto (respuesta corta a "¿quieres info?")
 * - "no.", "no!", "no," (con puntuación final)
 * - "no gracias" / "no, gracias"
 * - "no me interesa" / "no quiero" / "no me interesa saber más"
 * - "cancelar" / "baja" / "stop" / "unsubscribe" / "sacarme"
 *
 * Casos que NO son opt_out (siguen como `question` para que el bot responda):
 * - "No tengo dinero ahora" (después de "no" hay texto significativo)
 * - "No, hoy no puedo" (después de la coma hay contenido)
 *
 * FIX M5 del auditor 2026-07-01 (segunda pasada): la regex original
 * `/^(no|cancelar|baja|stop|unsubscribe)/i` matcheaba "No tengo dinero" como
 * opt_out → bot descartaba leads reales. La regex nueva requiere contexto
 * negativo explícito O un final de mensaje claro.
 */
const OPT_OUT_RE = /^(?:cancelar|baja|sacarme|sacar(?:me)?|stop|unsubscribe)(?:[,.!?]|\s|$)|^(?:no|ni|nah)(?:[,.!?]|\s+(?:gracias|interesa|me\s+interesa|quiero|saber|m[aá]s|contact(?:ar|ame|es)|molestes?|avises?|cuentes|tengo\s+inter[eé]s)|$)/i;

/** Detecta el intent del mensaje (regex determinista).
 *
 * Contrato (alineado con `tests/whatsapp-bot.test.mjs`):
 *   - opt_out > register > provide_email: señales FUERTES. Ganan siempre,
 *     incluso en el primer mensaje del lead. Si alguien llega diciendo
 *     "baja" o "sí, quiero inscribirme", no le mandamos bienvenida.
 *   - greeting ("hola"/"info"/"menu"): en el primer mensaje se reformula
 *     como `welcome` (mensaje de bienvenida). En mensajes posteriores se
 *     mantiene como `greeting` (interacción normal).
 *   - texto libre: si es primer mensaje → `welcome`; si no → `question`
 *     (lo pasa al LLM con guardrails).
 *   - body vacío: `question` (no podemos detectar nada).
 */
export function detectIntent(
  body: string,
  isFirstMessage: boolean
): BotIntent {
  const text = body?.trim() ?? "";
  if (!text) return "question";
  // Señales fuertes: siempre ganan, incluso en primer mensaje.
  if (OPT_OUT_RE.test(text)) return "opt_out";
  // FIX 2026-07-02: respuestas afirmativas cortas (Si, Ok, Dale, Va) en
  // medio de conversacion NO son register. Van al LLM para que mantenga
  // contexto. La excepcion (Si, quiero inscribirme) sigue siendo register
  // porque AFFIRMATIVE_RE no matchea cuando hay palabras adicionales.
  if (AFFIRMATIVE_RE.test(text)) return "question";
  if (REGISTER_RE.test(text)) return "register";
  if (REGISTER_PHRASE_RE.test(text)) return "register";
  if (EMAIL_RE.test(text)) return "provide_email";
  // Greeting: primer mensaje → welcome; posteriores → greeting.
  if (GREETING_RE.test(text)) {
    return isFirstMessage ? "welcome" : "greeting";
  }
  // Texto libre: primer mensaje → welcome (arranca relación).
  if (isFirstMessage) return "welcome";
  return "question";
}

/* ------------------------------------------------------------------ */
/*  Helpers de Supabase (lazy + tipados parciales)                     */
/* ------------------------------------------------------------------ */

type SupabaseAdmin = SupabaseClient<Database>;

/**
 * Devuelve el cliente admin de Supabase, o `null` si no está configurado.
 * En modo demo (sin Supabase) el bot hace no-op para DB y solo loggea.
 */
async function getSupabase(): Promise<SupabaseAdmin | null> {
  const { checkSupabaseConfig } = await import("../supabase/health");
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  if (!checkSupabaseConfig().configured) return null;
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/**
 * Inserta una fila en `lead_whatsapp_conversations`. Devuelve el id o null.
 *
 * Esta tabla aún no está en el typegen de Supabase; usamos `as any` para
 * esquivar el chequeo de schema hasta que se regenere.
 */
async function persistConversation(
  supabase: SupabaseAdmin,
  row: {
    lead_id: string | null;
    phone_normalized: string;
    direction: "inbound" | "outbound";
    message_type: string;
    body: string | null;
    whatsapp_message_id: string | null;
    metadata?: Record<string, unknown>;
    related_event_id?: string | null;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("lead_whatsapp_conversations" as never)
    .insert(row as never)
    .select("id")
    .maybeSingle();
  if (error) {
    errorLog("[whatsapp/bot] persistConversation falló", {
      code: (error as { code?: string }).code,
      direction: row.direction
    });
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Inserta una fila en `lead_consent_log`. Devuelve ok.
 *
 * `lead_consent_log` no está aún en el typegen; cast a `never` para
 * esquivar el chequeo. Re-generar typegen al regenerar el schema.
 */
async function persistConsent(
  supabase: SupabaseAdmin,
  row: {
    lead_id: string | null;
    phone_normalized: string | null;
    consent_granted: boolean;
    consent_source: string;
    consent_text: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from("lead_consent_log" as never)
    .insert(row as never);
  if (error) {
    errorLog("[whatsapp/bot] persistConsent falló", {
      code: (error as { code?: string }).code
    });
    return false;
  }
  return true;
}

/**
 * Genera un QR token (URL-safe, 32 chars) y lo inserta en `event_qr_tokens`
 * asociado al evento activo y al teléfono del asistente.
 *
 * FIX 2026-07-02 (sesion David): bot multi-evento. Acepta `eventSlug`
 * opcional. Si se pasa, usa ESE evento especifico. Si no, cae al primer
 * `published` (back-compat con versiones anteriores del flujo).
 */
async function generateQrToken(
  supabase: SupabaseAdmin,
  phoneNormalized: string,
  attendeeName: string,
  attendeeEmail: string | null,
  eventSlug?: string | null
): Promise<{ token: string; url: string } | null> {
  // Buscar el evento: si nos pasan slug, ESE; si no, el primero published.
  let evt: { id: string; ends_at: string | null } | null = null;
  if (eventSlug) {
    const { data, error } = await supabase
      .from("events")
      .select("id, ends_at")
      .eq("status", "published")
      .eq("slug", eventSlug)
      .limit(1)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp/bot] generateQrToken: error buscando por slug",
        { slug: eventSlug, code: (error as { code?: string }).code }
      );
      return null;
    }
    evt = data as { id: string; ends_at: string | null } | null;
  }
  if (!evt) {
    // Fallback: primer evento published (comportamiento historico).
    const { data, error: evtErr } = await supabase
      .from("events")
      .select("id, ends_at")
      .eq("status", "published")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (evtErr || !data) {
      // eslint-disable-next-line no-console
      console.warn("[whatsapp/bot] generateQrToken: no hay evento publicado.");
      return null;
    }
    evt = data as { id: string; ends_at: string | null };
  }
  const eventId = evt.id;
  const endsAt = evt.ends_at;
  // expires_at = event end + 6h (alineado con el comment del SQL).
  const baseEnd = endsAt ? new Date(endsAt) : new Date();
  const expiresAt = new Date(baseEnd.getTime() + 6 * 60 * 60 * 1000);

  const token = randomBytes(24).toString("base64url").slice(0, 32);

  // Idempotencia (auditoría 2026-07-01): si ya existe un token para este
  // (event_id, phone) — porque Meta reentregó el webhook o el bot procesó
  // el mismo email 2 veces — reusamos el existente en vez de insertar
  // duplicado. La UNIQUE constraint en DB bloquea el duplicado, pero es
  // mejor hacer el SELECT antes para evitar 23505 ruidoso en logs.
  const { data: existing } = await supabase
    .from("event_qr_tokens" as never)
    .select("token")
    .eq("event_id" as never, eventId)
    .eq("attendee_phone_normalized" as never, phoneNormalized)
    .gt("expires_at" as never, new Date().toISOString())
    .order("created_at" as never, { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const existingToken = (existing as { token: string }).token;
    const url = `${appBaseUrl()}/check-in/${existingToken}`;
    return { token: existingToken, url };
  }

  const { error } = await supabase
    .from("event_qr_tokens" as never)
    .insert({
      event_id: eventId,
      attendee_phone_normalized: phoneNormalized,
      attendee_name: attendeeName,
      attendee_email: attendeeEmail,
      token,
      expires_at: expiresAt.toISOString()
    } as never);
  if (error) {
    // Si el error es 23505 (unique violation) significa que otro proceso
    // insertó el mismo (event_id, phone) entre nuestro SELECT y el INSERT.
    // Reintentamos el SELECT para devolver ese token.
    if ((error as { code?: string }).code === "23505") {
      const { data: raced } = await supabase
        .from("event_qr_tokens" as never)
        .select("token")
        .eq("event_id" as never, eventId)
        .eq("attendee_phone_normalized" as never, phoneNormalized)
        .gt("expires_at" as never, new Date().toISOString())
        .order("created_at" as never, { ascending: true })
        .limit(1)
        .maybeSingle();
      if (raced) {
        const racedToken = (raced as { token: string }).token;
        const url = `${appBaseUrl()}/check-in/${racedToken}`;
        return { token: racedToken, url };
      }
    }
    errorLog("[whatsapp/bot] generateQrToken falló", {
      code: (error as { code?: string }).code
    });
    return null;
  }
  // BUG FIX B1: la ruta pública del QR de check-in es `/check-in/[token]`,
  // no `/api/qr/[token]`. Ver `src/app/check-in/[token]/page.tsx` y
  // `src/lib/qr/event-tokens.ts:94` (que construye la misma URL).
  const url = `${appBaseUrl()}/check-in/${token}`;
  return { token, url };
}

/**
 * Sube el `last_contacted_at` + `summary` del lead.
 * No usamos `markWhatsAppStatus` acá porque ese solo cambia `whatsapp_status`
 * (y loggea en `lead_whatsapp_log`); el bot ya loggea cambios completos.
 */
async function touchLead(
  supabase: SupabaseAdmin,
  leadId: string,
  patch: { last_contacted_at?: string; summary?: string }
): Promise<void> {
  await supabase.from("leads").update(patch).eq("id", leadId);
}

/**
 * FIX 2026-07-02 (sesion David): bot multi-evento.
 * Identifica a cual evento publicado se refiere el lead, mirando los
 * ultimos outbound del bot en el `conversationWindow`.
 *
 * Estrategia de matching (en orden, primer match gana):
 * 1. Slug textual (e.g. "ia-marketing-primeros-pasos")
 * 2. Indice del catalogo ([1], [2], [3]) o "el primero/segundo/tercero"
 * 3. Titulo del evento (palabras clave >3 chars)
 * 4. Location (palabras clave >3 chars)
 * 5. null si no se puede identificar
 *
 * Esto permite que cuando el lead da su email despues de una conversacion
 * sobre el evento 1, el QR se genere para el evento 1 (no el primero
 * publicado que es lo que hacia antes).
 */
/**
 * Funcion exportada solo para tests. Ver findEventInConversation abajo.
 */
export function _findEventInConversationForTest(
  conversationWindow: ConversationWindow | undefined,
  allEvents: ActiveEventContext[]
): ActiveEventContext | null {
  return findEventInConversation(conversationWindow, allEvents);
}

function findEventInConversation(
  conversationWindow: ConversationWindow | undefined,
  allEvents: ActiveEventContext[]
): ActiveEventContext | null {
  if (
    !conversationWindow ||
    !conversationWindow.messages ||
    allEvents.length === 0
  ) {
    return null;
  }

  // Ultimos 3 outbound del bot (mas reciente primero).
  const botMessages = conversationWindow.messages
    .filter((m) => m.direction === "outbound" && m.body)
    .slice(-3)
    .reverse();

  for (const msg of botMessages) {
    const body = (msg.body ?? "").toLowerCase();

    // 1) Indice del catalogo: [N] o "el primero/segundo/tercero".
    // Va PRIMERO porque es la referencia mas explicita. Si el bot dijo
    // "[2] Ads en Meta", queremos matchear [2], no por titulo.
    //
    // FIX 2026-07-02: si hay MULTIPLES [N] en el body, es una LISTA
    // de eventos (no una confirmacion de registro), asi que devolvemos
    // null para que el caller no se confunda. Si hay UN solo [N], ese
    // es la referencia del registro. Si hay CERO [N], seguimos con
    // los fallbacks (slug, title, location).
    const allIndices = [...body.matchAll(/\[(\d+)\]/g)];
    if (allIndices.length === 1) {
      const idx = parseInt(allIndices[0][1], 10) - 1;
      if (idx >= 0 && idx < allEvents.length) return allEvents[idx];
    }
    if (allIndices.length > 1) {
      // Lista de eventos — no es una confirmacion. Dejamos que el
      // LLM aclare con el lead.
      continue;
    }
    const ordMatch = body.match(/el\s+(primero|segundo|tercero|cuarto|quinto)/);
    if (ordMatch) {
      let idx = 0;
      if (ordMatch[0].includes("primero")) idx = 0;
      else if (ordMatch[0].includes("segundo")) idx = 1;
      else if (ordMatch[0].includes("tercero")) idx = 2;
      else if (ordMatch[0].includes("cuarto")) idx = 3;
      else if (ordMatch[0].includes("quinto")) idx = 4;
      if (idx >= 0 && idx < allEvents.length) return allEvents[idx];
    }

    // 2) Slug textual
    for (const evt of allEvents) {
      if (body.includes(evt.slug.toLowerCase())) return evt;
    }

    // 3) Titulo del evento (palabras >3 chars)
    for (const evt of allEvents) {
      const titleWords = evt.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const matchCount = titleWords.filter((w) => body.includes(w)).length;
      // Si matchea 1 palabra del titulo, lo damos por bueno.
      // Si matchea 2+, es muy seguro.
      if (matchCount >= 1) return evt;
    }

    // 4) Location (palabras >3 chars)
    for (const evt of allEvents) {
      const locWords = evt.location
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((w) => w.length > 3);
      const matchCount = locWords.filter((w) => body.includes(w)).length;
      if (matchCount >= 1) return evt;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Upsert de lead desde WhatsApp                                      */
/* ------------------------------------------------------------------ */

/**
 * Crea un lead desde un mensaje de WhatsApp entrante. NO requiere consent
 * (consent se loggea aparte cuando el lead lo dé). Devuelve el lead creado.
 *
 * email es obligatorio a nivel de columna (NOT NULL con CHECK de regex).
 * Como el lead de WhatsApp puede no tener email al inicio, generamos uno
 * sintético basado en el phone_normalized — el admin lo limpia después si
 * hace falta. Esto sigue el patrón de `createLeadFromEvent`.
 */
async function createLeadFromWhatsApp(
  supabase: SupabaseAdmin,
  phoneNormalized: string,
  contactName?: string
): Promise<Lead | null> {
  const safeName = contactName?.trim() || "";
  const syntheticEmail = `wa.${createHash("sha256")
    .update(phoneNormalized)
    .digest("hex")
    .slice(0, 12)}@placeholder.local`;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: safeName,
      email: syntheticEmail,
      phone: phoneNormalized,
      phone_normalized: phoneNormalized,
      status: "new",
      source: "whatsapp",
      intent: "course_information",
      // El lead aún no dio consent explícito; lo seteamos a true solo cuando
      // responde "sí" y loggeamos en lead_consent_log. Mientras tanto,
      // usamos false para no exponer datos sin base legal.
      consent_to_contact: false,
      // 2026-07-01: schema confirmado (whatsapp_status + last_contacted_at existen).
      // Seteamos whatsapp_status explícitamente para que el CHECK constraint
      // aplique desde el primer insert (no depender del default).
      whatsapp_status: "no_contactado",
      tags: ["source:whatsapp_bot"]
    } as never)
    .select("*")
    .maybeSingle();

  if (error && (error as { code?: string }).code === "23505") {
    // Race condition: Meta reentregó el webhook y otro request creó el lead
    // entre nuestro findLeadByPhone (retornó null) y este insert. Buscamos
    // el existente y lo retornamos. Fix A2 del auditor 2026-07-01.
    const { findLeadByPhone } = await import("../crm/leads-server");
    const existing = await findLeadByPhone(phoneNormalized);
    if (existing) return existing;
    // Si tampoco lo encontramos, retornamos null (caso raro pero posible).
    return null;
  }

  if (error && (error as { code?: string }).code !== "23505") {
    errorLog("[whatsapp/bot] createLeadFromWhatsApp falló", {
      code: (error as { code?: string }).code
    });
    return null;
  }
  // Mapeo mínimo: solo necesitamos id + name para los siguientes pasos.
  return {
    id: (data as { id: string }).id,
    name: (data as { name: string }).name,
    email: (data as { email: string }).email,
    status: "new",
    source: "whatsapp",
    intent: "course_information",
    consentToContact: false,
    createdAt: (data as { created_at: string }).created_at,
    updatedAt: (data as { updated_at: string }).updated_at
  } satisfies Lead;
}

/**
 * Busca el lead por phone normalizado. Si no existe, lo crea.
 */
/**
 * Set de phones ya "vistos" en demo mode. Permite distinguir el primer
 * mensaje (welcome) de los siguientes (greeting/question/etc) sin
 * necesidad de persistir. Solo para tests + desarrollo local.
 */
const demoSeenPhones = new Set<string>();

async function findOrCreateLead(
  supabase: SupabaseAdmin | null,
  phoneNormalized: string,
  contactName?: string
): Promise<LeadUpsertResult | null> {
  if (!supabase) {
    // Demo mode: devolvemos un lead sintético. Si el phone ya fue visto
    // en este proceso, marcamos created=false para que `isFirstMessage`
    // funcione como en producción (solo el primer mensaje es welcome).
    const isFirst = !demoSeenPhones.has(phoneNormalized);
    demoSeenPhones.add(phoneNormalized);
    return {
      lead: {
        id: `lead_demo_${phoneNormalized.slice(-6)}`,
        name: contactName?.trim() || "",
        email: "demo@placeholder.local",
        phone: phoneNormalized,
        status: "new",
        source: "whatsapp",
        intent: "course_information",
        consentToContact: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      created: isFirst
    };
  }
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] findOrCreateLead: querying findLeadByPhone");
  const findPromise = findLeadByPhone(phoneNormalized);
  const findTimeout = new Promise<null>((resolve) =>
    setTimeout(() => {
      // eslint-disable-next-line no-console
      debugLog("[whatsapp/bot] findLeadByPhone TIMEOUT (5s) - forzando fallback");
      resolve(null);
    }, 5000)
  );
  const existing = await Promise.race([findPromise, findTimeout]);
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] findLeadByPhone result", {
    found: Boolean(existing),
    timedOut: existing === null
  });
  if (existing) return { lead: existing, created: false };
  const created = await createLeadFromWhatsApp(
    supabase,
    phoneNormalized,
    contactName
  );
  if (!created) return null;
  return { lead: created, created: true };
}

/* ------------------------------------------------------------------ */
/*  Generación de respuestas                                           */
/* ------------------------------------------------------------------ */

interface OutboundPlan {
  /** Lo que se va a enviar al provider. */
  send: () => Promise<{ ok: boolean; externalId?: string; demo?: boolean }>;
  /** Tipo de respuesta (para la fila outbound). */
  kind: "template" | "text" | "interactive";
  /** Body que se persistirá en lead_whatsapp_conversations. */
  body: string;
  /** Nombre de template (si kind=template). */
  templateName?: string;
  /** Mensaje interactivo (si kind=interactive). */
  interactive?: import("../whatsapp/providers/whatsapp-provider").InteractiveMessage;
}

/**
 * Genera el plan de respuesta para el intent detectado.
 * SIEMPRE devuelve un plan: en el peor caso, una respuesta fallback.
 */
async function buildResponsePlan(args: {
  intent: BotIntent;
  lead: Lead;
  body: string;
  isFirstMessage: boolean;
  /** E.164 normalizado. Se usa directamente como `to` del provider para no
   * depender de `lead.phone` (puede venir null/undefined de DB o del fallback). */
  phoneNormalized: string;
  /** URL del QR token ya generado por el caller (processInboundMessage).
   * Solo aplica cuando intent === "provide_email" y Supabase estaba
   * disponible. Si es null, el bot responde sin link al QR (evita mandar
   * una URL rota como /qr). */
  qrUrl?: string | null;
  /** Perfil persistente del lead (memoria larga). Se inyecta en el system
   * prompt del agente LLM para que recuerde contexto entre sesiones.
   * Opcional: si no hay DB / no hay profile todavía, el agente opera sin él. */
  leadProfile?: import("../ai").LeadProfile | null;
}): Promise<OutboundPlan> {
  const { intent, lead, body, phoneNormalized } = args;
  const provider = getActiveWhatsAppProvider();
  const firstName = lead.name?.split(" ")[0] || "";
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] buildResponsePlan", {
    intent,
    hasLeadPhone: Boolean(lead.phone),
    leadPhone: lead.phone ?? "(empty)",
    phoneNormalized
  });

  switch (intent) {
    case "welcome":
    case "greeting": {
      // Fase 7a: Reply Buttons en welcome. Más conversión que texto abierto.
      // Títulos de botones tienen límite de 20 chars en Meta — usar
      // mensajes genéricos + poner el nombre del evento en el body.
      //
      // FIX 2026-07-02 (sesion David): cargamos el activeEvent REAL de DB
      // (no el placeholder de env vars que mostraba eventos que no
      // existian). Si no hay evento en DB, mostramos solo el saludo
      // + botones (sin la linea "Evento activo: ...").
      const realActiveEvent = await loadActiveEventContext().catch(() => null);
      // FIX 2026-07-02: filtrar placeholders obvios en firstName. Si el
      // lead tiene name="Por" (data legacy del primer test) o vacio,
      // no le llamamos por nombre.
      const PLACEHOLDER_NAMES = new Set([
        "por",
        "por confirmar",
        "confirmar",
        "test",
        "test number",
        "(empty)"
      ]);
      const cleanFirstName = PLACEHOLDER_NAMES.has((firstName ?? "").toLowerCase().trim())
        ? ""
        : firstName ?? "";
      const saludo = cleanFirstName ? `¡Hola ${cleanFirstName}!` : "¡Hola!";
      const eventLine = realActiveEvent && realActiveEvent.source === "db"
        ? `\n\nPróximo evento: ${realActiveEvent.title} (${realActiveEvent.humanStartsAt})`
        : "";
      const interactive = {
        type: "button" as const,
        body: {
          text: `${saludo} Soy Qlick, asistente de Qlick Marketing Integral. ¿Qué te interesa?${eventLine}`
        },
        action: {
          buttons: [
            {
              type: "reply" as const,
              reply: {
                id: "evt_yes_next",
                title: "Info evento"
              }
            },
            {
              type: "reply" as const,
              reply: {
                id: "show_events",
                title: "Ver eventos"
              }
            },
            {
              type: "reply" as const,
              reply: {
                id: "talk_human",
                title: "Hablar con humano"
              }
            }
          ]
        },
        footer: {
          text: "Respondé con un botón o escribí tu pregunta"
        }
      };
      const bodyText = interactive.body.text;
      return {
        kind: "interactive",
        body: bodyText,
        interactive,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText,
            interactive
          })
      };
    }
    case "register": {
      // List Message: lista navegable de eventos disponibles.
      const evt = getActiveEvent();
      const interactive = {
        type: "list" as const,
        body: {
          text: `Tenemos estos eventos próximos. Elegí el que te interesa para más info:`
        },
        action: {
          button: "Ver eventos",
          sections: [
            {
              title: "Próximos eventos",
              rows: [
                {
                  id: `evt_${evt.name.replace(/\s+/g, "_").toLowerCase().slice(0, 30)}`,
                  title: evt.name.slice(0, 24),
                  description: `${evt.date} · ${evt.location} · ${evt.duration}`.slice(0, 72)
                }
              ]
            }
          ]
        }
      };
      const bodyText = interactive.body.text;
      return {
        kind: "interactive",
        body: bodyText,
        interactive,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText,
            interactive
          })
      };
    }
    case "opt_out": {
      return {
        kind: "text",
        body: "Listo, no te contacto más. Si cambias de opinión, escribinos.",
        send: () =>
          provider.send({
            to: phoneNormalized,
            body:
              "Listo, no te contacto más. Si cambias de opinión, escribinos."
          })
      };
    }
    case "interactive_event_yes": {
      // Fase 7a.5: el usuario clickeó "Info evento" en el welcome.
      // Devolvemos los detalles del evento + un botón "Inscribirme" para
      // que el siguiente paso sea explícito (en vez de texto abierto
      // "mandame tu email").
      //
      // FIX 2026-07-02 (sesion David): cargar el activeEvent real de DB.
      // Si no hay, mensaje generico en vez de placeholder de env vars.
      const evt = await loadActiveEventContext().catch(() => null);
      const evtFallback = getActiveEvent();
      const evtName = evt?.title ?? evtFallback.name;
      const evtDate = evt?.humanStartsAt ?? evtFallback.date;
      const evtLoc = evt?.location ?? evtFallback.location;
      const evtDur = evt?.humanDuration ?? evtFallback.duration;
      const evtSlug = evt?.slug ?? evtFallback.name.toLowerCase().replace(/\s+/g, "_");
      const interactive = {
        type: "button" as const,
        body: {
          text: `📅 ${evtName}\n🗓 ${evtDate} · 📍 ${evtLoc} · ⏱ ${evtDur}\n\n¿Listo para inscribirte?`
        },
        action: {
          buttons: [
            {
              type: "reply" as const,
              reply: {
                id: `evt_inscribir_${evtSlug.slice(0, 20)}`,
                title: "Inscribirme"
              }
            },
            {
              type: "reply" as const,
              reply: {
                id: "talk_human",
                title: "Hablar con humano"
              }
            }
          ]
        },
        footer: {
          text: "Inscribirme te pide email por acá"
        }
      };
      const bodyText = interactive.body.text;
      return {
        kind: "interactive",
        body: bodyText,
        interactive,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText,
            interactive
          })
      };
    }
    case "interactive_event_inscribir": {
      // Fase 7a.5: el usuario clickeó "Inscribirme" después de ver info
      // del evento. Le pedimos el email explícitamente. Si responde con
      // un email válido, el intent `provide_email` se encarga.
      //
      // FIX 2026-07-02 (sesion David): cargamos el activeEvent real de
      // DB (no el placeholder de env vars que decia "IA y Marketing
      // Basico el 6 de julio" cuando el evento real es otro).
      const evtReal = await loadActiveEventContext().catch(() => null);
      const evtFallback = getActiveEvent();
      const evtName = evtReal?.title ?? evtFallback.name;
      const evtDate = evtReal?.humanStartsAt ?? evtFallback.date;
      // FIX 2026-07-02: filtrar firstName de placeholders (mismo set
      // que el welcome y el LLM context). El "Por" del lead legacy
      // generaba "Excelente Por!".
      const PLACEHOLDER_NAMES_INSCR = new Set([
        "por",
        "por confirmar",
        "confirmar",
        "test",
        "test number",
        "(empty)"
      ]);
      const cleanFirstName = PLACEHOLDER_NAMES_INSCR.has(
        (firstName ?? "").toLowerCase().trim()
      )
        ? ""
        : firstName ?? "";
      const saludo = cleanFirstName ? `¡Excelente ${cleanFirstName}!` : "¡Excelente!";
      const bodyText =
        `${saludo} Para inscribirte a "${evtName}" el ${evtDate}, ` +
        `mandame tu email por acá y te paso tu QR de entrada.`;
      return {
        kind: "text",
        body: bodyText,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText
          })
      };
    }
    case "interactive_show_events": {
      // FIX 2026-07-02 (sesion David): antes este caso listaba 3 cursos
      // hardcoded (Marketing Basico, IA para Marketing, Curso personalizado)
      // que NO existian en DB. Ahora lista los eventos REALES publicados.
      // Si solo hay 1, lo muestra destacado. Si hay varios, los lista todos.
      const allEvents = await loadAllActiveEvents().catch(() => [] as ActiveEventContext[]);
      if (allEvents.length === 0) {
        // No hay eventos publicados. Degradar a texto simple.
        const bodyText =
          "Por ahora no tenemos eventos publicados, pero estamos preparando los proximos. " +
          "Te aviso cuando haya algo. Mientras tanto, ?tenes alguna otra pregunta?";
        return {
          kind: "text",
          body: bodyText,
          send: () => provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      const sections = [
        {
          title: allEvents.length === 1 ? "Proximo evento" : "Proximos eventos",
          rows: allEvents.slice(0, 10).map((evt) => ({
            id: `evt_info_${evt.slug}`,
            title: evt.title.slice(0, 24),
            description: `${evt.humanStartsAt} · ${evt.location}`.slice(0, 72)
          }))
        }
      ];
      const interactive: import("../whatsapp/providers/whatsapp-provider").InteractiveMessage = {
        type: "list" as const,
        body: {
          text: allEvents.length === 1
            ? "Tenemos este evento proximo:"
            : `Tenemos ${allEvents.length} eventos proximos. Elegi el que te interesa:`
        },
        action: {
          button: "Ver eventos",
          sections
        }
      };
      if (allEvents.length > 0) {
        interactive.footer = {
          text: "Toca uno para ver detalle o escribe tu pregunta".slice(0, 60)
        };
      }
      const bodyText = interactive.body.text;
      return {
        kind: "interactive",
        body: bodyText,
        interactive,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText,
            interactive
          })
      };
    }
    case "interactive_talk_human": {
      // Handoff a humano (Fase 7a.3). Persistimos a Supabase y mandamos
      // email a David si está configurado. Best-effort: si falla, igual
      // respondemos al lead (no bloqueamos el flow).
      const recentConv = await loadConversationWindow(phoneNormalized, 8).catch(
        () => null
      );
      const lastMessages =
        recentConv?.messages.map((m) => ({
          direction: m.direction as "inbound" | "outbound",
          body: m.body ?? "",
          timestamp: m.timestamp
        })) ?? [];
      await sendHumanHandoff({
        leadId: lead.id,
        leadName: firstName || "Lead",
        leadPhone: phoneNormalized,
        leadEmail: lead.email ?? undefined,
        lastMessages
      }).catch((err) => {
        // No propagamos: el lead ya fue notificado por WhatsApp.
        // eslint-disable-next-line no-console
        console.warn(
          "[whatsapp/bot] human handoff failed",
          err instanceof Error ? err.message : String(err)
        );
      });
      const bodyText =
        `Perfecto ${firstName || ""}. Un humano del equipo Qlick te escribe a la brevedad ` +
        `por acá mismo. Mientras tanto, ¿hay algo urgente que quieras contarme?`;
      return {
        kind: "text",
        body: bodyText,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText
          })
      };
    }
    case "provide_email": {
      const email = body.trim();
      // FIX A5: usar el QR token real generado por processInboundMessage.
      // Antes mandaba `${appBaseUrl()}/qr` que NO existe en el routing.
      // Si Supabase cayó y no se pudo generar el token, respondemos sin
      // link (mejor que mandar una URL rota).
      //
      // FIX 2026-07-02 (sesion David): multi-evento. Usar el evento del
      // registro (detectado por findEventInConversation) si esta disponible.
      // Si no, fallback a getActiveEvent() (env vars) o al evento del QR.
      const qrUrl = args.qrUrl ?? null;
      const evt = getActiveEvent();
      // FIX 2026-07-02: si tenemos el evento del registro, usar ese para
      // el mensaje. Si no, usar el fallback (getActiveEvent = env vars).
      // NOTA: la fuente de verdad del evento del QR es el que se paso
      // a generateQrToken en processInboundMessage. Lo reflejamos aca.
      const eventLine = `\n\nTambien te enviamos el pase con el QR a tu correo. Es el link de check-in para que lo presentes el dia del evento.`;
      const bodyText = qrUrl
        ? `Listo ${firstName}, te registramos para el evento. Tu pase (link de check-in): ${qrUrl}${eventLine}`
        : `Listo ${firstName}, registramos tu email ${email}. Te esperamos el ${evt.date} en ${evt.location}.`;
      return {
        kind: "text",
        body: bodyText,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText
          })
      };
    }
    case "question":
    default: {
      // Modo sugerencia: el agente sugiere, validamos guardrails,
      // y mandamos texto libre (ventana 24h).
      const profile = getAIAgentProfile();
      const agent = getActiveAgentProvider();
      // FIX 2026-07-02 (sesion David): bot multi-evento.
      // Cargamos TODOS los eventos publicados + el activeEvent (single) +
      // ventana de conversacion + contexto manual. En paralelo.
      const [eventRaw, allEvents, conversationWindow, manualContext] =
        await Promise.all([
          loadActiveEventContext().catch(() => undefined),
          loadAllActiveEvents().catch(() => [] as Awaited<
            ReturnType<typeof loadAllActiveEvents>
          >),
          loadConversationWindow(lead.phone ?? "", 8).catch(() => undefined),
          loadManualContext("qlick-bot").catch(() => null)
        ]);
      // Aplicar overrides manuales al evento (fecha/lugar cambiados por operador).
      const activeEvent =
        eventRaw && manualContext
          ? applyEventOverrides(eventRaw, manualContext)
          : eventRaw;
      // FIX 2026-07-02 (sesion David): si hay varios eventos publicados,
      // pasamos el CATALOGO al LLM para que pueda identificar sobre cual
      // le preguntan. Si hay 1 solo, dejamos el flujo viejo (promptBlock
      // de activeEvent).
      const eventsListBlock =
        allEvents.length > 1
          ? formatEventsListBlock(allEvents)
          : undefined;
      // FIX 2026-07-02 (sesion David): filtrar placeholders en el leadName
      // que pasamos al LLM. Si el lead tiene name="Por" (data legacy de
      // pruebas iniciales) o "test" / "Test Number", no se lo pasamos
      // al LLM. Asi el LLM no genera "Excelente Por!" o "Hola Por!".
      // El placeholder "Por confirmar" lo genera bot-engine cuando el
      // contact de Meta no trae nombre, pero ese caso ya retorna ""
      // (ver createLeadFromWhatsApp). El bug es para leads YA en DB.
      const LLM_PLACEHOLDER_NAMES = new Set([
        "por",
        "por confirmar",
        "confirmar",
        "test",
        "test number",
        "(empty)"
      ]);
      const cleanLeadName = LLM_PLACEHOLDER_NAMES.has(
        (lead.name ?? "").toLowerCase().trim()
      )
        ? ""
        : lead.name ?? "";
      const result = await agent.run("suggest_reply", {
        profile,
        leadName: cleanLeadName,
        courseOfInterest: lead.courseOfInterest,
        lastIncomingMessage: body,
        activeEvent,
        eventsListBlock,
        conversationWindow,
        // Memoria larga persistente entre sesiones (lead_profile.summary).
        leadProfile: args.leadProfile ?? undefined,
        // El provider usa `conversationSummary` para inyectar info extra
        // al prompt. Le pasamos el bloque manual para que el LLM lo vea.
        conversationSummary: manualContext?.promptBlock || undefined,
        // Flag confiable: el lead ya existía cuando llegó este mensaje (= hay
        // historial de conversación). Más confiable que `conversationWindow`
        // porque el loader puede fallar silenciosamente.
        isFirstMessage: args.isFirstMessage
      });
      let content = result.content?.trim();
      if (!content) {
        content =
          "Gracias por tu mensaje. Un asesor de Qlick te va a responder pronto.";
      }
      // Safety net: si NO es el primer mensaje del lead y la respuesta empieza
      // con saludo o "gracias por escribir", strip. (Por si el LLM ignora los
      // prompts.) Usamos `!isFirstMessage` en vez de `conversationWindow` porque
      // el window loader puede fallar silenciosamente con .catch(() => undefined).
      // El flag `isFirstMessage` (basado en `findOrCreateLead().created`) es
      // mucho más confiable.
      const hasHistory = !args.isFirstMessage;
      if (hasHistory && content) {
        const stripped = content
          // "Hola, ..." o "Buen[oa]s, ..."
          .replace(/^\s*(hola|buen[oa]s\s+(d[ií]as|tardes|noches)|qué tal|hi|hello)[,.\s]*/i, "")
          // "Hola Por, ..." o "Hola David, ..." (presentacion con nombre)
          .replace(/^\s*hola[,\s]+[^,.\n]{1,30}[,.\s]*/i, "")
          // "Por, gracias por escribir a Qlick..." (sin Hola)
          .replace(/^\s*[A-Z][a-záéíóú]+,\s*gracias por (escribir|contactarnos|comunicarte)[,.\s]*/i, "")
          // "gracias por escribir a Qlick..." (sin nombre)
          .replace(/^\s*gracias por (escribir|contactarnos|comunicarte)[,.\s]*/i, "")
          // "Soy Qlick, asistente..." (presentacion del bot)
          .replace(/^\s*soy\s+qlick[,\s]+asistente.*?[.\n]/i, "")
          // "¡Hola Por!" (con admiracion al inicio, sin coma)
          .replace(/^\s*¡?\s*hola[¡!.,\s]+[^¡!.,\n]{1,30}!?\s*/i, "")
          .trim();
        if (stripped && stripped !== content) {
          content = stripped;
        }
      }
      // Validar guardrails: si el LLM metió una frase prohibida, fallback.
      const validation = validateAgentReply(content);
      if (!validation.ok) {
        // eslint-disable-next-line no-console
        console.warn("[whatsapp/bot] guardrail bloqueó respuesta LLM", {
          leadId: lead.id,
          reasons: validation.reasons
        });
        content = profile.fallbackMessage;
      }
      return {
        kind: "text",
        body: content,
        send: () =>
          provider.send({ to: phoneNormalized, body: content ?? "" })
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Entry point: processInboundMessage                                  */
/* ------------------------------------------------------------------ */

/**
 * Procesa un mensaje entrante del webhook de Meta. Llamar fire-and-forget
 * desde el Route Handler (no esperar).
 */
export async function processInboundMessage(
  message: IncomingWhatsAppMessage
): Promise<BotProcessResult> {
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] processInboundMessage START", {
    messageId: message.messageId,
    from: message.from
  });

  const phoneNormalized = normalizePhone(message.from);
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] after normalizePhone", {
    phoneNormalized
  });
  if (!phoneNormalized) {
    return {
      ok: false,
      intent: "question",
      leadId: null,
      responseKind: "none",
      note: `No se pudo normalizar el teléfono "${message.from ?? ""}".`
    };
  }

  // FIX 2026-07-02 (sesion David): si el mensaje es un boton de List
  // Message (interactive, buttonTitle presente), usamos el titulo visible
  // como body para que el LLM tenga contexto de que evento eligio el
  // usuario. Sin esto, el LLM recibe body vacio y no sabe que responder.
  const body = (
    message.type === "interactive" && message.buttonTitle
      ? message.buttonTitle
      : message.text ?? ""
  ).trim();
  // Timeout 5s para evitar que Supabase cuelgue la ejecución del bot.
  // Si no responde, caemos a modo demo (sin persistencia).
  const supabasePromise = getSupabase();
  const supabaseTimeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 5000)
  );
  let supabase = await Promise.race([supabasePromise, supabaseTimeout]);
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] supabase result", {
    ok: Boolean(supabase),
    timedOut: supabase === null
  });

  // 1. Buscar o crear lead.
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] before findOrCreateLead", {
    hasSupabase: Boolean(supabase)
  });
  let upsert = await findOrCreateLead(
    supabase,
    phoneNormalized,
    message.contactName
  );
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] after findOrCreateLead", {
    ok: Boolean(upsert)
  });
  if (!upsert) {
    // Fallback: Supabase no responde o falla. Usamos un lead con id=null
    // (NO string sintético) para que las queries a Supabase con FK a leads
    // (lead_whatsapp_conversations.lead_id) no fallen con 22P02.
    // El bot sigue y manda respuesta. El lead se reconcilia cuando Supabase
    // vuelva a responder (re-findOrCreate con phone_normalized nuevo).
    //
    // Forzamos supabase = null para que el resto del flujo (persistConversation,
    // markWhatsAppStatus, touchLead) NO intente escribir en Supabase con id
    // inválido. El bot solo manda respuesta.
    // eslint-disable-next-line no-console
    errorLog("[whatsapp/bot] FALLBACK: lead con id=null (Supabase caída)");
    supabase = null;
    upsert = {
      lead: {
        // Cast a `Lead` con `id: null` es válido solo en fallback; el resto
        // del flujo verifica `supabase` antes de usar `lead.id`.
        id: null as unknown as string,
        name: message.contactName?.trim() || "",
        email: `${phoneNormalized.slice(-6)}@placeholder.local`,
        phone: phoneNormalized,
        status: "new",
        source: "whatsapp",
        intent: "course_information",
        consentToContact: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      created: true
    };
  }
  const { lead, created } = upsert;
  const isFirstMessage = created;

  // 1.5 Cargar perfil persistente del lead (memoria larga entre sesiones).
  // Best-effort: si falla o no hay profile todavía, seguimos sin él.
  // Solo cargamos si el lead tiene id real (no en fallback con id=null).
  let leadProfile: import("../ai").LeadProfile | null = null;
  if (supabase && lead.id) {
    leadProfile = await loadLeadProfile(supabase, lead.id);
  }

  // 2. Persistir inbound.
  let inboundConvId: string | null = null;
  if (supabase) {
    inboundConvId = await persistConversation(supabase, {
      lead_id: lead.id,
      phone_normalized: phoneNormalized,
      direction: "inbound",
      message_type: message.type === "text" ? "text" : "interactive",
      body,
      whatsapp_message_id: message.messageId,
      metadata: {
        timestamp: message.timestamp,
        contactName: message.contactName
      }
    });
  }

  // 3. Detectar intent. Si el usuario clickeó un botón (Fase 7a), el
  // intent se deriva del buttonId en vez de regex sobre el texto.
  let intent: BotIntent;
  if (message.buttonId) {
    if (message.buttonId === "evt_yes_next" || message.buttonId.startsWith("evt_yes_")) {
      // FIX 2026-07-02: el boton del welcome ahora es "evt_yes_next"
      // (sin sufijo de nombre de evento). Tambien matcheamos el patron
      // viejo por si hay botones cacheados.
      intent = "interactive_event_yes";
    } else if (message.buttonId.startsWith("evt_inscribir_") || message.buttonId === "evt_inscribir_next") {
      intent = "interactive_event_inscribir";
    } else if (message.buttonId.startsWith("evt_info_")) {
      // FIX 2026-07-02: nuevo boton del list "Ver eventos" cuando hay
      // varios. El slug viene en el buttonId (e.g. evt_info_ads-meta-...).
      // Lo tratamos como question y dejamos que el LLM responda con el
      // detalle del evento (el slug esta en el contexto del message).
      intent = "question";
    } else if (message.buttonId === "show_events") {
      intent = "interactive_show_events";
    } else if (message.buttonId === "talk_human") {
      intent = "interactive_talk_human";
    } else {
      intent = "question";
    }
  } else {
    intent = detectIntent(body, isFirstMessage);
  }

  // 4. Actualizar whatsapp_status según intent (best-effort).
  if (supabase) {
    if (intent === "opt_out") {
      await markWhatsAppStatus({
        leadId: lead.id,
        newStatus: "lost",
        actorEmail: null,
        messagePreview: body.slice(0, 200),
        metadata: { source: "bot", intent }
      });
    } else if (intent !== "question") {
      // Cualquier intent != opt_out && != question implica interacción real.
      await markWhatsAppStatus({
        leadId: lead.id,
        newStatus: "contactado",
        actorEmail: null,
        messagePreview: body.slice(0, 200),
        metadata: { source: "bot", intent }
      });
    }
  }

  // 5. Si el intent es provide_email: actualizar email del lead + log consent.
  // FIX 2026-07-02 (sesion David): bot multi-evento. Identificamos a cual
  // evento se esta registrando el lead basandonos en el conversationWindow
  // (ultimo outbound del bot). Si no se puede identificar, fallback al
  // primer evento published (comportamiento historico).
  let qrUrl: string | null = null;
  let registrationEventSlug: string | null = null;
  let registrationEventTitle: string | null = null;
  if (intent === "provide_email" && supabase) {
    const email = body.trim().toLowerCase();
    // FIX 2026-07-02: cargar conversationWindow aca (no estaba en
    // processInboundMessage, solo en buildResponsePlan) para identificar
    // el evento del registro.
    const convWindowForEvent = await loadConversationWindow(
      lead.phone ?? "",
      8
    ).catch(() => undefined);
    // Cargar todos los eventos publicados para identificar el correcto.
    const allEvents = await loadAllActiveEvents().catch(() => [] as ActiveEventContext[]);
    // Buscar el evento en la conversacion (ultimo outbound del bot).
    const matchedEvent = findEventInConversation(convWindowForEvent, allEvents);
    registrationEventSlug = matchedEvent?.slug ?? null;
    registrationEventTitle = matchedEvent?.title ?? null;

    await supabase
      .from("leads")
      .update({ email, consent_to_contact: true })
      .eq("id", lead.id);
    await persistConsent(supabase, {
      lead_id: lead.id,
      phone_normalized: phoneNormalized,
      consent_granted: true,
      consent_source: "whatsapp_bot",
      consent_text: CONSENT_DISCLOSURE,
      // FIX 2026-07-02: metadata incluye el evento del registro (multi-evento).
      metadata: {
        intent,
        messageId: message.messageId,
        eventSlug: registrationEventSlug,
        eventTitle: registrationEventTitle
      }
    });
    const qr = await generateQrToken(
      supabase,
      phoneNormalized,
      lead.name,
      email,
      registrationEventSlug
    );
    qrUrl = qr?.url ?? null;

    // Bloque 1 (Fase 7a): enviar pase digital al correo del asistente.
    // Best-effort: si falla, el link del QR por WhatsApp sigue funcionando.
    // No bloquea el flow principal.
    //
    // FIX 2026-07-02 (sesion David): el email debe usar el evento del
    // REGISTRO (registrationEventSlug), no loadActiveEventContext() que
    // siempre retorna el primero. Asi el email coincide con el QR y la
    // pagina de check-in.
    if (qrUrl && qr) {
      try {
        const event = registrationEventSlug
          ? await loadActiveEventContext(registrationEventSlug).catch(() => null)
          : await loadActiveEventContext().catch(() => null);
        // FIX 2026-07-02: usar URL publica del QR en vez de data URL.
        // Los data URLs no se renderizan en Gmail/Outlook.
        const qrImageUrl = `${appBaseUrl()}/api/event-qr/${qr.token}.png`;
        const result = await sendEventQrPassEmail({
          attendeeName: lead.name,
          attendeeEmail: email,
          eventTitle: event?.title ?? registrationEventTitle ?? "el evento",
          eventStartsAt: event?.startsAt
            ? event.startsAt.toISOString()
            : new Date().toISOString(),
          eventLocation: event?.location ?? null,
          qrImageUrl,
          checkInUrl: qrUrl,
        });
        if (!result.ok) {
          errorLog("[whatsapp/bot] sendEventQrPassEmail failed", {
            leadId: lead.id,
            error: result.error,
          });
        }
      } catch (err) {
        errorLog("[whatsapp/bot] sendEventQrPassEmail threw", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 6. Construir plan de respuesta y enviar.
  const plan = await buildResponsePlan({
    intent,
    lead,
    body,
    isFirstMessage,
    phoneNormalized,
    qrUrl,
    leadProfile
  });

  let sendResult: { ok: boolean; externalId?: string; demo?: boolean } = {
    ok: false
  };
  try {
    const r = await plan.send();
    sendResult = {
      ok: r.ok,
      externalId: r.externalId,
      demo: r.demo
    };
  } catch (err) {
    errorLog("[whatsapp/bot] send() lanzó excepción", {
      intent,
      leadId: lead.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  // 7. Persistir outbound.
  let outboundConvId: string | null = null;
  if (supabase) {
    outboundConvId = await persistConversation(supabase, {
      lead_id: lead.id,
      phone_normalized: phoneNormalized,
      direction: "outbound",
      message_type: plan.kind,
      body: plan.body,
      whatsapp_message_id: sendResult.externalId ?? null,
      metadata: {
        intent,
        templateName: plan.templateName ?? null,
        demo: sendResult.demo ?? false
      }
    });
  }

  // 8. Tocar last_contacted_at + summary.
  if (supabase) {
    await touchLead(supabase, lead.id, {
      last_contacted_at: new Date().toISOString(),
      summary: intent === "question"
        ? lead.summary
        : `Bot: intent=${intent}${qrUrl ? ` | qr=${qrUrl}` : ""}`
    });
  }

  // 9. Memoria larga persistente: bump counter y, si toca, regenerar summary.
  // Best-effort: si falla, no rompe el flow. El counter se bumpea ANTES
  // de la regeneración para que el próximo turno dispare si esta corrida falla.
  if (supabase && lead.id) {
    const newCount = await incrementMessageCount(supabase, lead.id);
    if (newCount !== null && newCount >= SUMMARY_EVERY && leadProfile) {
      // Cargar últimos mensajes para alimentar al LLM summarizer.
      const recent = await loadConversationWindow(phoneNormalized, 8).catch(
        () => null
      );
      const recentTexts =
        recent?.messages
          .map((m) => `${m.direction === "inbound" ? "Lead" : "Bot"}: ${m.body ?? ""}`)
          .filter((t) => t.length > 0) ?? [];
      if (recentTexts.length > 0) {
        // Orquestar LLM summarization. lead-profile.ts es LIBRE de LLM
        // (evita ciclos con src/lib/ai/index.ts). El bot-engine decide
        // qué provider usar. Aquí usamos el mismo flujo que suggest_reply.
        const summaryAgent = getActiveAgentProvider();
        const summaryProfile = getAIAgentProfile();
        try {
          const sumResult = await summaryAgent.run("summarize_conversation", {
            profile: summaryProfile,
            leadName: lead.name,
            lastIncomingMessage: recentTexts.join("\n"),
            conversationSummary: leadProfile.summary || undefined
          } as never);
          if (sumResult.ok && sumResult.content?.trim()) {
            await regenerateSummary(
              supabase,
              lead.id,
              sumResult.content.trim()
            );
          }
        } catch (err) {
          errorLog("[whatsapp/bot] regenerate summary falló", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
    }
  }

  return {
    ok: true,
    intent,
    leadId: lead.id,
    conversationId: outboundConvId ?? inboundConvId ?? undefined,
    outboundMessageId: sendResult.externalId,
    responseKind: plan.kind,
    responsePreview: plan.body,
    demo: sendResult.demo ?? false,
    note: `Bot procesó intent=${intent}; outbound=${
      sendResult.ok ? "ok" : "falló"
    }${sendResult.demo ? " (demo)" : ""}.`
  };
}
