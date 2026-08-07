import type { LeadIntent, LeadStatus } from "@/types/crm";
import { getWhatsAppSessionWindow } from "./session-window";

export const LEAD_FOLLOWUP_MAX_PER_WINDOW = 2;
export const LEAD_FOLLOWUP_MAX_PER_RUN = 5;
export const LEAD_FOLLOWUP_RETRY_DELAY_MS = 30 * 60 * 1000;
export const LEAD_FOLLOWUP_CLAIM_DELAY_MS = 24 * 60 * 60 * 1000;
export const LEAD_REGISTRATION_COMPLETE_TAG = "registration:complete";

export const LEAD_FOLLOWUP_DELAYS_MS = {
  registration_incomplete: [60 * 60 * 1000, 6 * 60 * 60 * 1000],
  payment_pending: [4 * 60 * 60 * 1000, 8 * 60 * 60 * 1000],
} as const;

export type LeadFollowupMode = "off" | "shadow" | "live";
export type LeadFollowupStage = "registration_incomplete" | "payment_pending";

export function hasCompletedRegistrationSignal(
  tags: string[] | null | undefined,
): boolean {
  return (tags ?? []).includes(LEAD_REGISTRATION_COMPLETE_TAG);
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

function firstName(value: string | undefined): string {
  const cleaned = (value ?? "")
    .replace(/\[[^\]]+\]/g, "")
    .trim()
    .split(/\s+/)[0] ?? "";
  if (!cleaned || /^(por|confirmar|lead|whatsapp)$/i.test(cleaned)) return "";
  return cleaned;
}

function stageForInput(input: Pick<LeadFollowupInput, "status" | "intent" | "tags">): LeadFollowupStage | null {
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
  if (sentCountAfterSend >= LEAD_FOLLOWUP_MAX_PER_WINDOW) return null;
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
    const field = awaitingField === "email" ? "tu correo" : awaitingField === "name" ? "tu nombre completo" : "un dato";
    if (followupNumber === 1) {
      return `${prefix}\n\n¿Quieres que te ayude a terminar tu registro? Solo me falta ${field}.`;
    }
    return `${prefix}\n\nSigo pendiente para ayudarte con tu inscripción. Cuando quieras continuar, mándame ${field}.`;
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
  if (!input.consentToContact && !hasTransactionalRegistrationSignal(input.tags)) {
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

  const session = getWhatsAppSessionWindow(input.lastInboundAt, now);
  if (session.state === "unknown") {
    return { eligible: false, stage, reason: "window_unknown", followupNumber: null, body: null };
  }
  if (session.state === "closed") {
    return { eligible: false, stage, reason: "window_closed", followupNumber: null, body: null };
  }
  if (input.lastMessageDirection !== "outbound") {
    return { eligible: false, stage, reason: "lead_needs_bot_reply", followupNumber: null, body: null };
  }
  if (input.lastOutboundManual) {
    return { eligible: false, stage, reason: "manual_reply_pending", followupNumber: null, body: null };
  }
  if (input.sentCountInWindow >= LEAD_FOLLOWUP_MAX_PER_WINDOW) {
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
