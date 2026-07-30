import type { LeadIntent, LeadStatus } from "@/types/crm";

/** Señal mínima que el bot puede convertir en una etapa comercial. */
export interface LeadLifecycleInput {
  currentStatus: LeadStatus;
  currentIntent: LeadIntent;
  botIntent: string;
  body: string;
  awaitingField?: "name" | "email" | null;
  eventSlug?: string | null;
}

export interface LeadLifecycleDecision {
  status: LeadStatus;
  intent: LeadIntent;
  tagsToAdd: string[];
  nextFollowUpAt: string | null;
  reason: string;
}

const TERMINAL_STATUSES = new Set<LeadStatus>([
  "enrolled",
  "active_student",
  "event_attended",
  "survey_completed",
  "archived",
]);

const INFO_SIGNAL_RE = /\b(info|informaci[oó]n|curso|evento|taller|precio|costo|incluye|horario|fecha|d[oó]nde|d[oó]nde)\b/i;
const ENROLL_SIGNAL_RE = /\b(inscribirme|inscrib[ií]r|registrarme|registrar|apartar|reservar|separar|quiero entrar|quiero asistir)\b/i;
const PAYMENT_SIGNAL_RE = /\b(pagar|pago|dep[oó]sito|oxxo|transferencia|tarjeta|comprobante)\b/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/i;

function addTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? [] : [tag];
}

/**
 * Decide el avance comercial sin I/O y sin degradar etapas avanzadas.
 *
 * Un saludo aislado queda como `contacted`; pedir información concreta queda
 * como `info_requested`; una acción de inscripción crea una oportunidad
 * `interested`; y capturar correo deja el lead listo para pago.
 */
export function decideLeadLifecycle(input: LeadLifecycleInput): LeadLifecycleDecision {
  const body = input.body.trim();
  const eventTag = input.eventSlug ? `event:${input.eventSlug}:registration_started` : null;
  const registrationPending = Boolean(input.awaitingField) || input.botIntent === "provide_name";

  if (input.botIntent === "opt_out") {
    return {
      status: "lost",
      intent: input.currentIntent,
      tagsToAdd: ["whatsapp:opt_out"],
      nextFollowUpAt: null,
      reason: "El lead pidió no recibir más contacto.",
    };
  }

  if (TERMINAL_STATUSES.has(input.currentStatus)) {
    return {
      status: input.currentStatus,
      intent: input.currentIntent,
      tagsToAdd: [],
      nextFollowUpAt: null,
      reason: "Se preserva una etapa terminal o de alumno.",
    };
  }

  const isPaymentStep =
    input.botIntent === "provide_email" ||
    (input.botIntent === "provide_name" && EMAIL_RE.test(body)) ||
    PAYMENT_SIGNAL_RE.test(body);
  const isEnrollment =
    input.botIntent === "interactive_event_inscribir" ||
    input.botIntent === "register" ||
    ENROLL_SIGNAL_RE.test(body);
  const isInfoRequest = INFO_SIGNAL_RE.test(body) || input.botIntent === "course_information";

  if (isPaymentStep && (registrationPending || input.currentStatus === "payment_pending")) {
    return {
      status: "payment_pending",
      intent: "payment_help",
      tagsToAdd: eventTag ? [eventTag, "registration:payment_pending"] : ["registration:payment_pending"],
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reason: "El lead avanzó hasta el paso de pago.",
    };
  }

  if (isEnrollment || registrationPending) {
    const tag = eventTag ? [eventTag, "registration:incomplete"] : ["registration:incomplete"];
    return {
      status: "interested",
      intent: "enroll_course",
      tagsToAdd: tag,
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reason: registrationPending
        ? "El lead inició el registro y todavía falta un dato."
        : "El lead expresó intención de inscribirse.",
    };
  }

  if (isInfoRequest && (input.currentStatus === "new" || input.currentStatus === "contacted")) {
    return {
      status: "info_requested",
      intent: "course_information",
      tagsToAdd: addTag([], "conversation:info_requested"),
      nextFollowUpAt: null,
      reason: "Pidió información, pero no inició una inscripción.",
    };
  }

  if (input.currentStatus === "new") {
    return {
      status: "contacted",
      intent: input.currentIntent,
      tagsToAdd: ["conversation:first_contact"],
      nextFollowUpAt: null,
      reason: "Hubo contacto, pero no hay una señal comercial suficiente.",
    };
  }

  return {
    status: input.currentStatus,
    intent: input.currentIntent,
    tagsToAdd: [],
    nextFollowUpAt: null,
    reason: "No hay una transición comercial nueva.",
  };
}
