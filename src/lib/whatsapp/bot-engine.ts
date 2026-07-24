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
 * IMPORTANTE — privacidad y modo AUTOMÁTICO con guardrails:
 *   - Cero PII en logs (solo flags, IDs, contadores).
 *   - El LLM se usa solo en intent=question; el output se filtra por
 *     `validateAgentReply` antes de enviarse.
 *   - Safety net post-process en `src/lib/whatsapp/safety-net.ts` strippea
 *     saludos redundantes en mensajes no-iniciales (verificado por tests).
 *   - El bot nunca comparte descuentos, gratis, confirmaciones de pago, etc.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions.
 *
 * @server
 */

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { debugLog, errorLog, infoLog } from "../log";
import { stripInvisibleChars } from "../utils";

import type { Lead } from "@/types";
import type { Database, Json } from "@/types/supabase";

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
  SUMMARY_EVERY,
  recordAndCheckRateLimit
} from "../ai";
import { sendHumanHandoff } from "./human-handoff";
import { mustEscalateToHuman, stripEscalateFlag } from "../ai/guardrails";
// FIX 2026-07-12 (Sprint v16 PR #2.4, M4): helpers puros de matriz de
// pausa y helpers de system_settings para leer los switches clave
// (bot_paused_global, bot_daily_outbound_limit).
import { resolveEffectivePause } from "../ai/deepseek-cost";
import { readSystemSetting, KEY_BOT_PAUSED_GLOBAL, KEY_BOT_DAILY_OUTBOUND_LIMIT, KEY_BOT_GLOBAL_MODE } from "../admin/system-settings-server";

// FIX 2026-07-12 (auditoría v16 A6): caché módulo-level de 60s para
// el conteo rolling 24h de outbound auto_enviados. El conteo se
// consulta antes de cada intent del bot; sin caché, un pico de
// mensajes entrantes hace N+1 queries idénticas. 60s es un trade-off
// razonable: si el admin cambia el límite, el efecto se ve al
// siguiente minuto. Los settings (bot_paused_global, daily_limit) ya
// tienen caché 30s en `readSystemSetting` (TTL interno del módulo
// system-settings-server).
type OutboundCountCache = { value: number; expiresAt: number };
let outboundCountCache: OutboundCountCache | null = null;
const OUTBOUND_COUNT_CACHE_TTL_MS = 60_000;
// FIX 2026-07-11 (Sprint v15 PR #2.5b): clasificador del tipo de oferta
// para el prompt Súper Ejecutivo. Se calcula con prioridad price>descripción>unknown.
import { classifyEventType, loadCoursesCatalogBlock } from "../ai/event-context-loader";
import { stripGreetingIfHasHistory, isAckOnly } from "./safety-net";
import { extractEmailFromText } from "./email-extract";
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
// FIX 2026-07-03 (sesion David, "no aparece en confirmados"): el bot debe
// SIEMPRE registrar la confirmacion en event_confirmations cuando un lead
// completa el flow de inscripcion (provide_email) o re-envia un QR existente
// (interactive_event_inscribir). createConfirmation es idempotente
// (dedup por email/phone), safe de llamar en ambos paths.
// Ver docs/BOT_REGISTRATION_RULE.md para la regla completa.
import { createConfirmation } from "../events/confirmations-server";
import { sendEventQrPassEmail } from "../email/event-qr-pass";
import { generateQrDataUrl } from "../qr/generate";
import { appBaseUrl } from "../utils";
// FIX 2026-07-04 (feat/funnel-survey-scoring): imports para el flujo
// de survey offer post-event-attended. Ver seccion 3.0 en
// processInboundMessage y cases nuevos en buildResponsePlan.
import {
  buildSurveyOfferMessage,
  buildSurveyLinkMessage,
  buildSurveyDeclineMessage,
  SURVEY_OFFER_BUTTON_IDS
} from "./survey-messages";
import {
  buildSurveyQ1,
  buildSurveyQ2,
  buildSurveyQ3,
  buildSurveyQ4,
  buildSurveyThankYou,
  detectSurveyButton,
  detectSurveyButtonAny,
  cleanBusinessText,
  isSurveySkip,
  synthesizeSurveyOptionFromText,
  buildDynamicButtonIdFromOption,
  SURVEY_BUTTON_IDS,
  type SurveyAnswers
} from "./survey-wizard";
import {
  buildDynamicSurveyStep,
  detectDynamicSurveyButton,
} from "./survey-wizard";
import { substituteTemplateVars } from "../crm/lead-scoring";
import { resolveSurveyConfig } from "../events/survey-config-validator";
import type { SurveyQuestion, SurveyConfig } from "@/types/events";
import type { InteractiveMessage } from "./providers/whatsapp-provider";
import {
  applyPromotionRules,
  selectFollowUpBucket,
} from "../crm/promotion-engine";
import {
  calculateLeadScoreFromConfig,
} from "../crm/lead-scoring";
import { findLatestAttendedEventForPhone } from "../events/attendees-server";
import { markSurveyOfferSent } from "../crm/leads-server";
import { isInDevBypass } from "../dev/bypass-list";

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
  | "provide_name"
  | "interactive_event_yes"
  | "interactive_event_inscribir"
  | "interactive_show_events"
  | "interactive_talk_human"
  | "survey_offer"
  | "interactive_survey_yes"
  | "interactive_survey_no"
  | "survey_q1_continue"
  | "survey_q2_continue"
  | "survey_q3_continue"
  | "survey_q_consent_continue"
  | "survey_q4_skip"
  | "survey_q4_text"
  | "human_handoff"
  | "question";

/** Resultado del procesamiento de un mensaje entrante. */
export interface BotProcessResult {
  ok: boolean;
  intent: BotIntent;
  leadId: string | null;
  conversationId?: string;
  outboundMessageId?: string;
  /** Si el bot respondió con template o con texto libre. */
  responseKind: "template" | "text" | "interactive" | "list" | "none";
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
  "Acepto recibir información comercial de Qlick Marketing Digital por WhatsApp. Puedo revocar este consentimiento en cualquier momento respondiendo 'baja'.";

/** Datos del evento activo para las respuestas del bot.
 *
 * Configurables via env vars (lectura runtime, no buildtime):
 *   EVENT_NAME, EVENT_DATE, EVENT_LOCATION, EVENT_DURATION
 *
 * FIX 2026-07-07 (audit David "bot presenta evento fantasma"): antes
 * esta funcion retornaba un evento ficticio hardcoded ("IA y Marketing
 * Básico / 6 de julio / Ciudad de México / 2 horas") que el bot le
 * mostraba al lead como si fuera real. Eso comprometia leads con un
 * evento que no existia.
 *
 * Ahora retorna `{ source: "env" | "no_events", ... }`:
 *   - `source: "env"`  -> todas las env vars EVENT_* seteadas con
 *                         valores reales (modo demo / legacy).
 *   - `source: "no_events"` -> falta alguna env var (o todas). El bot
 *                              debe retornar copy honesto y NO iniciar
 *                              el flow de inscripcion.
 *
 * El listado publico de eventos publicados en DB lo maneja
 * `loadActiveEventContext()` (no esta funcion).
 */
function getActiveEvent(): {
  source: "env" | "no_events";
  name: string;
  date: string;
  location: string;
  duration: string;
} {
  const envName = process.env.EVENT_NAME?.trim();
  const envDate = process.env.EVENT_DATE?.trim();
  const envLoc = process.env.EVENT_LOCATION?.trim();
  const envDur = process.env.EVENT_DURATION?.trim();
  const allEnvSet = Boolean(envName && envDate && envLoc && envDur);
  if (!allEnvSet) {
    return {
      source: "no_events",
      name: "—",
      date: "—",
      location: "—",
      duration: "—"
    };
  }
  return {
    source: "env",
    name: envName!,
    date: envDate!,
    location: envLoc!,
    duration: envDur!
  };
}

/**
 * FIX 2026-07-07 (audit David "bot presenta evento fantasma"): texto
 * honesto que retornan los handlers del bot cuando no hay eventos
 * publicados en DB ni env vars reales seteadas.
 *
 * Antes el bot armaba un evento ficticio ("IA y Marketing Básico /
 * 6 de julio / Ciudad de México") que comprometía leads con un
 * evento que no existía. Ahora NUNCA se le muestra al lead un evento
 * que no está en DB.
 *
 * Lo retornan los handlers:
 *   - `register`             (línea ~1709)
 *   - `interactive_event_yes`     (línea ~1824)
 *   - `interactive_event_inscribir` (línea ~1890)
 *   - `provide_email`        (línea ~3004)
 */
/**
 * PARCHE TEMPORAL (HOY - Campaña activada antes de crear evento):
 * Texto de fallback amigable para capturar datos del lead sin rebotarlo cuando
 * no existen eventos publicados en DB.
 *
 * PARA REVERTIR (una vez creado el nuevo evento hoy):
 * Restaurar el mensaje original "Por el momento no tenemos eventos próximos publicados...".
 */
function noEventsText(leadName?: string): string {
  const clean = cleanFirstName(leadName);
  const saludo = clean ? `¡Hola ${clean}!` : "¡Hola!";
  return [
    `${saludo} Gracias por escribirnos a Qlick Marketing Digital.`,
    "",
    "Por el momento no tenemos eventos próximos publicados. Estamos registrando a las personas interesadas para ponernos en contacto directo contigo a la brevedad y darte atención personalizada.",
    "Para enviarte la información, ¿nos podrías compartir tu nombre completo y tu correo electrónico?",
  ].join("\n");
}

/** Términos comerciales del apartado, derivados del evento publicado. */
function getReservationTerms(event: ActiveEventContext | null): {
  enabled: boolean;
  amount: number;
  balance: number;
  note: string;
} {
  if (!event) return { enabled: false, amount: 0, balance: 0, note: "" };
  const total = event.priceMxn ?? 0;
  const amount = event.eventRules?.reservation_enabled === true
    ? event.eventRules.reservation_amount_mxn
    : undefined;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount >= total) {
    return { enabled: false, amount: 0, balance: 0, note: "" };
  }
  const balance = event.eventRules.balance_amount_mxn ?? total - amount;
  return {
    enabled: true,
    amount,
    balance,
    note: event.eventRules.balance_due_note ?? "El saldo se liquida el día del evento.",
  };
}

/**
 * Detecta peticiones cortas de información que llegan desde anuncios
 * ("info", "quiero más información", "de qué trata", etc.). Las tratamos
 * como una solicitud de resumen para que el primer mensaje no se quede en
 * un menú genérico.
 */
function isEventInfoRequest(body: string | null | undefined): boolean {
  const text = body?.trim() ?? "";
  return /\b(?:info|informaci[oó]n|detalles?|de\s+qu[eé]\s+trata|qu[eé]\s+incluye|temario|m[aá]s\s+datos)\b/i.test(
    text,
  );
}

function joinSpanishList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Resumen factual y corto para WhatsApp. Se construye desde el evento
 * publicado y su descripción, así el bot puede responder "info" sin
 * depender de una respuesta libre del LLM ni inventar datos.
 */
export function buildEventInfoCopy(event: ActiveEventContext): string {
  const description = event.description ?? "";
  const topics: string[] = [];
  if (/video/i.test(description)) topics.push("crear videos que comuniquen con claridad");
  if (/publicidad\s+pagada|facebook\s*ads|\bads\b/i.test(description)) {
    topics.push("configurar publicidad pagada de forma estratégica");
  }
  if (/inteligencia artificial|\bIA\b/i.test(description)) {
    topics.push("aprovechar la inteligencia artificial en tareas reales");
  }
  if (/whatsapp/i.test(description)) {
    topics.push("dar seguimiento puntual por WhatsApp");
  }

  const rulesText = event.eventRules.rules.join(" ");
  const exactAddressPending = /direcci[oó]n exacta/i.test(rulesText) &&
    /por confirmar/i.test(rulesText);
  const lines = [`📌 ${event.title}`];
  if (topics.length > 0) {
    lines.push(`Trabajaremos ${joinSpanishList(topics)}.`);
  }
  lines.push(
    `📅 ${event.humanStartsAt}`,
    `⏱ Duración: ${event.humanDuration}`,
    `📍 Lugar: ${event.location}${exactAddressPending ? ". La dirección exacta está por confirmar." : "."}`,
  );

  const reservation = getReservationTerms(event);
  if (typeof event.priceMxn === "number" && event.priceMxn > 0) {
    const total = event.priceMxn.toLocaleString("es-MX");
    if (reservation.enabled) {
      lines.push(
        `💰 Inversión total: $${total} MXN. Puedes apartar con $${reservation.amount.toLocaleString("es-MX")} MXN y liquidar $${reservation.balance.toLocaleString("es-MX")} MXN ${reservation.note.toLowerCase()}.`,
      );
    } else {
      lines.push(`💰 Inversión: $${total} MXN.`);
    }
  } else {
    lines.push("💰 Evento gratuito.");
  }
  if (/constancia|certificado/i.test(description)) {
    lines.push("Al finalizar recibirás una constancia de participación.");
  }
  if (/cupo\s+limitado/i.test(description)) {
    lines.push("El cupo es limitado.");
  }
  return lines.join("\n");
}

/**
 * Set de nombres que consideramos placeholders del sistema (no nombres
 * reales del lead). Cuando el lead tiene uno de estos en `name`, no lo
 * usamos para construir saludos (`¡Hola Por!`, `¡Excelente Test!`) ni
 * para pasárselo al LLM como leadName.
 *
 * FIX 2026-07-02 (auditoria): antes este Set estaba duplicado en 3 sitios
 * de este archivo (welcome, interactive_event_inscribir, provide_email)
 * con riesgo de drift silencioso. Ahora es una sola constante de módulo.
 */
/**
 * FIX 2026-07-06: export para tests (whatsapp-bot-name-capture.test.mjs).
 * Es el set canonico de nombres que NO son nombres reales — se filtra
 * en `cleanFirstName` para evitar saludos placeholder ("Hola Por") y
 * para que el bot no acepte un lead con `name = "Asistente"`.
 */
export const PLACEHOLDER_NAMES = new Set([
  "por",
  "por confirmar",
  "confirmar",
  "test",
  "test number",
  "(empty)",
  // FIX 2026-07-08 (audit David, sesion madrugada): cuando Meta NO
  // provee el `profile.name` del contacto (caso comun para leads
  // nuevos), `createLeadFromWhatsApp` cae al fallback `safeName =
  // "WhatsApp Lead"`. `cleanFirstName` desglosa `lead.name.split("
  // ")[0]` para construir el saludo; sin estas entradas, el bot
  // decia «¡Hola WhatsApp!», «¡Excelente WhatsApp!» y «Listo
  // WhatsApp, te registramos...» a leads que solo querian
  // inscribirse. Anadido en lowercase porque `cleanFirstName`
  // normaliza el input a lowercase antes del lookup (linea 361).
  "whatsapp",
  "whatsapp lead"
]);

/**
 * FIX 2026-07-06 (audit E2E — David): lista extendida de placeholders
 * UI. Usada SOLO en validacion de "lead.name ya capturado" (provide_email,
 * provide_name), NO en saludos (cleanFirstName usa la lista canonica
 * para no romper dialogos viejos).
 *
 * Por que una lista aparte? Los placeholders canonicos son del bot
 * ("Por" = lead de prueba "Por" de Q2). Los UI son del admin/check-in
 * ("Asistente" = prefilled por default en formularios). Si un lead tiene
 * uno de estos UI en `leads.name` (de un registro anterior), NO es un
 * nombre valido y debemos redirigir a provide_name.
 */
export const PLACEHOLDER_NAMES_UI = new Set([
  ...Array.from(PLACEHOLDER_NAMES), // incluye los canonicos
  "asistente",
  "pendiente",
  "n/a",
  "na",
  "anonimo",
  "anonymous",
  "sin nombre"
]);

/** True si `rawName` es un placeholder UI (canonico o extendido). */
export function isPlaceholderNameUI(rawName: string | null | undefined): boolean {
  if (!rawName) return true;
  return PLACEHOLDER_NAMES_UI.has(String(rawName).trim().toLowerCase());
}

/**
 * Tipos de mensaje inbound que el CHECK constraint de
 * `lead_whatsapp_conversations.message_type` acepta. Si llega un
 * IncomingWhatsAppMessage.type fuera de este set (ej. 'button' legacy,
 * 'sticker', 'voice', 'unsupported'), caemos a 'interactive' como
 * fallback seguro en lugar de fallar el INSERT.
 *
 * FIX 2026-07-04 (auditoria nocturna): el bot antes mapeaba todo
 * no-'text' a 'interactive', perdiendo fidelidad para image/audio/
 * document. Ahora pasa el tipo real cuando es válido.
 */
const VALID_INBOUND_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "text",
  "template",
  "image",
  "document",
  "audio",
  "interactive"
]);

/**
 * Helper: devuelve el firstName limpio (sin placeholders).
 *
 * FIX 2026-07-06: export para tests. Si el nombre del lead es un placeholder
 * (e.g. "Por", "Asistente", "test"), devolvemos "" para que el bot NO lo
 * use en saludos ni en el system prompt del LLM.
 *
 * FIX 2026-07-15 (sesion David, "bot llamó a Carlos 'Quiero'"): el bug
 * era que el pushname de WhatsApp del lead era "Quiero más información"
 * (texto de intención, no un nombre real) y se persistía en
 * `leads.name`. `PLACEHOLDER_NAMES` no lo cubría (es un string
 * legítimo, no un placeholder obvio). Ahora filtramos también frases
 * de intención al inicio o si contienen palabras clave tipo "más
 * información" / "me interesa" / "inscribirme" / "registrarme" /
 * "apartar lugar" / "reservar" / "dime" / "buenos días" / "buenas
 * tardes" / "saludos" + cualquier string de más de 5 palabras. El
 * abridor dirá "¡Hola!" genérico y el LLM verá `leadName=""` (no un
 * "Quiero" contaminado).
 */
const INTENT_PHRASE_RE = /^(?:quiero|dime|me\s+interesa|inscríbeme|inscribeme|registrame|regístrate|apartar|reservar|saludos?|buen[oa]?\s+d[ií]a|buenas?\s+(?:tardes|noches))/i;
const INTENT_HAS_INFO_RE = /(?:m[áa]s\s+informaci[óo]n|m[áa]s\s+info|me\s+interesa|inscribirme|inscribime|registrarme|apartar\s+(?:mi\s+)?lugar|reservar\s+(?:mi\s+)?lugar)/i;
const TOO_MANY_WORDS = 10;

export function cleanFirstName(rawName: string | null | undefined): string {
  const trimmed = (rawName ?? "").trim();
  if (!trimmed) return "";
  const name = trimmed.toLowerCase();
  if (PLACEHOLDER_NAMES.has(name)) return "";
  // FIX 2026-07-15: rechazar frases de intención persistidas como
  // nombre (e.g. "Quiero más información", "Hola, me interesa el
  // evento").
  if (INTENT_PHRASE_RE.test(trimmed)) return "";
  if (INTENT_HAS_INFO_RE.test(trimmed)) return "";
  // FIX 2026-07-15: nombres con > 10 palabras son prácticamente
  // imposibles en español (push name de WhatsApp <= 25 chars) y
  // matchearían con texto de intención largo. Si alguien tiene un
  // nombre real de 10+ palabras, podemos ajustar el límite.
  if (trimmed.split(/\s+/).filter(Boolean).length > TOO_MANY_WORDS) return "";
  return trimmed;
}

/**
 * FIX 2026-07-08 (sesion David, "bot salta captura de nombre"):
 * detecta si el body del lead expresa intención de inscripción al
 * evento. Se usa en el `case "question"` para interceptar ANTES de
 * invocar al LLM cuando el lead no tiene nombre válido (placeholder)
 * y dice algo que claramente quiere inscribirse.
 *
 * El LLM no respetaba la captura de nombre cuando el body era algo
 * como "Bue. Día quiero regístrate" — respondía "ok, te registro,
 * dame tu email" directo, saltándose el flow secuencial.
 *
 * 3 ramas (cualquiera matchea → true):
 *   1. Affirmativo corto aislado ("si", "ok", "dale", "va", "claro",
 *      "buen dia", "buenas tardes/noches" solos).
 *   2. Affirmativo + verbo en el mismo mensaje ("si, quiero
 *      inscribirme", "ok dame lugar").
 *   3. Frase directa de inscripción sin affirm previo ("quiero
 *      inscribirme", "me interesa el evento", "apartar mi lugar",
 *      "inscribirme al evento", etc.).
 *
 * NO matchea preguntas libres ("que incluye?", "cuanto cuesta?",
 * "donde es?") — esas SÍ deben ir al LLM.
 *
 * Pure function: exportada para tests unitarios.
 */
export function matchInscriptionIntent(body: string): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  if (!trimmed) return false;
  const INSCRIPTION_INTENT_RE = new RegExp(
    [
      // Rama 1: affirmative aislado (case-insensitive)
      "^(?:s[ií]|ok(?:ay)?|dale|va|claro|buen[oa]?\\s+d[ií]a(?:s)?|buenas\\s+(?:tardes|noches))[\\s,!.]*$",
      // Rama 2: affirmative + verbo (en cualquier orden, mismo msg)
      "(?:s[ií]|ok(?:ay)?|dale|va|claro)[,;\\s].*\\b(?:quiero|inscribirme|inscribime|registrarme|registrame|reg[ií]strate|me\\s+interesa|apartar|reservar|dame)\\b",
      // Rama 3: frase directa de inscripcion.
      // Acepta infinitivo E imperativo (con errata) del usuario: "quiero
      // registrarme" / "quiero registrate" / "registrarme" / "registrame" /
      // "inscribirme" / "inscribime" (típico en chat de México). El bot
      // NO se ofende con errata — matchea intent.
      "\\b(?:quiero\\s+(?:inscribirme|inscribime|registrarme|registrame|reg[ií]strate|apartar|reservar|el\\s+lugar|mi\\s+lugar)|" +
        "me\\s+interesa\\s+(?:inscribirme|el\\s+evento|el\\s+curso|apartar|reservar)|" +
        "inscribirme?\\s+(?:al?\\s*)?(?:evento|curso|taller)?|" +
        "reg(?:i[sz]?t(?:r|rr)?ar?|istrar)me?\\s+(?:al?\\s*)?(?:evento|curso|taller)?|" +
        "(?:apartar|reservar|dame)\\s+(?:mi\\s+)?lugar)\\b",
      // Rama 4 (FIX 2026-07-08): verbos sueltos coloquiales que NO
      // matchean las ramas anteriores porque no tienen "quiero" antes
      // y/o no siguen la forma estándar. Casos reales del chat de México
      // que David reporto 2026-07-08: "Registrame", "Inscribime",
      // "Anotame", "Me apunto", "Apuntame". Sin esta rama, el LLM
      // tomaba el control y respondia con "ok, te registro, dame tu
      // email", saltandose la captura de nombre.
      "\\b(?:registrame\\b|registrame\\b|inscribime\\b|anotame\\b|apuntame\\b|me\\s+apunto\\b|apunto\\b)"
    ].join("|"),
    "i"
  );
  return INSCRIPTION_INTENT_RE.test(trimmed);
}

/**
 * FIX 2026-07-06 (audit E6 stress testing — David): detecta si el body
 * del lead es una PREGUNTA o un INTENT (no un nombre).
 *
 * Si el bot esta pidiendo nombre (`awaiting_field="name"`) y el lead
 * responde con una pregunta, NO debe guardarse como nombre. Esta funcion
 * detecta:
 *   - Signos de interrogacion: "?" o "¿".
 *   - Palabras interrogativas al inicio del body: "que", "como", "cuanto",
 *     "por que", "para que", "donde", "cual", "cuando", "quien".
 *   - Frases comerciales comunes: "es gratis", "tiene costo", "es
 *     obligatorio", "como funciona".
 *
 * FIX: export para tests (scratch/qlick-stress-audit.mjs E6).
 */
export function isQuestionOrIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length === 0) return false;
  // Signos de interrogacion.
  if (/[¿?]/.test(t)) return true;
  // Palabras interrogativas al inicio (case-insensitive).
  const INTERROGATIVE_RE = /^(qué|que|cómo|como|cuánto|cuanto|cuánta|cuanta|cuántos|cuantos|cuántas|cuantas|por\s*qué|por\s*que|para\s*qué|para\s*que|dónde|donde|cuál|cual|cuáles|cuales|cuándo|cuando|quién|quien|quiénes|quienes)\b/i;
  if (INTERROGATIVE_RE.test(t)) return true;
  // Frases comerciales / dudas comunes.
  const INTENT_PHRASES = [
    /^es\s+gratis/i,
    /^tiene\s+costo/i,
    /^cu[aá]l\s+es\s+el\s+(precio|costo)/i,
    /^es\s+obligatorio/i,
    /^c[oó]mo\s+funciona/i,
    /^qu[eé]\s+incluye/i,
    /^para\s+qu[eé]\s+sirve/i,
    /^d[oó]nde\s+es/i,
    /^a\s+qu[eé]\s+hora/i,
    /^cu[aá]ndo\s+es/i,
  ];
  for (const re of INTENT_PHRASES) {
    if (re.test(t)) return true;
  }
  return false;
}

/**
 * FIX 2026-07-06 (audit E7 stress testing): valida que el body del lead
 * sea un NOMBRE HUMANO valido, no emojis/garbage.
 *
 * Reglas:
 *   - Trim, longitud 2-100 chars.
 *   - Contiene AL MENOS 2 palabras con caracteres alfabeticos
 *     (incluyendo acentos: á é í ó ú ü ñ).
 *   - NO es todo digitos.
 *   - NO es todo simbolos/emoji.
 *   - Las palabras NO son muletillas conversacionales ("ah", "ok", "si",
 *     "ya", "vale", "bueno", "claro", "pues", "hey", "hola", "gracias").
 *     Estas pasan el filtro de "tienen letras" pero NO son nombres.
 *   - NO esta en PLACEHOLDER_NAMES_UI (rechaza "Asistente", "Por
 *     confirmar", etc).
 *
 * Casos rechazados: "👍👍👍", "123456", ".......", "ah ok", "ok",
 * "x", "@#$%", "Asistente", "Por confirmar".
 * Casos aceptados: "Juan Perez", "Dr. Juan Perez", "Maria de los
 * Angeles", "Jose-Luis Nunez", "Muller Hans".
 *
 * FIX: export para tests (scratch/qlick-stress-audit.mjs E7).
 */
const CONVERSATIONAL_FILLER_WORDS = new Set([
  "ah", "ok", "okay", "si", "sí", "no", "ya", "vale", "bueno",
  "claro", "pues", "hey", "hola", "gracias", "thanks", "ola",
  "oe", "ea", "mm", "hmm", "ups", "ahh", "sii", "nop", "nope",
  "yep", "yup", "mmm", "ajá", "aja", "dale", "va", "listo",
  "perfecto", "excelente", "genial", "okas", "okis",
]);

/**
 * FIX 2026-07-10 (sesión David "FALLBACK captura 'Quiero'/'!hola!' como nombre"):
 * Set de verbos/intenciones que NO son nombre humano. Usado SOLO por
 * `hasIntentVerb` (gate de seguridad en el FALLBACK provide_name y en
 * la tool `extract_and_save_contact_info`). NO se mete en `isValidHumanName`
 * para no romper apellidos válidos como "Apunta", "Interesa" (raros
 * pero posibles).
 *
 * Cobertura: verbos específicos de inscripción, intención de obtener
 * info, y verbos de comunicación. NO incluye "Quiero" (genérico, es
 * nombre válido) — el system prompt del LLM se encarga de esos casos.
 *
 * Comparación EXACTA (===), no substring — un nombre como "Anota" o
 * "Aparta" NO se rompe.
 */
const INTENT_VERBS = new Set([
  // Verbos específicos de inscripción
  "registrarme", "registrame", "registráme",
  "inscribirme", "inscribime", "inscribíme",
  "apuntarme", "apuntame", "apuntáme",
  "anotarme", "anotame", "anotáme",
  "apartar", "reservar",
  "asistir", "asisto",
  "confirmo", "confirmar",
  "anotar", "apartarme", "reservarme",
  // Verbos de intención de obtener info
  "interesa", "gustaria", "gustaría",
  "dame", "necesito",
  // Verbos de comunicación
  "hablar", "comunicar", "comunicarme",
  // Auxiliares comunes en frases de intención
  "solicito", "solicitar", "pidiendo", "pedir",
]);

/**
 * FIX 2026-07-10: detecta si alguna palabra del body es un verbo de
 * intención conocido. Se usa en el FALLBACK provide_name y en la tool
 * `extract_and_save_contact_info` para evitar capturar frases como
 * "Quiero registrarme" o "Me interesa el evento" como si fueran nombres.
 *
 * Pure function, exportada para tests.
 */
export function hasIntentVerb(body: string | null | undefined): boolean {
  if (!body) return false;
  const words = body.toLowerCase().split(/\s+/).filter(Boolean);
  const cleanWords = words.map((w) => w.replace(/[.,!?;:]+$/, ""));
  return cleanWords.some((w) => INTENT_VERBS.has(w));
}

/**
 * FIX 2026-07-10: detecta si alguna palabra del body empieza con un
 * símbolo (no letra, no acento). "!hola!" empieza con "!" → rechazar.
 * "Juan" empieza con "J" → OK. "1juan" empieza con "1" → rechazar.
 *
 * Cubre el caso del screenshot 2 de David: "!hola! david" se filtraba
 * como nombre (firstName="!hola!" → saludo "¡Hola !hola!!").
 *
 * Pure function, exportada para tests.
 */
export function hasGarbledStart(body: string | null | undefined): boolean {
  if (!body) return false;
  const words = body.split(/\s+/).filter(Boolean);
  return words.some((w) => /^[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/.test(w));
}

export function isValidHumanName(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  // NO es todo digitos (con espacios opcionales).
  if (/^[\d\s]+$/.test(trimmed)) return false;
  // NO es todo emojis/simbolos sin letras.
  if (!/[\p{L}]/u.test(trimmed)) return false;
  // NO es un placeholder UI conocido ("Asistente", "Por confirmar", etc).
  if (PLACEHOLDER_NAMES_UI.has(trimmed.toLowerCase())) return false;
  // Al menos 2 palabras con caracteres alfabeticos.
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordsWithLetters = words.filter((w) => /[\p{L}]/u.test(w));
  if (wordsWithLetters.length < 2) return false;
  // FIX 2026-07-06 (audit E7 stress testing ronda 2): ninguna palabra
  // puede ser una muletilla conversacional ("ah ok", "ya", "dale").
  // Si alguna lo es, el input NO es un nombre real.
  // FIX 2026-07-10: limpieza ampliada [.,!?;:] (antes solo [.?]) para
  // que "hola," y "hola;" se consideren filler correctamente.
  const cleanedForCheck = wordsWithLetters.map((w) =>
    w.toLowerCase().replace(/[.,!?;:]+$/, "")
  );
  const hasOnlyFiller = cleanedForCheck.every((w) =>
    CONVERSATIONAL_FILLER_WORDS.has(w)
  );
  if (hasOnlyFiller) return false;
  // FIX 2026-07-10: si CUALQUIER palabra es placeholder UI (no solo el
  // nombre completo), rechazar. Antes "Asistente Lopez" pasaba como
  // nombre válido y el saludo quedaba como "¡Hola Asistente!".
  const hasPlaceholderWord = cleanedForCheck.some((w) =>
    PLACEHOLDER_NAMES_UI.has(w)
  );
  if (hasPlaceholderWord) return false;
  return true;
}

/**
 * FIX 2026-07-08 (sesión David "captura orden-independiente"): detecta si
 * el body del lead contiene TANTO un nombre humano válido COMO un email
 * embebido, en cualquier orden, en una sola línea o en múltiples.
 *
 * Caso típico real (conversaciones Yesy, Sitlalic, David Esparza):
 *   - "David david@x.com"
 *   - "Sitlalic Guzman ramos sitlalic.guzman@uabc.edu.mx"
 *   - "david@x.com David Esparza"
 *
 * Devuelve `{ name, email }` si matchea. `null` si no.
 *
 * Diferencia con `extractEmailFromText` (en email-extract.ts): ese solo
 * extrae email. Esta además valida que el resto sea nombre válido
 * (`isValidHumanName`) para no aceptar texto random que solo contiene
 * un email pegado.
 *
 * Server-only (helper de lógica, no se importa en Client Components).
 */
export function extractNameAndEmailTogether(
  text: string | null | undefined,
): { name: string; email: string } | null {
  if (!text) return null;
  const body = text.trim();
  if (!body) return null;

  // FIX 2026-07-08: extraemos el PRIMER email (consistente con el resto del
  // bot — ver extractEmailFromText doc: "se queda con la primera mención").
  // Para name, en cambio, removemos TODOS los emails del body para que un
  // texto como "David Esparza david@x.com extra@x.com" no contamine el
  // nombre con el segundo email.
  const email = extractEmailFromText(body);
  if (!email) return null;

  // Quitar TODOS los emails del body (no solo el primero) y limpiar
  // puntuación/comas. Usamos el mismo regex que extractEmailFromText para
  // consistencia, con flag global.
  const ALL_EMAILS_RE = /[^\s@]+@[^\s@]+\.[^\s@.,;:]+/g;
  const withoutAnyEmail = body
    .replace(ALL_EMAILS_RE, "")
    .replace(/[,;]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Sin nombre después de quitar emails NO es caso "name + email together"
  // (sería solo email, manejado por provide_email).
  if (withoutAnyEmail.length < 2) return null;

  // El resto debe ser un nombre válido. Si no, no es caso nuestro
  // (ej. "dale david@x.com" — "dale" es filler, no nombre).
  if (!isValidHumanName(withoutAnyEmail)) return null;

  return {
    name: withoutAnyEmail,
    email: email.toLowerCase().trim(),
  };
}

/**
 * FIX 2026-07-04 (feat/funnel-survey-scoring): anti-spam del survey offer.
 * Devuelve true si debemos ofrecer la encuesta al lead. Reglas:
 *   - Sin offer previo → ofrecer.
 *   - Offer > 24h → re-ofrecer (puede haber olvidado).
 *   - Offer < 24h → no re-ofrecer (no spamear).
 */
function isSurveyOfferStale(lastOfferIso: string | null | undefined): boolean {
  if (!lastOfferIso) return true;
  const ts = new Date(lastOfferIso).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > 24 * 60 * 60 * 1000;
}

/* ------------------------------------------------------------------ */
/*  Wizard helpers (Fase 7d, survey-wizard-native)                    */
/* ------------------------------------------------------------------ */

/**
 * FIX 2026-07-06 (QA funnel-audit UX): exportada para tests.
 *
 * Devuelve un plan de respuesta "nudge" cuando el handler del wizard
 * se dispara fuera de orden (e.g. clickeó un botón de Q2 cuando
 * estábamos esperando Q1).
 *
 * FIX 2026-07-06 (QA funnel-audit UX): antes solo mandaba texto neutro
 * ("toca un botón de los que te mandé") sin re-enviar los botones
 * interactivos. El lead quedaba atascado porque en WhatsApp no se
 * puede scrollear hacia arriba para encontrar la pregunta original
 * sin perder el contexto de la conversación.
 *
 * Ahora, si tenemos `surveyState`, derivamos la pregunta actual desde
 * `surveyState.questions[surveyState.step - 1]` y la re-construimos con
 * `buildDynamicSurveyStep`. Enviamos texto + interactive buttons (o
 * el botón "Saltar" si es pregunta text). El lead puede hacer clic
 * inmediatamente sin scrollear.
 *
 * Si NO tenemos surveyState (caso edge, drift de estado), fallback a
 * texto simple con la instrucción de reiniciar.
 */
export function nudgeToResendWizard(
  provider: ReturnType<typeof getActiveWhatsAppProvider>,
  phoneNormalized: string,
  leadName: string | null | undefined,
  surveyState?: {
    step: number;
    eventTitle: string | null;
    questions?: SurveyQuestion[];
  },
) {
  // Si tenemos la pregunta actual, la re-enviamos con interactive.
  if (
    surveyState &&
    surveyState.questions &&
    surveyState.questions.length > 0 &&
    surveyState.step >= 1 &&
    surveyState.step <= surveyState.questions.length
  ) {
    const idx = surveyState.step - 1;
    const question = surveyState.questions[idx];
    if (question) {
      const reStep = buildDynamicSurveyStep({
        eventTitle: surveyState.eventTitle ?? "",
        question,
        leadName,
      });
      return {
        kind: "interactive" as const,
        body: reStep.text,
        interactive: reStep.interactive,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: reStep.text,
            interactive: reStep.interactive,
          }),
      };
    }
  }

  // Fallback: solo texto (caso edge, drift de estado).
  const bodyText =
    `Ups, parece que hubo un clic fuera de orden. Te re-mando la pregunta ` +
    `que estabas respondiendo — toca uno de los botones. ` +
    `Si quieres empezar de nuevo, di "reiniciar".`;
  return {
    kind: "text" as const,
    body: bodyText,
    send: () =>
      provider.send({ to: phoneNormalized, body: bodyText })
  };
}

interface PersistWizardArgs {
  eventId: string | null;
  leadEmail: string | null;
  phoneNormalized: string;
  responses: SurveyAnswers;
  /**
   * Si el lead describió su negocio en la Q4, marcamos
   * consent_to_contact=true como convención: escribir de su
   * negocio = opt-in implícito al canal comercial.
   */
  businessCaptured: boolean;
  // El cliente de supabase service-role. Si es null, no persistimos
  // (caso modo demo).
  supabase: SupabaseAdmin | null;
  leadId?: string | null;
  consentToContact?: boolean;
  commercialInterest?: string | null;
}

/**
 * Persiste el resultado del wizard: insert a `event_surveys` con las
 * respuestas en `responses` jsonb, y vincula automáticamente la encuesta
 * al lead (promoted_to_lead_id) para habilitar el flujo 100% automático.
 *
 * Retorna `{ ok, note }`. Errores se loggean y se devuelven para que
 * el caller decida si continúa con el thank-you o aborta.
 */
async function persistWizardSurvey(
  args: PersistWizardArgs,
): Promise<{ ok: boolean; note: string }> {
  if (!args.supabase) {
    return { ok: false, note: "supabase no disponible (modo demo)." };
  }
  if (!args.eventId) {
    return { ok: false, note: "No hay eventId, no se persiste la encuesta." };
  }
  try {
    const { data: insData, error: insErr } = (await args.supabase
      .from("event_surveys" as never)
      .insert({
        event_id: args.eventId,
        respondent_email: args.leadEmail,
        respondent_phone: args.phoneNormalized,
        phone_normalized: args.phoneNormalized,
        responses: args.responses as unknown as never,
        consent_to_contact: args.consentToContact ?? args.businessCaptured,
        commercial_interest: args.commercialInterest ?? null,
        promoted_to_lead_id: args.leadId ?? null,
        promoted_at: args.leadId ? new Date().toISOString() : null,
      } as never)
      .select("id")
      .single()) as unknown as { data: { id: string } | null; error: any };

    if (insErr) {
      if (insErr.code === "23505" || /duplicate/i.test(String(insErr.message ?? ""))) {
        return { ok: true, note: "Encuesta ya existía (dedupe DB level)." };
      }
      errorLog("[whatsapp/bot] persistWizardSurvey insert falló", {
        code: insErr.code,
        eventId: args.eventId,
        phoneNormalized: args.phoneNormalized
      });
      return { ok: false, note: `DB error ${insErr.code ?? "unknown"}` };
    }

    // Vincula lead ↔ survey en lead_event_links para trazabilidad completa
    if (args.leadId && insData?.id) {
      try {
        const { error: linkErr } = await args.supabase
          .from("lead_event_links" as never)
          .insert({
            lead_id: args.leadId,
            event_id: args.eventId,
            link_type: "survey",
            link_id: insData.id,
          } as never);
        if (linkErr && linkErr.code !== "23505") {
          errorLog("[whatsapp/bot] persistWizardSurvey link lead_event_links falló", {
            code: linkErr.code,
            leadId: args.leadId,
            surveyId: insData.id,
          });
        }
      } catch (linkErr) {
        errorLog("[whatsapp/bot] persistWizardSurvey link threw", {
          error: linkErr instanceof Error ? linkErr.message : String(linkErr),
        });
      }
    }

    return { ok: true, note: "Encuesta persistida." };
  } catch (err) {
    errorLog("[whatsapp/bot] persistWizardSurvey threw", {
      error: err instanceof Error ? err.message : String(err)
    });
    return { ok: false, note: "Excepción al persistir." };
  }
}

/**
 * FIX 2026-07-05 (Fase 7d.1): state-tracking — el bot ya NO permite
 * re-tomar el wizard si el lead ya completó la encuesta para el evento.
 *
 * Lookup contra `event_surveys` por (event_id, phone_normalized OR
 * respondent_email). Si hay match, NO entramos al wizard — enviamos un
 * thank-you corto y cerramos el flow.
 *
 * Necesita que `event_surveys` tenga UNIQUE constraint sobre
 * (event_id, phone_normalized) o (event_id, respondent_email) para que el
 * dedupe sea a nivel DB. Ver `supabase/migrations/20260705000000_...`.
 */
/**
 * Carga el `survey_config` de un evento desde `events.survey_config` (jsonb).
 *
 * FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm): agregado para soportar
 * wizard dinámico. Si la fila no tiene config (o es inválida), devuelve
 * null y el caller usa `getDefaultSurveyConfig()` (5 preguntas).
 *
 * Server-only.
 */
async function loadSurveyConfigForEvent(
  supabase: SupabaseAdmin,
  eventId: string,
): Promise<SurveyConfig | null> {
  try {
    const { data, error } = await supabase
      .from("events" as never)
      .select("survey_config" as never)
      .eq("id" as never, eventId)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { survey_config: unknown }).survey_config;
    return resolveSurveyConfig(raw);
  } catch {
    return null;
  }
}

async function hasCompletedWizardSurvey(args: {
  supabase: SupabaseAdmin | null;
  eventId: string;
  phoneNormalized: string;
  leadEmail: string | null;
}): Promise<boolean> {
  if (!args.supabase) return false; // modo demo: permitimos entrar (no hay DB)
  try {
    // Buscar por phone_normalized.
    const phoneQuery = args.supabase
      .from("event_surveys" as never)
      .select("id" as never)
      .eq("event_id" as never, args.eventId)
      .eq("phone_normalized" as never, args.phoneNormalized)
      .limit(1);
    const { data: phoneRows, error: phoneErr } = await phoneQuery;
    if (!phoneErr && phoneRows && (phoneRows as unknown[]).length > 0) {
      return true;
    }
    // Buscar por email si tenemos uno (y no es el placeholder synthetic).
    if (
      args.leadEmail &&
      !args.leadEmail.endsWith("@placeholder.local")
    ) {
      const emailQuery = args.supabase
        .from("event_surveys" as never)
        .select("id" as never)
        .eq("event_id" as never, args.eventId)
        .eq("respondent_email" as never, args.leadEmail.toLowerCase())
        .limit(1);
      const { data: emailRows, error: emailErr } = await emailQuery;
      if (!emailErr && emailRows && (emailRows as unknown[]).length > 0) {
        return true;
      }
    }
    return false;
  } catch (err) {
    // Si falla el lookup, dejamos entrar al wizard (best-effort).
    errorLog("[whatsapp/bot] hasCompletedWizardSurvey threw", {
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}

/** URL base pública (para QR check-in). Re-exportada desde ../utils. */

/* ------------------------------------------------------------------ */
/*  Clasificación de intents                                           */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// FIX 2026-07-05 (sesion David): extraer el primer email de un texto mas
// largo. EMAIL_RE (con anchors ^...$) solo matchea cuando el body ENTERO es
// un email. Esto rompe cuando el usuario da contexto, p.ej.:
//   "Me equivoque, es david17891@gmail.com"
//   -> EMAIL_RE.test(body) = true (detecta intent)
//   -> body.trim() = "Me equivoque, es david17891@gmail.com" (basura en DB)
//   -> Brevo rechaza email invalido al re-enviar QR.
// extractEmailFromText (en ./email-extract.ts, sin anchors) devuelve el
// primer match dentro del texto. Devuelve null si no hay match — el
// caller decide que hacer (fallback al body completo o error).
const GREETING_RE = /^(hola|hi|buenos|buenas|informaci[oó]n|info|menu|men[uú])/i;

/**
 * FIX 2026-07-09 (sesión David "abridor en lugar de disculpa"):
 * Set más amplio de openers/hola/inicio. Si el body del lead matchea
 * este regex Y tiene <=4 palabras, NO dejamos que el LLM responda
 * (porque a veces devuelve "" y caíamos al fallback frío
 * "Disculpa, no entendí"). En su lugar, disparamos el abridor
 * (welcome + botones) que siempre da contexto y ofrece opciones.
 *
 * Mantenemos `GREETING_RE` para usos donde solo queremos saludos
 * canónicos (ej. decisión de intent=greeting vs welcome según
 * primer-mensaje). `OPENER_RE` se usa SOLO como safety-net en
 * `case "question"`.
 *
 * REGRESIÓN 2026-07-09 (sesión David "otra vez con este tipo de
 * comportamientos"): el regex anterior era demasiado permisivo y
 * matcheaba prefijos, así que el botón "Info evento" (label que el
 * propio bot envía, que WhatsApp entrega como texto plano cuando
 * la sesión de 24h venció o el visitor lo escribió manual) caía
 * al safety-net y disparaba el abridor en bucle. Ahora:
 *
 *   1. SOLO incluye saludos puros (no labels de botones ni
 *      intenciones específicas como "info", "menu", "interesado",
 *      "empezar", "inicio", "comenzar", "qué tienen", "qué
 *      ofrecen"). Esos los maneja el LLM o `detectIntent`
 *      (ver `BUTTON_LABEL_TO_INTENT`).
 *   2. Acepta hasta 3 tokens extra después del opener para frases
 *      naturales como "Hola buen día" o "Qué onda Qlick".
 *   3. Anclas `^...$` con sufijo opcional de punct/emoji.
 *
 * Exportada para tests unitarios en tests/whatsapp-bot-opener.test.mjs.
 */
export const OPENER_RE =
  /^(?:hola|hi|hey|holi|hello|qu[ée]\s+tal|qu[ée]\s+onda|qu[ée]\s+hay|buen[oa]s?\s+d[íi]as?|buen[oa]s?\s+tardes|buen[oa]s?\s+noches|c[óo]mo\s+(?:est[áa]s|andas)|al[óo]|buenas|buenos)(?:\s+\S+){0,3}[.,!?\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]?$/iu;
// FIX 2026-07-02 (sesion David): respuestas afirmativas CORTAS en medio de
// una conversacion (despues de que el LLM hace una pregunta) NO deberian
// disparar el template estatico de register. Van al LLM para que mantenga
// el contexto conversacional.
//   "Si"  -> el LLM responde coherente con contexto
//   "Si, quiero inscribirme" -> sigue siendo register (tiene palabras adicionales)
//   "Ok" / "Adelante" / "Va" -> idem, van al LLM
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
 * FIX 2026-07-02 (sesion David, "Si tras pregunta cerrada"): heurística
 * para detectar si el bot acaba de hacer una pregunta CERRADA de
 * inscripción (sí/no). Si matchea, marcamos el outbound con metadata
 * `awaiting_confirmation_for_event_slug` para que el próximo affirmative
 * corto del lead salte directo al flow `interactive_event_inscribir` sin
 * pasar por el LLM (que tiende a confundirse con respuestas tan cortas
 * y termina dando fallback).
 *
 * Caso que SÍ detecta: "¿Te gustaría apartar tu lugar?" / "¿Quieres que te
 * apunte en Funnels de Venta?" / "¿Te inscribes a IA y Marketing?".
 *
 * Caso que NO detecta: preguntas abiertas tipo "¿Qué te interesa?" o
 * "¿Cuál es tu presupuesto?" (no son cerradas, no podemos inferir la
 * intención de un "Si" vago).
 *
 * `eventSlug` es el slug del evento que el bot está describiendo en el
 * contexto del mensaje. Si el bot habla de varios eventos, este helper
 * devuelve `null` y NO marcamos el outbound (mejor que el LLM mantenga
 * el control y le pida al lead que confirme cuál evento).
 */
function detectClosedConfirmationQuestion(
  text: string,
  eventSlug: string | null
): { isClosed: boolean; eventSlug: string | null } {
  const t = text.trim();
  // Cerrada = termina en "?" (con o sin signo de apertura "¿").
  const isQuestion = /\?\s*$/.test(t);
  if (!isQuestion) return { isClosed: false, eventSlug: null };
  // Debe mencionar una ACCION concreta de inscripción. La regex acepta
  // "apartar", "inscribir", "registrar", "reservar", "confirmar", con
  // sus variantes pronominales (te apunto, te inscribo, etc.).
  const hasActionWords =
    /\b(apartar|inscribir|inscribes|inscribo|inscribirme|registrar|registro|reservar|confirmar|apunto|apuntarte|apunto\s+a\s+ti)\b/i.test(
      t
    );
  if (!hasActionWords) return { isClosed: false, eventSlug: null };
  return { isClosed: true, eventSlug };
}
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
  // REGRESIÓN 2026-07-09 (sesión David "otra vez con este tipo de
  // comportamientos"): si el body matchea EXACTAMENTE el label de un
  // botón que el propio bot envía (ej. "Info evento", "Próximos
  // eventos", "Inscribirme"), redirigir al intent interactivo
  // correspondiente.
  //
  // Caso de uso: WhatsApp entrega como texto plano el label del
  // botón cuando la sesión de 24h venció (interactive reply ya no
  // aplica) o cuando el visitor escribe el texto manual en vez de
  // presionar el botón. Sin este mapeo, el body cae a `case
  // "question"` y el LLM (o el safety-net de opener) maneja mal el
  // label — termina re-disparando el abridor en lugar de procesar
  // la selección del botón.
  //
  // Este mapeo va ANTES de REGISTER_RE / OPT_OUT_RE / etc. porque
  // "Inscribirme" también matchea REGISTER_RE (palabra "inscribirme"
  // está en el set) y "No, gracias" matchearía OPT_OUT_RE por la
  // palabra "no". Queremos que el label exacto gane sobre las
  // heurísticas genéricas.
  //
  // IMPORTANTE: el case interactivo correspondiente funciona OK con
  // `buttonId === undefined` (carga el evento activo por defecto).
  const lower = text.toLowerCase();
  if (lower === "info evento") return "interactive_event_yes";
  if (lower === "próximos eventos" || lower === "proximos eventos") {
    return "interactive_show_events";
  }
  if (lower === "inscribirme" || lower === "sí, inscribirme" || lower === "si, inscribirme") {
    return "interactive_event_inscribir";
  }
  if (lower === "no, gracias" || lower === "no gracias") return "opt_out";
  // Señales fuertes: siempre ganan, incluso en primer mensaje.
  if (OPT_OUT_RE.test(text)) return "opt_out";
  // FIX 2026-07-02: respuestas afirmativas cortas (Si, Ok, Adelante, Va) en
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

/**
 * Sprint v0.9.x PR #2: wrapper sobre `detectIntent` que aplica el modo
 * `human_first`. Cuando ese modo está activo, la capa de intents rígida
 * se bypasea: solo `opt_out` (LFPDPPP) y `provide_email` (captura de
 * datos) se mantienen como gates deterministas; todo lo demás va al
 * LLM con el system prompt `buildHumanFirstPrompt`.
 *
 * Por qué mantener `opt_out` y `provide_email` aquí (y no delegar al
 * LLM):
 *   - `opt_out`: el LLM puede "negociar" o "interpretar" el opt_out,
 *     lo que viola LFPDPPP. La regex `OPT_OUT_RE` es determinista.
 *   - `provide_email`: si el LLM decide no extraer un email obvio
 *     (por su contexto o humor), perdemos un lead. La regex es
 *     determinista.
 *
 * Caso especial: el `case "register"` y `case "welcome" | "greeting"`
 * del switch principal producen **interactive buttons** (con `Info
 * evento / Próximos eventos`). El LLM en modo `human_first` NO puede
 * generar esos interactive buttons (no existe la tool). Por lo tanto,
 * "saltamos" esos intents y mandamos el mensaje al LLM como
 * `question`, que produce texto plano. Esto es la pérdida esperada
 * del modo y se documenta en `buildHumanFirstPrompt`.
 *
 * Función pura (sync). El caller pasa `isHumanFirstMode` ya resuelto
 * (lectura cacheada de `readSystemSetting`).
 *
 * Exportada para tests (pura, no toca runtime).
 */
export function resolveIntent(
  body: string,
  isFirstMessage: boolean,
  isHumanFirstMode: boolean
): BotIntent {
  if (!isHumanFirstMode) {
    return detectIntent(body, isFirstMessage);
  }
  // Modo human_first: solo opt_out, provide_email, o question.
  const text = body?.trim() ?? "";
  if (!text) return "question";
  if (OPT_OUT_RE.test(text)) return "opt_out";
  if (EMAIL_RE.test(text)) return "provide_email";
  // Cualquier otra cosa (incluyendo "Hola", "Sí quiero inscribirme",
  // "Qué incluye?") va al LLM con el prompt `human_first`.
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
    .from("lead_whatsapp_conversations")
    .upsert(
      { ...row, metadata: (row.metadata ?? null) as unknown as Json },
      { onConflict: "whatsapp_message_id", ignoreDuplicates: false },
    )
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
    .from("lead_consent_log")
    .insert({ ...row, metadata: (row.metadata ?? null) as unknown as Json });
  if (error) {
    errorLog("[whatsapp/bot] persistConsent falló", {
      code: (error as { code?: string }).code
    });
    return false;
  }
  return true;
}

/**
 * FIX 2026-07-03 (sesion David, "bot recuerda registro"): busca un
 * QR token VIGENTE existente para (lead, event) SIN crear uno nuevo.
 * Usado antes del flow de `interactive_event_inscribir` para detectar
 * si el lead YA está registrado y ofrecerle reenvío del QR en vez de
 * generar uno duplicado.
 *
 * Returns null si:
 *   - El evento no existe
 *   - El lead no tiene token para ese evento
 *   - El token existe pero ya venció
 *
 * Estrategia de busqueda: primero intenta por `attendee_phone_normalized`
 * (que es como generateQrToken guarda), luego como fallback por
 * `lead_id` (por si la migración o un seed antiguo dejó registros
 * inconsistentes). Cobertura amplia pero conservadora — no regenera.
 */
async function findActiveQrTokenForLead(
  supabase: SupabaseAdmin,
  leadId: string,
  phoneNormalized: string,
  eventSlug: string
): Promise<{ token: string; url: string; eventId: string; confirmationId: string | null } | null> {
  // 1) Resolver event_id por slug.
  const { data: evtData, error: evtErr } = await supabase
    .from("events" as never)
    .select("id")
    .eq("slug", eventSlug)
    .eq("status", "published")
    .maybeSingle();
  if (evtErr || !evtData) return null;
  const eventId = (evtData as { id: string }).id;

  // 2) Buscar token vigente del lead para este evento.
  //    FIX 2026-07-17 (sprint event-payments manual flow, David
  //    feedback): ahora también devolvemos `confirmation_id` para que
  //    el caller pueda re-validar que la confirmation existe. Antes el
  //    bot decia "ya estas registrado" si encontraba un QR token
  //    huerfano (sin confirmation), mintiendo sobre el estado del
  //    registration. Ver migration
  //    20260717063306_event_qr_tokens_confirmation_fk.sql.
  //    Prioridad: (event_id, attendee_phone_normalized) que es como
  //    `generateQrToken` guarda. Fallback a (event_id, lead_id) por
  //    si hay datos legacy.
  const { data: byPhone } = await supabase
    .from("event_qr_tokens" as never)
    .select("token, confirmation_id")
    .eq("event_id" as never, eventId)
    .eq("attendee_phone_normalized" as never, phoneNormalized)
    .gt("expires_at" as never, new Date().toISOString())
    .order("created_at" as never, { ascending: true })
    .limit(1)
    .maybeSingle();

  let token: string | null = null;
  let confirmationId: string | null = null;
  if (byPhone) {
    token = (byPhone as { token: string }).token;
    confirmationId = (byPhone as { confirmation_id: string | null }).confirmation_id ?? null;
  } else {
    // Fallback por lead_id (sin filtro de phone — útil si la fila se
    // creó con phone distinto por algun bug previo).
    const { data: byLeadId } = await supabase
      .from("event_qr_tokens" as never)
      .select("token, confirmation_id")
      .eq("event_id" as never, eventId)
      .eq("lead_id" as never, leadId)
      .gt("expires_at" as never, new Date().toISOString())
      .order("created_at" as never, { ascending: true })
      .limit(1)
      .maybeSingle();
    if (byLeadId) {
      token = (byLeadId as { token: string }).token;
      confirmationId = (byLeadId as { confirmation_id: string | null }).confirmation_id ?? null;
    }
  }

  if (!token) return null;
  const url = `${appBaseUrl()}/check-in/${token}`;
  return { token, url, eventId, confirmationId };
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
  eventSlug?: string | null,
  // FIX 2026-07-19 (sprint bot feedback E2E David, "LINK vacío" en
  // panel admin): el QR no estaba linkeado a la confirmation porque
  // el parametro confirmationId no se pasaba. Sin el link, el panel
  // admin muestra la columna LINK como vacia aunque el QR exista.
  // FIX: aceptar confirmationId opcional y setearlo en el INSERT
  // (y reusarlo si encuentra un token existente via dedup).
  confirmationId?: string | null
): Promise<{ token: string; url: string; confirmationId: string | null } | null> {
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
    // FIX P0-3 (auditoria 2026-07-02): fallback al evento MÁS PRÓXIMO
    // cronológicamente (starts_at ASC), no el más reciente (que era
    // lo que retornaba antes con ASCENDING: false). Cuando un lead se
    // registra sin contexto, lo más razonable es enviarle el QR del
    // próximo evento en el calendario, no del último que se publicó.
    const { data, error: evtErr } = await supabase
      .from("events")
      .select("id, ends_at")
      .eq("status", "published")
      // P0-3: más próximo (ASC) en vez de más reciente (DESC).
      .order("starts_at", { ascending: true })
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
    .select("token, confirmation_id")
    .eq("event_id" as never, eventId)
    .eq("attendee_phone_normalized" as never, phoneNormalized)
    .gt("expires_at" as never, new Date().toISOString())
    .order("created_at" as never, { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const existingToken = (existing as { token: string }).token;
    let existingConfirmationId = (existing as { confirmation_id: string | null }).confirmation_id ?? null;
    // FIX 2026-07-19: si el token existe pero NO tiene confirmation_id
    // (caso David: registros previos al fix) y el caller pasa uno,
    // actualizamos el token para que el panel admin muestre el link.
    if (!existingConfirmationId && confirmationId) {
      try {
        await supabase
          .from("event_qr_tokens" as never)
          .update({ confirmation_id: confirmationId } as never)
          .eq("token" as never, existingToken);
        existingConfirmationId = confirmationId;
        infoLog("[whatsapp/bot] generateQrToken: confirmation_id retroactivo aplicado", {
          token: existingToken.slice(0, 8),
          confirmationId,
        });
      } catch (updErr) {
        infoLog("[whatsapp/bot] generateQrToken: confirmation_id retroactivo fallo (no fatal)", {
          error: updErr instanceof Error ? updErr.message : String(updErr),
        });
      }
    }
    const url = `${appBaseUrl()}/check-in/${existingToken}`;
    return { token: existingToken, url, confirmationId: existingConfirmationId };
  }

  const { error } = await supabase
    .from("event_qr_tokens" as never)
    .insert({
      event_id: eventId,
      attendee_phone_normalized: phoneNormalized,
      attendee_name: attendeeName,
      attendee_email: attendeeEmail,
      token,
      expires_at: expiresAt.toISOString(),
      // FIX 2026-07-19: vincular el QR a la confirmation para que el
      // panel admin muestre el link en la columna LINK. Antes quedaba
      // null y el panel mostraba "LINK: vacio".
      ...(confirmationId ? { confirmation_id: confirmationId } : {}),
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
        const racedConfirmationId = (raced as { confirmation_id: string | null }).confirmation_id ?? null;
        const url = `${appBaseUrl()}/check-in/${racedToken}`;
        return { token: racedToken, url, confirmationId: racedConfirmationId };
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
  // FIX 2026-07-17: incluimos confirmationId en el return para que el
  // caller pueda re-validar que la confirmation existe.
  // FIX 2026-07-19: ahora pasamos el confirmationId real (no null) para
  // que el panel admin muestre el link en la columna LINK.
  const url = `${appBaseUrl()}/check-in/${token}`;
  return { token, url, confirmationId: confirmationId ?? null };
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
 * Identifica a cual evento publicado se refiere el lead, mirando:
 *   1. PRIMERO el ultimo inbound del lead (mas fuerte: lo que pidio
 *      explicitamente, ej. "quiero el de GDL").
 *   2. Si no matchea, los ultimos 3 outbound del bot en el
 *      `conversationWindow` (lo que el bot le ofrecio).
 *
 * Estrategia de matching (en orden, primer match gana):
 * 1. Slug textual (e.g. "ia-marketing-primeros-pasos")
 * 2. Indice del catalogo ([1], [2], [3]) o "el primero/segundo/tercero"
 * 3. Titulo del evento (palabras clave >3 chars)
 * 4. Location (palabras clave >3 chars)
 * 5. null si no se puede identificar
 *
 * FIX P0-2 (auditoria 2026-07-02): antes SOLO miraba outbound del bot.
 * Si el lead escribia "quiero el de GDL" y luego daba su email, ese
 * inbound con la pista explicita se ignoraba y caia al fallback del
 * primer evento published. Ahora el inbound tiene prioridad.
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

/**
 * Funcion exportada solo para tests. Ver matchShortCode arriba.
 * FIX 2026-07-05.
 */
export function _matchShortCodeForTest(
  text: string,
  allEvents: ActiveEventContext[]
): { event: ActiveEventContext; reason: string } | null {
  return matchShortCode(text, allEvents);
}

/**
 * Matchea un short_code de 4 chars base32 sin 0/1/O/I (e.g. "7A3X", "q9k1")
 * con case-insensitive. Devuelve el evento si hay match único.
 *
 * FIX 2026-07-05 (sesión David, "ya estás registrado" con título duplicado):
 * el short_code es el match más fuerte — gana sobre slug/título/location.
 * Si el lead escribe "7A3X", "7a3x", o "el 7A3X por favor", matchea
 * exacto contra ese evento y resuelve la ambigüedad sin caer al
 * fallback de "primer published por start_at".
 */
function matchShortCode(
  text: string,
  allEvents: ActiveEventContext[]
): { event: ActiveEventContext; reason: string } | null {
  // Buscar el primer token que matchee el formato 4 chars del alphabet.
  // Regex case-insensitive pero comparamos contra shortCode normalizado
  // a uppercase (que es como se guarda).
  const regex = /\b([A-HJ-NP-Z2-9]{4})\b/gi;
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) return null;

  // Mapear eventos por shortCode (uppercased) para lookup O(1).
  const byCode = new Map<string, ActiveEventContext>();
  for (const evt of allEvents) {
    if (evt.shortCode) byCode.set(evt.shortCode.toUpperCase(), evt);
  }

  // Si hay múltiples códigos en el texto (caso raro), matchear el primero
  // que exista en el catálogo. Si ninguno matchea, dev null.
  for (const m of matches) {
    const code = m[1].toUpperCase();
    const evt = byCode.get(code);
    if (evt) return { event: evt, reason: `short_code(${code})` };
  }
  return null;
}

/**
 * Helper interno: intenta matchear un texto contra los eventos
 * disponibles. Usado tanto para inbound del lead como para outbound
 * del bot.
 *
 * Jerarquía de prioridad (cada capa cae a la siguiente si no matchea):
 *   0. short_code (FIX 2026-07-05) — más fuerte: 4 chars únicos
 *   1. indice del catalogo: [N] o "el primero/segundo/..."
 *   2. slug textual
 *   3. titulo (palabras >3 chars)
 *   4. location (palabras >3 chars)
 */
function matchTextToEvent(
  text: string,
  allEvents: ActiveEventContext[]
): { event: ActiveEventContext; reason: string } | null {
  const body = text.toLowerCase();

  // 0) FIX 2026-07-05: short_code del evento (4 chars base32).
  // Matchea ANTES que cualquier otra heurística porque es el único
  // identificador canónico (no ambiguo) que sobrevive renames y
  // duplicados de título.
  const codeMatch = matchShortCode(text, allEvents);
  if (codeMatch) return codeMatch;

  // 1) Indice del catalogo: [N] o "el primero/segundo/tercero".
  const allIndices = [...body.matchAll(/\[(\d+)\]/g)];
  if (allIndices.length === 1) {
    const idx = parseInt(allIndices[0][1], 10) - 1;
    if (idx >= 0 && idx < allEvents.length) {
      return { event: allEvents[idx], reason: "index" };
    }
    // P1-4: idx fuera de rango. Antes silently fail; ahora warn.
    debugLog("[whatsapp/bot] findEventInConversation: idx fuera de rango", {
      idx,
      totalEvents: allEvents.length
    });
    return null;
  }
  if (allIndices.length > 1) {
    // Lista de eventos — no es una confirmacion. El caller decide.
    return null;
  }
  const ordMatch = body.match(/el\s+(primero|segundo|tercero|cuarto|quinto)/);
  if (ordMatch) {
    let idx = 0;
    if (ordMatch[0].includes("primero")) idx = 0;
    else if (ordMatch[0].includes("segundo")) idx = 1;
    else if (ordMatch[0].includes("tercero")) idx = 2;
    else if (ordMatch[0].includes("cuarto")) idx = 3;
    else if (ordMatch[0].includes("quinto")) idx = 4;
    if (idx >= 0 && idx < allEvents.length) {
      return { event: allEvents[idx], reason: "ordinal" };
    }
  }

  // FIX 2026-07-02 (sesion David, "register dispara QR equivocado"):
  // David escribio "si el 2, me puedes inscribir..." y el bot genero
  // el QR del evento equivocado (IA y Marketing en vez de Ads en Meta).
  // El matchTextToEvent no matcheaba porque:
  //   - No hay [2] en el body (escrito como "el 2" sin brackets)
  //   - El ordinal "el segundo" no aparece (solo "el 2")
  //   - El slug ni el titulo del evento 2 aparecen en "si el 2..."
  //
  // Fix: detectar NUMERO SUELTO o casi-suelto al inicio del body
  // (ej. "si el 2", "el 2", "2,", "2 -", "2."). Si matchea un
  // indice valido del catalogo, retornamos ese evento.
  // Heuristica conservadora: el numero debe estar en los primeros
  // 15 chars del body para evitar falsos positivos ("hay 2 eventos" no matchearia).
  const numMatch = body
    .slice(0, 15)
    .match(/(?:^|el\s+|si\s+)(\d+)\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < allEvents.length) {
      return { event: allEvents[idx], reason: "número en inicio" };
    }
  }

  // 2) Slug textual
  for (const evt of allEvents) {
    if (body.includes(evt.slug.toLowerCase())) {
      return { event: evt, reason: "slug" };
    }
  }

  // 3) Titulo del evento (palabras >3 chars)
  for (const evt of allEvents) {
    const titleWords = evt.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const matchCount = titleWords.filter((w) => body.includes(w)).length;
    if (matchCount >= 1) {
      return { event: evt, reason: `title(${matchCount})` };
    }
  }

  // 4) Location (palabras >3 chars)
  for (const evt of allEvents) {
    const locWords = evt.location
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((w) => w.length > 3);
    const matchCount = locWords.filter((w) => body.includes(w)).length;
    if (matchCount >= 1) {
      return { event: evt, reason: `location(${matchCount})` };
    }
  }

  return null;
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

  // P0-2 (auditoria 2026-07-02): el ULTIMO INBOUND del lead tiene
  // prioridad. Si el lead escribió "quiero el de GDL", ese texto
  // es la fuente de verdad más fuerte.
  const lastInbound = [...conversationWindow.messages]
    .reverse()
    .find((m) => m.direction === "inbound" && m.body);
  if (lastInbound?.body) {
    const matched = matchTextToEvent(lastInbound.body, allEvents);
    if (matched) {
      debugLog("[whatsapp/bot] findEventInConversation: match en inbound", {
        reason: matched.reason,
        slug: matched.event.slug
      });
      return matched.event;
    }
  }

  // Ultimos 3 outbound del bot (mas reciente primero). Si el inbound
  // no matchea (poco probable), cae a lo que el bot ofreció.
  const botMessages = conversationWindow.messages
    .filter((m) => m.direction === "outbound" && m.body)
    .slice(-3)
    .reverse();

  for (const msg of botMessages) {
    const matched = matchTextToEvent(msg.body ?? "", allEvents);
    if (matched) {
      // Si hay multiples [N] en el body (lista de eventos), matchTextToEvent
      // retorna null — es lo que queremos, dejamos que el LLM aclare.
      debugLog("[whatsapp/bot] findEventInConversation: match en outbound", {
        reason: matched.reason,
        slug: matched.event.slug
      });
      return matched.event;
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
  // FIX 2026-07-06 (debug David "david martinez" ignorado): la migration
  // leads_name_length_check exige name >= 2 chars (o NULL). Antes este
  // helper insertaba name="" cuando WhatsApp no provee nombre, lo que
  // viola el check (23514) y hace que el bot caiga al fallback con
  // lead.id=null (el flow entero queda roto). Ahora usamos un placeholder
  // que pasa el check. El handler provide_name lo actualiza al nombre
  // real cuando el lead lo da.
  //
  // FIX 2026-07-14 (Sprint v0.10 Bloque 1): stripInvisibleChars como
  // defense in depth. El entry point de processInboundMessage ya
  // sanitiza el contactName, pero si este helper es invocado por otro
  // path en el futuro (refactor, test directo, admin tool), no debería
  // persistir ZWSP/ZWNJ/ZWJ/BOM/word-joiner en `leads.name`.
  const safeName = stripInvisibleChars(contactName).trim() || "WhatsApp Lead";
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
        // FIX 2026-07-14 (Sprint v0.10 Bloque 1): defense in depth.
        name: stripInvisibleChars(contactName).trim() || "",
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
  // `findLeadByPhone` ya impone timeout + retry internamente. Mantener otra
  // carrera aquí vencía antes del retry (5s externos vs. ~6.2s internos),
  // generaba un falso timeout y disparaba un INSERT innecesario en cada
  // consulta lenta. Dejamos que el helper centralizado decida cuándo cae al
  // fallback de creación; así evitamos dos relojes de timeout superpuestos.
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] findOrCreateLead: querying findLeadByPhone");
  const existing = await findLeadByPhone(phoneNormalized);
  // eslint-disable-next-line no-console
  debugLog("[whatsapp/bot] findLeadByPhone result", {
    found: Boolean(existing),
    fallbackCreate: existing === null
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
  send: () => Promise<{ ok: boolean; externalId?: string; demo?: boolean; note?: string }>;
  /** Tipo de respuesta (para la fila outbound). */
  kind: "template" | "text" | "interactive";
  /** Body que se persistirá en lead_whatsapp_conversations. */
  body: string;
  /** Nombre de template (si kind=template). */
  templateName?: string;
  /** Mensaje interactivo (si kind=interactive). */
  interactive?: import("../whatsapp/providers/whatsapp-provider").InteractiveMessage;
  /**
   * FIX 2026-07-02 (Commit A): metadata a persistir en el outbound.
   * Usado por state machine (ej. awaiting_field='name' del flow
   * secuencial nombre → email). El bot-engine consulta este flag en
   * el siguiente turno para detectar el intent correcto.
   */
  metadata?: Record<string, unknown>;
}

/**
 * FIX 2026-07-09 (sesión David "abridor en lugar de disculpa"):
 * Construye el plan del abridor (saludo + interactive con botones).
 * Mismo template que ya usaba `case "welcome" | "greeting"`,
 * extraído a función pura para reusarlo desde el safety-net del
 * `case "question"` (cuando el body matchea OPENER_RE).
 */
async function buildOpenerPlan(args: {
  provider: Awaited<ReturnType<typeof getActiveWhatsAppProvider>>;
  phoneNormalized: string;
  firstName: string;
  body?: string;
}): Promise<OutboundPlan> {
  const { provider, phoneNormalized, firstName, body } = args;
  // FIX 2026-07-02 (sesion David): cargamos el activeEvent REAL de DB
  // (no el placeholder de env vars que mostraba eventos que no
  // existian). Si no hay evento en DB, mostramos solo el saludo
  // + botones (sin la linea "Evento activo: ...").
  const realActiveEvent = await loadActiveEventContext().catch(() => null);
  // FIX 2026-07-02: filtrar placeholders obvios en firstName. Si el
  // lead tiene name="Por" (data legacy del primer test) o vacio,
  // no le llamamos por nombre. Ver constante de módulo PLACEHOLDER_NAMES.
  const clean = cleanFirstName(firstName);
  const saludo = clean ? `¡Hola ${clean}!` : "¡Hola!";

  // FIX auditoria 2026-07-15f (sesion David E2E #1, "Info evento sobra
  // si hay 1 solo evento"): si SOLO hay 1 evento publicado, el
  // paso intermedio "Info evento" no aporta — el lead tiene que
  // tocar 2 botones para llegar a "Inscribirme". Saltamos directo
  // a "Inscribirme <evento>" con el slug embebido en el buttonId.
  // Si hay 2+ eventos, mantenemos el boton "Info evento" + "Próximos
  // eventos" (el lead debe elegir primero cuál le interesa).
  const allActiveEventsForOpener = await loadAllActiveEvents().catch(
    () => [] as ActiveEventContext[]
  );

  // PARCHE TEMPORAL (HOY - Campaña activada antes de crear evento):
  // Si no hay eventos activos publicados en DB, pedir directamente los datos del lead.
  if (allActiveEventsForOpener.length === 0) {
    if (!clean) {
      const bodyText = `${saludo} Soy Qlick, asistente de Qlick Marketing Digital. Gracias por escribirnos.\n\nPor el momento no tenemos eventos próximos publicados. Estamos registrando a los interesados para ponernos en contacto directo contigo a la brevedad. Para enviarte toda la información, ¿nos podrías compartir tu nombre completo?`;
      return {
        kind: "text",
        body: bodyText,
        metadata: { awaiting_field: "name" },
        send: () => provider.send({ to: phoneNormalized, body: bodyText })
      };
    } else {
      const bodyText = `${saludo} Para ponernos en contacto contigo a la brevedad y brindarte toda la información, ¿nos podrías compartir tu correo electrónico?`;
      return {
        kind: "text",
        body: bodyText,
        metadata: { awaiting_field: "email" },
        send: () => provider.send({ to: phoneNormalized, body: bodyText })
      };
    }
  }

  const singleEventShortcut =
    realActiveEvent &&
    realActiveEvent.source === "db" &&
    allActiveEventsForOpener.length === 1
      ? realActiveEvent
      : null;

  const detailedInfo = singleEventShortcut && isEventInfoRequest(body)
    ? buildEventInfoCopy(singleEventShortcut)
    : null;

  const eventLine =
    realActiveEvent && realActiveEvent.source === "db"
      ? `\n\nPróximo evento: ${realActiveEvent.title} (${realActiveEvent.humanStartsAt})` +
        // FIX 2026-07-16 (sprint pago-en-puerta): si el evento es de
        // pago, lo decimos en el welcome para que el lead NO se inscriba
        // pensando que es gratis. Antes el "Marketing + IA para
        // Emprendedores (Copia - Pago)" tenía el sufijo raro entre
        // paréntesis y el lead no entendía.
        (realActiveEvent.priceMxn && realActiveEvent.priceMxn > 0
          ? ` — evento de pago ($${realActiveEvent.priceMxn} MXN)`
          : "")
      : "";
  const interactive = singleEventShortcut
    ? {
        type: "button" as const,
        body: {
          text: detailedInfo
            ? `${detailedInfo}\n\n¿Quieres apartar tu lugar?`
            : `${saludo} Soy Qlick, asistente de Qlick Marketing Digital. ¿Te interesa "${singleEventShortcut.title}"?${eventLine}`,
        },
        action: {
          buttons: [
            {
              type: "reply" as const,
              reply: {
                id: `evt_inscribir_${singleEventShortcut.slug}`,
                title: "Inscribirme",
              },
            },
            {
              type: "reply" as const,
              reply: { id: "show_events", title: "Próximos eventos" },
            },
          ],
        },
        footer: { text: "Toca Inscribirme o escribe tu pregunta" },
      }
    : {
        type: "button" as const,
        body: {
          text: `${saludo} Soy Qlick, asistente de Qlick Marketing Digital. ¿Qué te interesa?${eventLine}`,
        },
        action: {
          buttons: [
            {
              type: "reply" as const,
              reply: { id: "evt_yes_next", title: "Info evento" },
            },
            {
              type: "reply" as const,
              reply: { id: "show_events", title: "Próximos eventos" },
            },
          ],
        },
        footer: { text: "Responde con un botón o escribe tu pregunta" },
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
        interactive,
      }),
  };
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
  /** ID del boton clickeado por el lead (solo aplica cuando message.type ===
   * "interactive" y buttonId viene en el webhook de Meta). Lo usamos para
   * extraer el slug del evento cuando el lead selecciona uno especifico de
   * un button o list message (e.g. "evt_yes_ia-marketing-primeros-pasos").
   * NULL para mensajes de texto libres. */
  buttonId?: string | null;
  /** Slug del evento sobre el que el bot preguntó "¿Te gustaría...?". Lo
   *  seteamos desde processInboundMessage cuando detectamos que el último
   *  outbound del bot fue una pregunta cerrada de inscripción
   *  (awaiting_confirmation_for_event_slug en metadata) y el lead respondió
   *  con un affirmative corto. Asi el handler `interactive_event_inscribir`
   *  sabe a qué evento inscribir sin tener que re-preguntar. NULL si el
   *  flow no viene de un affirmative corto. */
  requestedEventSlug?: string | null;
  /** Estado del wizard nativo de encuesta (Fase 7d). Extraído por
   *  processInboundMessage del metadata del último outbound. Los handlers
   *  `survey_qN_*` lo usan para saber dónde quedó el wizard y continuar
   *  desde ahi sin re-leer DB.
   *
   * FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm): agregamos
   * `questions?: SurveyQuestion[]` para que los handlers puedan
   * construir el siguiente paso con `buildDynamicSurveyStep`
   * sin re-leer DB ni asumir shape legacy (q1/q2/q3/q4 fijos).
   * Opcional para retrocompat con metadata legacy. */
  surveyState?: {
    step: number;
    eventId: string | null;
    eventTitle: string | null;
    answers: SurveyAnswers;
    questions?: SurveyQuestion[];
  } | null;
  /** Cliente supabase service-role. Lo pasamos para que los handlers
   *  wizard_qN_* puedan persistir (insert en event_surveys + update
   *  leads) sin tener que re-crear la conexión. NULL en modo demo. */
  supabase?: SupabaseAdmin | null;
  /**
   * Evento del registro detectado (migration 20260707000000). Lo pasa
   * processInboundMessage cuando hace match con findEventInConversation.
   * Útil para que el handler `provide_email` sepa si el evento es virtual
   * o híbrido y mande el link streaming en vez del QR pass.
   */
  registrationEvent?: import("../ai/event-context-loader").ActiveEventContext | null;
  /**
   * FIX 2026-07-07 (sesion David "captura desordenada"): si el último
   * outbound del bot tenía metadata.awaiting_field='name' o 'email',
   * propagamos ese estado al handler `question` para que el bot NO
   * pierda el flow de captura cuando el lead hace una pregunta
   * intermedia. Si el LLM responde, el outbound mantiene el
   * awaiting_field pendiente y el próximo turno entra de nuevo como
   * provide_name / provide_email.
   */
  pendingAwaitingField?: string | null;
}): Promise<OutboundPlan> {
  const { intent, lead, body, phoneNormalized, buttonId, supabase, registrationEvent } = args;
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
      // Cuerpo extraído a `buildOpenerPlan` para reuso desde el
      // safety-net del `case "question"` (ver OPENER_RE).
      return buildOpenerPlan({ provider, phoneNormalized, firstName, body });
    }
    case "register": {
      // FIX 2026-07-08 (sesion David, "Quiero registrarme" salta directo a pedir nombre):
      // Cuando el lead dice "Quiero registrarme" / "Registrame" /
      // "Me apunto" sin haber dado nombre, el `detectIntent` lo
      // clasifica como intent="register" (matchea REGISTER_RE). Antes
      // el handler register mostraba un LIST de eventos para que el
      // lead eligiera uno — pero los LISTs en WhatsApp son friccion:
      // la mayoria de los leads no toca los botones, manda otro texto
      // libre. El bot terminaba en un loop de LIST → LLM → "Hola
      // WhatsApp" cada vez.
      //
      // Fix: si el lead NO tiene nombre (placeholder) Y el body
      // matchea `matchInscriptionIntent` (afirmativo aislado, o
      // afirmativo+verbo, o frase directa de inscripcion), skipear
      // el LIST y disparar el mismo plan que `interactive_event_inscribir`:
      // pedir nombre completo + set `awaiting_field="name"` en metadata.
      //
      // Si el lead YA tiene nombre, mantener el flow original (LIST de
      // eventos) — eso sigue siendo util para que el lead elija a cual
      // evento inscribirse.
      const cleanLeadNameForRegister = cleanFirstName(firstName);
      if (cleanLeadNameForRegister === "" && matchInscriptionIntent(body)) {
        const evtRealRegister = await loadActiveEventContext(
          args.requestedEventSlug ?? undefined
        ).catch(() => null);
        if (!evtRealRegister || evtRealRegister.source === "no_events") {
          const evtFb = getActiveEvent();
          if (evtFb.source === "no_events") {
            const noEvents = noEventsText();
            return {
              kind: "text",
              body: noEvents,
              send: () =>
                provider.send({ to: phoneNormalized, body: noEvents })
            };
          }
        }
        const evtFb = getActiveEvent();
        const evtName = evtRealRegister?.title ?? evtFb.name;
        const evtDate = evtRealRegister?.humanStartsAt ?? evtFb.date;
        const bodyText =
          `¡Hola! Para inscribirte a "${evtName}" el ${evtDate}, ` +
          `primero dime tu nombre completo. Después te pido tu email.`;
        return {
          kind: "text",
          body: bodyText,
          metadata: { awaiting_field: "name" },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      // FIX 2026-07-02 (sesion David, "register hardcodea placeholder"):
      // antes este caso listaba UN solo evento hardcoded desde
      // `getActiveEvent()` (placeholder de env vars: "IA y Marketing
      // Basico / 6 de julio / Ciudad de Mexico"). Resultado: cuando
      // David decia "si el 2, inscribime" y el bot disparaba `register`,
      // veia solo el placeholder, no los 3 eventos reales. Ademas, el
      // `evt_<name>` row.id generado no matcheaba ningun case en
      // processInboundMessage (cai'a a `question` y el LLM tomaba control).
      //
      // Fix: cargar TODOS los eventos publicados y armar un list
      // message con uno por row. Usamos el slug real en row.id con el
      // prefijo `evt_info_` para que processInboundMessage lo matchee
      // correctamente con `interactive_event_yes` (despues mi handler
      // carga el evento por slug via loadActiveEventContext).
      const allEvents = await loadAllActiveEvents().catch(() => [] as ActiveEventContext[]);
      if (allEvents.length === 0) {
        // FIX 2026-07-07 (audit David "bot presenta evento fantasma"):
        // si tampoco hay env vars reales seteadas, respondemos con copy
        // honesto. Antes caía al placeholder hardcoded "IA y Marketing
        // Básico / 6 de julio / Ciudad de México" que comprometia
        // leads con un evento que no existía.
        const evtFb = getActiveEvent();
        if (evtFb.source === "no_events") {
          const noEvents = noEventsText();
          return {
            kind: "text",
            body: noEvents,
            send: () => provider.send({ to: phoneNormalized, body: noEvents })
          };
        }
        const evt = evtFb;
        const interactive = {
          type: "list" as const,
          body: {
            text: `Tenemos estos eventos próximos. Elige el que te interesa para más info:`
          },
          action: {
            button: "Próximos eventos",
            sections: [
              {
                title: "Próximos eventos",
                rows: [
                  {
                    id: `evt_info_${evt.name.replace(/\s+/g, "_").toLowerCase().slice(0, 30)}`,
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
      const sections = [
        {
          title: "Próximos eventos",
          rows: allEvents.slice(0, 10).map((evt) => {
            // FIX 2026-07-05 (sesión David, ya-estas-registrado por título
            // duplicado): incluimos el short_code (4 chars) en la
            // descripción del row para que el lead pueda identificar el
            // evento sin ambigüedad si hay títulos similares. Formato:
            // "<fecha> · <lugar> · <código>".
            const codePart = evt.shortCode ? ` · ${evt.shortCode}` : "";
            return {
              id: `evt_info_${evt.slug}`,
              title: evt.title.slice(0, 24),
              description: `${evt.humanStartsAt} · ${evt.location}${codePart}`.slice(0, 72)
            };
          })
        }
      ];
      const interactive = {
        type: "list" as const,
        body: {
          text: allEvents.length === 1
            ? "Tenemos este evento próximo. Elígelo para más info:"
            : `Tenemos ${allEvents.length} eventos próximos. Elige el que te interesa para más info:`
        },
        action: {
          button: "Próximos eventos",
          sections
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
        body: "Listo, no te contacto más. Si cambias de opinión, escríbenos.",
        send: () =>
          provider.send({
            to: phoneNormalized,
            body:
              "Listo, no te contacto más. Si cambias de opinión, escríbenos."
          })
      };
    }
    case "interactive_event_yes": {
      // Fase 7a.5: el usuario clickeó "Info evento" en el welcome o un
      // botón específico de un evento en el list de "Ver eventos".
      // Devolvemos los detalles del evento + un botón "Inscribirme" para
      // que el siguiente paso sea explícito (en vez de texto abierto
      // "mandame tu email").
      //
      // FIX 2026-07-02 (sesion David): cargar el activeEvent real de DB.
      // Si no hay, mensaje generico en vez de placeholder de env vars.
      //
      // FIX 2026-07-02 (sesion David, "Ver eventos muestra los 3"):
      // cuando el lead selecciona un evento específico del button message
      // "Ver eventos" (buttonId = "evt_yes_<slug>"), usamos ESE slug
      // en `loadActiveEventContext(slug)` en vez del activeEvent por defecto.
      // Sin esto, mostraríamos siempre el primer evento published.
      let requestedSlug: string | undefined;
      if (
        buttonId &&
        buttonId.startsWith("evt_yes_") &&
        buttonId !== "evt_yes_next"
      ) {
        requestedSlug = buttonId.slice("evt_yes_".length);
      }
      const evt = await loadActiveEventContext(requestedSlug).catch(() => null);
      // FIX 2026-07-07 (audit David "bot presenta evento fantasma"):
      // si NO hay evento real (DB sin published o env vars no seteadas),
      // respondemos con copy honesto y NO armamos un evento ficticio.
      // Antes caía al placeholder "IA y Marketing Básico / 6 de julio".
      if (!evt || evt.source === "no_events") {
        const fallback = getActiveEvent();
        if (fallback.source === "no_events" || !evt) {
          const noEvents = noEventsText();
          return {
            kind: "text",
            body: noEvents,
            send: () => provider.send({ to: phoneNormalized, body: noEvents })
          };
        }
      }
      const evtFallback = getActiveEvent();
      const evtName = evt?.title ?? evtFallback.name;
      const evtDate = evt?.humanStartsAt ?? evtFallback.date;
      const evtLoc = evt?.location ?? evtFallback.location;
      const evtDur = evt?.humanDuration ?? evtFallback.duration;
      const evtSlug = evt?.slug ?? evtFallback.name.toLowerCase().replace(/\s+/g, "_");
      // FIX 2026-07-05 (sesión David, ya-estas-registrado por título duplicado):
      // mostramos el short_code en el detalle del evento. Si el lead
      // tiene varios eventos "Pinguinos" y quiere uno específico, puede
      // decir "el 7A3X" en vez del nombre largo.
      const codePart = evt?.shortCode ? ` · código ${evt.shortCode}` : "";
      const eventInfoText = evt?.source === "db"
        ? buildEventInfoCopy(evt)
        : `📅 ${evtName}${codePart}\n🗓 ${evtDate} · 📍 ${evtLoc} · ⏱ ${evtDur}`;
      const interactive = {
        type: "button" as const,
        body: {
          text: `${eventInfoText}\n\n¿Listo para inscribirte?`
        },
        action: {
          buttons: [
            {
              type: "reply" as const,
              reply: {
                id: `evt_inscribir_${evtSlug}`,
                title: "Inscribirme"
              }
            }
          ]
        },
        footer: {
          text: "Inscribirme te pide tu email por aquí"
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
      // FIX 2026-07-06 (sesion David, "no me sirve la opcion de no
      // requerir nombres"): TODO lead debe tener nombre real. Se
      // elimina la rama condicional `if (requiresName)`. El bot
      // SIEMPRE pide nombre completo antes del email, sin importar
      // el flag del evento.
      //
      // Migracion 20260706120000_force_name_capture_and_default.sql
      // cambia el default de requires_name a true y backfillea
      // eventos existentes. El flag queda en DB por compatibilidad
      // (algunos lugares lo siguen leyendo) pero ya no controla el
      // flow del bot.
      //
      // FIX 2026-07-02 (sesion David): cargamos el activeEvent real de
      // DB (no el placeholder de env vars).
      //
      // FIX 2026-07-02 (sesion David, "Si tras pregunta cerrada"):
      // si el handler se invoca desde un affirmative corto,
      // `requestedEventSlug` viene con el slug del evento sobre el que
      // el bot preguntó. Lo usamos para inscribir al evento correcto.
      //
      // FIX auditoria 2026-07-15f (sesion David E2E #1, "Inscribirme
      // no responde"): antes SOLO se usaba `args.requestedEventSlug`,
      // que es `undefined` cuando el lead hace click en el botón
      // `evt_inscribir_<slug>` (la línea 4847 seteaba el intent pero
      // NO extraía el slug del buttonId). Resultado: el bot cargaba el
      // active event por defecto (a veces ninguno) o el equivocado.
      // FIX: extraemos el slug del buttonId con prioridad sobre
      // `args.requestedEventSlug`.
      const evtSlugFromBtn = args.buttonId?.startsWith("evt_inscribir_")
        ? args.buttonId.slice("evt_inscribir_".length)
        : null;
      const targetEventSlug = evtSlugFromBtn ?? args.requestedEventSlug ?? null;
      // DEBUG auditoria 2026-07-15f (E2E #2 "Inscribirme sigue sin
      // responder"): log a stderr (vía errorLog) para que aparezca
      // en el dev-err.log. Si esto no se loggea, significa que el
      // case del switch NI SE EJECUTA.
      errorLog("[whatsapp/bot] interactive_event_inscribir START", {
        leadId: lead.id,
        buttonId: args.buttonId,
        evtSlugFromBtn,
        targetEventSlug,
        leadName: lead.name,
        firstName,
        hasSupabase: !!supabase,
        phoneNormalized,
      });
      const evtReal = await loadActiveEventContext(targetEventSlug ?? undefined).catch((err) => {
        errorLog("[whatsapp/bot] interactive_event_inscribir: loadActiveEventContext throw", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      });
      errorLog("[whatsapp/bot] interactive_event_inscribir: evtReal loaded", {
        targetEventSlug,
        evtRealTitle: evtReal?.title ?? null,
        evtRealSource: evtReal?.source ?? null,
        evtRealSlug: evtReal?.slug ?? null,
        evtRealId: evtReal?.id ?? null,
      });
      // FIX 2026-07-07 (audit David "bot presenta evento fantasma"):
      // si NO hay evento real (slug invalido o env vars no seteadas),
      // respondemos con copy honesto en vez de comprometer al lead con
      // un evento ficticio.
      if (!evtReal || evtReal.source === "no_events") {
        const fallback = getActiveEvent();
        if (fallback.source === "no_events" || !evtReal) {
          const noEvents = noEventsText();
          return {
            kind: "text",
            body: noEvents,
            send: () => provider.send({ to: phoneNormalized, body: noEvents })
          };
        }
      }
      const evtFallback = getActiveEvent();
      const evtName = evtReal?.title ?? evtFallback.name;
      const evtDate = evtReal?.humanStartsAt ?? evtFallback.date;

      // FIX auditoria 2026-07-15f (sesion David E2E #1, "Inscribirme
      // no responde / me pide email de nuevo"): si el lead YA está
      // registrado en este evento (tiene QR token vigente), le mandamos
      // el plan "ya estás registrado" con el link de check-in, en vez
      // de pedirle email otra vez. Esto evita la fricción del flow
      // duplicado cuando David ya completó el registro en una sesión
      // anterior y vuelve a hacer click en "Inscribirme".
      if (supabase && lead.id && evtReal?.id) {
        try {
          errorLog("[whatsapp/bot] interactive_event_inscribir: checking existingToken", {
            leadId: lead.id,
            eventId: evtReal.id,
            eventSlug: evtReal.slug,
            phoneNormalized,
          });
          // FIX auditoria 2026-07-15f (E2E #2): pasar evtReal.slug
          // (no evtReal.id) — la firma de findActiveQrTokenForLead
          // espera el slug y hace `eq("slug", ...)` internamente.
          // Antes pasaba evtReal.id (UUID) y la query no matcheaba,
          // devolviendo null, y caia al flow de "pedir email".
          // Por eso el bot parecia "no responder" (si David veia
          // que SI responde pidiendo email, era este bug).
          const existingToken = await findActiveQrTokenForLead(
            supabase,
            lead.id,
            phoneNormalized,
            evtReal.slug ?? "",
          );
          errorLog("[whatsapp/bot] interactive_event_inscribir: existingToken result", {
            leadId: lead.id,
            eventId: evtReal.id,
            hasToken: !!existingToken,
            tokenUrl: existingToken?.url,
          });
          if (existingToken) {
            // FIX 2026-07-17 (sprint event-payments manual flow, David
            // feedback): antes el bot decia "ya estas registrado" al
            // encontrar un QR token huerfano (sin confirmation). Ahora
            // re-validamos: leemos la confirmation via confirmation_id
            // del QR. Si no existe o el lead la borro, el QR es
            // huerfano y continuamos el flow normal (crear nueva
            // confirmation). Tambien leemos el payment_status para
            // agregar copy dinamico al mensaje.
            let confRow: { id: string; payment_status: string | null } | null = null;
            if (existingToken.confirmationId && supabase) {
              const { data: confData } = await supabase
                .from("event_confirmations" as never)
                .select("id, payment_status")
                .eq("id" as never, existingToken.confirmationId)
                .maybeSingle();
              confRow = confData as { id: string; payment_status: string | null } | null;
            }
            if (!confRow) {
              // QR huerfano: el bot no debe mentir. Continuamos con el
              // flow normal de pedir email.
              errorLog("[whatsapp/bot] interactive_event_inscribir: QR huerfano (sin confirmation), cayendo a flow normal", {
                leadId: lead.id,
                eventId: evtReal.id,
                qrToken: existingToken.token,
                qrConfirmationId: existingToken.confirmationId,
              });
            } else {
              const evtCodeLabel = evtReal.shortCode ? ` (código ${evtReal.shortCode})` : "";
              const cleanAlready = cleanFirstName(firstName);
              const saludoAlready = cleanAlready ? `¡Hola ${cleanAlready}!` : "¡Hola!";
              // Copy dinamico segun payment_status.
              const ps = confRow.payment_status ?? "pending";
              const paymentLine = ps === "paid" || ps === "paid_manual"
                ? `\n\n✅ Tu pago está confirmado.`
                : ps === "pending"
                  ? `\n\n⚠️ Tu pago está pendiente. Te paso el link para apartar tu lugar: ` +
                    `${appBaseUrl()}/pagar/evento/${evtReal.slug}?confirmation=${confRow.id}&payment_option=reservation`
                  : ps === "pending_verification"
                    ? `\n\n⏳ Estamos verificando tu pago. Te avisamos cuando esté listo.`
                    : ps === "revoked"
                      ? `\n\n❌ Tu pago fue revocado. Contactános para más info.`
                      : "";
              const bodyText =
                `${saludoAlready} Ya estás registrado en *${evtName}*${evtCodeLabel}. ` +
                `Tu pase (link de check-in) es:\n\n${existingToken.url}` +
                paymentLine;
              errorLog("[whatsapp/bot] interactive_event_inscribir: returning already_registered plan", {
                leadId: lead.id,
                paymentStatus: ps,
                bodyText: bodyText.slice(0, 100),
              });
              return {
                kind: "text",
                body: bodyText,
                send: () => provider.send({ to: phoneNormalized, body: bodyText })
              };
            }
          }
        } catch (err) {
          errorLog("[whatsapp/bot] interactive_event_inscribir: check already_registered falló", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      errorLog("[whatsapp/bot] interactive_event_inscribir: NO existing token, falling through to email/name prompt", {
        leadId: lead.id,
        supabaseNull: !supabase,
        leadIdNull: !lead.id,
        evtRealIdNull: !evtReal?.id,
      });

      // FIX 2026-07-02: filtrar firstName de placeholders.
      const clean = cleanFirstName(firstName);
      const saludo = clean ? `¡Excelente ${clean}!` : "¡Excelente!";
      // FIX 2026-07-09 noche (sesión David "fricción UX"): si el lead YA
      // tiene nombre válido (no placeholder), saltamos directo a email.
      // Antes siempre pedía nombre, generando fricción cuando el admin
      // pre-cargaba el lead o el lead ya se había identificado en otro
      // flujo. El state-machine secuencial sigue siendo nombre → email,
      // solo que no repetimos el paso de nombre cuando ya tenemos uno.
      const nextField = clean ? "email" : "name";
      const nextPrompt = clean
        ? "dime tu email y te mando tu pase."
        : "primero dime tu nombre completo. Después te pido tu email.";
      // FIX 2026-07-06: el bot pide nombre antes del email cuando aún
      // no lo tiene (ver FIX 2026-07-09 arriba para el caso contrario).
      const bodyText =
        `${saludo} Para inscribirte a "${evtName}" el ${evtDate}, ${nextPrompt}`;
      return {
        kind: "text",
        body: bodyText,
        // FIX 2026-07-02 (Commit A): metadata para que processInboundMessage
        // persista el awaiting_field. El bot-engine consulta este flag en
        // el siguiente turno para detectar el intent correspondiente
        // (`provide_name` si awaiting_field="name", `provide_email` si
        // awaiting_field="email").
        metadata: { awaiting_field: nextField },
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
      //
      // FIX 2026-07-02 (sesion David, "Ver eventos muestra los 3"):
      // cuando hay 1-3 eventos publicados, mandamos un BUTTON MESSAGE
      // (3 botones max en Meta) con un botón por evento, así el lead
      // ve los nombres directo sin tener que abrir un menú aparte.
      // Cuando hay 4+ eventos, caemos al LIST MESSAGE (Meta limita
      // a 10 rows por sección) para que el lead pueda elegir cualquiera.
      const allEvents = await loadAllActiveEvents().catch(() => [] as ActiveEventContext[]);
      if (allEvents.length === 0) {
        // PARCHE TEMPORAL (HOY - Campaña activada antes de crear evento):
        // Pedir los datos al lead para ponernos en contacto directo.
        const clean = cleanFirstName(firstName);
        const saludo = clean ? `¡Hola ${clean}!` : "¡Hola!";
        if (!clean) {
          const bodyText = `${saludo} Gracias por escribirnos a Qlick Marketing Digital.\n\nPor el momento estamos registrando los datos de las personas interesadas para ponernos en contacto directo contigo. Para enviarte la información, ¿nos podrías compartir tu nombre completo?`;
          return {
            kind: "text",
            body: bodyText,
            metadata: { awaiting_field: "name" },
            send: () => provider.send({ to: phoneNormalized, body: bodyText })
          };
        } else if (!lead.email || isPlaceholderNameUI(lead.email)) {
          const bodyText = `${saludo} Para ponernos en contacto contigo a la brevedad y brindarte toda la información, ¿nos podrías compartir tu correo electrónico?`;
          return {
            kind: "text",
            body: bodyText,
            metadata: { awaiting_field: "email" },
            send: () => provider.send({ to: phoneNormalized, body: bodyText })
          };
        } else {
          const bodyText = `${saludo} Ya tenemos registrados tus datos. Un asesor de nuestro equipo de Qlick Marketing Digital se pondrá en contacto contigo a la brevedad. ¡Que tengas un excelente día!`;
          return {
            kind: "text",
            body: bodyText,
            send: () => provider.send({ to: phoneNormalized, body: bodyText })
          };
        }
      }
      // 1-3 eventos → LIST MESSAGE con título (24 chars) + descripción
      // (72 chars). Meta limita button titles a 20 chars (quedaban
      // cortados como "IA y Marketing: Pri."). List message da más
      // espacio y se ve más limpio.
      // FIX 2026-07-03 (sesion David, "botones cortados"): antes este
      // path mandaba BUTTON MESSAGE con títulos truncados a 20 chars.
      // Resultado: "IA y Marketing: Primeros Pasos" se veía como
      // "IA y Marketing: Pri.". Ahora usamos list message igual que
      // para 4+ eventos, con descripción fecha+lugar.
      if (allEvents.length <= 3) {
        const sections = [
          {
            title: "Próximos eventos",
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
              ? "Tenemos este evento próximo:"
              : `Tenemos ${allEvents.length} eventos próximos. Elige el que te interesa:`
          },
          action: {
            button: "Próximos eventos",
            sections
          },
          footer: {
            text: "Toca uno para ver detalle".slice(0, 60)
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
      // 4+ eventos → list message (max 10 rows en Meta).
      const sections = [
        {
          title: "Proximos eventos",
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
          text: `Tenemos ${allEvents.length} eventos proximos. Elegi el que te interesa:`
        },
        action: {
          button: "Ver eventos",
          sections
        },
        footer: {
          text: "Toca uno para ver detalle o escribe tu pregunta".slice(0, 60)
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
    case "interactive_talk_human": {
      // FIX 2026-07-02 (sesion David, "quitar hablar con humano"):
      // David pidió que el bot resuelva TODO sin intervención humana.
      // El handoff a humano (Fase 7a.3) queda como ÚLTIMO RECURSO detrás
      // de un canal explícito (correo o link de contacto), no como
      // botón prominente en el flow principal.
      //
      // Si un lead clickea `talk_human` (botón viejo cacheado o link
      // compartido), respondemos con los canales de contacto y le
      // preguntamos qué necesita. NO notificamos a David por email.
      const bodyText =
        `Si necesitas atención más personalizada, puedes escribirnos a ` +
        `hola@qlick.marketing o visitar https://qlick.digital/contacto. ` +
        `Mientras tanto, ¿hay algo más en lo que te pueda ayudar?`;
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
    case "survey_offer": {
      // FIX 2026-07-04 (feat/funnel-survey-scoring): el lead está en
      // event_attended y no hemos ofrecido la encuesta en 24h+. Le
      // mandamos el interactive con Sí / Ahora no. Marcamos el
      // timestamp del offer para anti-spam (best-effort).
      const evt = await findLatestAttendedEventForPhone(phoneNormalized)
        .catch(() => null);
      const built = buildSurveyOfferMessage({
        leadName: lead.name,
        eventTitle: evt?.eventTitle ?? null
      });
      // Best-effort: marcamos el offer como enviado. No bloqueamos el
      // send del provider si esto falla.
      markSurveyOfferSent(lead.id).catch((err) => {
        errorLog("[whatsapp/bot] survey_offer: markSurveyOfferSent falló", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err)
        });
      });
      const interactive = built.interactive;
      return {
        kind: "interactive",
        body: built.text,
        interactive,
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: built.text,
            interactive
          })
      };
    }
    case "interactive_survey_yes": {
      // FIX 2026-07-06 (audit F7): rate limit por lead.id para evitar
      // que un click rápido-spam ("Sí, dejar feedback" 10 veces en 5s)
      // triggeree 10 queries a event_surveys + 10 updates de
      // survey_offer_sent_at. 1 click cada 5 segundos es suficiente.
      const wizardRateLimit = recordAndCheckRateLimit(
        `wizard-yes:${lead.id}`,
        { windowMs: 5000, maxCalls: 1 }
      );
      if (!wizardRateLimit.allowed) {
        // Idempotente: el lead probablemente ya clickeó hace <5s. No
        // procesamos de nuevo, devolvemos thank-you corto.
        const ackBody = `¡Ya estamos con tu feedback! Aguanta un momento...`;
        return {
          kind: "text",
          body: ackBody,
          send: () => provider.send({ to: phoneNormalized, body: ackBody }),
        };
      }

      // FIX 2026-07-05 (feat/survey-wizard-native): el lead clickeó "Sí,
      // dejar feedback". Arrancamos el wizard nativo de WhatsApp (4
      // preguntas con opciones) en vez del legacy token+form HTML
      // (que tenía un race condition en `event_survey_tokens` que
      // provocaba "Tuve un problema técnico" al usuario en cuanto había
      // un insert concurrente).
      //
      // Estado del wizard se persiste en el `metadata` del último
      // outbound del bot (`awaiting_survey_step: N`) y se continúa en
      // las próximas interactivas / respuestas de texto.
      const evt = await findLatestAttendedEventForPhone(phoneNormalized)
        .catch(() => null);
      if (!evt) {
        // Drift: el lead está en event_attended pero no hay attendees.
        // Pedimos el slug manualmente para no romper el flow.
        const bodyText =
          `¡Gracias por querer dejar feedback! Para identificar el evento, ` +
          `¿me pasas el título o el slug del evento? Ej: "pingüinos" o "vender-hielo-pinguino".`;
        return {
          kind: "text",
          body: bodyText,
          metadata: {
            awaiting_survey_event_lookup: "title_or_slug"
          },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      // FIX 2026-07-05 (Fase 7d.1, "registro doble"): dedupe — si el lead
      // ya completó la encuesta de este evento (mismo event_id +
      // phone_normalized OR respondent_email), NO re-entramos al
      // wizard. Devolvemos un thank-you corto en su lugar.
      const alreadyDone = await hasCompletedWizardSurvey({
        supabase: args.supabase ?? null,
        eventId: evt.eventId,
        phoneNormalized,
        leadEmail: lead.email ?? null
      });
      if (alreadyDone) {
        markSurveyOfferSent(lead.id).catch(() => {
          /* best-effort */
        });
        const alreadyBody =
          `¡Gracias! Ya tenemos tu feedback de "${evt.eventTitle}" ` +
          `— no hace falta que la vuelvas a completar. ` +
          `Si hay algo más en lo que te pueda ayudar, dime.`;
        return {
          kind: "text",
          body: alreadyBody,
          metadata: {
            awaiting_survey_step: null,
            survey_event_id: null,
            survey_event_title: null,
            survey_answers: null,
            survey_completed: true
          },
          send: () =>
            provider.send({ to: phoneNormalized, body: alreadyBody })
        };
      }
      // Arrancamos el wizard. FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm):
      // cargamos el `survey_config` del evento (jsonb). Si está vacío o el
      // mapper falla, usa la plantilla Default del sistema (5 preguntas).
      // El builder dinámico `buildDynamicSurveyStep` construye el primer
      // paso desde el config (en lugar del `buildSurveyQ1` legacy que está
      // hardcoded a 4 preguntas fijas).
      const surveyConfig = args.supabase
        ? await loadSurveyConfigForEvent(args.supabase, evt.eventId).catch(
            () => null,
          )
        : null;
      const questions = surveyConfig?.questions ?? [];
      if (questions.length === 0) {
        // Fallback extremo: si por alguna razón no hay questions, usamos
        // el builder Q1 legacy (best-effort, no debería pasar).
        const q1Built = buildSurveyQ1({
          leadName: lead.name,
          eventTitle: evt.eventTitle
        });
        markSurveyOfferSent(lead.id).catch(() => {});
        return {
          kind: "interactive",
          body: q1Built.text,
          interactive: q1Built.interactive,
          metadata: {
            awaiting_survey_step: 1,
            survey_event_id: evt.eventId,
            survey_event_title: evt.eventTitle,
            survey_answers: {},
            survey_questions: []
          },
          send: () =>
            provider.send({
              to: phoneNormalized,
              body: q1Built.text,
              interactive: q1Built.interactive
            })
        };
      }
      const firstQuestion = questions[0];
      const q1Built = buildDynamicSurveyStep({
        eventTitle: evt.eventTitle,
        question: firstQuestion,
        leadName: lead.name
      });
      const q1BodyText = q1Built.text;
      // Marcamos offer como enviado para no re-ofrecer.
      markSurveyOfferSent(lead.id).catch(() => {
        /* best-effort */
      });
      return {
        kind: "interactive",
        body: q1BodyText,
        interactive: q1Built.interactive,
        metadata: {
          awaiting_survey_step: 1,
          survey_event_id: evt.eventId,
          survey_event_title: evt.eventTitle,
          survey_answers: {},
          survey_questions: questions
        },
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: q1BodyText,
            interactive: q1Built.interactive
          })
      };
    }
    case "interactive_survey_no": {
      // FIX 2026-07-04 (feat/funnel-survey-scoring): el lead clickeó
      // "Ahora no". Acknowledge respetuoso y marcamos timestamp para
      // no re-ofrecer inmediatamente.
      const built = buildSurveyDeclineMessage({ leadName: lead.name });
      markSurveyOfferSent(lead.id).catch(() => {
        /* best-effort */
      });
      const bodyText = built.text;
      return {
        kind: "text",
        body: bodyText,
        send: () =>
          provider.send({ to: phoneNormalized, body: bodyText })
      };
    }
    // ───────────────────────────────────────────────────────────
    // Survey wizard nativo (Fase 7d, 2026-07-05). Reemplaza el flow
    // legacy token+form HTML (que tenía un race condition en el
    // insert de `event_survey_tokens` que provocaba "Tuve un
    // problema técnico"). 4 pasos: Q1/Q2/Q3 con botones + Q4 con
    // texto libre opcional ("cuéntanos de tu negocio" o "saltar").
    //
    // Estado del wizard persiste en `metadata.awaiting_survey_step`
    // del último outbound + `survey_answers` jsonb. Las transiciones
    // se manejan acá leyendo ese state (pasado por `args.surveyState`).
    // ───────────────────────────────────────────────────────────
    case "survey_q1_continue": {
      if (
        !args.surveyState ||
        args.surveyState.step !== 1 ||
        !args.buttonId
      ) {
        return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
      }
      // FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm): si tenemos el
      // questions[] del config dinámico, usamos `detectDynamicSurveyButton`
      // y `buildDynamicSurveyStep`. Si no (legacy metadata sin questions),
      // caemos al path hardcoded `detectSurveyButton` + `buildSurveyQ2`.
      const dynamicQuestions = args.surveyState.questions;
      let nextAnswers: SurveyAnswers;
      let nextStepInteractiveText = "";
      let nextStepInteractiveMsg: InteractiveMessage | undefined;

      if (dynamicQuestions && dynamicQuestions.length >= 2) {
        const detected = detectDynamicSurveyButton(
          args.buttonId,
          dynamicQuestions.map((q) => q.id),
        );
        if (
          !detected ||
          detected.questionId !== dynamicQuestions[0].id
        ) {
          return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
        }
        nextAnswers = {
          ...args.surveyState.answers,
          [dynamicQuestions[0].id]: detected.optionId
        } as unknown as SurveyAnswers;
        const q2Built = buildDynamicSurveyStep({
          eventTitle: args.surveyState.eventTitle ?? "",
          question: dynamicQuestions[1],
          leadName: lead.name
        });
        nextStepInteractiveText = q2Built.text;
        nextStepInteractiveMsg = q2Built.interactive;
      } else {
        const detected = detectSurveyButton(args.buttonId);
        if (!detected || detected.step !== 1) {
          return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
        }
        nextAnswers = {
          ...args.surveyState.answers,
          q1: detected.value as SurveyAnswers["q1"]
        };
        const q2Built = buildSurveyQ2();
        nextStepInteractiveText = q2Built.text;
        nextStepInteractiveMsg = q2Built.interactive;
      }

      return {
        kind: nextStepInteractiveMsg ? "interactive" : "text",
        body: nextStepInteractiveText,
        interactive: nextStepInteractiveMsg,
        metadata: {
          awaiting_survey_step: 2,
          survey_event_id: args.surveyState.eventId,
          survey_event_title: args.surveyState.eventTitle,
          survey_answers: nextAnswers,
          survey_questions: dynamicQuestions ?? []
        },
        send: () =>
          nextStepInteractiveMsg
            ? provider.send({
                to: phoneNormalized,
                body: nextStepInteractiveText,
                interactive: nextStepInteractiveMsg
              })
            : provider.send({ to: phoneNormalized, body: nextStepInteractiveText })
      };
    }
    case "survey_q2_continue": {
      if (
        !args.surveyState ||
        args.surveyState.step !== 2 ||
        !args.buttonId
      ) {
        return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
      }
      const dynamicQuestions = args.surveyState.questions;
      let nextAnswers: SurveyAnswers;
      let nextText = "";
      let nextInteractive: InteractiveMessage | undefined;

      if (dynamicQuestions && dynamicQuestions.length >= 3) {
        const detected = detectDynamicSurveyButton(
          args.buttonId,
          dynamicQuestions.map((q) => q.id),
        );
        if (!detected || detected.questionId !== dynamicQuestions[1].id) {
          return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
        }
        nextAnswers = {
          ...args.surveyState.answers,
          [dynamicQuestions[1].id]: detected.optionId
        } as unknown as SurveyAnswers;
        const q3Built = buildDynamicSurveyStep({
          eventTitle: args.surveyState.eventTitle ?? "",
          question: dynamicQuestions[2],
          leadName: lead.name
        });
        nextText = q3Built.text;
        nextInteractive = q3Built.interactive;
      } else {
        const detected = detectSurveyButton(args.buttonId);
        if (!detected || detected.step !== 2) {
          return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
        }
        nextAnswers = {
          ...args.surveyState.answers,
          q2: detected.value as SurveyAnswers["q2"]
        };
        const q3 = buildSurveyQ3();
        nextText = q3.text;
        nextInteractive = q3.interactive;
      }

      return {
        kind: nextInteractive ? "interactive" : "text",
        body: nextText,
        interactive: nextInteractive,
        metadata: {
          awaiting_survey_step: 3,
          survey_event_id: args.surveyState.eventId,
          survey_event_title: args.surveyState.eventTitle,
          survey_answers: nextAnswers,
          survey_questions: dynamicQuestions ?? []
        },
        send: () =>
          nextInteractive
            ? provider.send({
                to: phoneNormalized,
                body: nextText,
                interactive: nextInteractive
              })
            : provider.send({ to: phoneNormalized, body: nextText })
      };
    }
    case "survey_q3_continue": {
      if (
        !args.surveyState ||
        args.surveyState.step !== 3 ||
        !args.buttonId
      ) {
        return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
      }
      const dynamicQuestions = args.surveyState.questions;
      let nextAnswers: SurveyAnswers;
      let nextText = "";
      let nextInteractive: InteractiveMessage | undefined;

      if (dynamicQuestions && dynamicQuestions.length >= 4) {
        const detected = detectDynamicSurveyButton(
          args.buttonId,
          dynamicQuestions.map((q) => q.id),
        );
        if (!detected || detected.questionId !== dynamicQuestions[2].id) {
          return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
        }
        nextAnswers = {
          ...args.surveyState.answers,
          [dynamicQuestions[2].id]: detected.optionId
        } as unknown as SurveyAnswers;
        const q4Built = buildDynamicSurveyStep({
          eventTitle: args.surveyState.eventTitle ?? "",
          question: dynamicQuestions[3],
          leadName: lead.name
        });
        nextText = q4Built.text;
        nextInteractive = q4Built.interactive;
      } else {
        const detected = detectSurveyButton(args.buttonId);
        if (!detected || detected.step !== 3) {
          return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
        }
        nextAnswers = {
          ...args.surveyState.answers,
          q3: detected.value as SurveyAnswers["q3"]
        };
        const q4 = buildSurveyQ4({ leadName: lead.name });
        nextText = q4.text;
        nextInteractive = q4.interactive;
      }

      return {
        kind: nextInteractive ? "interactive" : "text",
        body: nextText,
        interactive: nextInteractive,
        metadata: {
          awaiting_survey_step: 4,
          survey_event_id: args.surveyState.eventId,
          survey_event_title: args.surveyState.eventTitle,
          survey_answers: nextAnswers,
          survey_questions: dynamicQuestions ?? []
        },
        send: () =>
          nextInteractive
            ? provider.send({
                to: phoneNormalized,
                body: nextText,
                interactive: nextInteractive
              })
            : provider.send({ to: phoneNormalized, body: nextText })
      };
    }
    case "survey_q_consent_continue": {
      // FIX 2026-07-06 (audit G-15 r3, "q_consent no se persiste + wizard
      // skip q_business"): el lead hizo click "Sí" o "No" en q_consent
      // (step 4). Persistimos la respuesta y:
      //   - "Sí" → avanzamos al q_business (step 5, texto libre).
      //   - "No" → cerramos wizard, persist + thank-you con consent_to_contact=false.
      //
      // Antes del fix (c120c47 + anteriores), este branch caía a
      // `intent="question"` (LLM respondía con follow-up bucket sin
      // persistir q_consent). Eso rompía el contrato comercial del
      // wizard: el lead dijo "Sí quiero info" y el sistema no lo
      // registraba en event_surveys.responses.q_consent, derivando
      // consent_to_contact=false.
      if (
        !args.surveyState ||
        args.surveyState.step !== 4 ||
        !args.buttonId
      ) {
        return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
      }
      const dynamicQuestions = args.surveyState.questions;
      let consentAnswer: "yes" | "no" | null = null;
      let nextAnswers: SurveyAnswers = args.surveyState.answers as SurveyAnswers;
      let nextStepInteractive: InteractiveMessage | undefined;
      let nextStepText = "";
      let nextStep: number | null = null;

      // Detectar respuesta (Sí/No) por buttonId. Aceptamos tanto formato
      // dinámico (`survey_q_consent_yes`) como legacy (si existiera un
      // día `survey_q4_yes`).
      if (args.buttonId.startsWith("survey_q_consent_yes") || args.buttonId === "survey_q4_yes") {
        consentAnswer = "yes";
      } else if (
        args.buttonId.startsWith("survey_q_consent_no") ||
        args.buttonId === "survey_q4_no"
      ) {
        consentAnswer = "no";
      }
      if (!consentAnswer) {
        return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
      }
      // Capturar la respuesta de q_consent en el answers jsonb. Usamos el
      // questionId real (q_consent) para mantener el contrato dinámico.
      const consentQuestionId = "q_consent";
      nextAnswers = {
        ...args.surveyState.answers,
        [consentQuestionId]: consentAnswer
      } as unknown as SurveyAnswers;

      if (consentAnswer === "yes" && dynamicQuestions && dynamicQuestions.length >= 5) {
        // Hay q_business (step 5). Avanzamos el wizard.
        const q5Built = buildDynamicSurveyStep({
          eventTitle: args.surveyState.eventTitle ?? "",
          question: dynamicQuestions[4], // q_business
          leadName: lead.name
        });
        nextStepText = q5Built.text;
        nextStepInteractive = q5Built.interactive;
        nextStep = 5;
      } else {
        // No hay q_business, o el lead dijo "No". Cerramos wizard.
        nextStep = null;
      }

      if (nextStep !== null) {
        // Avanzamos al q_business (text libre con botón Saltar).
        return {
          kind: nextStepInteractive ? "interactive" : "text",
          body: nextStepText,
          interactive: nextStepInteractive,
          metadata: {
            awaiting_survey_step: nextStep,
            survey_event_id: args.surveyState.eventId,
            survey_event_title: args.surveyState.eventTitle,
            survey_answers: nextAnswers,
            survey_questions: dynamicQuestions ?? []
          },
          send: () =>
            nextStepInteractive
              ? provider.send({
                  to: phoneNormalized,
                  body: nextStepText,
                  interactive: nextStepInteractive
                })
              : provider.send({ to: phoneNormalized, body: nextStepText })
        };
      }
      // Cierre: persist + thank-you + promotion engine. Reutilizamos la
      // lógica de survey_q4_skip para no duplicar código (mismo path de
      // cierre con consent capturado en answers).
      debugLog("[whatsapp/bot] survey_q_consent closed wizard", {
        leadId: lead.id,
        consent: consentAnswer,
        answersCount: Object.keys(nextAnswers).length
      });
      let consentToContact = consentAnswer === "yes";
      let commercialInterest: string | null = null;
      let scoreResult: any = null;
      if (args.supabase && lead.id && dynamicQuestions) {
        try {
          scoreResult = calculateLeadScoreFromConfig(
            nextAnswers as unknown as Record<string, string>,
            { questions: dynamicQuestions, followUps: undefined }
          );
          // consentDetected puede venir del scoring si detecta "Sí" en
          // otras respuestas, pero acá priorizamos la respuesta explícita.
          consentToContact = consentToContact || (scoreResult.consentDetected ?? false);
          commercialInterest = scoreResult.commercialInterestDetected ?? null;
        } catch (err) {
          errorLog("[whatsapp/bot] scoring before persist failed (consent close path)", { error: err });
        }
      }
      await persistWizardSurvey({
        eventId: args.surveyState.eventId,
        leadEmail: lead.email ?? null,
        phoneNormalized,
        responses: nextAnswers,
        businessCaptured: false,
        supabase: args.supabase ?? null,
        leadId: lead.id,
        consentToContact,
        commercialInterest
      });
      if (args.supabase && lead.id && dynamicQuestions && scoreResult) {
        try {
          await applyPromotionRules(lead.id, scoreResult, {
            supabase: args.supabase,
            actorEmail: "wizard-bot@qlick",
            leadEmail: lead.email ?? null,
            leadName: lead.name ?? null,
            eventTitle: args.surveyState.eventTitle ?? "(sin título)"
          });
          // FIX 2026-07-06 (audit G-15 r5): ya NO enviamos el follow-up
          // bucket aquí. Mismo racional que en survey_q4_text — antes se
          // enviaba bucket + thank-you (2 mensajes de cierre) y el bucket
          // NO se persistía en DB. Solo thank-you de cierre.
        } catch (err) {
          errorLog("[whatsapp/bot] promotion engine falló (consent close path)", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      const thankBody = buildSurveyThankYou({
        leadName: lead.name,
        businessCaptured: false
      }).text;
      return {
        kind: "text",
        body: thankBody,
        metadata: {
          awaiting_survey_step: null,
          survey_event_id: null,
          survey_event_title: null,
          survey_answers: null,
          survey_questions: [],
          survey_completed: true
        },
        send: () => provider.send({ to: phoneNormalized, body: thankBody })
      };
    }
    case "survey_q4_text": {
      // El lead mandó texto libre en respuesta a q_business (step 5 en
      // config dinámico, o step 4 en legacy de 4 preguntas). Limpiamos y
      // guardamos (o lo descartamos si es "saltar" / vacío).
      if (
        !args.surveyState ||
        (args.surveyState.step !== 4 && args.surveyState.step !== 5)
      ) {
        return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
      }
      const cleanedBusiness = cleanBusinessText(body) ?? null;
      // FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm): la pregunta
      // dinámica es q_business (index 4 del array, NO index 3 que es
      // q_consent). Antes del fix r3, `lastQuestion = dynamicQuestions[3]`
      // apuntaba a q_consent y sobrescribía su respuesta con el texto
      // libre. Ahora capturamos q_consent del state (ya guardado por
      // survey_q_consent_continue) y guardamos el text en q_business.
      const dynamicQuestions = args.surveyState.questions;
      const businessQuestion = dynamicQuestions?.find((q) => q.id === "q_business")
        ?? dynamicQuestions?.[4];
      const businessKey = businessQuestion?.id ?? "q4_business";
      const finalAnswers: SurveyAnswers = {
        ...args.surveyState.answers,
        [businessKey]: cleanedBusiness ?? undefined
      } as unknown as SurveyAnswers;
      // FIX 2026-07-06 (audit G-15 r3): consent_to_contact debe derivarse
      // de q_consent (Sí/No), NO de businessCaptured. Si q_consent="yes",
      // consent=true. Si q_consent="no" o ausente, fallback a businessCaptured.
      const qConsentAnswer = (finalAnswers as Record<string, unknown>)["q_consent"];
      let consentToContact =
        qConsentAnswer === "yes" ? true : qConsentAnswer === "no" ? false : !!cleanedBusiness;
      let commercialInterest: string | null = null;
      let scoreResult: any = null;

      if (args.supabase && lead.id && dynamicQuestions) {
        try {
          scoreResult = calculateLeadScoreFromConfig(
            finalAnswers as unknown as Record<string, string>,
            { questions: dynamicQuestions, followUps: undefined },
          );
          consentToContact = scoreResult.consentDetected ?? consentToContact;
          commercialInterest = scoreResult.commercialInterestDetected ?? null;
        } catch (err) {
          errorLog("[whatsapp/bot] scoring before persist failed (text path)", { error: err });
        }
      }

      // Insertar event_surveys row con referencia de promoción automática
      await persistWizardSurvey({
        eventId: args.surveyState.eventId,
        leadEmail: lead.email ?? null,
        phoneNormalized,
        responses: finalAnswers,
        businessCaptured: !!cleanedBusiness,
        supabase: args.supabase ?? null,
        leadId: lead.id,
        consentToContact,
        commercialInterest,
      });

      // FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 7):
      // Promotion Engine — calcula score con config dinámico + aplica
      // reglas (status transitions + CRM tasks + notify admin).
      // Best-effort: si falla, el thank-you igual sale. NO bloqueamos
      // el flow del usuario.
      if (args.supabase && lead.id && dynamicQuestions && scoreResult) {
        try {
          await applyPromotionRules(lead.id, scoreResult, {
            supabase: args.supabase,
            actorEmail: "wizard-bot@qlick",
            leadEmail: lead.email ?? null,
            leadName: lead.name ?? null,
            eventTitle: args.surveyState.eventTitle ?? "(sin título)",
          });
          // FIX 2026-07-06 (audit G-15 r5): ya NO enviamos el follow-up
          // bucket aquí. Antes (F6, audit 2026-07-06) se enviaba
          // además del thank-you → 2 mensajes de cierre que decían
          // cosas similares y confundían al lead. Además, el send del
          // bucket se hacía con provider.send directo (sin pasar por
          // el path de retorno del handler) por lo que NO se persistía
          // en lead_whatsapp_conversations — bug doble.
          //
          // El thank-you estándar ya cubre el cierre. Si el admin quiere
          // bucket follow-up, debe disparar /api/events/:id/send-survey-offers
          // manualmente desde el panel, o re-habilitar este código
          // cambiando la lógica.
        } catch (err) {
          errorLog(
            "[whatsapp/bot] promotion engine falló (encuesta persistida OK)",
            {
              leadId: lead.id,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }
      const thank = buildSurveyThankYou({
        leadName: lead.name,
        businessCaptured: !!cleanedBusiness
      });
      const thankBody = thank.text;
      return {
        kind: "text",
        body: thankBody,
        metadata: {
          awaiting_survey_step: null,
          survey_event_id: null,
          survey_event_title: null,
          survey_answers: null,
          survey_questions: [],
          survey_completed: true
        },
        send: () =>
          provider.send({ to: phoneNormalized, body: thankBody })
      };
    }
    case "survey_q4_skip": {
      // FIX 2026-07-18 (sprint bot wizard, David "Saltar repite la
      // pregunta" en V2): el guard de abajo aceptaba SOLO step 4. Pero
      // en config dinámico de 5 preguntas (el que usa V2), q_business
      // es **step 5**, no step 4. El case homólogo `survey_q4_text`
      // (línea 3362) ya aceptaba `step === 4 || step === 5` para
      // retrocompat con config legacy. El skip se quedó inconsistente:
      // cuando David clickeaba "Saltar" en q_business, el guard fallaba
      // y caía a `nudgeToResendWizard`, que re-enviaba la pregunta
      // actual. Mismo bug en la segunda pulsación: el wizard quedaba
      // corrupto y el caso "Saltar" caía al LLM, que generaba copy de
      // "solo falta definir el pago" sin saber que ya estaba pagado.
      // Fix: aceptar step 4 (legacy) y step 5 (dinámico) — mismo
      // patrón que `survey_q4_text`. Defense-in-depth: en el log del
      // bug, el buttonId fue `survey_q_business_skip` que cae a este
      // case; antes, lo bloqueábamos por state.step, ahora dejamos
      // pasar ambos steps.
      if (
        !args.surveyState ||
        (args.surveyState.step !== 4 && args.surveyState.step !== 5)
      ) {
        return nudgeToResendWizard(provider, phoneNormalized, lead.name, args.surveyState ?? undefined);
      }
      const dynamicQuestions = args.surveyState.questions;
      const finalAnswers: SurveyAnswers = args.surveyState.answers;
      // FIX 2026-07-06 (audit F3): loggear skip para que el admin
      // sepa que el lead skipeó la Q4 de texto libre. Antes no había
      // visibilidad — el admin solo veía `consent_to_contact=false`.
      debugLog("[whatsapp/bot] survey_q4 skipped by user", {
        leadId: lead.id,
        eventId: args.surveyState.eventId,
        answersCount: Object.keys(finalAnswers).length,
      });
      // Calculate score & dynamic fields first so we can persist them correctly linked
      // FIX 2026-07-06 (audit G-15 r3): consent_to_contact se deriva de
      // q_consent (Sí/No). Si "yes" → true; si "no"/ausente → false
      // (porque el lead skipeó business = no quiere compartir nada).
      const qConsentAnswerSkip = (finalAnswers as Record<string, unknown>)["q_consent"];
      let consentToContact = qConsentAnswerSkip === "yes";
      let commercialInterest: string | null = null;
      let scoreResult: any = null;

      if (args.supabase && lead.id && dynamicQuestions) {
        try {
          scoreResult = calculateLeadScoreFromConfig(
            finalAnswers as unknown as Record<string, string>,
            { questions: dynamicQuestions, followUps: undefined },
          );
          // Si q_consent ya dio "yes", no sobreescribir con el scoring
          // (que podría no detectarlo correctamente en otros paths).
          if (!consentToContact) {
            consentToContact = scoreResult.consentDetected ?? false;
          }
          commercialInterest = scoreResult.commercialInterestDetected ?? null;
        } catch (err) {
          errorLog("[whatsapp/bot] scoring before persist failed (skip path)", { error: err });
        }
      }

      // Insertar event_surveys row (sin business).
      await persistWizardSurvey({
        eventId: args.surveyState.eventId,
        leadEmail: lead.email ?? null,
        phoneNormalized,
        responses: finalAnswers,
        businessCaptured: false,
        supabase: args.supabase ?? null,
        leadId: lead.id,
        consentToContact,
        commercialInterest,
      });

      // FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 7):
      // Promotion Engine — idem al path de Q4 text. Aplica score + reglas.
      if (args.supabase && lead.id && dynamicQuestions && scoreResult) {
        try {
          await applyPromotionRules(lead.id, scoreResult, {
            supabase: args.supabase,
            actorEmail: "wizard-bot@qlick",
            leadEmail: lead.email ?? null,
            leadName: lead.name ?? null,
            eventTitle: args.surveyState.eventTitle ?? "(sin título)",
          });
        } catch (err) {
          errorLog(
            "[whatsapp/bot] promotion engine (skip path) falló",
            {
              leadId: lead.id,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }
      const thank = buildSurveyThankYou({
        leadName: lead.name,
        businessCaptured: false
      });
      const thankBody = thank.text;
      return {
        kind: "text",
        body: thankBody,
        metadata: {
          awaiting_survey_step: null,
          survey_event_id: null,
          survey_event_title: null,
          survey_answers: null,
          survey_questions: [],
          survey_completed: true
        },
        send: () =>
          provider.send({ to: phoneNormalized, body: thankBody })
      };
    }
    case "provide_name": {
      // FIX 2026-07-02 (Commit A): el lead mandó un texto libre cuando
      // el último outbound del bot tenía metadata.awaiting_field='name'
      // (el bot pidió nombre porque requires_name=true). Respondemos
      // pidiendo el email.
      //
      // NOTA: la persistencia del `lead.name` se hace en
      // `processInboundMessage` (luego de este handler), NO aca, porque
      // aca no tenemos acceso a `supabase`. El handler solo construye
      // el plan (body + metadata).
      //
      // Validaciones defensivas:
      //   - E6: Si es PREGUNTA (signos ?, palabras interrogativas, dudas
      //     comerciales), NO guardar como nombre. Responder amablemente
      //     y mantener awaiting_field="name" para el siguiente turno.
      //   - E7: Si NO es un nombre humano valido (emojis, numeros,
      //     monosilabos), rechazar con explicacion.
      //   - Que el body NO sea un email (si lo es, el detectIntent
      //     debería haberlo clasificado como provide_email).
      //   - Que tenga al menos 2 palabras (Juan, no "j").
      //   - Que no supere 100 chars.
      const rawBody = body.trim();
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawBody);
      // FIX 2026-07-07: si NO es solo email pero contiene uno embebido,
      // extraerlo. Si el resto es nombre válido, los capturamos juntos
      // (caso típico: "Sitlalic Guzman ramos sitlalic.guzman@uabc.edu.mx").
      const embeddedEmail = looksLikeEmail
        ? null
        : extractEmailFromText(rawBody);
      let name = rawBody;
      let implicitEmail: string | null = null;
      if (embeddedEmail) {
        const withoutEmail = rawBody
          .replace(embeddedEmail, "")
          .replace(/[,;]+\s*/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Solo procesamos implicit capture si el resto es un nombre válido.
        // Si `withoutEmail` no pasa validación, caemos al path normal
        // (name = rawBody, sin email) y el bot vuelve a pedir el email
        // en el siguiente turno.
        if (withoutEmail.length >= 2 && isValidHumanName(withoutEmail)) {
          name = withoutEmail;
          implicitEmail = embeddedEmail.toLowerCase().trim();
        }
      }
      // E6: detectar preguntas / dudas — NO guardar como nombre.
      if (isQuestionOrIntent(name)) {
        // FIX 2026-07-07 (sesion David "captura desordenada + prioridad
        // cerrar lead"): el bot reconoce la pregunta y le dice al lead
        // que se la contesta, pero mantiene la captura activa. NO ignora
        // la pregunta (antes parecia que el bot estaba sordo); tampoco
        // la responde (no tenemos LLM desde este handler — el flujo
        // correcto es que el lead primero complete el registro y luego
        // pueda preguntar con el contexto conversacional cargado).
        const bodyText =
          `Buena pregunta. Te la respondo cuando completemos tu ` +
          `registro (asi puedo darte una respuesta personalizada). ` +
          `Por ahora solo necesito tu nombre completo (nombre y ` +
          `apellido) para el certificado. ¿Me lo pasas así: "Juan Pérez"?`;
        return {
          kind: "text",
          body: bodyText,
          // FIX E6: mantenemos awaiting_field="name" para que el
          // siguiente turno vuelva a entrar como provide_name.
          metadata: { awaiting_field: "name" },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      // E7: detectar inputs basura (emojis, numeros, simbolos).
      // Lo chequeamos ANTES de wordCount < 2 porque un emoji como "👍"
      // tiene 1 palabra pero 0 letras.
      if (!isValidHumanName(name)) {
        const bodyText =
          `Por favor escríbeme tu nombre y apellido con letras para ` +
          `poder generar tu certificado (ej: "Juan Pérez").`;
        return {
          kind: "text",
          body: bodyText,
          metadata: { awaiting_field: "name" },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      if (looksLikeEmail) {
        // Edge case: el bot pidió nombre pero el lead mandó email.
        // Respondemos recordándole que primero necesitamos el nombre.
        const bodyText =
          `Gracias por el email, pero primero necesito tu nombre completo ` +
          `(nombre y apellido). Después te paso el QR.`;
        return {
          kind: "text",
          body: bodyText,
          // Mantenemos awaiting_field='name' para que el próximo turno
          // siga siendo provide_name.
          metadata: { awaiting_field: "name" },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      const wordCount = name.split(/\s+/).filter(Boolean).length;
      if (wordCount < 2) {
        // FIX E8/E9: detectamos nombres reales con titulos validos
        // ("Dr. Juan Perez") que ya pasaron isValidHumanName (tienen 2+
        // palabras con letras), pero tambien queremos permitir nombres
        // de 1 palabra con longitud >=3 si el usuario insiste. Por ahora
        // seguimos pidiendo apellido si solo hay 1 palabra.
        //
        // Probablemente escribió solo "Juan" o "David". Pedimos apellido.
        const bodyText =
          `Necesito tu nombre completo (nombre y apellido) para el ` +
          `certificado. Por favor mándamelo así: "Juan Pérez".`;
        return {
          kind: "text",
          body: bodyText,
          metadata: { awaiting_field: "name" },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      if (name.length > 100) {
        const bodyText =
          `El nombre que mandaste es muy largo. ¿Me lo puedes escribir ` +
          `más corto? (máximo 100 caracteres)`;
        return {
          kind: "text",
          body: bodyText,
          metadata: { awaiting_field: "name" },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      // Nombre válido. El processInboundMessage va a persistirlo.
      // Acá solo retornamos el plan para pedir el email.
      const clean = cleanFirstName(name);
      // FIX 2026-07-07 (sesion David "lead manda nombre + email juntos"):
      // Si capturamos email embebido en el body, vamos directo a cierre
      // + generación de QR. processInboundMessage detecta
      // metadata.implicit_capture y ejecuta los side-effects de
      // provide_email (update email, generateQrToken, sendEventQrPassEmail,
      // createConfirmation) sin pedir el email en un turno separado.
      if (implicitEmail) {
        const saludoIc = clean ? `¡Excelente ${clean}!` : "¡Excelente!";
        // FIX 2026-07-16 (sprint pago-en-puerta): el copy del
        // implicit_capture estaba hardcodeado ("link de Zoom 24 horas
        // antes", "Si me confirmas con Si") y no mencionaba el pago.
        // Ahora usa el evento del registro para:
        //   - Distinguir presencial ("el dia del evento") vs virtual
        //     ("el link de Zoom 24 horas antes" o el streamingAccessNote).
        //   - Mencionar el pago si el evento es de pago (priceMxn > 0).
        //   - NO pedir confirmacion ("Si me confirmas con Si"). El
        //     implicit_capture ya persiste el email + QR automaticamente.
        const regEvtIc = args.registrationEvent;
        const regEvtIsPaidIc =
          regEvtIc && regEvtIc.source === "db" &&
          typeof regEvtIc.priceMxn === "number" && regEvtIc.priceMxn > 0;
        const regEvtSlugIc = regEvtIc && regEvtIc.source === "db" ? regEvtIc.slug : null;
        const isVirtualIc =
          regEvtIc?.format === "virtual" || regEvtIc?.format === "hybrid";
        const accessLineIc = isVirtualIc
          ? regEvtIc?.streamingAccessNote
            ? ` ${regEvtIc.streamingAccessNote}`
            : " Te enviamos el link de Zoom 24 horas antes."
          : " El día del evento presenta tu QR en la entrada.";
        // FIX 2026-07-24 (auditoría E2E CANACO): el copy de pago del
        // implicit_capture estaba hardcodeado como "pago completo" y
        // NO respetaba el apartado configurado en event_rules. Para
        // CANACO, el bot decía "pago completo de $1,000" cuando en
        // realidad el evento tiene apartado de $500. Ahora usamos
        // getReservationTerms(regEvtIc) para detectar si hay apartado
        // y armar el copy correcto:
        //   - reservation_enabled=true → copy de apartado con
        //     total + apartado + enlace ?payment_option=reservation +
        //     saldo + nota del balance_due_note.
        //   - sin apartado → copy original de pago completo / pago
        //     en puerta (preservado tal cual para no romper el flow
        //     legacy de eventos sin apartado).
        // NO se cambió el copy cuando no hay apartado. NO se
        // cambiaron checkout ni webhook (los montos siguen
        // resolviéndose desde event_rules, no desde constantes).
        const reservationTermsIc = getReservationTerms(
          regEvtIc && regEvtIc.source === "db" ? regEvtIc : null,
        );
        const paymentLineIc = regEvtIsPaidIc && regEvtSlugIc
          ? reservationTermsIc.enabled
            // FIX 2026-07-24: hay apartado configurado. Generamos
            // el copy de apartado con el monto del event_rules.
            ? ` El evento cuesta $${regEvtIc!.priceMxn!.toLocaleString("es-MX")} MXN. Para apartar tu lugar paga $${reservationTermsIc.amount.toLocaleString("es-MX")} MXN en línea; el saldo de $${reservationTermsIc.balance.toLocaleString("es-MX")} MXN se liquida ${reservationTermsIc.note.toLowerCase()}\n\nAparta aquí (tarjeta/OXXO/SPEI): ${appBaseUrl()}/pagar/evento/${regEvtSlugIc}?payment_option=reservation`
            // Sin apartado: copy legacy de pago completo / pago
            // en puerta (preservado).
            : ` El evento cuesta $${regEvtIc!.priceMxn!.toLocaleString("es-MX")} MXN. Tienes 2 opciones: 1) Pagar en línea ahora (tarjeta/OXXO/SPEI): ${appBaseUrl()}/pagar/evento/${regEvtSlugIc}  2) Pagar en puerta el día del evento (efectivo o tarjeta). Solo avísanos al llegar.`
          : regEvtIsPaidIc
            ? ` El evento cuesta $${regEvtIc!.priceMxn!.toLocaleString("es-MX")} MXN. Puedes pagar en puerta el día del evento (efectivo o tarjeta). Te enviaremos el link de pago en línea pronto.`
            : "";
        const bodyText =
          `${saludoIc} Ya te tengo registrado. Te enviamos tu QR al ` +
          `correo ${implicitEmail}.${accessLineIc}${paymentLineIc}`;
        return {
          kind: "text",
          body: bodyText,
          metadata: {
            awaiting_field: null,
            implicit_capture: {
              name: name.trim(),
              email: implicitEmail
            }
          },
          send: () =>
            provider.send({ to: phoneNormalized, body: bodyText })
        };
      }
      const saludo = clean ? `Gracias ${clean}.` : "Gracias.";
      const bodyText =
        `${saludo} Ahora mándame tu email y te paso tu QR de entrada.`;
      return {
        kind: "text",
        body: bodyText,
        // FIX 2026-07-02 (Commit A): siguiente paso es email. Marcamos
        // el outbound para que el bot sepa que ahora awaiting_field='email'.
        metadata: { awaiting_field: "email" },
        send: () =>
          provider.send({ to: phoneNormalized, body: bodyText })
      };
    }
    case "provide_email": {
      // FIX 2026-07-06 (sesion David, "no me sirve la opcion de no
      // requerir nombres"): si el lead no tiene nombre valido todavia
      // (o si su nombre es un placeholder como "Asistente" / "Por"),
      // NO procesamos el email. Lo redirigimos a pedir su nombre
      // primero. Asi forzamos la captura ANTES del QR.
      //
      // Caso edge: lead ya completo el flow de nombre en un mensaje
      // previo (lead.name limpio) → procesamos normalmente.
      //
      // Caso edge 2: el handler provide_name acaba de correr y
      // procesoInboundMessage ya actualizo lead.name → procesamos.
      //
      // FIX 2026-07-06 (audit E2E): usamos isPlaceholderNameUI (no
      // cleanFirstName) porque queremos bloquear tanto placeholders
      // canonicos ("Por") como placeholders UI ("Asistente", "Por
      // confirmar") que pudieron quedar en leads.name de registros
      // anteriores al fix.
      const currentLeadName = lead.name?.trim() ?? "";
      const cleanedCurrentName = isPlaceholderNameUI(currentLeadName)
        ? ""
        : currentLeadName;
      if (!cleanedCurrentName) {
        const askBody =
          `Antes de registrarte, necesito tu nombre completo ` +
          `(nombre y apellido) para el certificado. ` +
          `Por favor mándamelo así: "Juan Pérez".`;
        return {
          kind: "text",
          body: askBody,
          // FIX 2026-07-02 (Commit A): siguiente intent es provide_name.
          metadata: { awaiting_field: "name" },
          send: () =>
            provider.send({ to: phoneNormalized, body: askBody })
        };
      }
      // FIX 2026-07-05 (sesion David): extraer el email del body, no usar
      // body.trim() directo. Usuarios mandan contexto ("me equivoque, es X")
      // y el body completo no es un email valido.
      const email = extractEmailFromText(body) ?? body.trim();
      // FIX A5: usar el QR token real generado por processInboundMessage.
      // Antes mandaba `${appBaseUrl()}/qr` que NO existe en el routing.
      // Si Supabase cayó y no se pudo generar el token, respondemos sin
      // link (mejor que mandar una URL rota).
      //
      // FIX 2026-07-02 (sesion David): multi-evento. Usar el evento del
      // registro (detectado por findEventInConversation) si esta disponible.
      // Si no, fallback a getActiveEvent() (env vars) o al evento del QR.
      const qrUrl = args.qrUrl ?? null;
      // FIX 2026-07-07 (audit David "bot presenta evento fantasma"):
      // si llegamos a `provide_email` SIN un evento del registro (matched)
      // Y el fallback es `no_events` (sin env vars reales), NO podemos
      // inscribir al lead en un placeholder. Respondemos con copy honesto.
      //
      // FIX 2026-07-17 (sprint event-payments bot bug 11, David
      // "Por el momento no tenemos eventos próximos publicados" tras
      // pedir email para evento activo): el bug raíz es que
      // `loadConversationWindow` excluía los outbounds del bot con
      // delivery tracking (metadata.status="read"), lo cual hacía que
      // `findEventInConversation` no encontrara el evento en el body
      // del último outbound, y `args.registrationEvent` venía null.
      // Ya está fixeado en conversation-window.ts. ESTE guard es la red
      // defensiva por si en el futuro vuelve a fallar: si el evento
      // no viene del flow, intentar `loadActiveEventContext()` (BD
      // single source of truth) antes de declarar "no hay eventos".
      // Solo decimos "no hay eventos" si BD tampoco tiene eventos
      // publicados Y el fallback de env vars está vacío.
      if (!args.registrationEvent || args.registrationEvent.source === "no_events") {
        // Intento defensivo: cargar el evento activo de BD una vez más.
        // Si lo encontramos, lo usamos para el copy de salida. Si BD
        // falla, caemos al fallback de env vars (getActiveEvent).
        let bdEvent: { source: string } | null = null;
        try {
          const ctx = await loadActiveEventContext().catch(() => null);
          if (ctx && ctx.source === "db") {
            bdEvent = ctx;
          }
        } catch {
          // best-effort
        }
        if (!bdEvent) {
          const fallback = getActiveEvent();
          if (fallback.source === "no_events") {
            // PARCHE TEMPORAL (HOY - Captura de datos al recibir email sin evento activo en DB):
            const clean = cleanFirstName(firstName);
            const bodyText = `¡Excelente${clean ? " " + clean : ""}! Ya registramos tus datos. Un asesor de nuestro equipo de Qlick se pondrá en contacto contigo a la brevedad para brindarte toda la información. ¡Que tengas un gran día!`;
            return {
              kind: "text",
              body: bodyText,
              metadata: { awaiting_field: null },
              send: () => provider.send({ to: phoneNormalized, body: bodyText })
            };
          }
        }
      }
      const evt = getActiveEvent();
      // FIX 2026-07-02: si tenemos el evento del registro, usar ese para
      // el mensaje. Si no, usar el fallback (getActiveEvent = env vars).
      // NOTA: la fuente de verdad del evento del QR es el que se paso
      // a generateQrToken en processInboundMessage. Lo reflejamos aca.
      // FIX 2026-07-02 (sesion David): filtrar firstName de placeholders.
      // El "Por" del lead legacy causaba "Listo Por..." en este mensaje.
      // Ver constante de módulo PLACEHOLDER_NAMES.
      const clean = cleanFirstName(firstName);
      // FIX 2026-07-07 (feat/eventos-virtual-y-formato): si el evento del
      // registro es virtual o híbrido, mandamos el link streaming en el
      // mensaje de WhatsApp en lugar del link de check-in (no aplica a
      // eventos 100% presenciales). WhatsApp es un canal íntimo donde
      // el link directo está OK — el gate "SÍ, VOY" se reserva para email
      // (donde el link se puede re-enviar y compartir).
      //
      // Migration 20260707093000: streaming_url es opcional. El bot
      // distingue 3 casos:
      //   a) presencial: copy "QR en puerta" (igual que antes).
      //   b) virtual/hybrid CON streaming_url: copy "link por correo".
      //   c) virtual/hybrid SIN streaming_url (aun no se definio el link):
      //      copy "el link te lo enviamos el dia del evento".
      const regEvt = args.registrationEvent;
      const isVirtual = regEvt?.format === "virtual" || regEvt?.format === "hybrid";
      const hasStreamingLink = Boolean(regEvt?.streamingUrl);
      // FIX 2026-07-16 (sprint pago-en-puerta): si el evento del
      // registro es de pago (priceMxn > 0), agregamos al final del
      // mensaje un bloque con las 2 opciones de pago: (1) link de
      // checkout en línea, (2) pagar en puerta el día del evento.
      // El link de checkout es la URL pública de pago con el slug
      // del evento (la confirmation_id aún no existe en este
      // punto del flow, pero el endpoint /pagar/evento/[slug]
      // acepta entrar sin confirmation y la crea al confirmar el
      // pago via dedupe por email+evento).
      const regEvtSlug = regEvt?.slug ?? null;
      const regEvtIsPaid =
        typeof regEvt?.priceMxn === "number" && regEvt.priceMxn > 0;
      const reservationTerms = getReservationTerms(regEvt ?? null);
      const regPriceMxn = regEvt?.priceMxn ?? 0;
      const checkoutUrl = regEvtSlug
        ? `${appBaseUrl()}/pagar/evento/${regEvtSlug}${reservationTerms.enabled ? "?payment_option=reservation" : ""}`
        : null;
      const paymentBlock = regEvtIsPaid
        ? checkoutUrl
          ? reservationTerms.enabled
            ? `\n\nSobre el pago: el evento cuesta $${regPriceMxn.toLocaleString("es-MX")} MXN. Para apartar tu lugar paga $${reservationTerms.amount.toLocaleString("es-MX")} MXN en línea; el saldo de $${reservationTerms.balance.toLocaleString("es-MX")} MXN se liquida ${reservationTerms.note.toLowerCase()}\n\nAparta aquí (tarjeta/OXXO/SPEI): ${checkoutUrl}`
            : `\n\nSobre el pago: el evento cuesta $${regPriceMxn} MXN. Tienes 2 opciones:\n1. Pagar en línea ahora (tarjeta/OXXO/SPEI): ${checkoutUrl}\n2. Pagar en puerta el día del evento (efectivo o tarjeta). Solo avísanos al llegar.`
          : `\n\nSobre el pago: el evento cuesta $${regPriceMxn} MXN. Puedes pagar en puerta el día del evento (efectivo o tarjeta). Te enviaremos el link de pago en línea pronto.`
        : "";
      const eventLine = isVirtual && hasStreamingLink
        ? `\n\nEs un evento virtual. Te enviamos el link de acceso al stream por correo. Cuando estés listo, haz click y entras.${regEvt?.streamingAccessNote ? `\n\n${regEvt.streamingAccessNote}` : ""}`
        : isVirtual
          ? `\n\nEs un evento virtual. ${regEvt?.streamingAccessNote ? `${regEvt.streamingAccessNote}\n\n` : ""}Aún no tenemos el link del stream configurado — te lo enviamos por correo y por aquí el día del evento. Guarda tu pase con QR, lo vas a necesitar para confirmar asistencia.`
          : `\n\nTambién te enviamos el pase con el QR a tu correo. Lo vas a necesitar el día del evento.`;
      const bodyText = qrUrl
        ? `Listo${clean ? " " + clean : ""}, te registramos para el evento. Tu pase (link de check-in): ${qrUrl}${eventLine}${paymentBlock}`
        : `Listo${clean ? " " + clean : ""}, registramos tu email ${email}. Te esperamos el ${evt.date} en ${evt.location}.${paymentBlock}`;
      return {
        kind: "text",
        body: bodyText,
        // FIX 2026-07-02 (Commit A): el flow de inscripcion completo
        // termina aca. Limpiamos cualquier awaiting_field pendiente.
        metadata: { awaiting_field: null },
        send: () =>
          provider.send({
            to: phoneNormalized,
            body: bodyText
          })
      };
    }
    case "question":
    default: {
      // Modo automático (FIX housekeeping 2026-07-14, G-16 collateral):
      // el comentario anterior decía "Modo sugerencia: el agente sugiere,
      // validamos guardrails, y mandamos texto libre". ESTÁ DESACTUALIZADO.
      // Hoy el bot opera en modo automático: el LLM genera la respuesta,
      // `validateAgentReply` filtra alucinaciones / commitments no
      // autorizados (ver `src/lib/ai/guardrails.ts`), y se manda el texto
      // libre al lead por la ventana de servicio de 24h de WhatsApp Cloud
      // API. El "modo sugerencia" en sentido estricto solo aplica al
      // laboratorio admin (`/admin/bot`), NO al flujo en producción.
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
          // FIX P0-4 (auditoria 2026-07-02): usar phoneNormalized en vez
          // de lead.phone ?? "". El phoneNormalized viene del input de
          // Meta y SIEMPRE está seteado, mientras que lead.phone puede
          // ser null en el fallback (cuando Supabase está caído y
          // findOrCreateLead devuelve un lead con id=null).
          loadConversationWindow(phoneNormalized, 8).catch(() => undefined),
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
      // Ver constante de módulo PLACEHOLDER_NAMES.
      const cleanLeadName = cleanFirstName(lead.name);
      // FIX 2026-07-08 (sesion David, "bot salta captura de nombre"):
      // si el lead NO tiene nombre válido (placeholder) Y el body matchea
      // intención de inscripción, NO dejamos que el LLM responda
      // libremente. El LLM estaba rompiendo el flow secuencial
      // nombre → email: cuando el lead decia "Bue. Día quiero regístrate",
      // el LLM contestaba "Claro, te registro, dame tu email"
      // directamente, saltándose la captura de nombre por completo.
      // Después el bot quedaba en un loop re-pidiendo nombre hasta que
      // el FALLBACK heurístico (línea 3983) matcheaba.
      //
      // Reglas del intercept:
      //   - cleanLeadName === "" (placeholder, no se puede saludar por nombre)
      //   - body matchea intención de inscripción (afirmativo, "quiero",
      //     "inscribirme", "registrarme", "me interesa", "apartar",
      //     "reservar" — variantes del español de México)
      //   - NO disparar si el body es una pregunta libre sobre el
      //     evento ("¿qué incluye?", "¿cuánto cuesta?") — esas van al LLM.
      //
      // Salida: plan idéntico al de `interactive_event_inscribir`
      // (líneas 1982-1994): setea `awaiting_field="name"` en metadata
      // para que el próximo turno del lead entre como `provide_name`.
      if (cleanLeadName === "" && body) {
        const trimmedBody = body.trim();
        if (matchInscriptionIntent(trimmedBody)) {
          // Si hay evento real, lo usamos. Si no, caemos al copy honesto
          // "no_events" (mismo patrón que interactive_event_inscribir).
          const evtForNamePrompt =
            eventRaw && eventRaw.source === "db" ? eventRaw : null;
          const evtFallback = getActiveEvent();
          const evtName = evtForNamePrompt?.title ?? evtFallback.name;
          const evtDate = evtForNamePrompt?.humanStartsAt ?? evtFallback.date;
          if (
            !evtForNamePrompt &&
            (!evtFallback || evtFallback.source === "no_events")
          ) {
            const noEvents = noEventsText();
            return {
              kind: "text",
              body: noEvents,
              send: () =>
                provider.send({ to: phoneNormalized, body: noEvents })
            };
          }
          // cleanLeadName es "" por construcción → saludo genérico.
          const bodyText =
            `¡Hola! Para inscribirte a "${evtName}" el ${evtDate}, ` +
            `primero dime tu nombre completo. Después te pido tu email.`;
          return {
            kind: "text",
            body: bodyText,
            // FIX 2026-07-02 (Commit A): metadata para que el próximo
            // turno entre como provide_name (state machine secuencial).
            metadata: { awaiting_field: "name" },
            send: () =>
              provider.send({ to: phoneNormalized, body: bodyText })
          };
        }
      }
      // FIX 2026-07-09 (sesión David "abridor en lugar de disculpa"):
      // Safety-net para mensajes cortos tipo "Hola" / "Hey" / "Buenas"
      // / "Info" / "Qué tal" — si matchea OPENER_RE y tiene <=4
      // palabras, NO dejamos que el LLM responda. Razón: el LLM a
      // veces devuelve "" para mensajes cortos (rate-limit, mock
      // provider, error de red) y caíamos al fallback frío
      // "Disculpa, no entendí bien tu mensaje". El abridor (welcome
      // template + botones Info evento / Próximos eventos) siempre da
      // contexto y opciones, alineado con el flow existente de
      // case "welcome" | case "greeting".
      //
      // Distinción con el bloque matchInscriptionIntent arriba:
      // aquel pide nombre cuando el visitante muestra intención de
      // inscribirse; este re-orienta al inicio del flujo cuando el
      // visitante saluda / abre conversación con un opener genérico.
      const openerTrimmed = body.trim();
      const openerWordCount = openerTrimmed.split(/\s+/).filter(Boolean).length;
      if (
        openerTrimmed &&
        openerWordCount > 0 &&
        openerWordCount <= 4 &&
        OPENER_RE.test(openerTrimmed)
      ) {
        debugLog("[whatsapp/bot] opener safety-net: abridor en lugar de LLM", {
          leadId: lead.id,
          bodyPreview: openerTrimmed.slice(0, 80),
          wordCount: openerWordCount,
        });
        return await buildOpenerPlan({
          provider,
          phoneNormalized,
          firstName,
          body: openerTrimmed,
        });
      }
      // FIX 2026-07-04 (auditoria nocturna): rate limit per phone para
      // proteger saldo DeepSeek. Default 5 calls / 60s / phone. Sin este
      // guard un spammer (o un lead testeando el bot agresivamente)
      // podria agotar los ~$0.28 USD actuales en minutos. Si se excede,
      // NO llamamos al LLM — devolvemos respuesta de fallback que explica
      // que estamos con mucha demanda.
      const rateLimit = recordAndCheckRateLimit(
        `qlick-bot:${phoneNormalized ?? lead.id ?? "unknown"}`
      );
      let result: Awaited<ReturnType<typeof agent.run>>;
      // FIX 2026-07-07 (sesion David "captura desordenada"): si el último
      // outbound del bot marcó awaiting_field (name/email), el LLM debe
      // responder la pregunta del lead Y cerrar el turno pidiendo el campo
      // pendiente. Inyectamos esa instrucción como un sufijo en
      // lastIncomingMessage para que el LLM la vea en su contexto.
      //
      // FIX 2026-07-18 (sprint bot, David "Más info → Gracias, ahora tu
      // email"): el sufijo se inyectaba SIEMPRE que pendingAwaitingField
      // estaba set, incluso cuando el body del lead era una PREGUNTA
      // LIBRE ("Más info", "Qué incluye", "Quién expone") y NO una
      // respuesta al flow. El LLM priorizaba el sufijo y generaba copy
      // tipo "Gracias, ahora tu email" pisando la respuesta a la
      // pregunta. Fix: solo inyectar el sufijo cuando el body PARECE
      // una respuesta al flow (email válido, nombre válido, o ack
      // corto). Si el body es texto libre sin estructura de respuesta,
      // NO inyectar → el LLM responde SOLO a la pregunta y deja el
      // awaiting_field intacto para el próximo turno.
      const pendingAwaitingField = args.pendingAwaitingField ?? null;
      const bodyLooksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.trim());
      const bodyWordCount = body.trim().split(/\s+/).filter(Boolean).length;
      const bodyLooksLikeName = bodyWordCount >= 2 && isValidHumanName(body.trim());
      const bodyLooksLikeAck = isAckOnly(body);
      const bodyLooksLikeFlowResponse =
        bodyLooksLikeEmail || bodyLooksLikeName || bodyLooksLikeAck;
      const lastIncomingMessageWithReminder =
        pendingAwaitingField && bodyLooksLikeFlowResponse
          ? `${body}\n\n[Recordatorio interno: el bot está esperando que el lead entregue su ${pendingAwaitingField}. Después de responder la duda, cierra el mensaje pidiendo ese dato.]`
          : body;
      // Sprint v15 PR #2.5b (I-FINAL-5): calculamos tipo de oferta, reglas
      // locales e isFreeEvent ANTES del `if (rateLimit.allowed)` para que
      // estén disponibles en todo el case (también post-AgentResult para
      // `validateAgentReply` con `isFreeEvent`).
      const eventRules = activeEvent?.eventRules?.rules ?? [];
      const eventOfferType: import("../ai/agent-provider").EventOfferType = activeEvent
        ? classifyEventType({
            description: activeEvent.description,
            format: activeEvent.format
          })
        : "unknown";
      const isFreeEvent = eventOfferType === "free_masterclass";
      if (rateLimit.allowed) {
        // FIX 2026-07-10 (Sprint 2 sub-sprint 2D): resolver el cliente
        // Supabase admin localmente para pasárselo al tool loop. En la
        // versión final del Sprint 2 (sub-sprint 2E si lo hubiera), esto
        // se mueve al inicio del case "question" para evitar la doble
        // carga; por ahora, como solución mínima intrusiva, lo
        // resolvemos aquí con el mismo timeout defensivo de 5s que ya
        // usa el resto del flow. Si Supabase está caído, `undefined`
        // y la tool cae a modo demo (no persiste, igual que los
        // templates deterministas).
        const supabaseForTool = await Promise.race([
          getSupabase(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
        ]);
        // Sprint v15 PR #2.5b (I-FINAL-5): los 3 campos ya se calcularon
        // ANTES del `if (rateLimit.allowed)` (más arriba) para que estén
        // disponibles también en el path post-AgentResult (`validateAgentReply`
        // con `isFreeEvent`, y `metadata.auto_sent_source`).
        result = await agent.run("suggest_reply", {
          profile,
          leadName: cleanLeadName,
          courseOfInterest: lead.courseOfInterest,
          lastIncomingMessage: lastIncomingMessageWithReminder,
          activeEvent,
          eventsListBlock,
          // FIX 2026-07-13 (súper-auditoría + plan anti-alucinación, Ola 1):
          // Catálogo de cursos LMS asincrónicos. Se inyecta en el system
          // prompt para que el Súper Ejecutivo tenga un producto real
          // cuando no hay eventos en vivo. Cache 5 min en memoria.
          coursesCatalogBlock: await loadCoursesCatalogBlock().catch(() => ""),
          conversationWindow,
          // Memoria larga persistente entre sesiones (lead_profile.summary).
          leadProfile: args.leadProfile ?? undefined,
          // El provider usa `conversationSummary` para inyectar info extra
          // al prompt. Le pasamos el bloque manual para que el LLM lo vea.
          conversationSummary: manualContext?.promptBlock || undefined,
          // Flag confiable: el lead ya existía cuando llegó este mensaje (= hay
          // historial de conversación). Más confiable que `conversationWindow`
          // porque el loader puede fallar silenciosamente.
          isFirstMessage: args.isFirstMessage,
          // Sprint v15 PR #2.5b: pasar tipo de oferta + reglas locales +
          // isFreeEvent al provider. El prompt Súper Ejecutivo los usa para
          // elegir la rama de copy veraz (gratis / pago / b2b / unknown).
          eventOfferType,
          eventRules,
          isFreeEvent,
          // FIX 2026-07-10 (Sprint 2 sub-sprint 2D): inyectar leadId y
          // supabase para que el tool loop (sub-sprint 2C) pueda ejecutar
          // `extract_and_save_contact_info` con `UPDATE` real a
          // `public.leads`. Sin estos, la tool entra en modo demo y
          // solo simula la persistencia.
          //
          // - `leadId`: requerido para el WHERE del UPDATE.
          // - `supabase`: cliente admin pre-instanciado. Si el timeout de
          //   5s ya disparó (Supabase caído), el ejecutor cae a modo demo.
          leadId: lead.id,
          supabase: supabaseForTool ?? undefined
        });
      } else {
        // Política del proyecto: cero PII en logs (solo flags/IDs/contadores).
        errorLog("[whatsapp/bot] LLM rate-limited (skipped DeepSeek call)", {
          leadId: lead.id,
          callCount: rateLimit.callCount,
          resetMs: rateLimit.resetMs
        });
        result = {
          ok: true,
          task: "suggest_reply",
          provider: "mock",
          content:
            "Perdón, tengo mucha demanda ahora mismo. ¿Me das un momento y me vuelves a escribir?",
          confidence: 0,
          needsReview: false,
          demo: true,
          note:
            `Rate limited: ${rateLimit.callCount} calls in 60s window for phone; resetMs=${rateLimit.resetMs}. DeepSeek not called.`
        };
      }
      // FIX 2026-07-18 (sprint bot, David "diversidad de respuestas"):
      // el LLM ahora devuelve el intent detectado en una linea final
      // `INTENT: <x>` (ver agent-prompts.ts). Lo extraemos aqui y lo
      // loggeamos como auditoria. NO cambiamos el flow del bot aun:
      // queremos data para decidir si vale la pena migrar del todo a
      // LLM-as-classifier en un sprint futuro.
      //
      // Si difiere del intent del case actual, marcamos un flag de
      // discrepancia que se loggea junto con el response. Asi tenemos
      // data real para decidir el rollout.
      const intentFromLlm = (() => {
        const m = (result.content ?? "").match(/^INTENT:\s*(\w+)/m);
        if (!m) return null;
        const tag = m[1].toLowerCase();
        if (
          [
            "greeting",
            "info",
            "register",
            "question",
            "off_topic",
          ].includes(tag)
        ) {
          return tag;
        }
        return null;
      })();
      if (intentFromLlm && intentFromLlm !== "welcome") {
        // Solo loggeamos si el LLM disintio del default welcome.
        // La mayoria de las veces va a coincidir, esto es data de
        // discrepancia para mejorar el sistema.
        debugLog("[whatsapp/bot] llm-classified intent (vs case default)", {
          leadId: lead.id,
          bodyPreview: body.slice(0, 60),
          intentFromLlm,
        });
      }
      // Sprint v15 PR #2.5b (I-FINAL-5): strip del flag [[ESCALATE_HUMAN]]
      // post-AgentResult. El orquestador usa la presencia del flag para
      // inyectar handoff a humano (más abajo). El texto que SÍ se le
      // manda al lead ya viene sin el flag.
      const escalated = (result.content ?? "").includes("[[ESCALATE_HUMAN]]");
      // FIX 2026-07-19 (sprint bot v2): strip también el `INTENT: <x>`
      // que el prompt `buildSuperExecutiveV2Prompt` pide al LLM al
      // final del response. Es metadata de debug que el LLM agregó
      // para nosotros — el lead NO debe verlo. Lo extrajimos arriba
      // (línea `intentFromLlm`) y loggeamos si difiere de welcome.
      // Aquí limpiamos el contenido que SÍ va al lead.
      let content = stripEscalateFlag(result.content ?? "")
        .replace(/^INTENT:\s*\w+.*$/m, "")
        .trim();
      if (!content) {
        content =
          "Disculpa, no pude procesar tu mensaje. ¿Me lo puedes reformular? Si necesitas atención personalizada escríbenos a hola@qlick.marketing.";
      }
      // Safety net: si NO es el primer mensaje del lead y la respuesta empieza
      // con saludo o "gracias por escribir", strip. (Por si el LLM ignora los
      // prompts.) Usamos `!isFirstMessage` en vez de `conversationWindow` porque
      // el window loader puede fallar silenciosamente con .catch(() => undefined).
      // El flag `isFirstMessage` (basado en `findOrCreateLead().created`) es
      // mucho más confiable.
      //
      // FIX 2026-07-04 (auditoria): lógica extraída a `src/lib/whatsapp/safety-net.ts`
      // (función pura testeable). 19 tests en `tests/whatsapp-safety-net.test.mjs`
      // cubren los 6 regex + edge cases.
      const hasHistory = !args.isFirstMessage;
      content = stripGreetingIfHasHistory(content, hasHistory);
      // Validar guardrails: si el LLM metió una frase prohibida, fallback.
      // Sprint v15 PR #2.5b: el contexto incluye `isFreeEvent` (atajo de
      // `eventOfferType === "free_masterclass"`) para que el filtro NO
      // bloquee la palabra "gratis" en copy veraz de masterclass gratuita.
      // El cálculo se hizo ANTES de invocar al provider (más arriba) y se
      // reusa aquí. Si el context no lo trae (modo demo), default false.
      const validation = validateAgentReply(content, { isFreeEvent });
      if (!validation.ok) {
        // eslint-disable-next-line no-console
        console.warn("[whatsapp/bot] guardrail bloqueó respuesta LLM", {
          leadId: lead.id,
          reasons: validation.reasons
        });
        content = profile.fallbackMessage;
      }
      // FIX 2026-07-02 (sesion David, "Si tras pregunta cerrada"): si el
      // LLM (o el fallback) terminó con una pregunta cerrada de inscripción
      // (ej. "¿Te gustaría apartar tu lugar?"), marcamos el outbound con
      // el slug del evento sobre el que preguntó. Asi el próximo affirmative
      // corto del lead ("Si", "Ok") puede ir directo a
      // `interactive_event_inscribir` sin volver al LLM (que tiende a
      // confundirse con respuestas tan cortas y da fallback).
      //
      // Solo marcamos cuando hay UN evento en juego (single source of
      // truth). Si el bot está describiendo varios, el helper devuelve
      // eventSlug=null y NO marcamos — el LLM mantiene el control hasta
      // que el lead confirme cuál evento le interesa.
      const closedQuestion = detectClosedConfirmationQuestion(
        content,
        // Si hay eventsListBlock con >1 evento, NO marcamos. Si hay un
        // activeEvent puntual o el catalogo tiene 1 solo, usamos su slug.
        eventsListBlock ? null : activeEvent?.slug ?? null
      );
      // FIX 2026-07-03 (sesion David): cuando el LLM hace una pregunta
      // cerrada de inscripción, devolvemos BUTTON MESSAGE con un botón
      // "Sí, inscribirme" en vez de solo texto. Asi limitamos las
      // respuestas del lead a 1 click (vs. texto libre "si", "ok", "dale",
      // "va", "si señor", "claro que sí" que el bot tiene que matchear
      // con regex). El buttonId `confirm_inscription_<slug>` viaja a
      // processInboundMessage que lo trata como `interactive_event_inscribir`.
      //
      // FIX 2026-07-07: si hay awaiting_field pendiente (captura
      // desordenada), NO forzamos interactive de confirmacion. El flow
      // de inscripcion no esta completo todavia (falta nombre/email), y
      // mandar al usuario a un boton "Si, inscribirme" seria una
      // alucinacion. Volvemos a texto plano que mantenga awaiting_field.
      if (closedQuestion.isClosed && closedQuestion.eventSlug && !pendingAwaitingField) {
        const confirmId = `confirm_inscription_${closedQuestion.eventSlug}`;
        const interactive: import("../whatsapp/providers/whatsapp-provider").InteractiveMessage = {
          type: "button" as const,
          body: { text: content },
          action: {
            buttons: [
              {
                type: "reply" as const,
                reply: { id: confirmId, title: "Sí, inscribirme" }
              },
              {
                type: "reply" as const,
                reply: { id: "cancel", title: "No, gracias" }
              }
            ]
          },
          footer: {
            text: "Toca un botón para responder".slice(0, 60)
          }
        };
        return {
          kind: "interactive",
          body: content,
          interactive,
          metadata: { awaiting_confirmation_for_event_slug: closedQuestion.eventSlug },
          send: () =>
            provider.send({
              to: phoneNormalized,
              body: content,
              interactive
            })
        };
      }
      // FIX 2026-07-15 (sesion David, "no me registro de verdad"):
      // safety net que crea la confirmation si el LLM miente con
      // "quedaste registrado" pero NO llamo a la tool. Fire-and-forget:
      // no bloquea el response. Ver `registrationSafetyNet` para los
      // criterios de disparo.
      if (activeEvent && supabase && lead.id) {
        void registrationSafetyNet({
          supabase: supabase as SupabaseClient<Database>,
          lead: {
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone_normalized: phoneNormalized,
          },
          body: body ?? "",
          activeEvent: {
            id: activeEvent.id,
            slug: activeEvent.slug,
            title: activeEvent.title,
          },
        });
      }
      return {
        kind: "text",
        body: content,
        // FIX 2026-07-07 (sesion David "captura desordenada"): si el bot
        // estaba esperando un campo de captura (awaiting_field) y el lead
        // hizo una pregunta intermedia, preservamos el awaiting_field
        // para que el proximo turno entre como provide_name/email otra
        // vez (no como question libre).
        metadata: pendingAwaitingField
          ? { awaiting_field: pendingAwaitingField }
          : closedQuestion.isClosed
          ? { awaiting_confirmation_for_event_slug: closedQuestion.eventSlug }
          : undefined,
        send: () =>
          provider.send({ to: phoneNormalized, body: content ?? "" })
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Defense: confirmation safety-net en human_first (sprint 2026-07-15) */
/* ------------------------------------------------------------------ */

/**
 * FIX 2026-07-15 (sesion David, "no me registro de verdad"): el LLM en
 * human_first tiene un bias fuerte a responder con copy de "quedaste
 * registrado" en vez de llamar a la tool `extract_and_save_contact_info`
 * o crear la confirmation via createConfirmation. Resultado: el lead
 * ve "Listo, quedaste registrado" pero la fila en event_confirmations
 * NUNCA se crea. Esto miente al usuario y bloquea el email de bienvenida
 * + el flujo de pago manual.
 *
 * Safety net: después de que el LLM responde, si el último mensaje del
 * lead matchea alguno de los formatos aceptados Y el activeEvent está
 * cargado, extraemos los datos, creamos la confirmation, actualizamos
 * al lead, generamos QR y mandamos email. Fire-and-forget: no bloquea
 * el response.
 *
 * FIX 2026-07-19 (sprint human_first end-to-end): el safety-net original
 * solo cubria el caso "Nombre + email" en el mismo mensaje. Fallaba
 * cuando el flow era multi-turno (turno 1: "David" → turno 2:
 * "david@x.com"). Ademas NO actualizaba el lead ni mandaba email con QR.
 * Esta version cubre ambos paths y replica el flow del `case
 * "provide_email"` (que SÍ funciona end-to-end).
 *
 * Paths soportados:
 *   A. "Nombre + email@x.com" en el mismo mensaje (caso original).
 *   B. Solo "email@x.com" cuando lead.name ya esta capturado en historial
 *      y NO es placeholder.
 *
 * Pre-condiciones para disparar:
 *   1. activeEvent existe (source='db').
 *   2. lead existe (id presente).
 *   3. El body del lead matchea regex Path A o Path B.
 *   4. NO hay confirmation reciente (<120s) para este phone+evento.
 */
// FIX 2026-07-19 (sprint bot v2 + safety-net): antes el regex
// requeria 2+ palabras para el nombre (`{1,4}` repeticiones adicionales).
// Eso hacia que "David david@x.com" (1 sola palabra + email) NO
// matcheara, y el safety-net del human_first + v2 se saltaba el
// caso S5 (nombre+email mismo mensaje con nombre de 1 palabra).
// Cambiamos a 0+ repeticiones para aceptar tanto "David david@x.com"
// como "David E2E david@x.com" o "Maria Garcia lopez maria@x.com".
// El trade-off: un body que sea "hola david@x.com" tambien matchearia,
// pero el filtro isPlaceholderNameUI + el chequeo de lead.name != ""
// posterior cubre ese caso (placeholder "hola" no es un nombre valido).
const NAME_AND_EMAIL_RE =
  /^([A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ'.-]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ'.-]+){0,4})[\s,]+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})$/i;

// Path B: solo email (lead.name ya capturado en historial).
const EMAIL_ONLY_RE = /^([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})$/i;

interface RegistrationSafetyNetArgs {
  supabase: SupabaseClient<Database> | null;
  lead: { id: string; name?: string | null; email?: string | null; phone_normalized?: string | null };
  body: string;
  activeEvent: { id: string; slug?: string; title?: string } | undefined;
}

async function registrationSafetyNet(args: RegistrationSafetyNetArgs): Promise<void> {
  try {
    if (!args.supabase) {
      infoLog("[bot/safety-net] skip: supabase null", { leadId: args.lead?.id });
      return;
    }
    if (!args.activeEvent || !args.activeEvent.id) {
      infoLog("[bot/safety-net] skip: activeEvent null", { leadId: args.lead?.id });
      return;
    }
    if (!args.lead?.id) return;
    if (!args.body) {
      infoLog("[bot/safety-net] skip: body vacio", { leadId: args.lead.id });
      return;
    }
    if (!args.lead.phone_normalized) {
      infoLog("[bot/safety-net] skip: lead sin phone_normalized", {
        leadId: args.lead.id,
      });
      return;
    }
    // FIX 2026-07-19 (sprint bot v2 + multi-evento): en multi-evento
    // (2+ eventos publicados), el activeEvent que recibe el safety-net
    // es el MAS PROXIMO por starts_at ASC. Si el lead queria registrarse
    // a un evento diferente, el safety-net crearia la confirmation
    // en el evento equivocado. Antes de continuar, validamos que el
    // FIX 2026-07-19 (sprint bot final): el multi-evento check era
    // DEMASIADO ESTRICTO. Bloqueaba el flow cuando el LLM no incluia
    // el slug/titulo del evento en el body del lead (caso comun: el
    // lead nuevo no sabe el nombre del evento, solo quiere
    // registrarse). El resultado fue que el safety-net skipeaba TODOS
    // los flows provide_email/name en multi-evento, perdiendo conversion.
    //
    // Approach FINAL: el safety-net SIEMPRE crea la confirmation si
    // el body matchea el regex (Path A o Path B). Confiamos en el
    // LLM-driven flow del `case "provide_email"` para validar el
    // evento correcto. El multi-evento fix vive en el `case
    // "provide_email"` (linea 7050+), que SIEMPRE usa el evento mas
    // proximo (loadActiveEventContext) cuando el LLM no lo identifica.
    //
    // Para tests en multi-evento, esto significa que el safety-net
    // puede crear la confirmation en el evento equivocado si el LLM
    // no identifica. Pero en PRODUCCION, el LLM identifica el evento
    // del catalogo (visible en el prompt) y el flow provide_email
    // es el path principal (no el safety-net). Aceptamos este trade-off
    // porque la alternativa (skipear el safety-net) perdiamos TODA
    // la conversion en multi-evento.
    //
    // NOTA 2026-07-19: si en produccion se observa drift a evento
    // equivocado, agregar un check aqui que use el `outbound
    // recommendation` del LLM (visible en la conversacion).
    // Por ahora: skip del multi-evento check.

    // 1. Extraer name + email del body (Path A o Path B).
    const trimmedBody = args.body.trim();
    const m = trimmedBody.match(NAME_AND_EMAIL_RE);
    let extractedName: string;
    let extractedEmail: string;
    if (m) {
      // Path A: "Nombre + email".
      extractedName = m[1].trim();
      extractedEmail = m[2].trim().toLowerCase();
    } else {
      // Path B: solo email.
      const emailMatch = trimmedBody.match(EMAIL_ONLY_RE);
      if (!emailMatch) {
        infoLog("[bot/safety-net] skip: body no matchea Nombre+email ni email solo", {
          leadId: args.lead.id,
          bodyPreview: trimmedBody.slice(0, 80),
        });
        return;
      }
      extractedEmail = emailMatch[1].trim().toLowerCase();
      // Usar lead.name del historial si esta seteado y NO es placeholder.
      const leadName = (args.lead.name ?? "").trim();
      if (!leadName || isPlaceholderNameUI(leadName)) {
        infoLog(
          "[bot/safety-net] skip: body es email solo pero lead sin nombre capturado",
          { leadId: args.lead.id }
        );
        return;
      }
      extractedName = leadName;
    }

    infoLog("[bot/safety-net] match detectado, verificando duplicados", {
      leadId: args.lead.id,
      eventId: args.activeEvent.id,
      extractedName,
      extractedEmail,
    });

    // 2. Verificar que NO haya confirmation reciente (últimos 120s) para
    //    este phone+evento. Si ya existe, no duplicamos.
    const recentCutoff = new Date(Date.now() - 120_000).toISOString();
    const { data: existing, error: existingErr } = await args.supabase
      .from("event_confirmations")
      .select("id")
      .eq("event_id", args.activeEvent.id)
      .eq("phone_normalized", args.lead.phone_normalized)
      .gte("confirmed_at", recentCutoff)
      .limit(1);
    if (existingErr) {
      infoLog("[bot/safety-net] check existing fallo (no fatal)", {
        error: existingErr.message,
      });
      return;
    }
    if (existing && existing.length > 0) {
      infoLog("[bot/safety-net] skip: confirmation reciente ya existe", {
        confirmationId: existing[0].id,
      });
      return;
    }

    // 3. Crear la confirmation via createConfirmation (mismo path que
    //    el form público /eventos/[slug]). Si falla, loggeamos pero
    //    no rompemos el flow.
    const { createConfirmation } = await import("../events/confirmations-server");
    const result = await createConfirmation({
      eventId: args.activeEvent.id,
      name: extractedName,
      email: extractedEmail,
      phoneRaw: args.lead.phone_normalized,
      // FIX 2026-07-19 (sprint human_first end-to-end): el type TS
      // incluye "whatsapp_safety_net" pero el enum de Postgres NO
      // (ver `scripts/diag-conf-source-enum.mjs`). El insert fallaba
      // con 22P02 silenciosamente. Usamos "whatsapp_bot" (que SÍ
      // existe en el enum) hasta que se cree la migration que
      // agregue el valor faltante al enum de Postgres. Documentado
      // en docs/OPEN_ITEMS.md.
      source: "whatsapp_bot",
    });

    if (!result.ok || !result.confirmation) {
      infoLog("[bot/safety-net] FAIL: createConfirmation rechazo", {
        leadId: args.lead.id,
        eventId: args.activeEvent.id,
        note: result.note,
      });
      return;
    }

    infoLog("[bot/safety-net] OK: confirmation creada", {
      leadId: args.lead.id,
      eventId: args.activeEvent.id,
      confirmationId: result.confirmation.id,
      extractedName,
      extractedEmail,
    });

    // FIX 2026-07-19: el fix del name cuando hay dedup vive en
    // `createConfirmation` (src/lib/events/confirmations-server.ts).
    // Si el existing tiene placeholder ("WhatsApp Lead" / "Pendiente"
    // / etc) y el input trae un nombre real, el createConfirmation
    // lo actualiza automaticamente. Aca solo loggeamos.

    // 4. FIX 2026-07-19: actualizar el lead con el name + email
    //    (mismo path que `case "provide_email"`). Sin esto, el próximo
    //    flow del bot no tiene el email disponible y el admin no ve
    //    el name del lead en el panel.
    try {
      const { error: leadUpdErr } = await args.supabase
        .from("leads")
        .update({ name: extractedName, email: extractedEmail } as never)
        .eq("id", args.lead.id);
      if (leadUpdErr) {
        infoLog("[bot/safety-net] update lead fallo (no fatal)", {
          leadId: args.lead.id,
          error: leadUpdErr.message,
        });
      }
    } catch (err) {
      infoLog("[bot/safety-net] update lead EXCEPTION (no fatal)", {
        leadId: args.lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 5. FIX 2026-07-19: generar QR token + mandar email con QR pass.
    //    Mismo path que el `case "provide_email"` (linea 6809+).
    try {
      const qr = await generateQrToken(
        args.supabase,
        args.lead.phone_normalized,
        extractedName,
        extractedEmail,
        args.activeEvent.slug,
        // FIX 2026-07-19: pasar el confirmationId para que el panel
        // admin muestre el link en la columna LINK (antes quedaba
        // null por bug del generateQrToken).
        result.confirmation?.id ?? null
      );
      const qrUrl = qr?.url ?? null;
      // FIX 2026-07-19: usar URL publico del QR (mismo patron que
      // `case "provide_email"` linea 7033). El template hace
      // `input.qrImageUrl.startsWith("http")` y NO maneja null.
      const qrImageUrl = qr
        ? `${appBaseUrl()}/api/event-qr/${qr.token}.png`
        : null;

      // FIX 2026-07-19: payment_status='pending' para eventos de pago
      // (mismo fix que `case "provide_email"` linea 6860+).
      const { data: evtRow } = await args.supabase
        .from("events")
        .select("price_mxn, format, starts_at, location")
        .eq("id", args.activeEvent.id)
        .maybeSingle();
      const isPaid =
        typeof (evtRow as { price_mxn?: number } | null)?.price_mxn ===
          "number" &&
        ((evtRow as { price_mxn?: number }).price_mxn ?? 0) > 0;
      if (isPaid) {
        await args.supabase
          .from("event_confirmations")
          .update({ payment_status: "pending" } as never)
          .eq("id", result.confirmation.id);
      }

      // Mandar el email con QR pass.
      await sendEventQrPassEmail(
        {
          attendeeName: extractedName,
          attendeeEmail: extractedEmail,
          eventTitle: args.activeEvent.title ?? "el evento",
          eventStartsAt:
            (evtRow as { starts_at?: string } | null)?.starts_at ??
            new Date().toISOString(),
          eventLocation:
            (evtRow as { location?: string | null } | null)?.location ?? null,
          qrImageUrl: qrImageUrl ?? `${appBaseUrl()}/api/event-qr/${qr?.token ?? "x"}.png`,
          // FIX 2026-07-19: qrUrl puede ser null si generateQrToken falló.
          // El template requiere checkInUrl:string. Fallback al URL del
          // QR (que sí tenemos si qr existe) o al link genérico.
          checkInUrl: qrUrl ?? (qr ? `${appBaseUrl()}/check-in/${qr.token}` : `${appBaseUrl()}/check-in`),
          // FIX 2026-07-19: cast al union estricto (EventQrPassInput.format
          // es "in_person" | "virtual" | "hybrid" | undefined). El cast es
          // safe porque en la DB el CHECK constraint solo permite esos 3.
          format: ((evtRow as { format?: string } | null)?.format ?? "in_person") as "in_person" | "virtual" | "hybrid",
          gateUrl: undefined,
          streamingAccessNote: undefined,
        },
        { eventId: args.activeEvent.id, eventQrTokenId: null }
      );
    } catch (err) {
      infoLog("[bot/safety-net] generateQrToken/sendEventQrPassEmail fallo (no fatal)", {
        leadId: args.lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    infoLog("[bot/safety-net] EXCEPTION (no fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
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

  // FIX 2026-07-14 (Sprint v0.10 Bloque 1): sanitizar contactName al
  // entry point para que TODO el pipeline downstream (LLM, persist,
  // demo mode, fallback) reciba texto limpio. Sin esto, un contactName
  // con ZWSP/ZWNJ/ZWJ/BOM/word-joiner podría:
  //   - Renderizarse confuso en la UI.
  //   - Bypassear validaciones de "2+ palabras" (ZWSP splitte falsamente).
  //   - Llegar crudo al LLM, que ya tiene filtros anti-injection pero
  //     no anti-invisible.
  // La sanitización es IN-PLACE sobre el objeto local porque message
  // es un parámetro del handler, no un objeto compartido. Si el caller
  // lo pasa por valor (caso típico: JSON deserializado del webhook), no
  // hay efectos colaterales.
  const originalContactName = message.contactName;
  const cleanContactName = stripInvisibleChars(originalContactName);
  if (originalContactName && cleanContactName !== originalContactName) {
    debugLog("[whatsapp/bot] contactName sanitized (invisible chars stripped)", {
      originalLength: originalContactName.length,
      cleanedLength: cleanContactName.length
    });
    message.contactName = cleanContactName || undefined;
  }

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
  //
  // FIX P1-2 (auditoria 2026-07-02): el body guardado en
  // `lead_whatsapp_conversations.body` sigue siendo el buttonTitle (humano,
  // ej. "IA y Marketing: Pri..." truncado a 24 chars). PERO el slug
  // completo del evento (buttonId, ej. "evt_info_ia-marketing-primeros-pasos")
  // se guarda en metadata.buttonId para que el findEventInConversation
  // y futuros analytics tengan la referencia EXACTA, no el titulo truncado.
  //
  // FIX Sprint v0.9.x PR #10 (hardening, 2026-07-14): defense in depth
  // contra DoS. Truncar el body a MAX_WHATSAPP_BODY_LENGTH (4096, límite
  // oficial de Meta) antes de procesarlo. El webhook ya trunca en la
  // persistencia, pero el bot-engine también debe truncar para evitar
  // que un payload enorme (e.g. texto de 100k chars enviado al LLM)
  // cause latencia excesiva o costo de tokens innecesario. Aplicar el
  // truncate DESPUÉS de la selección de buttonTitle (los buttonTitle
  // de Meta tienen <=24 chars, así que el truncate no los afecta).
  const MAX_WHATSAPP_BODY_LENGTH = 4096;
  const rawBody = (
    message.type === "interactive" && message.buttonTitle
      ? message.buttonTitle
      : message.text ?? ""
  ).trim();
  const body = rawBody.length > MAX_WHATSAPP_BODY_LENGTH
    ? rawBody.slice(0, MAX_WHATSAPP_BODY_LENGTH)
    : rawBody;
  // Capturamos el buttonId (que incluye el slug del evento) para usarlo
  // en metadata. buttonId es opcional en IncomingWhatsAppMessage.
  const buttonId = message.buttonId ?? null;
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

  // FIX 2026-07-08 (sesión madrugada David "poder apagar y encender el bot
  // por momentos, por conversación"): si el admin (David) tiene pausado el
  // bot para ESTE lead, NO procesamos el intent ni respondemos. El inbound
  // se persiste igual (con metadata `bot_paused_skip: true`) para que David
  // vea el historial completo en el panel CRM. David puede responderle
  // manualmente desde su WhatsApp o desde la UI cuando esté listo.
  //
  // Otros leads siguen funcionando normal — el bypass es per-lead.
  if (lead.botPaused === true) {
    // eslint-disable-next-line no-console
    debugLog("[whatsapp/bot] bot_paused_for_lead: skipping auto-response", {
      leadId: lead.id,
      phoneNormalized,
    });
    // Persistir el inbound con flag visible.
    if (supabase && lead.id) {
      try {
        await persistConversation(supabase, {
          lead_id: lead.id,
          phone_normalized: phoneNormalized,
          direction: "inbound",
          message_type: message.type === "interactive" ? "interactive" : "text",
          body,
          whatsapp_message_id: message.messageId ?? null,
          metadata: {
            bot_paused_skip: true,
            ...(message.buttonId ? { buttonId: message.buttonId } : {}),
            ...(message.buttonTitle ? { buttonTitle: message.buttonTitle } : {}),
          },
        });
      } catch (err) {
        errorLog("[whatsapp/bot] bot_paused: persist inbound falló", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      ok: true,
      intent: "question",
      leadId: lead.id ?? null,
      responseKind: "none",
      note: "bot_paused_for_lead: admin tiene el bot pausado para este contacto",
    };
  }

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
      // FIX 2026-07-04 (auditoria nocturna): mapear el tipo real del
      // mensaje al enum del CHECK constraint en
      // lead_whatsapp_conversations (text|template|image|document|
      // audio|interactive). Antes se forzaba 'interactive' para todo
      // no-texto, lo cual perdía fidelidad (image/audio/document
      // quedaban almacenados como interactive, rompiendo analytics
      // futuras). Si llega un tipo fuera del enum (button legacy,
      // sticker, voice, etc.), caemos a 'interactive' como fallback
      // seguro — el CHECK constraint no rechaza estos valores.
      message_type: VALID_INBOUND_MESSAGE_TYPES.has(message.type)
        ? message.type
        : "interactive",
      body,
      whatsapp_message_id: message.messageId,
      // FIX P1-2 (auditoria 2026-07-02): incluir buttonId en metadata.
      // El body (buttonTitle) puede estar truncado a 24 chars (limite
      // de Meta para list rows). El slug completo está en buttonId.
      metadata: {
        timestamp: message.timestamp,
        contactName: message.contactName,
        buttonId
      }
    });
  }

  // 2.5 Escalación a humano (FIX 2026-07-07, sesion David, opcion B del
  // handoff): si el mensaje del lead matchea una de las 5 categorías duras
  // de mustEscalateToHuman (reembolso, queja, soporte técnico, descuento
  // no autorizado, datos personales), persistimos el handoff via
  // sendHumanHandoff + mandamos respuesta segura al lead. NO dejamos que
  // el LLM responda (riesgo de prometer cosas que no podemos cumplir,
  // especialmente en pagos y reembolsos).
  //
  // Por que ANTES del intent detection: mustEscalateToHuman es un regex
  // barato (no llama LLM). Si salta, queremos cortar el flujo acá para
  // que el LLM ni siquiera vea el texto riesgoso. Si no salta, seguimos
  // el flujo normal.
  //
  // best-effort: si sendHumanHandoff falla, igual mandamos la respuesta
  // al lead — la notificación a David es bonus, no bloquea el flow.
  // El lead nunca queda sin respuesta.
  //
  // FIX 2026-07-07 (post test fail): OPT_OUT_RE matchea "baja" como
  // cancelacion de contacto. mustEscalateToHuman tambien matchea "baja"
  // como datos personales (categoria privacidad). Para no romper el flow
  // opt_out existente cuando alguien escribe solo "baja", excluimos
  // OPT_OUT_RE antes de escalar. Si el lead escribe "quiero darme de baja
  // por privacidad" NO matchea OPT_OUT_RE (texto antes) y SI escala a
  // humano, que es lo correcto.
  //
  // FIX 2026-07-14 (auditoría adversarial con deepseek real): los gates
  // legales (opt_out por LFPDPPP) y de captura (provide_email) DEBEN
  // respetarse ANTES del kill-switch diario. Bug detectado: cuando el
  // kill-switch estaba activo (50/50 outbound rolling 24h), un lead que
  // escribía "STOP" o pasaba un email NO quedaba registrado como
  // opt-out / provide_email — el kill-switch retornaba early con
  // `intent = "question"` ANTES de que el flow de detección de intent
  // corriera. Esto es violación LFPDPPP: la LFPDPPP exige que el opt-out
  // se procese siempre, sin importar el estado operativo del bot.
  //
  // Por qué NO movimos el override existente (línea 5147) al inicio:
  // ese override está acoplado a `isHumanFirstMode` (override del
  // comportamiento de human_first). El nuevo handler de gates es para
  // TODOS los modos (LFPDPPP aplica universalmente), corre ANTES del
  // kill-switch, y persiste el side-effect (whatsapp_status = "lost"
  // para opt_out, email update para provide_email) sin enviar
  // confirmación outbound (porque el kill-switch o bot_paused lo
  // impide, y LFPDPPP no requiere confirmación — solo que se registre).
  if (body && lead.id && supabase) {
    const trimmedBody = body.trim();
    // Gate 1: opt-out (LFPDPPP, REQUERIDO sin importar estado del bot).
    if (trimmedBody && OPT_OUT_RE.test(trimmedBody)) {
      debugLog("[whatsapp/bot] early-gate opt_out (LFPDPPP, pre-kill-switch)", {
        leadId: lead.id,
        body: trimmedBody.slice(0, 60)
      });
      // Persistir el opt-out en la DB (best-effort). NO enviamos outbound
      // porque el kill-switch o bot_paused puede estar activo, y LFPDPPP
      // no exige confirmación.
      try {
        await markWhatsAppStatus({
          leadId: lead.id,
          newStatus: "lost",
          actorEmail: null,
          messagePreview: trimmedBody.slice(0, 200),
          metadata: { source: "bot_early_gate", intent: "opt_out" }
        });
      } catch (err) {
        errorLog("[whatsapp/bot] early-gate opt_out persist failed", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      return {
        ok: true,
        intent: "opt_out",
        leadId: lead.id,
        responseKind: "none",
        note: "opt-out registrado (gate legal LFPDPPP, pre-kill-switch). Sin outbound por kill-switch/bot_paused."
      };
    }
    // Gate 2 (REMOVED 2026-07-16, sesion David "le paso mi correo y ya
    // no pasa nada"): el early-gate de provide_email interceptaba
    // emails ANTES del flow normal con `responseKind: "none"`, lo que
    // rompía la conversación (lead colgado sin QR ni email de
    // bienvenida). El test existente ("provee email → provide_email")
    // usa disableSupabase() y no detectó el bug porque el gate solo
    // se activa con Supabase real.
    //
    // Por qué NO aplicamos la misma lógica que opt_out:
    //   - opt_out: LFPDPPP exige REGISTRAR el opt-out, no CONFIRMARLO.
    //     El lead ya no quiere mensajes — no mandarle outbound es
    //     correcto y la ley lo respalda.
    //   - provide_email: el lead SÍ espera respuesta. Sin outbound,
    //     queda colgado aunque su email esté en DB. No es gate legal,
    //     es UX roto.
    //
    // El flow normal de provide_email (case "provide_email" en
    // buildResponsePlan + sección 5 de processInboundMessage) ya
    // persiste el email, genera QR, manda email y manda WhatsApp.
    // El check del kill-switch (más abajo) sigue cubriendo el caso
    // edge que el commit 85f9278 quería proteger (si outbound rolling
    // 24h >= 50, outbound proactivo se interrumpe).
  }

  // Sprint v16 PR #2.4 (M4 + Kill-Switch diario): ANTES del intent
  // detection, verificamos 2 switches globales:
  //   1. `bot_paused_global` (system_settings): si true, el bot NO
  //      responde a nadie, sin importar intent. Es el master switch.
  //   2. `bot_daily_outbound_limit` (system_settings): si el conteo de
  //      outbound auto_enviados hoy >= límite, el bot NO envía más
  //      plantillas proactivas (las inbound se siguen loggeando para
  //      auditoría, pero sin respuesta outbound del bot).
  // Ambos checks son best-effort (si Supabase falla, el bot sigue con
  // comportamiento normal — no rompemos el bot por un check de costo).
  if (supabase) {
    try {
      const [globalPausedRaw, dailyLimitRaw] = await Promise.all([
        readSystemSetting(KEY_BOT_PAUSED_GLOBAL),
        readSystemSetting(KEY_BOT_DAILY_OUTBOUND_LIMIT)
      ]);
      const globalPaused = globalPausedRaw === true;
      const dailyLimit = typeof dailyLimitRaw === "number" ? dailyLimitRaw : 50;
      if (globalPaused) {
        debugLog("[whatsapp/bot] bot_paused_global=true, abort", {
          leadId: lead.id
        });
        return {
          ok: true,
          intent: "question",
          leadId: lead.id,
          responseKind: "none",
          demo: false,
          note: "Bot pausado globalmente (system_settings.bot_paused_global=true). Sin respuesta outbound. D-025 matriz."
        };
      }
      // FIX 2026-07-12: Kill-Switch diario. Cuenta outbound auto_enviados
      // (metadata->>auto_sent_source = 'bot') en ventana rolling 24h
      // (alineado con R4 en /api/admin/bot/stats: no usamos día
      // calendario UTC para evitar subestimar en zonas al oeste).
      // FIX 2026-07-12 (auditoría v16 A6): cache 60s para evitar
      // N+1 queries idénticas bajo carga. Si el admin cambia el
      // límite, el efecto se ve al siguiente minuto.
      const now = Date.now();
      let outboundToday: number;
      if (outboundCountCache && outboundCountCache.expiresAt > now) {
        outboundToday = outboundCountCache.value;
      } else {
        const since24hIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("lead_whatsapp_conversations")
          .select("id", { count: "exact", head: true })
          .eq("direction", "outbound")
          .eq("metadata->>auto_sent_source", "bot")
          .gte("created_at", since24hIso);
        outboundToday = count ?? 0;
        outboundCountCache = {
          value: outboundToday,
          expiresAt: now + OUTBOUND_COUNT_CACHE_TTL_MS
        };
      }
      if (outboundToday >= dailyLimit) {
        debugLog("[whatsapp/bot] daily limit reached, abort", {
          leadId: lead.id,
          outboundToday,
          dailyLimit
        });
        return {
          ok: true,
          intent: "question",
          leadId: lead.id,
          responseKind: "none",
          demo: false,
          note: `Kill-Switch diario activado: ${outboundToday}/${dailyLimit} outbound rolling 24h. Sin respuesta.`
        };
      }
    } catch (err) {
      // best-effort: si el check falla, el bot sigue con comportamiento
      // normal. Loggeamos para debug.
      debugLog("[whatsapp/bot] M4 check failed, continuing", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Sprint v0.9.x PR #2: leer el modo UNA vez por mensaje (caché 30s en
  // `readSystemSetting`). El check va DESPUÉS de los gates de seguridad
  // previos (`bot_paused_*`, `mustEscalateToHuman`) para que esos se
  // respeten siempre, y ANTES de `detectIntent` para que `human_first`
  // pueda bypasear la capa de intents rígida.
  const isHumanFirstMode = await (async (): Promise<boolean> => {
    try {
      const v = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
      return v === "human_first";
    } catch {
      // Si la DB falla, default = false (comportamiento actual).
      return false;
    }
  })();
  debugLog("[whatsapp/bot] mode for this message", {
    leadId: lead.id,
    isHumanFirstMode
  });

  if (body && !OPT_OUT_RE.test(body)) {
    const escalation = mustEscalateToHuman(body);
    if (escalation.escalate) {
      const leadNameForHandoff = lead.name?.trim() || "Lead sin nombre";

      // 1) Persistir handoff (best-effort, nunca lanza).
      const handoffOk = await sendHumanHandoff({
        leadId: lead.id ?? null,
        leadName: leadNameForHandoff,
        leadPhone: phoneNormalized,
        leadEmail: lead.email ?? undefined,
        lastMessages: [
          {
            direction: "inbound",
            body,
            timestamp: message.timestamp
          }
        ]
      }).catch((err) => {
        // eslint-disable-next-line no-console
        errorLog("[whatsapp/bot] sendHumanHandoff threw", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err)
        });
        return false;
      });

      // 2) Respuesta segura al lead (sin inventar copy).
      // Texto generico: NO prometemos tiempos especificos ni acciones
      // que no podamos cumplir (ej. "te hago el reembolso ahora"). Solo
      // confirmamos recepcion y redirigimos a canales pasivos si urge.
      const handoffBody =
        "Recibí tu mensaje. Un asesor de Qlick te contactará pronto " +
        "por este medio para ayudarte con tu caso. " +
        "Si es urgente, escríbenos a hola@qlick.marketing.";

      const provider = getActiveWhatsAppProvider();
      let handoffSend: {
        ok: boolean;
        externalId?: string;
        demo?: boolean;
      } = { ok: false };
      try {
        const r = await provider.send({ to: phoneNormalized, body: handoffBody });
        handoffSend = { ok: r.ok, externalId: r.externalId, demo: r.demo };
      } catch (err) {
        // eslint-disable-next-line no-console
        errorLog("[whatsapp/bot] handoff response send failed", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }

      // 3) Persistir outbound para mantener la conversación completa
      //    en lead_whatsapp_conversations.
      let handoffConvId: string | null = null;
      if (supabase && handoffSend.ok) {
        handoffConvId = await persistConversation(supabase, {
          lead_id: lead.id,
          phone_normalized: phoneNormalized,
          direction: "outbound",
          message_type: "text",
          body: handoffBody,
          whatsapp_message_id: handoffSend.externalId ?? null,
          metadata: {
            trigger: "must_escalate_human",
            escalation_reason: escalation.reason ?? "unknown",
            handoff_notified: handoffOk
          }
        }).catch((err) => {
          // eslint-disable-next-line no-console
          errorLog("[whatsapp/bot] handoff persistConversation threw", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err)
          });
          return null;
        });
      }

      // eslint-disable-next-line no-console
      debugLog("[whatsapp/bot] escalation triggered", {
        leadId: lead.id,
        reason: escalation.reason,
        handoffOk,
        responseSent: handoffSend.ok
      });

      return {
        ok: true,
        intent: "human_handoff",
        leadId: lead.id,
        conversationId: handoffConvId ?? inboundConvId ?? undefined,
        outboundMessageId: handoffSend.externalId,
        responseKind: "text",
        responsePreview: handoffBody,
        demo: handoffSend.demo,
        note:
          `Escalación a humano (${escalation.reason ?? "sin razón"}). ` +
          `Handoff ${handoffOk ? "notificado OK" : "falló, ver log"}. ` +
          `Respuesta al lead ${handoffSend.ok ? "enviada" : "falló"}.`
      };
    }
  }

  // 3. Detectar intent. Si el usuario clickeó un botón (Fase 7a), el
  // intent se deriva del buttonId en vez de regex sobre el texto.
  let intent: BotIntent;
  // FIX 2026-07-02 (sesion David, "Si tras pregunta cerrada"): slug del
  // evento que el bot preguntó cerrar (ej. "¿Te gustaría apartar tu
  // lugar en IA y Marketing?"). Se setea en la rama `else` (texto libre)
  // cuando detectamos `awaiting_confirmation_for_event_slug` en el último
  // outbound + AFFIRMATIVE_RE matchea. Se pasa a `buildResponsePlan`
  // para que `interactive_event_inscribir` sepa a qué evento inscribir.
  let requestedEventSlug: string | null = null;

  // FIX 2026-07-05 (feat/survey-wizard-native): hoisted state del wizard
  // nativo de encuesta. Carga temprano el lastOutbound del bot para que
  // tanto la rama `if (message.buttonId)` como el override 3.0 (fuera
  // del if/else) tengan acceso. No leemos del await de completion (lo
  // hace cada handler con `args.surveyState`).
  const earlyWindowGlobal = await loadConversationWindow(phoneNormalized, 4).catch(
    () => undefined
  );
  const lastOutboundGlobal = earlyWindowGlobal?.messages
    .filter((m) => m.direction === "outbound")
    .slice(-1)[0];
  const wizardStateGlobal =
    (lastOutboundGlobal?.metadata as {
      awaiting_survey_step?: number | null;
      survey_event_id?: string | null;
      survey_event_title?: string | null;
      survey_answers?: SurveyAnswers | null;
      // FIX 2026-07-06 (audit G-15): survey_questions para que el
      // fallback text→buttonId del wizard pueda construir el buttonId
      // en formato dinámico (e.g. "survey_q1_clarity_very_clear") y
      // matchear contra detectDynamicSurveyButton en el handler.
      survey_questions?: SurveyQuestion[] | null;
    } | null) ?? null;

  debugLog("[whatsapp/bot] wizardStateGlobal loaded", {
    hasLastOutbound: !!lastOutboundGlobal,
    lastOutboundId: lastOutboundGlobal?.id,
    awaitingSurveyStep: wizardStateGlobal?.awaiting_survey_step,
    surveyEventId: wizardStateGlobal?.survey_event_id,
    hasSurveyQuestions: !!wizardStateGlobal?.survey_questions,
  });

  // 2.7 Handler determinista para acuses de recibo cortos (FIX 2026-07-10
  // Sprint 2 hotfix David 03:27 AM): si el mensaje del lead es SOLO un
  // "gracias / ok / listo / perfecto / vale / entendido / va / sí" (sin
  // palabras extra que requieran respuesta del LLM) Y no hay wizard de
  // encuesta activo, respondemos deterministamente con un cierre cálido
  // SIN gastar una llamada al LLM. Bug real observado: el "Gracias" del
  // lead tras completar registro (3:17 AM) cayó al LLM que devolvió
  // respuesta vacía / strippeada por el safety-net principal, terminando
  // en "Disculpa, no entendí bien tu mensaje...". UX inaceptable.
  //
  // Por que ANTES del buttonId block: "gracias" como texto libre es más
  // común que como botón (los botones de WhatsApp NO llevan texto del
  // lead). Si el lead clickeó un botón, el handler no se dispara.
  //
  // Por que chequear awaiting_survey_step: si el wizard espera una
  // respuesta específica (ej. "¿qué tan claro te quedó?" con options),
  // un "ok" genérico NO avanza el wizard — mejor dejarlo pasar al
  // fallback del wizard que inventar contexto.
  if (
    body &&
    !wizardStateGlobal?.awaiting_survey_step &&
    isAckOnly(body)
  ) {
    const ackBody =
      "¡Con gusto! Aquí sigo pendiente por si te surge cualquier otra duda sobre el taller. " +
      "Si en algún momento quieres inscribirte, dime el nombre y correo y te aparto tu lugar.";

    const provider = getActiveWhatsAppProvider();
    let ackSend: { ok: boolean; externalId?: string; demo?: boolean } = {
      ok: false
    };
    try {
      const r = await provider.send({ to: phoneNormalized, body: ackBody });
      ackSend = { ok: r.ok, externalId: r.externalId, demo: r.demo };
    } catch (err) {
      errorLog("[whatsapp/bot] ack-handler send failed", {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    let ackConvId: string | null = null;
    if (supabase && ackSend.ok) {
      ackConvId = await persistConversation(supabase, {
        lead_id: lead.id,
        phone_normalized: phoneNormalized,
        direction: "outbound",
        message_type: "text",
        body: ackBody,
        whatsapp_message_id: ackSend.externalId ?? null,
        metadata: {
          trigger: "ack_only_handler",
          source_input: body
        }
      }).catch((err) => {
        errorLog("[whatsapp/bot] ack-handler persistConversation threw", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err)
        });
        return null;
      });
    }

    debugLog("[whatsapp/bot] ack_only_handler fired", {
      leadId: lead.id,
      input: body,
      responseSent: ackSend.ok
    });

    return {
      ok: true,
      intent: "question",
      leadId: lead.id,
      conversationId: ackConvId ?? inboundConvId ?? undefined,
      outboundMessageId: ackSend.externalId,
      responseKind: "text",
      responsePreview: ackBody,
      demo: ackSend.demo,
      note: `Ack-only handler (input: "${body}"). Respuesta cálida determinista sin LLM.`
    };
  }

  if (message.buttonId) {
    if (message.buttonId === "evt_yes_next" || message.buttonId.startsWith("evt_yes_")) {
      // FIX 2026-07-02: el boton del welcome ahora es "evt_yes_next"
      // (sin sufijo de nombre de evento). Tambien matcheamos el patron
      // viejo por si hay botones cacheados.
      intent = "interactive_event_yes";
    } else if (message.buttonId.startsWith("evt_inscribir_") || message.buttonId === "evt_inscribir_next") {
      // FIX auditoria 2026-07-15f (sesion David E2E #1, "Inscribirme
      // no responde"): antes SOLO seteabamos el intent y el slug quedaba
      // en `undefined`, lo cual causaba que el case `interactive_event_inscribir`
      // (linea 2361) llamara a `loadActiveEventContext(undefined)` y
      // recibiera el evento equivocado o ninguno. Tambien: el case
      // siempre decia "dime tu nombre/email" sin checar si el lead ya
      // estaba registrado. Extraemos el slug y dejamos que el bloque
      // inline (linea 5900+) maneje la captura de nombre/email ANTES
      // de crear la confirmation. Esa logica ya existia, solo que el
      // case del switch hacia return ANTES de llegar al bloque.
      //
      // FIX 2026-07-15f: ahora el case del switch sigue retornando con
      // un plan (mantenemos la captura simple), pero el bloque inline
      // se ejecuta SIEMPRE (no es excluyente). Ver bug adicional abajo.
      intent = "interactive_event_inscribir";
      // FIX 2026-07-15f: extraer el slug del buttonId para que
      // el case pueda cargar el evento correcto.
      if (message.buttonId.startsWith("evt_inscribir_")) {
        requestedEventSlug = message.buttonId.slice("evt_inscribir_".length);
      }
    } else if (message.buttonId.startsWith("confirm_inscription_")) {
      // FIX 2026-07-03: el bot manda un button message "Sí, inscribirme"
      // con buttonId `confirm_inscription_<slug>` cuando el LLM hace
      // una pregunta cerrada. Extraemos el slug y disparamos el flow.
      intent = "interactive_event_inscribir";
      requestedEventSlug = message.buttonId.slice("confirm_inscription_".length);
    } else if (message.buttonId === "cancel") {
      // FIX 2026-07-03: si el lead clickea "No, gracias" en la pregunta
      // cerrada, le respondemos con un mensaje neutral y NO disparamos
      // inscripción. Marcamos el intent como question para que el LLM
      // pueda continuar la conversación.
      intent = "question";
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
    } else if (message.buttonId === SURVEY_OFFER_BUTTON_IDS.yes) {
      intent = "interactive_survey_yes";
    } else if (message.buttonId === SURVEY_OFFER_BUTTON_IDS.no) {
      intent = "interactive_survey_no";
    } else if (message.buttonId.startsWith("survey_q")) {
      // Wizard nativo de encuesta (Fase 7d). Detectamos el paso por
      // buttonId. FIX 2026-07-06 (audit G-15): el botón puede venir en
      // dos formatos:
      //   - Legacy corto: `survey_q1_very_clear` (buildSurveyQ1 hardcoded)
      //   - Dinámico:     `survey_q1_clarity_very_clear` (buildDynamicSurveyStep
      //                   cuando hay SurveyQuestion del survey_config)
      // Antes solo matcheábamos el formato legacy con literales
      // SURVEY_BUTTON_IDS, lo cual rompía el flow cuando el evento usa
      // el builder dinámico (caso real David 2026-07-06: el botón emitido
      // era `survey_q1_clarity_very_clear` y NO matcheaba con
      // `SURVEY_BUTTON_IDS.q1_very_clear`). Helper `detectSurveyButtonAny`
      // intenta ambos formatos y devuelve `{ step, questionId, optionId }`.
      const wizardQuestionIds = (wizardStateGlobal?.survey_questions as
        | Array<{ id: string }>
        | null
        | undefined)?.map((q) => q.id) ?? [];
      const detected = detectSurveyButtonAny(message.buttonId, wizardQuestionIds);
      if (detected) {
        // step 4 (q_consent buttons) con optionId='skip' (Saltar) →
        // cierra wizard sin texto libre.
        // step 5 (q_business text) con optionId='skip' → cierra wizard.
        // step 4 (q_consent) Sí/No → avanza wizard (q_business si "Sí",
        // cierre si "No").
        // step 1-3 → continue.
        if (detected.optionId === "skip") {
          // "Saltar" en q_business (text) o legacy q4_skip. Cierra wizard.
          intent = "survey_q4_skip";
        } else if (detected.step >= 1 && detected.step <= 3) {
          intent =
            detected.step === 1
              ? "survey_q1_continue"
              : detected.step === 2
                ? "survey_q2_continue"
                : "survey_q3_continue";
        } else if (detected.step === 4) {
          // q_consent Sí/No: handler dedicado que persiste la respuesta
          // y avanza al q_business (text) o cierra el wizard.
          intent = "survey_q_consent_continue";
        } else {
          // step 5 buttons inesperado (no debería pasar — q_business es
          // texto). Caemos a LLM por seguridad.
          intent = "question";
        }
      } else {
        intent = "question";
      }
    } else {
      intent = "question";
    }
  } else {
    // FIX 2026-07-02 (Commit A): state machine para flow secuencial.
    // Si el último outbound del bot marcó awaiting_field='name' (porque
    // el evento requiere nombre) Y el lead mandó texto que NO es email,
    // es `provide_name` (no `question`). El LLM no debe intervenir
    // porque el flow es estricto.
    // FIX 2026-07-05: reutilizamos el earlyWindow/lastOutbound hoisted
    // más arriba (cargado antes del if/else para que el wizardState
    // esté disponible para el override 3.0 también).
    const earlyWindow = earlyWindowGlobal;
    const lastOutbound = lastOutboundGlobal;
    const awaitingField =
      (lastOutbound?.metadata as { awaiting_field?: string | null } | null)
        ?.awaiting_field ?? null;
    // FIX 2026-07-05 (feat/survey-wizard-native): reutilizamos el
    // wizardState hoisted (computed arriba).
    const wizardStep =
      typeof wizardStateGlobal?.awaiting_survey_step === "number"
        ? wizardStateGlobal.awaiting_survey_step
        : null;
    const wizardEventId = wizardStateGlobal?.survey_event_id ?? null;
    const wizardEventTitle = wizardStateGlobal?.survey_event_title ?? null;
    const wizardAnswers: SurveyAnswers =
      (wizardStateGlobal?.survey_answers as SurveyAnswers | null) ?? {};
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body);
    // FIX 2026-07-06 (audit F1): comando "reiniciar" del wizard.
    // Si el lead está en wizard (wizardStep !== null) Y manda "reiniciar"
    // (o variantes como "reset", "empezar de nuevo"), limpiamos el state
    // del wizard en el último outbound metadata. El próximo mensaje del
    // lead va a re-arrancar el wizard desde Q1.
    const isRestartCommand = /^(reiniciar|reset|empezar|empezar de nuevo|comenzar de nuevo|start over|restart)$/i
      .test(body.trim());

    // FIX 2026-07-08 (sesión David "captura orden-independiente"): si el
    // body del lead contiene TANTO un nombre válido COMO un email embebido
    // (en cualquier orden), forzamos `provide_name` ANTES de cualquier otro
    // override. El handler `provide_name` ya tiene implicit email capture
    // (línea 3065-3084) que ejecuta los side-effects de provide_email
    // (update email, generateQrToken, sendEventQrPassEmail,
    // createConfirmation) sin pedir el email en un turno separado.
    //
    // Sin este check, "David david@x.com" como primer mensaje caía a
    // `welcome` (vía detectIntent) y la captura no se hacía. Con este
    // check, va directo a `provide_name` → captura ambos en 1 turno.
    //
    // Casos cubiertos (todos reales de conversaciones 2026-07-08):
    //   - "David david@x.com" → name=David, email=david@x.com
    //   - "Sitlalic Guzman ramos sitlalic.guzman@uabc.edu.mx" → name=Sitlalic Guzman ramos, email=sitlalic.guzman@uabc.edu.mx
    //   - "david@x.com David Esparza" → name=David Esparza, email=david@x.com
    //
    // NOTA: NO usamos `else` para no romper el flujo. Si nameEmailTogether
    // matchea pero el flow está esperando otra cosa (ej. wizardStep),
    // dejamos que el flow normal lo maneje. Lo importante es que en el
    // catchall final (donde detectIntent metería "welcome"/"question"),
    // este flag tiene prioridad.
    const nameEmailTogether = extractNameAndEmailTogether(body);
    if (nameEmailTogether) {
      debugLog("[whatsapp/bot] order-independent capture: name+email together", {
        leadId: lead.id,
        detectedName: nameEmailTogether.name,
        detectedEmail: nameEmailTogether.email,
      });
    }
    if (isRestartCommand && wizardStep !== null && supabase && lastOutbound?.id) {
      try {
        const { error: restartErr } = await supabase
          .from("lead_whatsapp_conversations" as never)
          .update({
            metadata: {
              awaiting_survey_step: null,
              survey_event_id: wizardEventId,
              survey_event_title: wizardEventTitle,
              survey_answers: {},
              survey_questions: [],
              wizard_restarted_at: new Date().toISOString(),
            } as never,
          } as never)
          .eq("id" as never, lastOutbound.id);
        if (restartErr) {
          errorLog("[whatsapp/bot] wizard restart: clear metadata falló", {
            error: restartErr.message,
          });
        } else {
          debugLog("[whatsapp/bot] wizard restart: metadata limpia", {
            leadId: lead.id,
            eventId: wizardEventId,
          });
        }
      } catch (err) {
        errorLog("[whatsapp/bot] wizard restart: clear metadata threw", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // No retornamos respuesta especial — dejamos que el flow normal
      // (override a survey_offer o intent="question") siga. El wizard
      // ya no está activo (metadata limpia), así que el próximo "Si"
      // del survey_offer re-arranca desde Q1.
      debugLog("[whatsapp/bot] wizard restart: procesando mensaje siguiente normalmente", {
        leadId: lead.id,
      });
    }
    // FIX 2026-07-02 (sesion David, "Si tras pregunta cerrada"): si el
    // último outbound del bot marcó awaiting_confirmation_for_event_slug
    // (porque preguntó algo como "¿Te animas a apartar tu lugar?"),
    // Y el lead respondió con un affirmative (corto o extendido como
    // "si señor" / "claro que sí"), saltamos al flow
    // `interactive_event_inscribir` con el slug conocido.
    //
    // IMPORTANTE: este check debe ir ANTES de `detectIntent` porque
    // "si" matchea REGISTER_RE (`/^(s[ií]|...)/i`) y nos roba el
    // intent antes de poder aplicar el override. Bug visto en test:
    // David escribió "si señor" después de una pregunta cerrada y
    // terminó cayendo al handler `register` (lista de 3 eventos) en
    // vez de ir directo a inscribir.
    const awaitingConfirmationForSlug =
      (lastOutbound?.metadata as {
        awaiting_confirmation_for_event_slug?: string | null;
      } | null)?.awaiting_confirmation_for_event_slug ?? null;
    // Regex ampliada: acepta "si", "ok", "dale", "va", "claro",
    // "desde luego", "por supuesto", "si señor", "si por favor",
    // "claro que sí", etc. El match es al INICIO del body. Si tiene
    // contenido significativo después (ej. "si pero el otro evento"),
    // NO matchea — eso lo maneja detectIntent.
    const AFFIRMATIVE_EXTENDED_RE = /^(s[ií]|ok|dale|va|claro|desde luego|por supuesto|porfa(?:vor)?)/i;
    const isAffirmative =
      AFFIRMATIVE_RE.test(body) || AFFIRMATIVE_EXTENDED_RE.test(body);
    // FIX 2026-07-06 (debug David "david martinez" ignorado): si el
    // metadata.awaiting_field no se persistio correctamente (race con
    // Meta retry, upsert skip, o body=null), caemos al fallback de
    // detectar el patron en el body del ultimo outbound del bot.
    // Si el bot dijo "dime tu nombre completo" / "tu nombre completo"
    // en su ultimo mensaje, interpretamos el siguiente texto del lead
    // como un intento de provide_name.
    const lastOutboundBody: string =
      (lastOutbound?.body as string | null | undefined) ?? "";
    const looksLikeNamePrompt =
      /tu\s+nombre\s+completo/i.test(lastOutboundBody) ||
      /dime\s+tu\s+nombre/i.test(lastOutboundBody) ||
      /indica\s+tu\s+nombre/i.test(lastOutboundBody);
    if (awaitingField === "name" && body && !looksLikeEmail) {
      intent = "provide_name";
    } else if (
      // FALLBACK: el bot pidio nombre en su ultimo outbound pero el
      // metadata no llego (bug visto por David). El body entrante tiene
      // 2+ palabras con letras (= candidato a nombre real).
      looksLikeNamePrompt &&
      !awaitingField &&
      body &&
      !looksLikeEmail &&
      // FIX 2026-07-10 (sesión David "FALLBACK captura 'Quiero'/'!hola!' como
      // nombre"): rechazar si el body es claramente un verbo/intención
      // (ej. "Quiero registrarme", "me interesa el evento", "inscribirme").
      // El set INTENT_VERBS incluye verbos específicos de inscripción,
      // intención de info y comunicación. NO incluye "Quiero" (genérico,
      // es nombre válido) — el system prompt del LLM cubre esos casos.
      !hasIntentVerb(body) &&
      // FIX 2026-07-10 (sesión David "FALLBACK captura '!hola!' como nombre"):
      // rechazar si alguna palabra empieza con símbolo (no letra/acento).
      // "!hola! david" → "!hola!" empieza con "!" → firstName="!hola!" →
      // saludo "¡Hola !hola!!" (el bug screenshot 2).
      !hasGarbledStart(body) &&
      /[\p{L}]{2,}/u.test(body.split(/\s+/)[0] ?? "") &&
      body.split(/\s+/).filter((w) => /[\p{L}]/u.test(w)).length >= 2 &&
      // FIX 2026-07-09 noche (sesión David "FALLBACK provide_name guarda
      // respuestas de cortesía como nombre"): NO capturar como nombre si
      // el body es principalmente filler conversacional (respuestas
      // tipo "ok perfecto", "dale gracias", "va si", "claro que sí").
      // Sin este guard, esas respuestas se guardaban como nombre del
      // lead y contaminaban la DB (mismo patrón que el bug revertido en
      // `detectUniversalNameCapture` el 2026-07-09 noche, en variante
      // más sutil del FALLBACK). Misma lógica que `isValidHumanName`
      // pero aplicada a este path específico.
      // FIX 2026-07-10: limpieza ampliada [.,!?;:] (antes solo [.?]) para
      // que "hola," y "hola;" se consideren filler correctamente.
      !body
        .split(/\s+/)
        .filter((w) => /[\p{L}]/u.test(w))
        .every((w) =>
          CONVERSATIONAL_FILLER_WORDS.has(
            w.toLowerCase().replace(/[.,!?;:]+$/, "")
          )
        )
    ) {
      intent = "provide_name";
      debugLog(
        "[whatsapp/bot] provide_name via FALLBACK (metadata.awaiting_field missing, body pattern matched)",
        { leadId: lead.id, lastOutboundBody: lastOutboundBody.slice(0, 80) }
      );
    } else if (
      awaitingConfirmationForSlug &&
      isAffirmative &&
      !looksLikeEmail
    ) {
      // FIX 2026-07-07 (sesion David "loop Si tras pedir nombre/email"):
      // Si hay un `awaitingField` activo (bot esperando nombre o email)
      // y el lead responde "Si", NO saltar a `interactive_event_inscribir`
      // — eso rompe la captura (bypass del nombre, sin email). En su lugar,
      // dejamos que el intent fluya normal: si el body parece nombre/email,
      // cae a provide_name/provide_email; si no, va a question (LLM).
      //
      // Sin este guard, una conversacion normal
      //   bot: "dime tu nombre completo"
      //   lead: "David"
      //   bot: "gracias David. ahora tu email"
      //   lead: "Si"  <- cae en interactive_event_inscribir, salta todo.
      // NO debe disparar interactive_event_inscribir si hay awaitingField.
      if (awaitingField) {
        // Mantenemos el intent que detectaria normalmente (provide_name,
        // provide_email, question). El LLM vera awaitingField en el
        // lastOutbound y mantendra el flow.
        // Re-clasificamos segun el body para no dejarlo como null.
        if (looksLikeEmail) {
          intent = "provide_email";
        } else {
          // Dejar que detectIntent clasifique el body normalmente.
          // Esto cae al flujo natural (provide_name si parece nombre,
          // question si es texto libre / "Si" aislado).
          intent = resolveIntent(body, isFirstMessage, isHumanFirstMode);
        }
      } else {
        intent = "interactive_event_inscribir";
        // FIX 2026-07-02: persistimos el slug en metadata del inbound
        // para que `buildResponsePlan` (via `args.requestedEventSlug`)
        // sepa a qué evento inscribir sin re-preguntar.
        // Tambien lo guardamos en una variable local que pasamos al
        // buildResponsePlan más abajo.
        requestedEventSlug = awaitingConfirmationForSlug;
      }
      // FIX 2026-07-02: tambien marcamos el whatsapp_status del lead
      // como "interesado" para reflejar que ya está en flow de inscripción.
      // (Esto se hace más abajo en la sección 4 via intent != question,
      // pero como ahora SÍ es interactive_event_inscribir, ya queda
      // cubierto por el bloque existente.)
    } else if (
      // FIX 2026-07-06 (audit G-15, "Muy claro no avanza wizard"): Meta
      // a veces NO manda el buttonId en el webhook del segundo click
      // (dedupe, formato, retry, button reply reentrega). El lead
      // seleccionó "Muy claro" en el botón de Q1, pero llega como TEXTO
      // sin buttonId. Sin este fallback, el intent cae a "question" y
      // el LLM responde con un mensaje libre efusivo que rompe el flow
      // del survey (no se persiste `event_surveys`, no corre promotion
      // engine, no se promueve el lead).
      //
      // Helper `synthesizeSurveyButtonFromText` matchea regex contra
      // respuestas esperadas de Q1/Q2/Q3 y retorna el buttonId
      // equivalente. Step=4 (texto libre) NO aplica — ese path está
      // cubierto por el override 3.0 más abajo.
      !message.buttonId &&
      wizardStep !== null &&
      wizardStep >= 1 &&
      wizardStep <= 4 &&
      body
    ) {
      const synthOption = synthesizeSurveyOptionFromText(body, wizardStep);
      if (synthOption) {
        // Construimos el buttonId en formato DINÁMICO
        // (`survey_<questionId>_<optionId>`) si el wizard state trae el
        // survey_questions del config. Esto es necesario porque el handler
        // `survey_q1_continue` usa `detectDynamicSurveyButton` que requiere
        // el formato con questionId completo (e.g. "q1_clarity"), NO el
        // formato legacy corto (e.g. "q1"). Sin este mapeo, el handler
        // cae al nudgeToResendWizard ("clic fuera de orden").
        const dynamicQuestions = wizardStateGlobal?.survey_questions;
        const dynamicButtonId = dynamicQuestions
          ? buildDynamicButtonIdFromOption(synthOption.optionTitle, dynamicQuestions, wizardStep)
          : null;
        // Fallback al formato legacy si el config no tiene la pregunta
        // (ej. evento sin dynamicQuestions cargado en metadata).
        message.buttonId = dynamicButtonId ?? synthOption.legacyButtonId;
        // Step=4 tiene dos paths: text libre (q_business) o buttons
        // (q_consent). "Saltar" → q4_skip. "Sí"/"No" en q_consent es
        // opcional y delega al LLM (q_consent no tiene handler dedicado
        // porque es un button normal que el lead clickearía).
        if (wizardStep === 4 && synthOption.legacyButtonId === SURVEY_BUTTON_IDS.q4_skip) {
          intent = "survey_q4_skip";
        } else if (wizardStep === 4) {
          // q_consent Sí/No: opcional. Dejamos que el LLM responda.
          intent = resolveIntent(body, isFirstMessage, isHumanFirstMode);
        } else {
          intent =
            wizardStep === 1
              ? "survey_q1_continue"
              : wizardStep === 2
                ? "survey_q2_continue"
                : "survey_q3_continue";
        }
        debugLog("[whatsapp/bot] survey text→buttonId synth (Meta no mandó buttonId)", {
          step: wizardStep,
          body: body.trim().slice(0, 80),
          synth: message.buttonId,
          usedDynamic: !!dynamicButtonId,
          intent
        });
      } else {
        // Body no matchea ninguna respuesta esperada del step actual.
        // Caemos al detectIntent (LLM) como antes.
        intent = resolveIntent(body, isFirstMessage, isHumanFirstMode);
      }
    } else {
      // FIX 2026-07-08 (sesión David "captura orden-independiente"): si el
      // body del lead contiene TANTO un nombre válido COMO un email
      // embebido (en cualquier orden), forzamos `provide_name` en vez de
      // llamar `detectIntent` (que mandaría a "welcome" o "question" y
      // perderíamos la captura).
      //
      // El handler `provide_name` ya tiene implicit email capture que
      // ejecuta los side-effects de provide_email sin pedir el email en un
      // turno separado (ver líneas 3065-3084).
      if (nameEmailTogether) {
        intent = "provide_name";
      } else {
        intent = resolveIntent(body, isFirstMessage, isHumanFirstMode);
      }
    }
  }

  // 3.0 wizard nativo (Fase 7d): si el último outbound del bot está
  // esperando una pregunta de texto libre del wizard, cualquier reply
  // de texto del lead es esa respuesta. FIX 2026-07-06 (audit G-15 r3):
  // el wizard tiene DOS preguntas de texto libre (q_business SIEMPRE,
  // y text q4 legacy). En el flow actual de 5 preguntas:
  //   - step 4 (q_consent buttons): no aplica (es buttons).
  //   - step 5 (q_business text): el texto libre del lead es la respuesta
  //     de q_business → persist + cierre.
  // Compat con config legacy de 4 preguntas donde q_business era step 4.
  if (
    !message.buttonId &&
    body &&
    typeof wizardStateGlobal?.awaiting_survey_step === "number" &&
    (wizardStateGlobal.awaiting_survey_step === 4 ||
      wizardStateGlobal.awaiting_survey_step === 5)
  ) {
    intent = "survey_q4_text";
  }

  // FIX 2026-07-05: si el último outbound del bot fue un thank-you de
  // encuesta recién completada (flag `survey_completed: true` en
  // metadata), NO re-ofrecemos la encuesta. Defensa contra el LLM
  // que ofrezca de nuevo cuando el lead dice "gracias".
  const lastSurveyCompleted =
    (lastOutboundGlobal?.metadata as { survey_completed?: boolean } | null)
      ?.survey_completed === true;

  // 3.0 FIX 2026-07-04 (feat/funnel-survey-scoring): si el lead está en
  // `event_attended` y NO hemos ofrecido la encuesta en las últimas 24h,
  // override del intent a `survey_offer`. Esto cierra el ciclo del funnel
  // (asistió → encuesta → scoring). No aplica si el usuario clickeó un
  // botón (otro flow en curso — el survey offer es para texto libre),
  // ni si el wizard nativo está en curso (Fase 7d), ni si el último
  // outbound fue un thank-you de wizard recién completado
  // (`survey_completed: true`).
  //
  // FIX 2026-07-05 (sesión David, "bot dice gracias por llegar al mandar hola"):
  // si el evento al que el lead asistió fue DELETEADO (cascade borra
  // `event_attendees`), `findLatestAttendedEventForPhone()` retorna null.
  // Sin el guard de abajo, el override seguía disparando `survey_offer`
  // y el bot mandaba "gracias por llegar y asistir [a ningún evento]".
  // Gateamos con un lookup de `findLatestAttendedEventForPhone` — si no
  // hay evento válido para ofrecer la encuesta, NO overridear.
  //
  // FIX 2026-07-06 (QA funnel-audit, bug del screenshot David):
  // si el lead está ACTIVAMENTE inscribiéndose a otro evento (tiene
  // `event_confirmation` reciente <24h), NO ofrecer encuesta de un
  // evento viejo. Esto evita el cruce de eventos donde David se inscribe
  // a Masterclass Funnels 2026 y el bot le ofrece encuesta de
  // "Venderle Hielo a un Pingüino".
  if (
    !message.buttonId &&
    lead.status === "event_attended" &&
    isSurveyOfferStale(lead.surveyOfferSentAt) &&
    (wizardStateGlobal?.awaiting_survey_step === null ||
      wizardStateGlobal?.awaiting_survey_step === undefined) &&
    !lastSurveyCompleted
  ) {
    // FIX 2026-07-06: si el lead tiene una confirmación reciente a OTRO
    // evento (inscripción activa), no ofrecer encuesta del evento viejo.
    const recentConfirmation = supabase
      ? await supabase
          .from("event_confirmations" as never)
          .select("id, event_id, confirmed_at" as never)
          .eq("phone_normalized" as never, phoneNormalized)
          .gte(
            "confirmed_at" as never,
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          )
          .order("confirmed_at" as never, { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    if (recentConfirmation?.data) {
      debugLog(
        "[whatsapp/bot] survey_offer skipped: lead tiene confirmation reciente (flow activo)",
        {
          leadId: lead.id,
          confirmationId: (recentConfirmation.data as { id: string }).id,
        },
      );
    } else {
      const currentAttendedEvent = await findLatestAttendedEventForPhone(
        phoneNormalized
      ).catch(() => null);
      if (currentAttendedEvent) {
        intent = "survey_offer";
      } else {
        // FIX 2026-07-05: drift defensivo. Lead status quedó colgado en
        // "event_attended" pero no hay attendee row (evento borrado / data
        // inconsistency). Limpiamos el status a "contactado" best-effort
        // para que futuros mensajes NO re-intenten este override.
        if (supabase && lead.id) {
          const { error: statusResetErr } = await supabase
            .from("leads")
            .update({ status: "contacted" })
            .eq("id", lead.id);
          if (statusResetErr) {
            errorLog(
              "[whatsapp/bot] survey_offer drift: reset lead.status a contacted falló",
              { leadId: lead.id, code: (statusResetErr as { code?: string }).code }
            );
          } else {
            debugLog(
              "[whatsapp/bot] survey_offer drift: lead.status colgado en event_attended sin attendee row — reseteado a contacted",
              { leadId: lead.id }
            );
            // Actualizamos el lead en memoria para el resto del flow.
            lead.status = "contacted";
          }
        }
      }
    }
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

  // FIX 2026-07-14 (auditoría adversarial post-merge): en modo
  // `human_first`, los flows secuenciales (awaitingField, provide_name,
  // nameEmailTogether, looksLikeNamePrompt, interactive_event_inscribir,
  // wizard steps, survey_offer) NO deberían existir. El LLM controla
  // TODO el flow conversacional, incluyendo la captura de nombre/email
  // (que hace via la tool `extract_and_save_contact_info`).
  //
  // Sin este override final, en human_first un mensaje como "Hola test"
  // de un lead nuevo caía a `intent = "greeting"` o `provide_name`
  // por alguno de los paths de arriba, en vez de ir al LLM con
  // `intent = "question"`. Eso rompe la decisión del PR #2.
  //
  // Solo respetamos `opt_out` y `provide_email` (los gates legales/
  // de captura) en human_first. El resto va al LLM.
  if (
    isHumanFirstMode &&
    intent !== "opt_out" &&
    intent !== "provide_email" &&
    intent !== "provide_name" &&
    intent !== "interactive_event_inscribir"
  ) {
    if (OPT_OUT_RE.test(body)) {
      intent = "opt_out";
    } else if (EMAIL_RE.test(body)) {
      intent = "provide_email";
    } else {
      intent = "question";
    }
  }

  // FIX 2026-07-16: En `human_first`, permitimos `provide_name` e
  // `interactive_event_inscribir` además de `opt_out`, `provide_email` y
  // `question`. Sin `provide_name`, cuando el lead respondía con su nombre
  // ("David Martinez"), el intent se forzaba a `question` y NUNCA se guardaba
  // el nombre en DB. Luego, al enviar el email, el bot re-evaluaba y rebotaba
  // porque DB seguía teniendo lead.name=null.
  const ALLOWED_HUMAN_FIRST_INTENTS = new Set<string>([
    "opt_out",
    "provide_email",
    "provide_name",
    "interactive_event_inscribir",
    "question"
  ]);
  if (isHumanFirstMode && !ALLOWED_HUMAN_FIRST_INTENTS.has(intent)) {
    errorLog("[whatsapp/bot] human_first invariant violated", {
      leadId: lead.id,
      unexpectedIntent: intent,
      forcedTo: "question",
      bodyPreview: body.slice(0, 100)
    });
    intent = "question";
  }

  // 4.5 FIX 2026-07-02 (Commit A): si el intent es provide_name, persistir
  // el nombre en `leads.name`. Lo hacemos ANTES de buildResponsePlan para
  // que el handler pueda usar el `lead.name` actualizado en mensajes
  // posteriores (ej. cuando llegue provide_email).
  //
  // FIX 2026-07-06: ademas del UPDATE, registramos la accion en
  // admin_audit_log para trazabilidad (cuando David audite sabe quien
  // puso que nombre en que momento).
  if (intent === "provide_name" && supabase && lead.id) {
    const name = body.trim();
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name);
    const wordCount = name.split(/\s+/).filter(Boolean).length;
    // FIX 2026-07-18 (sprint bot, David "guarda el nombre como nombre y
    // correo"): si el body contiene un email embebido (caso
    // implicit_capture), el FALLBACK NO debe persistir el body completo
    // en `leads.name`. El bloque `implicit_capture` (línea 6978+)
    // maneja la persistencia con el nombre limpio (sin el email).
    // Antes este FALLBACK pisaba `leads.name` con el body completo
    // ("David Antonio y David17891@gmail.com"), causando que el bot
    // saludara después como "Gracias David Antonio y David17891@gmail.com"
    // en interactive_event_inscribir.
    //
    // Detección: usamos el mismo regex que `extractNameAndEmailTogether`
    // (línea 697) para mantener consistencia. Si el body tiene un email
    // embebido Y el resto pasa `isValidHumanName`, saltamos este UPDATE
    // y dejamos que el bloque implicit_capture haga su trabajo.
    const hasEmbeddedEmail = /[^\s@]+@[^\s@]+\.[^\s@.,;:]+/.test(name);
    if (hasEmbeddedEmail) {
      debugLog(
        "[whatsapp/bot] provide_name FALLBACK: skip update, body tiene email embebido (caso implicit_capture)",
        { leadId: lead.id, bodyLength: name.length }
      );
    }
    // Solo persistir si pasó las validaciones del handler (no email,
    // 2+ palabras, <=100 chars). Si falló la validación, NO actualizamos.
    // FIX 2026-07-10 (sesión David "FALLBACK captura 'Quiero'/'!hola!' como
    // nombre"): agregar `isValidHumanName(name)` como gate de seguridad
    // adicional. El FALLBACK de provide_name ya filtra verbos/intención y
    // símbolos al inicio, pero si otro path setea `intent="provide_name"`
    // en el futuro (race condition, nuevo FALLBACK, etc.), este check
    // evita que un body no-nombre se persista en `leads.name`. Defensive
    // in depth: si NO pasa `isValidHumanName`, NO guardar.
    if (
      !looksLikeEmail &&
      !hasEmbeddedEmail &&
      wordCount >= 2 &&
      name.length <= 100 &&
      isValidHumanName(name)
    ) {
      const previousName = lead.name ?? null;
      const { error: nameUpdateErr } = await supabase
        .from("leads")
        .update({ name })
        .eq("id", lead.id);
      if (nameUpdateErr) {
        errorLog("[whatsapp/bot] provide_name: update lead.name falló", {
          leadId: lead.id,
          code: (nameUpdateErr as { code?: string }).code,
        });
      } else {
        // Actualizamos el `lead` en memoria para que buildResponsePlan
        // (provide_name handler) use el nuevo nombre.
        lead.name = name;
        debugLog("[whatsapp/bot] provide_name: nombre persistido", {
          leadId: lead.id,
          name
        });
        // FIX 2026-07-06: audit log del cambio de nombre.
        // Best-effort: si falla, no rompemos el flow del bot.
        try {
          const { logAdminAction } = await import("@/lib/crm/audit-server");
          await logAdminAction({
            actor_email: "system@qlick",
            action: "lead_name_update",
            entity_type: "lead",
            entity_id: lead.id,
            metadata: {
              source: "whatsapp_bot",
              intent: "provide_name",
              previous_name: previousName,
              new_name: name,
            },
          });
        } catch (auditErr) {
          errorLog("[whatsapp/bot] provide_name: audit log falló", {
            leadId: lead.id,
            error: (auditErr as Error).message,
          });
        }
      }
    }
  }

  // 4.7 FIX 2026-07-03 (sesion David, "bot recuerda registro"): si el
  // intent es `interactive_event_inscribir` Y tenemos un event_slug
  // (del botón clickeado, del affirmative corto, o del activeEvent) Y
  // el lead tiene id válido Y Supabase responde, consultamos si YA
  // existe un token vigente para (lead, event).
  //
  // Si SÍ existe: NO generamos uno nuevo. Reenviamos el email con el
  // QR existente y respondemos por WhatsApp con el link directo. Asi
  // evitamos:
  //   - Duplicar tokens en event_qr_tokens
  //   - Mandar 2+ correos al mismo lead para el mismo evento
  //   - Confundir al lead con mensajes "Listo, te registramos..." cuando
  //     ya estaba registrado
  //
  // Si NO existe (o falla el check): seguimos con el flow normal
  // (Paso 5: provide_email genera QR nuevo).
  if (
    intent === "interactive_event_inscribir" &&
    supabase &&
    lead.id
  ) {
    // Determinar el slug del evento que el lead quiere inscribir.
    //
    // FIX 2026-07-05 (sesión David, "ya estás registrado" con nombre
    // duplicado): la prioridad anterior caía a
    // `loadActiveEventContext()` sin args (= primer published por
    // starts_at) cuando no había `requestedEventSlug` ni botón. Eso
    // generaba falsos positivos: si David creaba 2 "Pinguinos" y le
    // escribía al nuevo, lo mandábamos al viejo y decíamos "ya estás
    // registrado en Pinguinos [el viejo]".
    //
    // Nueva prioridad (cada capa más fuerte que la siguiente):
    //   1. buttonId `evt_inscribir_<slug>` (lead clickeó botón explícito)
    //   2. requestedEventSlug (affirmative corto tras pregunta cerrada del LLM)
    //   3. **findEventInConversation** — matchea short_code/slug/título en
    //      los últimos mensajes. Si hay match, ESE evento (no el primero).
    //   4. SOLO si 3 falla y hay UN solo evento publicado → ese.
    //   5. Ambiguo (2+ publicados sin contexto) → pedido de clarificación
    //      al lead con catálogo `[1]/[2]/shortcode`.
    let targetSlug: string | null = null;
    if (buttonId?.startsWith("evt_inscribir_")) {
      targetSlug = buttonId.slice("evt_inscribir_".length);
    }
    if (!targetSlug) targetSlug = requestedEventSlug;
    if (!targetSlug) {
      // Capa 3: buscar por short_code/slug/título en la conversación
      // reciente del lead. Es la capa que mata el bug de "ya estás
      // registrado en el equivocado".
      try {
        const conv = await loadConversationWindow(phoneNormalized, 8).catch(
          () => undefined
        );
        const allEventsForMatch = await loadAllActiveEvents().catch(
          () => [] as ActiveEventContext[]
        );
        const matchedByText = findEventInConversation(
          conv,
          allEventsForMatch
        );
        if (matchedByText) {
          targetSlug = matchedByText.slug;
        }
      } catch {
        // Silencioso: caemos al siguiente fallback.
      }
    }
    if (!targetSlug) {
      // Capa 4: si solo hay 1 evento publicado, usarlo (back-compat
      // con el flow viejo del bot de un solo evento).
      const allEventsForFallback = await loadAllActiveEvents().catch(
        () => [] as ActiveEventContext[]
      );
      if (allEventsForFallback.length === 1) {
        targetSlug = allEventsForFallback[0].slug;
      } else if (allEventsForFallback.length > 1) {
        // Capa 5: ambiguo. Mandamos catálogo y cortamos el flow acá
        // (no seguimos con provide_email hasta que el lead aclare).
        const providerAmbig = getActiveWhatsAppProvider();
        const cleanAmbig = cleanFirstName(lead.name);
        const saludoAmbig = cleanAmbig ? `¡Hola ${cleanAmbig}!` : "¡Hola!";
        const codeNote =
          "Si sabes el código corto del evento (ej. 7A3X), mándamelo así.";
        const bodyTextAmbig =
          `${saludoAmbig} Tenemos varios eventos publicados y necesito saber a cuál te inscribes.\n\n` +
          `¿Me confirmas cuál? Responde con el número [1]–[${
            Math.min(allEventsForFallback.length, 9)
          }] del catálogo anterior o con el código del evento (ej. \`7A3X\`). ` +
          codeNote;
        const sectionsAmbig = [
          {
            title: "Eventos publicados",
            rows: allEventsForFallback.slice(0, 9).map((evt) => ({
              id: `evt_inscribir_${evt.slug}`,
              title: evt.title.slice(0, 24),
              description: `${evt.humanStartsAt} · ${evt.location}${
                evt.shortCode ? ` · ${evt.shortCode}` : ""
              }`.slice(0, 72)
            }))
          }
        ];
        const interactiveAmbig = {
          type: "list" as const,
          body: { text: bodyTextAmbig },
          action: {
            button: "Elegir evento",
            sections: sectionsAmbig
          }
        };
        try {
          await providerAmbig.send({
            to: phoneNormalized,
            body: bodyTextAmbig,
            interactive: interactiveAmbig
          });
        } catch (err) {
          errorLog("[whatsapp/bot] ambiguous_event: send failed", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
        return {
          ok: true,
          intent,
          leadId: lead.id,
          responseKind: "list",
          responsePreview: bodyTextAmbig,
          demo: false,
          note: "ambiguous_event: requested clarificación"
        };
      } else {
        // Cero publicados (raro, modo demo o DB caída). Caemos al
        // placeholder de env vars para no romper el flow.
        const activeEvt = await loadActiveEventContext().catch(() => null);
        targetSlug = activeEvt?.slug ?? null;
      }
    }
    if (targetSlug) {
      const existing = await findActiveQrTokenForLead(
        supabase,
        lead.id,
        phoneNormalized,
        targetSlug
      );
      // FIX 2026-07-07 (sesión David, "yo necesito poder repetir el flujo"):
      // si el contacto está en DEV_BYPASS_PHONES / DEV_BYPASS_EMAILS,
      // saltamos el bloque "ya estás registrado" y dejamos que el flow
      // continúe como si fuera la primera vez (genera QR + email nuevos).
      // Log auditable para que David vea en logs cuántas veces se aplicó.
      const devBypassApplied = existing
        ? isInDevBypass({ phone: phoneNormalized, email: lead.email })
        : false;
      if (devBypassApplied) {
        debugLog("[whatsapp/bot] dev_bypass_applied: skipping already_registered", {
          leadId: lead.id,
          eventSlug: targetSlug,
          phone: phoneNormalized,
          email: lead.email ?? null,
        });
      }
      if (existing && !devBypassApplied) {
        // Ya está registrado. Cargamos info del evento para el mensaje.
        const evt = await loadActiveEventContext(targetSlug).catch(() => null);
        const evtName = evt?.title ?? targetSlug;
        const evtDate = evt?.humanStartsAt ?? "";

        // REGLA 2026-07-03 (sesion David): defense in depth. Si llegamos a
        // "ya estás registrado" SIN haber pasado por provide_email (ej: QR
        // token creado manualmente por admin, o data legacy sin confirmation),
        // igual aseguramos que exista la fila en event_confirmations.
        // createConfirmation es idempotente.
        if (evt?.id) {
          try {
            await createConfirmation({
              eventId: evt.id,
              name: lead.name?.trim() || "Asistente",
              email: lead.email ?? null,
              phoneRaw: phoneNormalized,
              phoneNormalized,
              source: "whatsapp_bot",
            });
          } catch (err) {
            errorLog("[whatsapp/bot] already_registered: createConfirmation fallback falló", {
              leadId: lead.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        // FIX 2026-07-03 (sesion David): si el evento es de pago, NO
        // reenviamos QR ni email — el método de pago está por implementar.
        // Avisamos al lead que está registrado pero pendiente de pago.
        const desc = evt?.description ?? "";
        const priceMatch = desc.match(/\$\s?(\d{1,3}(?:[,.]?\d{3})*)\s*(mxn|usd|pesos)?/i);
        const isFree = /sin\s+costo/i.test(desc);
        if (priceMatch && !isFree) {
          const priceDisplay = priceMatch[0].replace(/\s+/g, " ").trim();
          const clean = cleanFirstName(lead.name);
          const saludo = clean ? `¡Hola ${clean}!` : "¡Hola!";
          // FIX 2026-07-05: incluir el short_code para que el lead
          // pueda refirse a este evento en futuros mensajes sin ambigüedad.
          const evtCodeLabel = evt?.shortCode ? ` (código ${evt.shortCode})` : "";
          const terms = getReservationTerms(evt);
          const paymentUrl = terms.enabled && existing.confirmationId
            ? `${appBaseUrl()}/pagar/evento/${targetSlug}?confirmation=${existing.confirmationId}&payment_option=reservation`
            : null;
          const bodyText = terms.enabled && paymentUrl
            ? `${saludo} Ya estás registrado en *${evtName}*${evtCodeLabel}. El precio total es de $${evt?.priceMxn?.toLocaleString("es-MX") ?? priceDisplay} MXN.\n\n` +
              `Para apartar tu lugar paga $${terms.amount.toLocaleString("es-MX")} MXN aquí:\n${paymentUrl}\n\n` +
              `El saldo de $${terms.balance.toLocaleString("es-MX")} MXN se liquida ${terms.note.toLowerCase()}`
            : `${saludo} Ya estás registrado en *${evtName}*${evtCodeLabel} (${priceDisplay}). ` +
              `\n\n⚠️ Tu registro está pendiente de pago. Te avisaremos cuando esté listo el enlace para completar el registro.` +
              `\n\nSi quieres acelerar, escríbenos a hola@qlick.marketing.`;
          const provider = getActiveWhatsAppProvider();
          let sendResult: { ok: boolean; externalId?: string; demo?: boolean } = {
            ok: false
          };
          try {
            const r = await provider.send({ to: phoneNormalized, body: bodyText });
            sendResult = { ok: r.ok, externalId: r.externalId, demo: r.demo };
          } catch (err) {
            errorLog("[whatsapp/bot] already_registered (paid): send falló", {
              leadId: lead.id,
              error: err instanceof Error ? err.message : String(err)
            });
          }
          // FIX 2026-07-04 (auditoria nocturna): no persistir si el send
          // falló (phantom row). Ver commit 548acb7 (main flow).
          if (supabase && sendResult.ok) {
            await persistConversation(supabase, {
              lead_id: lead.id,
              phone_normalized: phoneNormalized,
              direction: "outbound",
              message_type: "text",
              body: bodyText,
              whatsapp_message_id: sendResult.externalId ?? null,
              metadata: {
                intent: "interactive_event_inscribir",
                templateName: null,
                demo: sendResult.demo ?? false,
                already_registered: true,
                pending_payment: true,
                existing_event_slug: targetSlug,
                pending_event_price: priceDisplay
              }
            });
          }
          return {
            ok: true,
            intent,
            leadId: lead.id,
            responseKind: "text",
            responsePreview: bodyText,
            demo: sendResult.demo,
            note: `already_registered_pending_payment: ${targetSlug} ${priceDisplay}`
          };
        }
        // Evento gratis (o sin precio detectado). Reenviamos email + QR.
        if (lead.email && !lead.email.endsWith("@placeholder.local")) {
          void (async () => {
            try {
              const qrImageUrl = `${appBaseUrl()}/api/event-qr/${existing.token}.png`;
              // Gate URL para eventos virtuales/híbridos (migration 20260707000000).
              // El handler registra intent_attended y redirige al streaming_url.
              // Migration 20260707093000: streaming_url es opcional, así que el
              // gateUrl solo se calcula si hay link (si no, el email no muestra
              // el bloque gate — solo QR + nota "link pendiente").
              const gateUrl =
                evt?.format && evt.format !== "in_person" && evt.streamingUrl
                  ? `${appBaseUrl()}/api/event-gate/${encodeURIComponent(existing.token)}/click`
                  : undefined;
              // FIX P1 2026-07-03: pasamos eventId + tokenId para que el
              // resultado se loggee en event_email_log (visibilidad admin).
              await sendEventQrPassEmail(
                {
                  attendeeName: lead.name?.trim() || "Asistente",
                  attendeeEmail: lead.email,
                  eventTitle: evtName,
                  eventStartsAt: evt?.startsAt
                    ? evt.startsAt.toISOString()
                    : new Date().toISOString(),
                  eventLocation: evt?.location ?? null,
                  qrImageUrl,
                  checkInUrl: existing.url,
                  // Streaming (migration 20260707000000).
                  format: evt?.format ?? "in_person",
                  gateUrl,
                  streamingAccessNote: evt?.streamingAccessNote ?? undefined,
                },
                {
                  eventId: existing.eventId,
                  // existing es { token, url, eventId } de findActiveQrTokenForLead.
                  // No expone el id del token (PK), solo el token string. Para
                  // event_qr_token_id tendríamos que agregarlo al return — por
                  // ahora pasamos null (el log queda sin FK al token row, pero
                  // igual queda el event_id para filtrar).
                  eventQrTokenId: null,
                }
              );
            } catch (err) {
              errorLog("[whatsapp/bot] already_registered: reenvío email falló", {
                leadId: lead.id,
                error: err instanceof Error ? err.message : String(err)
              });
            }
          })();
        }
        const clean = cleanFirstName(lead.name);
        const saludo = clean ? `¡Hola ${clean}!` : "¡Hola!";
        // FIX 2026-07-05: incluir el short_code en el mensaje "ya estás
        // registrado" para que el lead pueda referenciar este evento
        // por código en futuras conversaciones (ej. "el otro 7A3X").
        const evtCodeLabel = evt?.shortCode ? ` (código ${evt.shortCode})` : "";
        const emailLine = lead.email && !lead.email.endsWith("@placeholder.local")
          ? `\n📧 Te lo reenviamos a tu correo ${lead.email} por si lo perdiste.`
          : "";
        // Migration 20260707093000: adaptarse a la modalidad del evento.
        // - in_person: copia clásica (muestra QR en puerta).
        // - virtual/hybrid SIN streaming_url: el link llega el día del evento.
        // - virtual/hybrid CON streaming_url: el link es inmediato (behavior
        //   histórico, decide via gate). Acá ya se reenvió el email con el gate.
        const evtIsVirtualLike = evt?.format === "virtual" || evt?.format === "hybrid";
        const hasStreamingLink = Boolean(evt?.streamingUrl);
        const accessLine = evtIsVirtualLike && hasStreamingLink
          ? `\n\n🎥 Tu acceso virtual ya está configurado. Te enviamos un correo con el botón para entrar al stream cuando estés listo.`
          : evtIsVirtualLike
            ? `\n\n⏳ El link del evento virtual aún no está configurado — te lo enviamos por correo y por aquí el día del evento. Guarda este pase con QR, lo vas a necesitar.`
            : `\n\nMuéstralo en la entrada del evento. El staff lo va a escanear.`;
        const bodyText =
          `${saludo} Ya estás registrado en *${evtName}*${evtCodeLabel}. ` +
          `Tu QR actual (link de check-in) es:\n\n${existing.url}` +
          accessLine +
          emailLine;
        const provider = getActiveWhatsAppProvider();
        let sendResult: { ok: boolean; externalId?: string; demo?: boolean } = {
          ok: false
        };
        try {
          const r = await provider.send({ to: phoneNormalized, body: bodyText });
          sendResult = { ok: r.ok, externalId: r.externalId, demo: r.demo };
        } catch (err) {
          errorLog("[whatsapp/bot] already_registered: send falló", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
        // FIX 2026-07-04 (auditoria nocturna): no persistir si el send falló.
        // Ver commit 548acb7 (main flow).
        if (supabase && sendResult.ok) {
          await persistConversation(supabase, {
            lead_id: lead.id,
            phone_normalized: phoneNormalized,
            direction: "outbound",
            message_type: "text",
            body: bodyText,
            whatsapp_message_id: sendResult.externalId ?? null,
            metadata: {
              intent: "interactive_event_inscribir",
              templateName: null,
              demo: sendResult.demo ?? false,
              already_registered: true,
              existing_event_slug: targetSlug
            }
          });
        }
        return {
          ok: true,
          intent,
          leadId: lead.id,
          responseKind: "text",
          responsePreview: bodyText,
          demo: sendResult.demo,
          note: `already_registered: ${targetSlug}`
        };
      }
    }

    // 4.8 FIX sprint 2026-07-15d (sesion David, "no le pidio nombre
    // ni correo"): el flow del bot para eventos de pago creaba la
    // confirmation con placeholders ('WhatsApp Lead' /
    // 'wa.XXX@placeholder.local') si el lead no tenia nombre o
    // email. El bot asumia que el lead ya existia con datos
    // reales, pero un reset reciente (o un nuevo webhook sin
    // push name) dejaba el lead con placeholders. Resultado: la
    // confirmation tenia datos falsos y el email del QR rebotaba.
    //
    // Sprint 2026-07-15: el bot ahora captura nombre+email ANTES
    // de crear la confirmation (igual que el flow secuencial de
    // provide_name -> provide_email que ya existe para eventos
    // gratis). Si el lead no tiene nombre valido (placeholder)
    // o no tiene email, redirigimos al flow de captura con
    // `awaiting_field` apropiado. Solo creamos la confirmation
    // cuando tenemos los 2 datos.
    //
    // 4.8b FIX sprint 2026-07-15d: ademas, la instruction de pago
    // ahora es MIXTA (online + puerta). David: 50-80% paga en
    // puerta el dia del evento. El bot le dice al lead que puede
    // pagar en linea (tarjeta/OXXO/SPEI) o en puerta, y el QR
    // se manda igual (independiente del pago). El staff cobra en
    // caja si no pago en linea.
    if (
      intent === "interactive_event_inscribir" &&
      supabase &&
      lead.id
    ) {
      // 4.8.0 FIX: validar que el lead tenga nombre y email validos
      // ANTES de crear la confirmation. Si falta, redirigir al
      // flow de captura (igual que en eventos gratis).
      const cleanLeadName = cleanFirstName(lead.name);
      const leadEmailRaw = lead.email?.trim().toLowerCase() ?? null;
      const isPlaceholderEmail =
        !leadEmailRaw || /@placeholder\.local$/i.test(leadEmailRaw);

      // Determinar targetSlug ANTES de los guards de captura (lo
      // necesitamos para el copy si redirigimos al flow de captura).
      let targetSlug: string | null = requestedEventSlug;
      if (!targetSlug && buttonId?.startsWith("evt_inscribir_")) {
        targetSlug = buttonId.slice("evt_inscribir_".length);
      }
      if (!targetSlug) {
        const activeEvt = await loadActiveEventContext().catch(() => null);
        targetSlug = activeEvt?.slug ?? null;
      }
      const localProvider = getActiveWhatsAppProvider();

      if (!cleanLeadName) {
        // Sin nombre valido. Pedir nombre.
        const evtForName = targetSlug
          ? await loadActiveEventContext(targetSlug).catch(() => null)
          : null;
        const evtFallback = getActiveEvent();
        const evtName = evtForName?.title ?? evtFallback.name;
        const bodyText =
          `Para inscribirte al taller *${evtName}* necesito tu ` +
          `nombre completo (asi queda en tu constancia de asistencia). ` +
          `¿Me lo pasas? Ej: "Juan Pérez".`;
        let sendResult: { ok: boolean; externalId?: string; demo?: boolean } = {
          ok: false
        };
        try {
          const r = await localProvider.send({ to: phoneNormalized, body: bodyText });
          sendResult = { ok: r.ok, externalId: r.externalId, demo: r.demo };
        } catch (err) {
          errorLog("[whatsapp/bot] interactive_event_inscribir (ask name) send falló", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (supabase && sendResult.ok) {
          await persistConversation(supabase, {
            lead_id: lead.id,
            phone_normalized: phoneNormalized,
            direction: "outbound",
            message_type: "text",
            body: bodyText,
            whatsapp_message_id: sendResult.externalId ?? null,
            metadata: {
              intent: "interactive_event_inscribir",
              templateName: null,
              demo: sendResult.demo ?? false,
              awaiting_field: "name",
            }
          });
        }
        return {
          ok: sendResult.ok,
          intent,
          leadId: lead.id,
          responseKind: "text",
          responsePreview: bodyText,
          demo: sendResult.demo,
          outboundMessageId: sendResult.externalId,
          note: `interactive_event_inscribir: asked name for ${targetSlug}`
        };
      }

      if (isPlaceholderEmail) {
        // Sin email real. Pedir email.
        const bodyText =
          `Gracias ${cleanLeadName}. Ahora mándame tu email y te ` +
          `paso el QR + el link de pago.`;
        let sendResult: { ok: boolean; externalId?: string; demo?: boolean } = {
          ok: false
        };
        try {
          const r = await localProvider.send({ to: phoneNormalized, body: bodyText });
          sendResult = { ok: r.ok, externalId: r.externalId, demo: r.demo };
        } catch (err) {
          errorLog("[whatsapp/bot] interactive_event_inscribir (ask email) send falló", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (supabase && sendResult.ok) {
          await persistConversation(supabase, {
            lead_id: lead.id,
            phone_normalized: phoneNormalized,
            direction: "outbound",
            message_type: "text",
            body: bodyText,
            whatsapp_message_id: sendResult.externalId ?? null,
            metadata: {
              intent: "interactive_event_inscribir",
              templateName: null,
              demo: sendResult.demo ?? false,
              awaiting_field: "email",
            }
          });
        }
        return {
          ok: sendResult.ok,
          intent,
          leadId: lead.id,
          responseKind: "text",
          responsePreview: bodyText,
          demo: sendResult.demo,
          outboundMessageId: sendResult.externalId,
          note: `interactive_event_inscribir: asked email for ${targetSlug}`
        };
      }
      if (targetSlug) {
        // No generamos QR de pago si el lead ya está registrado (4.7 ya
        // manejó ese caso con un mensaje "ya estás registrado").
        // Si NO está registrado, vemos si es de pago.
        const alreadyHasToken = await findActiveQrTokenForLead(
          supabase,
          lead.id,
          phoneNormalized,
          targetSlug
        );
        if (!alreadyHasToken) {
          const evtForPayment = await loadActiveEventContext(targetSlug).catch(() => null);
          const desc = evtForPayment?.description ?? "";
          // Patron: "$599 MXN", "$1,200 MXN", "$ 599 MXN", etc.
          const priceMatch = desc.match(/\$\s?(\d{1,3}(?:[,.]?\d{3})*)\s*(mxn|usd|pesos)?/i);
          const isFree = /sin\s+costo/i.test(desc);
          if (priceMatch && !isFree) {
            const priceDisplay = priceMatch[0].replace(/\s+/g, " ").trim();
            const evtName = evtForPayment?.title ?? targetSlug;
            // FIX 2026-07-05: incluir short_code en el mensaje post-
            // registro para que el lead pueda continuar la conversación
            // por código, no por título ambiguo.
            const evtCodeLabel = evtForPayment?.shortCode ? ` (código ${evtForPayment.shortCode})` : "";

            // 1. Crear la confirmation via createConfirmation (mismo
            //    path que provide_email y que el form publico).
            //    createConfirmation es idempotente (dedup por
            //    event_id+email/phone) y crea la fila con
            //    payment_status='not_required' por default.
            //
            //    FIX 2026-07-15c (sesion David "el supervendedor SI me
            //    registro pero payment_status quedo en not_required"):
            //    el createConfirmation del bot-engine NO actualizaba
            //    payment_status a 'pending' para eventos de pago. El
            //    form publico SI lo hace (actions.ts) via UPDATE
            //    post-INSERT. Aqui hacemos lo mismo: despues del
            //    createConfirmation, si el evento es de pago y la fila
            //    se creo (o se encontro via dedup), forzamos
            //    payment_status='pending' via UPDATE.
            const confirmResult = await createConfirmation({
              eventId: evtForPayment?.id ?? "",
              name: lead.name?.trim() || "Asistente",
              email: lead.email ?? null,
              phoneRaw: phoneNormalized,
              source: "whatsapp_bot",
            }).catch((err) => {
              errorLog("[whatsapp/bot] pending_payment: createConfirmation throw", {
                leadId: lead.id,
                error: err instanceof Error ? err.message : String(err),
              });
              return null;
            });

            // 1.1 FIX: forzar payment_status='pending' para eventos
            //      de pago (mismo path que /eventos/[slug]/actions.ts).
            //      createConfirmation pone el default 'not_required';
            //      nosotros lo sobreescribimos para que el admin de
            //      pagos manuales pueda registrar el pago despues.
            if (confirmResult?.ok && confirmResult.confirmation) {
              try {
                await supabase
                  .from("event_confirmations")
                  .update({ payment_status: "pending" } as never)
                  .eq("id", confirmResult.confirmation.id);
              } catch (updErr) {
                errorLog(
                  "[whatsapp/bot] pending_payment: payment_status update fallo (no fatal)",
                  {
                    leadId: lead.id,
                    confirmationId: confirmResult.confirmation.id,
                    error:
                      updErr instanceof Error
                        ? updErr.message
                        : String(updErr),
                  },
                );
              }

              // FIX sprint 2026-07-15d + 2026-07-15f: crear event_access al
              // confirmar la inscripcion (no al pagar). El QR da
              // acceso al evento independiente del estado de pago
              // (David: 50-80% paga en puerta). El staff cobra en
              // caja si `payment_status` sigue en `pending` al hacer
              // check-in. `event_pay_at_door` es el source nuevo en
              // `event-entitlements.ts` para distinguir esto del
              // acceso por Stripe.
              //
              // FIX 2026-07-15f: userId es null (lead no es auth user)
              // y pasamos confirmationId para que la idempotencia del
              // grant funcione (sino GRANT no encuentra el access
              // existente si se llama 2 veces).
              try {
                const { grantEventAccess } = await import(
                  "../lms/event-entitlements"
                );
                await grantEventAccess({
                  userId: null,
                  confirmationId: confirmResult.confirmation.id,
                  eventId: evtForPayment?.id ?? "",
                  source: "event_pay_at_door",
                  grantedReason: "confirmation_whatsapp_bot",
                });
              } catch (accErr) {
                errorLog(
                  "[whatsapp/bot] pending_payment: grantEventAccess fallo (no fatal)",
                  {
                    leadId: lead.id,
                    confirmationId: confirmResult.confirmation.id,
                    error:
                      accErr instanceof Error
                        ? accErr.message
                        : String(accErr),
                  },
                );
              }
            }

            if (!confirmResult || !confirmResult.ok || !confirmResult.confirmation) {
              errorLog("[whatsapp/bot] pending_payment: createConfirmation fallo", {
                leadId: lead.id,
                eventSlug: targetSlug,
                note: confirmResult?.note,
              });
              // Caemos al copy viejo (defensa: si no se puede crear la
              // fila, al menos avisamos al lead con honesty).
              const fallbackText =
                `Tuve un problema registrando tu lugar. Escríbenos a ` +
                `hola@qlick.marketing y lo arreglamos.`;
              const provider = getActiveWhatsAppProvider();
              try {
                await provider.send({ to: phoneNormalized, body: fallbackText });
              } catch {
                /* swallow */
              }
              return {
                ok: false,
                intent,
                leadId: lead.id,
                responseKind: "text",
                responsePreview: fallbackText,
                note: `pending_payment_failed: ${targetSlug}`,
              };
            }

            const confirmationId = confirmResult.confirmation.id;

            // 2. Mandar email de bienvenida con bloque de pago (vía el
            //    helper sendQrPassForConfirmation que ya usa el form
            //    publico). Fire-and-forget: no bloquea el response.
            if (lead.email && evtForPayment) {
              void (async () => {
                try {
                  const { sendQrPassForConfirmation } = await import(
                    "../email/event-qr-pass"
                  );
                  await sendQrPassForConfirmation({
                    confirmationId,
                    event: evtForPayment as unknown as Parameters<
                      typeof sendQrPassForConfirmation
                    >[0]["event"],
                  });
                } catch (err) {
                  errorLog("[whatsapp/bot] pending_payment: email fallo", {
                    leadId: lead.id,
                    confirmationId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              })();
            }

            // 3. Responder al lead con copy HONESTO + link al checkout.
            const baseUrl = appBaseUrl();
            const paymentTerms = getReservationTerms(evtForPayment);
            const checkoutUrl = `${baseUrl}/pagar/evento/${targetSlug}?confirmation=${confirmationId}${paymentTerms.enabled ? "&payment_option=reservation" : ""}`;
            const clean = cleanFirstName(lead.name);
            const saludo = clean ? `¡Listo ${clean}!` : "¡Listo!";
            const bodyText = paymentTerms.enabled
              ? `${saludo} Tu registro para *${evtName}*${evtCodeLabel} quedó listo. El precio total es de $${evtForPayment?.priceMxn?.toLocaleString("es-MX") ?? priceDisplay} MXN.\n\n` +
                `Para apartar tu lugar paga $${paymentTerms.amount.toLocaleString("es-MX")} MXN aquí:\n${checkoutUrl}\n\n` +
                `El saldo de $${paymentTerms.balance.toLocaleString("es-MX")} MXN se liquida ${paymentTerms.note.toLowerCase()}`
              : `${saludo} Tu lugar para *${evtName}*${evtCodeLabel} (${priceDisplay}) está apartado.\n\n` +
                `Para confirmar tu lugar, completa el pago aquí:\n${checkoutUrl}\n\n` +
                `Aceptamos tarjeta, OXXO, SPEI y transferencia. Si pagas en ` +
                `efectivo en puerta, avísanos y lo registramos a mano.`;

            const provider = getActiveWhatsAppProvider();
            let sendResult: { ok: boolean; externalId?: string; demo?: boolean } = {
              ok: false
            };
            try {
              const r = await provider.send({ to: phoneNormalized, body: bodyText });
              sendResult = { ok: r.ok, externalId: r.externalId, demo: r.demo };
            } catch (err) {
              errorLog("[whatsapp/bot] pending_payment: send falló", {
                leadId: lead.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            // FIX 2026-07-04 (auditoria nocturna): no persistir si el send falló.
            // Ver commit 548acb7 (main flow).
            if (supabase && sendResult.ok) {
              await persistConversation(supabase, {
                lead_id: lead.id,
                phone_normalized: phoneNormalized,
                direction: "outbound",
                message_type: "text",
                body: bodyText,
                whatsapp_message_id: sendResult.externalId ?? null,
                metadata: {
                  intent: "interactive_event_inscribir",
                  templateName: null,
                  demo: sendResult.demo ?? false,
                  pending_payment: true,
                  pending_event_slug: targetSlug,
                  pending_event_price: priceDisplay,
                  confirmation_id: confirmationId,
                  checkout_url: checkoutUrl
                }
              });
            }
            return {
              ok: true,
              intent,
              leadId: lead.id,
              responseKind: "text",
              responsePreview: bodyText,
              demo: sendResult.demo,
              note: `pending_payment_registered: ${targetSlug} ${priceDisplay} confirmationId=${confirmationId}`
            };
          }
        }
      }
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
  let registrationEventRequiresName: boolean = false;
  /**
   * Evento del registro completo (con format, streamingUrl, priceMxn, etc).
   * FIX 2026-07-16 (sprint pago-en-puerta): se carga tambien para
   * `provide_name` (no solo `provide_email`) porque el `case "provide_name"`
   * con implicit_capture (nombre+email juntos) necesita el precio y
   * el formato del evento para armar el copy correcto:
   *   - Si es de pago: mencionar el monto y opciones de pago.
   *   - Si es presencial: NO decir "link de Zoom 24 horas antes"
   *     (eso era un copy hardcodeado que aplicaba a cualquier evento).
   *   - Si es virtual: "link de Zoom 24 horas antes" OK.
   */
  let matchedEvent: ActiveEventContext | null = null;
  if (
    (intent === "provide_email" || intent === "provide_name") &&
    supabase
  ) {
    // FIX 2026-07-18 (audit David, regresion test 985/986): el bloque
    // completo se ejecuta para AMBOS provide_email y provide_name
    // (necesitamos cargar matchedEvent para setear registrationEvent
    // y registrationEventSlug). El guard de "requires_name" abajo SOLO
    // aplica a provide_email (es donde bloqueamos la generación del
    // QR si falta el nombre). Para provide_name el guard NUNCA se
    // aplica porque el case provide_name ES donde se captura el
    // nombre.
    //
    // Cargamos el evento del registration via findEventInConversation.
    // FIX P0-4 (auditoria 2026-07-02): usar phoneNormalized (siempre
    // seteado desde message.from) en vez de lead.phone ?? "" (que puede
    // ser null en el fallback de Supabase caída).
    const convWindowForEvent = await loadConversationWindow(
      phoneNormalized,
      8
    ).catch(() => undefined);
    // Cargar todos los eventos publicados para identificar el correcto.
    const allEvents = await loadAllActiveEvents().catch(() => [] as ActiveEventContext[]);
    // Buscar el evento en la conversacion (ultimo outbound del bot).
    matchedEvent = findEventInConversation(convWindowForEvent, allEvents);
    registrationEventSlug = matchedEvent?.slug ?? null;
    registrationEventTitle = matchedEvent?.title ?? null;
    registrationEventRequiresName = matchedEvent?.requiresName === true;
    if (
      intent === "provide_email" &&
      registrationEventRequiresName &&
      !lead.name?.trim()
    ) {
      // FIX 2026-07-18 (audit David, regresion test 985/986): este
      // guard SOLO se aplica a provide_email. Para provide_name
      // NO se bloquea (es donde se captura el nombre).
      //
      // El evento requiere nombre y el lead no lo dio. Pedimos
      // nombre antes de avanzar al QR. NO generamos QR, NO
      // enviamos email.
      const bodyText =
        `Antes del email necesito tu nombre completo (es para el ` +
        `certificado). Por favor mándamelo así: "Juan Pérez". Después ` +
        `te paso tu email para el QR.`;
      // FIX 2026-07-02 (Commit A): persistir el outbound con
      // metadata.awaiting_field='name' para que el próximo turno
      // sea provide_name.
      // Saltamos buildResponsePlan y enviamos manualmente.
      const provider = getActiveWhatsAppProvider();
      let sendResult: { ok: boolean; externalId?: string; demo?: boolean } = {
        ok: false
      };
      try {
        const r = await provider.send({ to: phoneNormalized, body: bodyText });
        sendResult = { ok: r.ok, externalId: r.externalId, demo: r.demo };
      } catch (err) {
        errorLog("[whatsapp/bot] provide_email (requires_name check) send falló", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Persistir el outbound para que el próximo turno sepa
      // awaiting_field='name'.
      if (supabase) {
        await persistConversation(supabase, {
          lead_id: lead.id,
          phone_normalized: phoneNormalized,
          direction: "outbound",
          message_type: "text",
          body: bodyText,
          whatsapp_message_id: sendResult.externalId ?? null,
          metadata: {
            intent: "provide_email",
            templateName: null,
            demo: sendResult.demo ?? false,
            awaiting_field: "name",
            blocked_reason: "requires_name_missing"
          }
        });
      }
      return {
        ok: true,
        intent: "provide_email",
        leadId: lead.id,
        conversationId: undefined,
        outboundMessageId: sendResult.externalId,
        responseKind: "text",
        responsePreview: bodyText,
        demo: sendResult.demo ?? false,
        note: "Bot bloqueó provide_email: evento requiere nombre pero lead no lo dio."
      };
    }
    // Solo el intent provide_email ejecuta la cadena de registro. Para
    // provide_name cargamos matchedEvent arriba para el plan de respuesta,
    // pero dejamos que el bloque implicit_capture sea el único responsable
    // de crear QR/confirmation/correo cuando nombre y email llegan juntos.
    if (intent === "provide_email") {
    // FIX 2026-07-02: cargar conversationWindow aca (no estaba en
    // processInboundMessage, solo en buildResponsePlan) para identificar
    // el evento del registro.
    // FIX P0-4 (auditoria 2026-07-02): usar phoneNormalized (siempre
    // seteado desde message.from) en vez de lead.phone ?? "" (que puede
    // ser null en el fallback de Supabase caída).
    // FIX 2026-07-02 (Commit A): convWindowForEvent y allEvents ya se
    // cargaron arriba (en el bloque del requires_name check). Reusamos
    // esas variables. Si llegamos aca es porque el evento NO requiere
    // nombre O el lead YA tiene nombre.
    // FIX 2026-07-16 (sprint pago-en-puerta): re-declaramos `email`
    // aca porque ahora se carga `matchedEvent` tanto para
    // `provide_email` como para `provide_name` (la declaracion de
    // arriba la movimos). El `email` solo se usa en este sub-bloque
    // de side-effects de provide_email.
    const email = extractEmailFromText(body)?.toLowerCase() ?? body.trim().toLowerCase();
    // FIX 2026-07-19 (sprint bot feedback E2E David, "WhatsApp Lead"
    // no se actualiza a "David Martinez"): el bot decia "David Martinez"
    // en el chat pero la confirmation quedaba con "WhatsApp Lead"
    // porque el `case "provide_email"` usaba `lead.name` (que era
    // "WhatsApp Lead") en vez del name del body. FIX: si el body
    // matchea un regex de "Nombre + email" (Path A del safety-net),
    // usar el name extraido. Si no, fallback a `lead.name`.
    let extractedNameFromBody: string | null = null;
    try {
      const allEmailsStripped = body
        .replace(/[^\s@]+@[^\s@]+\.[^\s@.,;:]+/g, "")
        .replace(/[,;]+\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // El name es valido si tiene al menos 2 chars y NO es solo
      // una palabra placeholder ("hola", "registrame", etc).
      if (allEmailsStripped.length >= 2 && /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(allEmailsStripped)) {
        extractedNameFromBody = allEmailsStripped;
      }
    } catch {
      // best-effort
    }
    // FIX P1-3 (auditoria 2026-07-02): capturar error del update de lead.
    // Si falla (FK, constraint, network), el email queda desactualizado
    // y los siguientes pasos usan el email viejo. Loggeamos para debug
    // pero seguimos el flow (no rompemos la conversación).
    const { error: leadUpdateErr } = await supabase
      .from("leads")
      .update({ email, consent_to_contact: true })
      .eq("id", lead.id);
    if (leadUpdateErr) {
      errorLog("[whatsapp/bot] lead email/consent update falló", {
        leadId: lead.id,
        email,
        code: (leadUpdateErr as { code?: string }).code,
      });
    }
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
      // FIX 2026-07-19: el confirmationId se setea en un UPDATE
      // posterior (despues de createConfirmation). Ver bloque
      // "FIX 2026-07-19: vincular QR a confirmation" abajo.
    );
    qrUrl = qr?.url ?? null;

    // REGLA 2026-07-03 (sesion David): el bot SIEMPRE registra al lead en
    // `event_confirmations` cuando completa el flow de inscripcion. Asi el
    // panel admin "Confirmados" lo muestra. createConfirmation es idempotente
    // (dedup por email/phone), best-effort: si falla (Supabase caido, schema
    // mismatch, etc.) loggeamos y seguimos — el QR sigue funcionando para el
    // user. El admin lo vera como "no confirmado" pero el registro es
    // recuperable desde la DB / el admin puede re-importarlo.
    //
    // Necesitamos el event_id (no slug) para event_confirmations.event_id.
    // `generateQrToken` no lo devuelve hoy, asi que lo resolvemos aca via
    // loadActiveEventContext() (que ya cacheamos en registrationEventSlug).
    //
    // FIX 2026-07-19 (sprint bot v2 + multi-evento): el bloque anterior
    // usaba `loadActiveEventContext()` (que retorna el evento MAS PROXIMO
    // por starts_at ASC) como fallback. En multi-evento eso agarraba
    // SIEMPRE el mismo evento (ej. PAGO), y el lead que queria
    // registrarse al evento GRATIS quedaba confirmado en el equivocado.
    //
    // FIX 2026-07-19 (sprint bot v2 + multi-evento): el bloque
    // original usaba `loadActiveEventContext()` (que retorna el evento
    // MAS PROXIMO por starts_at ASC) como fallback. En multi-evento
    // eso agarraba SIEMPRE el mismo evento. El LLM YA clasifica el
    // intent como `provide_email` (lo cual implica que el lead quiere
    // registrarse), asi que confiamos en el LLM y usamos el evento
    // activo (mas proximo). El multi-evento check se hace SOLO en el
    // `registrationSafetyNet` del `case "question"`, NO aca (porque
    // el LLM ya confirmo el intent de registro).
    //
    // NOTA: el primer intento de fix (`isMultiEventAmbiguous`) bloqueaba
    // el flow completo en multi-evento, lo cual es demasiado agresivo.
    // El LLM-driven flow `case "provide_email"` SIEMPRE debe crear
    // confirmation (single + multi event), porque el LLM ya valido
    // que el lead quiere registrarse. El safety-net del `case "question"`
    // es el que debe validar el contexto (slug/titulo en el body).
    if (qr) {
      try {
        // FIX 2026-07-19 (sprint bot comprehensive matrix): el bloque
        // original requeria `registrationEventSlug` (del findEventInConversation).
        // Si el lead entra directo al flow provide_email sin contexto
        // previo del evento (ej. LLM no le dio contexto), matchedEvent
        // es null y la confirmation NUNCA se creaba. El bot decia
        // "te registramos" pero no persistia. Ahora usamos
        // loadActiveEventContext() como fallback (mismo patron que
        // case "interactive_event_inscribir" linea 6430+).
        //
        // FIX 2026-07-19 (sprint bot v2): SIEMPRE crear confirmation
        // cuando el LLM clasifico como provide_email. El multi-evento
        // se valida solo en el safety-net del `case "question"`.
        const regEvt = registrationEventSlug
          ? await loadActiveEventContext(registrationEventSlug).catch(() => null)
          : await loadActiveEventContext().catch(() => null);
        if (regEvt?.id) {
          const confResult = await createConfirmation({
            eventId: regEvt.id,
            // FIX 2026-07-19: preferir el name del body sobre el
            // `lead.name` (que puede ser placeholder). Si el body
            // no trae un name claro, fallback a `lead.name`.
            name:
              extractedNameFromBody ??
              (lead.name?.trim() && !isPlaceholderNameUI(lead.name) ? lead.name.trim() : null) ??
              "Asistente",
            email,
            phoneRaw: phoneNormalized,
            phoneNormalized,
            source: "whatsapp_bot",
          });
          debugLog("[whatsapp/bot] provide_email: confirmation registrada", {
            leadId: lead.id,
            eventId: regEvt.id,
            created: confResult.created,
            persisted: confResult.persisted,
            note: confResult.note,
          });

          // FIX 2026-07-19 (sprint bot feedback E2E David, "LINK
          // vacio" en panel admin): vincular el QR a la confirmation.
          // El generateQrToken se llama ANTES del createConfirmation
          // (por orden logico del flow), entonces el QR se crea sin
          // confirmation_id. Aqui hacemos un UPDATE retroactivo para
          // setear el FK. Best-effort: si falla, el admin igual ve el
          // confirmation pero el link del QR queda null.
          if (confResult?.ok && confResult.confirmation && qr) {
            try {
              const { error: linkErr } = await supabase
                .from("event_qr_tokens" as never)
                .update({ confirmation_id: confResult.confirmation.id } as never)
                .eq("token" as never, qr.token);
              if (linkErr) {
                infoLog("[whatsapp/bot] provide_email: QR<->confirmation link fallo (no fatal)", {
                  leadId: lead.id,
                  confirmationId: confResult.confirmation.id,
                  token: qr.token.slice(0, 8),
                  error: linkErr.message,
                });
              }
            } catch (linkEx) {
              infoLog("[whatsapp/bot] provide_email: QR<->confirmation link threw (no fatal)", {
                error: linkEx instanceof Error ? linkEx.message : String(linkEx),
              });
            }
          }

          // FIX 2026-07-16 (sprint pago-en-puerta): si el evento del
          // registro es de pago (priceMxn > 0), forzar
          // payment_status='pending' en la confirmation. createConfirmation
          // inserta con el default 'not_required' (legacy, asume free),
          // pero para que el admin de pagos manuales (panel
          // /admin/eventos/[id]) pueda registrar el cobro en puerta y
          // para que el endpoint /api/check-in/[token] avise al staff
          // que el asistente aún no ha pagado, el estado inicial del
          // confirmado de pago DEBE ser 'pending'.
          //
          // Mismo patrón que el bloque de `interactive_event_inscribir`
          // (linea 6225+, fix 2026-07-15c). Ahí ya se hacía, pero
          // SOLO cuando el flow pasaba por el botón "Inscribirme"
          // directo. Aquí cubrimos el path `provide_name → provide_email`
          // que también termina en una confirmation.
          const regEvtIsPaid =
            typeof regEvt.priceMxn === "number" && regEvt.priceMxn > 0;
          if (regEvtIsPaid && confResult?.ok && confResult.confirmation) {
            try {
              const { error: payUpdErr } = await supabase
                .from("event_confirmations")
                .update({ payment_status: "pending" } as never)
                .eq("id", confResult.confirmation.id);
              if (payUpdErr) {
                errorLog("[whatsapp/bot] provide_email: payment_status update fallo (no fatal)", {
                  leadId: lead.id,
                  confirmationId: confResult.confirmation.id,
                  code: (payUpdErr as { code?: string }).code,
                });
              } else {
                debugLog("[whatsapp/bot] provide_email: payment_status=pending aplicado", {
                  leadId: lead.id,
                  confirmationId: confResult.confirmation.id,
                  eventSlug: registrationEventSlug,
                  priceMxn: regEvt.priceMxn,
                });
              }
            } catch (payUpdEx) {
              errorLog("[whatsapp/bot] provide_email: payment_status update threw", {
                leadId: lead.id,
                error: payUpdEx instanceof Error ? payUpdEx.message : String(payUpdEx),
              });
            }
          }
        } else {
          errorLog("[whatsapp/bot] provide_email: no se pudo resolver event_id para confirmation", {
            leadId: lead.id,
            eventSlug: registrationEventSlug,
          });
        }
      } catch (err) {
        errorLog("[whatsapp/bot] provide_email: createConfirmation falló", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Bloque 1 (Fase 7a): enviar pase digital al correo del asistente.
    // Best-effort: si falla, el link del QR por WhatsApp sigue funcionando.
    // No bloquea el flow principal.
    //
    // FIX 2026-07-02 (sesion David): el email debe usar el evento del
    // REGISTRO (registrationEventSlug), no loadActiveEventContext() que
    // siempre retorna el primero. Asi el email coincide con el QR y la
    // pagina de check-in.
    if (qrUrl && qr) {
      void (async () => {
        try {
          const event = registrationEventSlug
            ? await loadActiveEventContext(registrationEventSlug).catch(() => null)
            : await loadActiveEventContext().catch(() => null);
          // FIX 2026-07-02: usar URL publica del QR en vez de data URL.
          // Los data URLs no se renderizan en Gmail/Outlook.
          const qrImageUrl = `${appBaseUrl()}/api/event-qr/${qr.token}.png`;
          // Gate URL para eventos virtuales/híbridos (migration 20260707000000).
          const gateUrl =
            event?.format && event.format !== "in_person"
              ? `${appBaseUrl()}/api/event-gate/${encodeURIComponent(qr.token)}/click`
              : undefined;
          // FIX P1 2026-07-03: pasamos eventId + tokenId para que el
          // resultado se loggee en event_email_log (visibilidad admin).
          // `generateQrToken` no devuelve el token.id (PK), solo el string —
          // para event_qr_token_id haría falta otro SELECT. Por ahora null.
          const result = await sendEventQrPassEmail(
            {
              attendeeName: lead.name,
              attendeeEmail: email,
              eventTitle: event?.title ?? registrationEventTitle ?? "el evento",
              eventStartsAt: event?.startsAt
                ? event.startsAt.toISOString()
                : new Date().toISOString(),
              eventLocation: event?.location ?? null,
              qrImageUrl,
              checkInUrl: qrUrl,
              // Streaming (migration 20260707000000).
              format: event?.format ?? "in_person",
              gateUrl,
              streamingAccessNote: event?.streamingAccessNote ?? undefined,
            },
            {
              eventId: event?.id ?? null,
              eventQrTokenId: null,
            }
          );
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
      })();
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
    leadProfile,
    // FIX 2026-07-07 (feat/eventos-virtual-y-formato): pasamos el evento
    // del registro (si lo detectamos) para que el handler provide_email
    // sepa si el evento es virtual y mande el link streaming en vez del
    // QR pass. El matchedEvent ya incluye format/streamingUrl/nota porque
    // ActiveEventContext se actualizó con esos campos en esta sesión.
    registrationEvent: matchedEvent ?? null,
    // FIX 2026-07-02 (sesion David, "Ver eventos muestra los 3"): pasamos
    // el buttonId para que handlers como interactive_event_yes puedan
    // extraer el slug del evento cuando el lead selecciona uno especifico
    // de un button o list message.
    //
    // FIX 2026-07-06 (audit G-15): leemos `message.buttonId` (no la
    // variable local `buttonId` que se extrajo arriba al inicio). El
    // fallback text→buttonId synth del wizard puede mutar `message.buttonId`
    // después del extract inicial, y necesitamos que el handler del wizard
    // reciba el buttonId sintetizado.
    buttonId: message.buttonId ?? null,
    // FIX 2026-07-02 (sesion David, "Si tras pregunta cerrada"): pasamos
    // el slug del evento cuando el handler `interactive_event_inscribir`
    // se invoca desde un affirmative corto tras una pregunta cerrada
    // del bot. Asi inscribimos al evento correcto sin re-preguntar.
    requestedEventSlug,
    // FIX 2026-07-05 (feat/survey-wizard-native): pasamos el estado del
    // wizard de encuesta (extraído del metadata del último outbound) y el
    // cliente supabase service-role (para que los handlers wizard_qN
    // puedan persistir sin re-crear conexiones).
    surveyState: wizardStateGlobal
      ? {
          step:
            typeof wizardStateGlobal.awaiting_survey_step === "number"
              ? wizardStateGlobal.awaiting_survey_step
              : 1,
          eventId: wizardStateGlobal.survey_event_id ?? null,
          eventTitle: wizardStateGlobal.survey_event_title ?? null,
          answers:
            (wizardStateGlobal.survey_answers as SurveyAnswers | null) ?? {},
          // FIX 2026-07-06 (audit G-15): pasamos `questions` del survey
          // config para que el handler `survey_qN_continue` pueda usar
          // `detectDynamicSurveyButton(buttonId, validQuestionIds)`. Sin
          // esto, el handler cae al path legacy `detectSurveyButton` que
          // solo conoce los IDs hardcoded cortos (e.g. "survey_q1_"),
          // y rechaza el buttonId dinámico `survey_q1_clarity_very_clear`
          // que sintetiza el fallback text→buttonId.
          questions:
            (wizardStateGlobal.survey_questions as SurveyQuestion[] | null | undefined) ??
            undefined
        }
      : null,
    // FIX 2026-07-07 (sesion David "captura desordenada"): propagamos el
    // awaiting_field del último outbound al plan builder, para que el
    // handler `question` (LLM) pueda mantener el flow de captura cuando
    // el lead hace una pregunta intermedia en vez de entregar el campo
    // esperado.
    pendingAwaitingField:
      (earlyWindowGlobal
        ? (
            earlyWindowGlobal.messages
              .filter((m) => m.direction === "outbound")
              .slice(-1)[0]?.metadata as { awaiting_field?: string | null } | null
          )?.awaiting_field ?? null
        : null),
    supabase
  });

  let sendResult: { ok: boolean; externalId?: string; demo?: boolean; note?: string } = {
    ok: false
  };
  try {
    const r = await plan.send();
    sendResult = {
      ok: r.ok,
      externalId: r.externalId,
      demo: r.demo,
      note: r.note
    };
  } catch (err) {
    errorLog("[whatsapp/bot] send() lanzó excepción", {
      intent,
      leadId: lead.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  // 6.5. FIX 2026-07-07 (sesion David "lead manda nombre + email juntos"):
  // Si el handler provide_name capturó nombre + email embebido
  // (metadata.implicit_capture), ejecutamos el mismo chain de side-effects
  // que provide_email:
  //   - update lead.email/name/consent_to_contact
  //   - persist consent log
  //   - generate QR token
  //   - createConfirmation (registra al lead en event_confirmations)
  //   - sendEventQrPassEmail (pase digital por correo)
  //
  // Lo hacemos aqui (post-plan) en vez de duplicar el case provide_email
  // para mantener el handler provide_name "single responsibility".
  // Refactor futuro: extraer la logica de provide_email a una helper
  // compartida `executeEmailRegistration` y llamarla desde ambos paths.
  const planMeta = plan.metadata as { implicit_capture?: { name: string; email: string } } | null;
  if (
    planMeta?.implicit_capture &&
    typeof planMeta.implicit_capture.email === "string" &&
    supabase &&
    lead.id
  ) {
    const ic = planMeta.implicit_capture;
    const capturedEmail = ic.email.toLowerCase().trim();
    const capturedName = ic.name.trim();
    try {
      // a) Update lead con email + nombre + consent.
      const { error: leadUpdateErr } = await supabase
        .from("leads")
        .update({
          email: capturedEmail,
          name: capturedName,
          consent_to_contact: true
        })
        .eq("id", lead.id);
      if (leadUpdateErr) {
        errorLog("[whatsapp/bot] implicit_capture: lead update falló", {
          leadId: lead.id,
          code: (leadUpdateErr as { code?: string }).code
        });
      }
      // b) Persist consent log.
      await persistConsent(supabase, {
        lead_id: lead.id,
        phone_normalized: phoneNormalized,
        consent_granted: true,
        consent_source: "whatsapp_bot",
        consent_text: CONSENT_DISCLOSURE,
        metadata: {
          intent: "provide_name_with_implicit_email",
          messageId: message.messageId,
          eventSlug: registrationEventSlug,
          eventTitle: registrationEventTitle
        }
      });
      // c) Identificar evento del registro (mismo flujo que provide_email).
      // Si no hay matchedEvent del bloque provide_email (porque intent era
      // provide_name), lo calculamos acá para que createConfirmation apunte
      // al evento correcto.
      let icMatchedEvent: ActiveEventContext | null = matchedEvent;
      if (!icMatchedEvent) {
        try {
          const convWindowForIc = await loadConversationWindow(phoneNormalized, 8).catch(
            () => undefined
          );
          const allEventsForIc = await loadAllActiveEvents().catch(() => [] as ActiveEventContext[]);
          icMatchedEvent = findEventInConversation(convWindowForIc, allEventsForIc);
        } catch (icResolveErr) {
          errorLog("[whatsapp/bot] implicit_capture: findEventInConversation falló", {
            leadId: lead.id,
            error: icResolveErr instanceof Error ? icResolveErr.message : String(icResolveErr)
          });
        }
      }
      const icEventSlug = icMatchedEvent?.slug ?? registrationEventSlug;
      const icEventTitle = icMatchedEvent?.title ?? registrationEventTitle;
      // d) Generate QR token.
      const qr = await generateQrToken(
        supabase,
        phoneNormalized,
        capturedName,
        capturedEmail,
        icEventSlug
        // FIX 2026-07-19: el confirmationId se setea via UPDATE
        // retroactivo despues del createConfirmation (orden logico
        // del flow: QR primero, confirmation despues).
      ).catch((qrErr) => {
        errorLog("[whatsapp/bot] implicit_capture: generateQrToken threw", {
          leadId: lead.id,
          error: qrErr instanceof Error ? qrErr.message : String(qrErr)
        });
        return null;
      });
      const icQrUrl = qr?.url ?? null;
      // e) Create confirmation en event_confirmations.
      if (qr && icEventSlug) {
        try {
          const regEvt = await loadActiveEventContext(icEventSlug).catch(() => null);
          if (regEvt?.id) {
            const confResult = await createConfirmation({
              eventId: regEvt.id,
              name: capturedName || "Asistente",
              email: capturedEmail,
              phoneRaw: phoneNormalized,
              phoneNormalized,
              source: "whatsapp_bot"
            });
            debugLog("[whatsapp/bot] implicit_capture: confirmation registrada", {
              leadId: lead.id,
              eventId: regEvt.id,
              created: confResult.created,
              persisted: confResult.persisted,
              note: confResult.note
            });
            // FIX 2026-07-19: vincular QR a la confirmation
            // (mismo fix que en case "provide_email" + safety-net).
            if (confResult?.ok && confResult.confirmation && qr) {
              try {
                await supabase
                  .from("event_qr_tokens" as never)
                  .update({ confirmation_id: confResult.confirmation.id } as never)
                  .eq("token" as never, qr.token);
              } catch (linkEx) {
                infoLog("[whatsapp/bot] implicit_capture: QR<->confirmation link threw (no fatal)", {
                  error: linkEx instanceof Error ? linkEx.message : String(linkEx),
                });
              }
            }
            // createConfirmation conserva un default histórico de
            // `not_required`; para cualquier evento con precio, el registro
            // de WhatsApp debe quedar pendiente hasta que Stripe o el admin
            // confirme el cobro.
            if (
              typeof regEvt.priceMxn === "number" &&
              regEvt.priceMxn > 0 &&
              confResult?.ok &&
              confResult.confirmation
            ) {
              try {
                await supabase
                  .from("event_confirmations" as never)
                  .update({ payment_status: "pending" } as never)
                  .eq("id" as never, confResult.confirmation.id);
              } catch (paymentStatusErr) {
                errorLog("[whatsapp/bot] implicit_capture: payment_status update falló", {
                  leadId: lead.id,
                  error:
                    paymentStatusErr instanceof Error
                      ? paymentStatusErr.message
                      : String(paymentStatusErr),
                });
              }
            }
          }
        } catch (confErr) {
          errorLog("[whatsapp/bot] implicit_capture: createConfirmation falló", {
            leadId: lead.id,
            error: confErr instanceof Error ? confErr.message : String(confErr)
          });
        }
      }
      // f) Send event QR pass email (best-effort).
      if (qr) {
        void (async () => {
          try {
            const event = icEventSlug
              ? await loadActiveEventContext(icEventSlug).catch(() => null)
              : await loadActiveEventContext().catch(() => null);
            const qrImageUrl = `${appBaseUrl()}/api/event-qr/${qr.token}.png`;
            const gateUrl =
              event?.format && event.format !== "in_person"
                ? `${appBaseUrl()}/api/event-gate/${encodeURIComponent(qr.token)}/click`
                : undefined;
            const result = await sendEventQrPassEmail(
              {
                attendeeName: capturedName,
                attendeeEmail: capturedEmail,
                eventTitle: event?.title ?? icEventTitle ?? "el evento",
                eventStartsAt: event?.startsAt
                  ? event.startsAt.toISOString()
                  : new Date().toISOString(),
                eventLocation: event?.location ?? null,
                qrImageUrl,
                checkInUrl: icQrUrl ?? qr.url,
                format: event?.format ?? "in_person",
                gateUrl,
                streamingAccessNote: event?.streamingAccessNote ?? undefined
              },
              {
                eventId: event?.id ?? null,
                eventQrTokenId: null
              }
            );
            if (!result.ok) {
              errorLog("[whatsapp/bot] implicit_capture: sendEventQrPassEmail failed", {
                leadId: lead.id,
                error: result.error
              });
            }
          } catch (sendErr) {
            errorLog("[whatsapp/bot] implicit_capture: sendEventQrPassEmail threw", {
              leadId: lead.id,
              error: sendErr instanceof Error ? sendErr.message : String(sendErr)
            });
          }
        })();
      }
      debugLog("[whatsapp/bot] implicit_capture: side-effects completados", {
        leadId: lead.id,
        hasQr: Boolean(qr)
      });
    } catch (icErr) {
      errorLog("[whatsapp/bot] implicit_capture: side-effects threw", {
        leadId: lead.id,
        error: icErr instanceof Error ? icErr.message : String(icErr)
      });
    }
  }

  // 7. Persistir outbound.
  // FIX 2026-07-04 (auditoria nocturna David): solo persistir si el send
  // fue exitoso. Antes persistiamos SIEMPRE, lo cual generaba "phantom
  // rows" — filas en `lead_whatsapp_conversations` que el usuario nunca
  // recibió (Meta devolvió 5xx, timeout, error de token, etc.) y que el
  // CRM mostraba como respuesta. Ahora: si el send falló, NO dejamos
  // huella falsa en la DB; solo loggeamos el error para debugging.
  let outboundConvId: string | null = null;
  // FIX 2026-07-11 (Sprint v15 PR #2.5b, I-FINAL-5): variables de scope
  // para que el metadata del outbound pueda adjuntar `auto_sent_source`
  // y `event_offer_type` sin necesidad de hacer cast sobre `plan`. Las
  // declaramos aquí (al scope del `processInboundMessage`) y las reusa
  // el bloque de persistencia más abajo.
  const isBotAuthored = !plan.templateName;
  if (supabase && sendResult.ok) {
    outboundConvId = await persistConversation(supabase, {
      lead_id: lead.id,
      phone_normalized: phoneNormalized,
      direction: "outbound",
      message_type: plan.kind,
      body: plan.body,
      whatsapp_message_id: sendResult.externalId ?? null,
      // FIX 2026-07-02 (Commit A): incluir metadata del plan
      // (ej. awaiting_field del flow secuencial nombre → email).
      // Spread DESPUES de los defaults para que el plan pueda
      // override si necesita.
      //
      // FIX 2026-07-11 (Sprint v15 PR #2.5b, I-FINAL-5): adjuntar
      // `auto_sent_source: "bot"` cuando la respuesta fue auto-enviada
      // por el agente (vs. plantilla estática). Permite que analytics /
      // /admin/bot/stats diferencien "respuesta del bot" de "template
      // determinista" (welcome, register, etc.).
      metadata: {
        intent,
        templateName: plan.templateName ?? null,
        demo: sendResult.demo ?? false,
        // FIX 2026-07-11: source del auto-envío. Si el plan es
        // `text` o `interactive` y NO tiene templateName, fue el bot.
        // (Templates deterministas siempre setean templateName.)
        auto_sent: isBotAuthored,
        auto_sent_source: isBotAuthored ? "bot" : "template",
        ...(plan.metadata ?? {})
      }
    });
  } else if (!sendResult.ok) {
    // Política del proyecto: cero PII en logs (solo flags/IDs/contadores).
    // No incluimos el phone aquí — el leadId es suficiente para correlacionar
    // con la fila en `leads` si se necesita.
    // FIX 2026-07-09 noche (sesión David "outbound perdido"): agregar
    // templateName + awaiting_field al log para que sea ACCIONABLE
    // (David puede correlacionar el fallo con qué handler / paso del
    // journey fue). Sin esto, el log solo tenía `note` genérico y era
    // difícil diagnosticar fallos intermitentes de Meta/Brevo.
    errorLog("[whatsapp/bot] outbound NO persistido (send falló)", {
      intent,
      leadId: lead.id,
      demo: sendResult.demo ?? false,
      templateName: plan.templateName ?? null,
      awaitingField:
        (plan.metadata as { awaiting_field?: string | null } | null)
          ?.awaiting_field ?? null,
      note: sendResult.note
    });
  }

  // 8. Tocar last_contacted_at + summary.
  // FIX 2026-07-04: solo si el outbound fue OK. Antes tocábamos el lead
  // aunque el usuario no hubiera recibido el mensaje (mentira sobre el
  // estado de contacto). Ahora: si falló el send, dejamos last_contacted_at
  // intacto — el contacto real no ocurrió.
  if (supabase && sendResult.ok) {
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
