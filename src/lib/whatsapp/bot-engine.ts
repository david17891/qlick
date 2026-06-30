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

import type { Lead } from "@/types";
import type { Database } from "@/types/supabase";

import { findLeadByPhone } from "../crm/leads-server";
import { normalizePhone } from "../crm/phone-utils";
import { markWhatsAppStatus } from "../leads/whatsapp-status";
import {
  getActiveAgentProvider,
  validateAgentReply
} from "../ai";
import { getAIAgentProfile } from "../crm/agent-utils";

import type { IncomingWhatsAppMessage } from "./webhooks/types";
import { getActiveWhatsAppProvider } from ".";

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
  | "question";

/** Resultado del procesamiento de un mensaje entrante. */
export interface BotProcessResult {
  ok: boolean;
  intent: BotIntent;
  leadId: string | null;
  conversationId?: string;
  outboundMessageId?: string;
  /** Si el bot respondió con template o con texto libre. */
  responseKind: "template" | "text" | "none";
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
 */
const TEMPLATES = {
  bienvenida: "conf_bienvenida",
  infoEvento: "conf_info_evento",
  confirmacion: "conf_confirmacion_registro"
} as const;

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

/** URL base pública (para QR check-in). */
function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://qlick.mx";
}

/* ------------------------------------------------------------------ */
/*  Clasificación de intents                                           */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GREETING_RE = /^(hola|hi|buenos|buenas|informaci[oó]n|info|menu|men[uú])/i;
const REGISTER_RE = /^(s[ií]|confirmo|inscribirme|registrarme|quiero|me interesa)/i;
const OPT_OUT_RE = /^(no|cancelar|baja|stop|unsubscribe)/i;

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
  if (REGISTER_RE.test(text)) return "register";
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
    // eslint-disable-next-line no-console
    console.error("[whatsapp/bot] persistConversation falló", {
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
    // eslint-disable-next-line no-console
    console.error("[whatsapp/bot] persistConsent falló", {
      code: (error as { code?: string }).code
    });
    return false;
  }
  return true;
}

/**
 * Genera un QR token (URL-safe, 32 chars) y lo inserta en `event_qr_tokens`
 * asociado al evento activo y al teléfono del asistente.
 */
async function generateQrToken(
  supabase: SupabaseAdmin,
  phoneNormalized: string,
  attendeeName: string,
  attendeeEmail: string | null
): Promise<{ token: string; url: string } | null> {
  // Buscar el evento activo (placeholder: el primer evento publicado).
  const { data: evt, error: evtErr } = await supabase
    .from("events")
    .select("id, ends_at")
    .eq("status", "published")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (evtErr || !evt) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp/bot] generateQrToken: no hay evento publicado.");
    return null;
  }
  const eventId = (evt as { id: string }).id;
  const endsAt = (evt as { ends_at?: string | null }).ends_at;
  // expires_at = event end + 6h (alineado con el comment del SQL).
  const baseEnd = endsAt ? new Date(endsAt) : new Date();
  const expiresAt = new Date(baseEnd.getTime() + 6 * 60 * 60 * 1000);

  const token = randomBytes(24).toString("base64url").slice(0, 32);
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
    // eslint-disable-next-line no-console
    console.error("[whatsapp/bot] generateQrToken falló", {
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
  const safeName = contactName?.trim() || "Por confirmar";
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
      whatsapp_status: "no_contactado",
      tags: ["source:whatsapp_bot"]
    } as never)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp/bot] createLeadFromWhatsApp falló", {
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
        name: contactName?.trim() || "Por confirmar",
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
  const existing = await findLeadByPhone(phoneNormalized);
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
  kind: "template" | "text";
  /** Body que se persistirá en lead_whatsapp_conversations. */
  body: string;
  /** Nombre de template (si kind=template). */
  templateName?: string;
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
}): Promise<OutboundPlan> {
  const { intent, lead, body } = args;
  const provider = getActiveWhatsAppProvider();
  const firstName = lead.name?.split(" ")[0] || "hola";

  switch (intent) {
    case "welcome":
    case "greeting": {
      return {
        kind: "template",
        templateName: TEMPLATES.bienvenida,
        body: `Hola ${firstName}, bienvenido/a a Qlick. ¿Quieres info de "${getActiveEvent().name}"? Responde "sí" para más detalles.`,
        send: () =>
          provider.send({
            to: lead.phone ?? "",
            body: firstName,
            templateName: TEMPLATES.bienvenida,
            templateLanguage: "es_MX"
          })
      };
    }
    case "register": {
      const evt = getActiveEvent();
      const evtText =
        `${evt.name} | ${evt.date} | ${evt.location} | ${evt.duration}`;
      return {
        kind: "template",
        templateName: TEMPLATES.infoEvento,
        body: evtText,
        send: () =>
          provider.send({
            to: lead.phone ?? "",
            body: evtText,
            templateName: TEMPLATES.infoEvento,
            templateLanguage: "es_MX"
          })
      };
    }
    case "opt_out": {
      return {
        kind: "text",
        body: "Listo, no te contacto más. Si cambias de opinión, escribinos.",
        send: () =>
          provider.send({
            to: lead.phone ?? "",
            body:
              "Listo, no te contacto más. Si cambias de opinión, escribinos."
          })
      };
    }
    case "provide_email": {
      const email = body.trim();
      const url = `${appBaseUrl()}/qr`;
      const qrLine = `Tu pase: ${url}`;
      return {
        kind: "template",
        templateName: TEMPLATES.confirmacion,
        body: `${firstName} | ${email} | ${qrLine}`,
        send: () =>
          provider.send({
            to: lead.phone ?? "",
            body: `${firstName} | ${email} | ${qrLine}`,
            templateName: TEMPLATES.confirmacion,
            templateLanguage: "es_MX"
          })
      };
    }
    case "question":
    default: {
      // Modo sugerencia: el agente sugiere, validamos guardrails,
      // y mandamos texto libre (ventana 24h).
      const profile = getAIAgentProfile();
      const agent = getActiveAgentProvider();
      const result = await agent.run("suggest_reply", {
        profile,
        leadName: lead.name,
        courseOfInterest: lead.courseOfInterest,
        lastIncomingMessage: body
      });
      let content = result.content?.trim();
      if (!content) {
        content =
          "Gracias por tu mensaje. Un asesor de Qlick te va a responder pronto.";
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
          provider.send({ to: lead.phone ?? "", body: content ?? "" })
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
  const phoneNormalized = normalizePhone(message.from);
  if (!phoneNormalized) {
    return {
      ok: false,
      intent: "question",
      leadId: null,
      responseKind: "none",
      note: `No se pudo normalizar el teléfono "${message.from ?? ""}".`
    };
  }

  const body = (message.text ?? "").trim();
  const supabase = await getSupabase();

  // 1. Buscar o crear lead.
  const upsert = await findOrCreateLead(
    supabase,
    phoneNormalized,
    message.contactName
  );
  if (!upsert) {
    return {
      ok: false,
      intent: "question",
      leadId: null,
      responseKind: "none",
      note: "No se pudo resolver el lead (findOrCreateLead null)."
    };
  }
  const { lead, created } = upsert;
  const isFirstMessage = created;

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

  // 3. Detectar intent.
  const intent = detectIntent(body, isFirstMessage);

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
  let qrUrl: string | null = null;
  if (intent === "provide_email" && supabase) {
    const email = body.trim().toLowerCase();
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
      metadata: { intent, messageId: message.messageId }
    });
    const qr = await generateQrToken(
      supabase,
      phoneNormalized,
      lead.name,
      email
    );
    qrUrl = qr?.url ?? null;
  }

  // 6. Construir plan de respuesta y enviar.
  const plan = await buildResponsePlan({
    intent,
    lead,
    body,
    isFirstMessage
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
    // eslint-disable-next-line no-console
    console.error("[whatsapp/bot] send() lanzó excepción", {
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
