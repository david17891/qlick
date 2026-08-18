import type { LeadIntent, LeadStatus } from "@/types/crm";
import { getWhatsAppSessionWindow } from "./session-window";

export const WHATSAPP_FREE_ENTRY_POINT_MS = 72 * 60 * 60 * 1000;
export const WHATSAPP_STANDARD_SESSION_MS = 24 * 60 * 60 * 1000;
export const LEAD_FOLLOWUP_MAX_PER_WINDOW = 2;
export const LEAD_FOLLOWUP_MAX_PER_RUN = 5;
export const LEAD_FOLLOWUP_RETRY_DELAY_MS = 30 * 60 * 1000;
export const LEAD_FOLLOWUP_CLAIM_DELAY_MS = 24 * 60 * 60 * 1000;
export const LEAD_REGISTRATION_COMPLETE_TAG = "registration:complete";

export const LEAD_FOLLOWUP_DELAYS_MS = {
  registration_incomplete: [60 * 60 * 1000, 6 * 60 * 60 * 1000],
  payment_pending: [4 * 60 * 60 * 1000, 8 * 60 * 60 * 1000],
  info_requested: [3 * 60 * 60 * 1000],
} as const;

export type LeadFollowupMode = "off" | "shadow" | "live";
export type LeadFollowupStage =
  | "registration_incomplete"
  | "payment_pending"
  | "info_requested";

export const LEAD_INFO_FOLLOWUP_MAX_PER_WINDOW = 1;

export function getMaxFollowupsForStage(stage: LeadFollowupStage): number {
  return stage === "info_requested"
    ? LEAD_INFO_FOLLOWUP_MAX_PER_WINDOW
    : LEAD_FOLLOWUP_MAX_PER_WINDOW;
}

export function hasCompletedRegistrationSignal(
  tags: string[] | null | undefined,
): boolean {
  return (tags ?? []).some(
    (tag) =>
      tag === LEAD_REGISTRATION_COMPLETE_TAG ||
      /^event:.+:registration_complete$/.test(tag),
  );
}

export interface LeadFollowupInput {
  name?: string;
  status: LeadStatus;
  intent: LeadIntent;
  tags?: string[] | null;
  consentToContact: boolean;
  botPaused: boolean;
  nextFollowUpAt: string | null;
  lastInboundAt: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastOutboundManual: boolean;
  awaitingField: "name" | "email" | null;
  sentCountInWindow: number;
  freeEntryPointUntil?: string | null;
  now?: Date;
}

export interface LeadFollowupDecision {
  eligible: boolean;
  stage: LeadFollowupStage | null;
  reason:
    | "eligible"
    | "not_a_followup_stage"
    | "consent_missing"
    | "bot_paused"
    | "opted_out"
    | "not_due"
    | "window_unknown"
    | "window_closed"
    | "lead_needs_bot_reply"
    | "manual_reply_pending"
    | "registration_complete"
    | "max_attempts_reached";
  followupNumber: number | null;
  body: string | null;
}

/**
 * Una inscripcion iniciada permite completar el tramite dentro de la ventana
 * de servicio de WhatsApp, aunque el lead todavia no haya aceptado mensajes
 * comerciales. Esto no cambia `consent_to_contact`: es solo una senal
 * transaccional, y una baja explicita sigue bloqueando cualquier envio.
 */
export function hasTransactionalRegistrationSignal(
  tags: string[] | null | undefined,
): boolean {
  return (tags ?? []).some(
    (tag) =>
      tag === "registration:incomplete" ||
      tag === "registration:payment_pending" ||
      /^event:.+:registration_started$/.test(tag),
  );
}

/**
 * Pedir información por WhatsApp abre una conversación de servicio sobre
 * esa solicitud. Esto permite un único rescate contextual dentro de 24 h sin
 * convertir `consent_to_contact` en consentimiento general de marketing.
 */
export function hasRequestedInfoSignal(
  tags: string[] | null | undefined,
): boolean {
  return (tags ?? []).includes("conversation:info_requested");
}

/**
 * Obtiene el ultimo campo de registro que el bot estaba solicitando.
 *
 * Algunos mensajes historicos (por ejemplo un acuse de "gracias") no
 * incluyen `awaiting_field`; en ese caso conservamos el ultimo estado de la
 * maquina que si lo declaro. Si existe un estado explicito con `null`, ese
 * estado cancela cualquier solicitud anterior.
 */
export function getPendingRegistrationField(
  messages: Array<{
    direction: "inbound" | "outbound";
    metadata?: unknown;
  }>,
): "name" | "email" | null {
  const outboundWithState = [...messages]
    .reverse()
    .find(
      (message) =>
        message.direction === "outbound" &&
        message.metadata &&
        typeof message.metadata === "object" &&
        Object.prototype.hasOwnProperty.call(message.metadata, "awaiting_field"),
    );

  if (outboundWithState) {
    const value = (outboundWithState.metadata as { awaiting_field?: unknown })
      .awaiting_field;
    return value === "name" || value === "email" ? value : null;
  }

  return null;
}

/**
 * Corrige estados históricos donde el modelo dejó `awaiting_field=name`
 * aunque el texto enviado ya pedía el correo. El cuerpo visible es una señal
 * segura porque proviene del outbound persistido, no de una inferencia nueva.
 */
export function normalizePendingRegistrationField(
  messages: Array<{
    direction: "inbound" | "outbound";
    body?: string | null;
    metadata?: unknown;
  }>,
): "name" | "email" | null {
  const field = getPendingRegistrationField(messages);
  const lastOutbound = [...messages]
    .reverse()
    .find((message) => message.direction === "outbound");
  const body = lastOutbound?.body ?? "";

  // Rescate de outbounds históricos o de proveedores que no conservaron la
  // metadata: el texto explícito de la pregunta sigue siendo una señal
  // determinista y permite continuar el flujo sin volver al LLM.
  const inferredField = !field && body
    ? /(?:nombre\s+completo|dime\s+(?:tu\s+)?nombre|m[aá]ndame\s+(?:tu\s+)?nombre)\b/i.test(body)
      ? "name"
      : /(?:correo|email)\b/i.test(body) &&
          /(?:falta|m[aá]ndame|dame|p[aá]same|comparte|env[ií]a)/i.test(body)
        ? "email"
        : null
    : null;
  const effectiveField = field ?? inferredField;
  if (!effectiveField) return null;

  if (
    effectiveField === "name" &&
    /(?:solo|s[oó]lo|[úu]nicamente)\s+(?:me\s+)?falta(?:n)?\s+(?:tu\s+)?(?:mejor\s+)?(?:correo|email)\b/i.test(body)
  ) {
    return "email";
  }
  if (
    effectiveField === "name" &&
    /(?:ahora|solo)\s+(?:m[aá]ndame|dame|p[aá]same|comparte)\s+(?:tu\s+)?(?:correo|email)\b/i.test(body)
  ) {
    return "email";
  }
  if (
    effectiveField === "email" &&
    /(?:necesito|dime|indica|m[aá]ndame|comparte)\s+(?:tu\s+)?nombre\s+completo\b/i.test(body)
  ) {
    return "name";
  }
  return effectiveField;
}

/**
 * Indica si el ultimo outbound del bot fue el rescate de informacion y aun
 * no existe una respuesta del bot posterior. Se usa para que un "si" corto
 * entre al cierre de inscripcion, en vez de caer en el ack generico.
 */
export function isInfoRescuePending(
  messages: Array<{
    direction: "inbound" | "outbound";
    metadata?: unknown;
  }>,
): boolean {
  const lastOutbound = [...messages]
    .reverse()
    .find((message) => message.direction === "outbound");
  if (!lastOutbound || !lastOutbound.metadata || typeof lastOutbound.metadata !== "object") {
    return false;
  }
  const metadata = lastOutbound.metadata as {
    auto_sent_source?: unknown;
    followup_stage?: unknown;
  };
  return metadata.auto_sent_source === "lead_followup" && metadata.followup_stage === "info_requested";
}

type FollowupConversationMessage = {
  direction: "inbound" | "outbound";
  created_at: string;
  metadata?: unknown;
};

function referralFromMetadata(value: unknown): { sourceType?: string } | null {
  if (!value || typeof value !== "object") return null;
  const referral = (value as { referral?: unknown }).referral;
  if (!referral || typeof referral !== "object") return null;
  return referral as { sourceType?: string; source_type?: string };
}

/**
 * Calcula la ventana especial de entrada de campaña únicamente cuando el
 * webhook conservó una referencia de Meta y el bot respondió dentro de 24h.
 * Los históricos sin referral no pueden asumir esta excepción.
 */
export function getFreeEntryPointUntil(
  messages: FollowupConversationMessage[],
  now = new Date(),
): string | null {
  const inboundWithReferral = [...messages]
    .filter((message) => message.direction === "inbound")
    .reverse()
    .find((message) => {
      const referral = referralFromMetadata(message.metadata);
      const sourceType = referral?.sourceType ?? (referral as { source_type?: string } | null)?.source_type;
      return sourceType === "ad" || sourceType === "page_cta" || sourceType === "facebook_page";
    });
  if (!inboundWithReferral) return null;

  const inboundMs = Date.parse(inboundWithReferral.created_at);
  if (!Number.isFinite(inboundMs)) return null;
  const responseDeadline = inboundMs + WHATSAPP_STANDARD_SESSION_MS;
  const hasBusinessResponse = messages.some((message) => {
    const createdMs = Date.parse(message.created_at);
    return message.direction === "outbound" &&
      Number.isFinite(createdMs) &&
      createdMs >= inboundMs &&
      createdMs <= responseDeadline;
  });
  if (!hasBusinessResponse) return null;

  const until = new Date(inboundMs + WHATSAPP_FREE_ENTRY_POINT_MS).toISOString();
  return Date.parse(until) > now.getTime() ? until : null;
}

/** Devuelve el límite efectivo de envío para una conversación. */
export function getEffectiveFollowupOpenUntil(
  lastInboundAt: string | null,
  freeEntryPointUntil: string | null,
  now = new Date(),
): string | null {
  if (freeEntryPointUntil && Date.parse(freeEntryPointUntil) > now.getTime()) {
    return freeEntryPointUntil;
  }
  return getWhatsAppSessionWindow(lastInboundAt, now).openUntil;
}

function firstName(value: string | undefined): string {
  const cleaned = (value ?? "")
    .replace(/\[[^\]]+\]/g, "")
    .trim()
    .split(/\s+/)[0] ?? "";
  if (!cleaned || /^(por|confirmar|lead|whatsapp)$/i.test(cleaned)) return "";
  return cleaned;
}

function stageForInput(input: Pick<LeadFollowupInput, "status" | "intent" | "tags">): LeadFollowupStage | null {
  // Una inscripción terminada detiene los recordatorios de registro/pago,
  // pero no debe impedir una futura solicitud explícita de información sobre
  // otro evento.
  if (
    input.status === "info_requested" &&
    hasRequestedInfoSignal(input.tags)
  ) {
    return "info_requested";
  }
  if (hasCompletedRegistrationSignal(input.tags)) return null;
  if (input.status === "payment_pending") return "payment_pending";
  if (
    input.status === "interested" &&
    (input.intent === "enroll_course" ||
      (input.tags ?? []).includes("registration:incomplete"))
  ) {
    return "registration_incomplete";
  }
  return null;
}

export function normalizeLeadFollowupMode(value: unknown): LeadFollowupMode {
  return value === "shadow" || value === "live" ? value : "off";
}

export function getNextLeadFollowupAt(
  stage: LeadFollowupStage,
  sentCountAfterSend: number,
  now: Date,
  openUntil: string | null,
): string | null {
  if (sentCountAfterSend >= getMaxFollowupsForStage(stage)) return null;
  const delay = LEAD_FOLLOWUP_DELAYS_MS[stage][sentCountAfterSend];
  if (delay === undefined) return null;
  const next = now.getTime() + delay;
  const openUntilMs = openUntil ? Date.parse(openUntil) : Number.NaN;
  if (Number.isFinite(openUntilMs) && next >= openUntilMs) return null;
  return new Date(next).toISOString();
}

export function buildLeadFollowupBody(
  stage: LeadFollowupStage,
  name: string | undefined,
  followupNumber: number,
  awaitingField: "name" | "email" | null,
): string {
  const greeting = firstName(name);
  const prefix = greeting ? `Hola ${greeting} 👋` : "Hola 👋";

  if (stage === "registration_incomplete") {
    if (!awaitingField) {
      return `${prefix}\n\nVeo que quieres avanzar con tu inscripción. Solo me faltan tu nombre completo y tu correo; respóndeme aquí y lo terminamos.`;
    }
    const field = awaitingField === "email" ? "tu correo" : awaitingField === "name" ? "tu nombre completo" : "un dato";
    if (followupNumber === 1) {
      return `${prefix}\n\n¿Quieres que te ayude a terminar tu registro? Solo me falta ${field}.`;
    }
    return `${prefix}\n\nSigo pendiente para ayudarte con tu inscripción. Cuando quieras continuar, mándame ${field}.`;
  }

  if (stage === "info_requested") {
    // Este mensaje es una puerta de cierre, no una pregunta abierta. El
    // siguiente paso debe ser inequívoco y de un solo dato: cuando la
    // persona responda "sí", el motor entra a captura de nombre y después
    // de correo. El campo pendiente se persiste en el cron que envía este
    // copy; así no cae en el ack genérico ni vuelve a presentar el evento.
    return `${prefix}\n\nSi quieres inscribirte, te paso el enlace oficial de pago para apartar o pagar. Respóndeme “sí” y empezamos con tu nombre completo.`;
  }

  if (followupNumber === 1) {
    return `${prefix}\n\n¿Quieres que te ayude a completar tu pago? Puedo reenviarte los datos y explicarte cómo apartar tu lugar.`;
  }
  return `${prefix}\n\n¿Todavía quieres reservar tu lugar? Si me respondes, te ayudo a terminar el pago por aquí.`;
}

export function decideLeadFollowup(input: LeadFollowupInput): LeadFollowupDecision {
  const now = input.now ?? new Date();
  const stage = stageForInput(input);
  if (!stage) {
    return { eligible: false, stage: null, reason: "not_a_followup_stage", followupNumber: null, body: null };
  }
  if (
    !input.consentToContact &&
    !hasTransactionalRegistrationSignal(input.tags) &&
    !hasRequestedInfoSignal(input.tags)
  ) {
    return { eligible: false, stage, reason: "consent_missing", followupNumber: null, body: null };
  }
  if (input.botPaused) {
    return { eligible: false, stage, reason: "bot_paused", followupNumber: null, body: null };
  }
  if ((input.tags ?? []).includes("whatsapp:opt_out")) {
    return { eligible: false, stage, reason: "opted_out", followupNumber: null, body: null };
  }
  if (!input.nextFollowUpAt || Date.parse(input.nextFollowUpAt) > now.getTime()) {
    return { eligible: false, stage, reason: "not_due", followupNumber: null, body: null };
  }

  const freeEntryPointActive = Boolean(
    input.freeEntryPointUntil && Date.parse(input.freeEntryPointUntil) > now.getTime(),
  );
  const session = getWhatsAppSessionWindow(input.lastInboundAt, now);
  if (session.state === "unknown" && !freeEntryPointActive) {
    return { eligible: false, stage, reason: "window_unknown", followupNumber: null, body: null };
  }
  if (session.state === "closed" && !freeEntryPointActive) {
    return { eligible: false, stage, reason: "window_closed", followupNumber: null, body: null };
  }
  if (input.lastMessageDirection !== "outbound") {
    return { eligible: false, stage, reason: "lead_needs_bot_reply", followupNumber: null, body: null };
  }
  if (input.lastOutboundManual) {
    return { eligible: false, stage, reason: "manual_reply_pending", followupNumber: null, body: null };
  }
  if (input.sentCountInWindow >= getMaxFollowupsForStage(stage)) {
    return { eligible: false, stage, reason: "max_attempts_reached", followupNumber: null, body: null };
  }

  const followupNumber = input.sentCountInWindow + 1;
  return {
    eligible: true,
    stage,
    reason: "eligible",
    followupNumber,
    body: buildLeadFollowupBody(stage, input.name, followupNumber, input.awaitingField),
  };
}
