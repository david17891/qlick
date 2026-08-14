/**
 * Guardas compartidos para el motor conversacional seguro.
 *
 * Este módulo no tiene acceso a Supabase ni a proveedores externos. Mantener
 * estas decisiones puras permite probarlas con fixtures y usarlas como una
 * frontera de seguridad antes de enviar cualquier texto a WhatsApp.
 */

export type BotEngineMode = "legacy" | "shadow" | "canary" | "live" | "safe";

export type ActiveDomain = "event" | "service" | "support" | "general";

export type ExpectedReply =
  | "none"
  | "event_choice"
  | "name"
  | "email"
  | "payment_action"
  | "service_goal";

export type BotDecisionEntityType = "name" | "email" | "event" | "button";

export interface BotDecisionEntity {
  type: BotDecisionEntityType;
  exactSpan: string;
}

export interface BotDecision {
  domain: ActiveDomain;
  intent: string;
  confidence: number;
  entityCandidates: BotDecisionEntity[];
  answerKey: string;
  nextAction: ExpectedReply;
  replyDraft?: string;
}

const PLACEHOLDER_NAMES = new Set([
  "por",
  "por confirmar",
  "confirmar",
  "test",
  "test number",
  "whatsapp",
  "whatsapp lead",
  "asistente",
  "pendiente",
  "n/a",
  "na",
  "anonimo",
  "anonymous",
  "sin nombre",
]);

const FILLER_WORDS = new Set([
  "ah", "ok", "okay", "si", "sí", "no", "ya", "vale", "bueno", "claro",
  "pues", "hey", "hola", "gracias", "thanks", "dale", "va", "listo",
  "perfecto", "excelente", "genial", "buenas", "días", "dias", "tardes",
  "noches",
]);

const NON_NAME_WORDS = new Set([
  "básico", "basico", "premium", "estándar", "estandar", "paquete", "plan",
  "agencia", "marketing", "publicidad", "evento", "taller", "curso", "servicio",
  "información", "informacion", "ubicación", "ubicacion", "ciudad", "municipio",
  "colonia", "calle", "avenida", "cp",
]);

const LEADING_PREPOSITION = /^(?:en|desde|por|para|a|hacia|cerca\s+de|de)\b/i;
// Una ubicación o dirección nunca es una captura de nombre. La coma y los
// indicadores de sede aparecen con frecuencia cuando el lead responde a una
// pregunta de registro copiando el lugar del evento (ej. "CANACO, San Luis
// Río Colorado"). Se rechaza antes de normalizar tokens para no convertirla
// accidentalmente en nombre válido.
const LOCATION_LIKE_NAME_RE = /[,\n]|\b(?:canaco|avenida|av\.?|calle|colonia|c\.p\.?|c[oó]digo\s+postal)\b/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const INTERNAL_REASONING_RE = /(?:<\/?think\b|\b(?:pensamiento|razonamiento|análisis|analysis|reasoning|diagnóstico)\s*:|\b(?:el\s+lead|el\s+usuario|el\s+prospecto)\s+(?:escribió|pregunta|dijo|quiere)|\b(?:voy\s+a|debo\s+responder|respondo|aplico\s+(?:la|el)\s+regla|analizando|internamente|no\s+debo\s+inventar)\b)/iu;

function stripInvisible(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "");
}

function cleanToken(value: string): string {
  return value.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, "");
}

/** Solo permite nombres capturados por una señal explícita del usuario. */
export function isVerifiedNameCandidate(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const text = stripInvisible(value).trim();
  if (text.length < 2 || text.length > 100) return false;
  if (EMAIL_RE.test(text) || URL_RE.test(text) || /\d/.test(text)) return false;
  if (LEADING_PREPOSITION.test(text)) return false;
  if (LOCATION_LIKE_NAME_RE.test(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;

  const normalized = words.map(cleanToken).filter(Boolean);
  if (normalized.length !== words.length) return false;
  if (normalized.some((word) => FILLER_WORDS.has(word))) return false;
  if (normalized.some((word) => NON_NAME_WORDS.has(word))) return false;
  if (normalized.every((word) => PLACEHOLDER_NAMES.has(word))) return false;
  if (PLACEHOLDER_NAMES.has(normalized.join(" "))) return false;

  return normalized.every((word) => /\p{L}{2,}/u.test(word));
}

/** El perfil de WhatsApp nunca es suficiente para personalizar un saludo. */
export function isTrustedNameStatus(value: unknown): boolean {
  return value === "user_verified" || value === "admin_verified";
}

export function hasVerifiedNameTag(tags: readonly string[] | null | undefined): boolean {
  return Boolean(tags?.some((tag) => tag === "name:user_verified" || tag === "name:admin_verified"));
}

export function trustedLeadName(
  name: string | null | undefined,
  tags: readonly string[] | null | undefined,
): string {
  return hasVerifiedNameTag(tags) && isVerifiedNameCandidate(name) ? name!.trim() : "";
}

export function hasInternalReasoningLeak(value: string | null | undefined): boolean {
  return Boolean(value && INTERNAL_REASONING_RE.test(value));
}

export interface ReplySafetyContext {
  isPaidEvent?: boolean;
  paymentPending?: boolean;
  hasVerifiedPayment?: boolean;
  isFreeEvent?: boolean;
}

/** Valida el texto final sin intentar rescatar una salida contaminada. */
export function validateGeneratedReply(
  value: string | null | undefined,
  context: ReplySafetyContext = {},
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = value?.trim() ?? "";
  const lower = text.toLowerCase();

  if (!text) reasons.push("empty_reply");
  if (text.length > 700) reasons.push("reply_too_long");
  if (hasInternalReasoningLeak(text)) reasons.push("internal_reasoning_leak");

  if (
    context.isPaidEvent &&
    context.paymentPending &&
    !context.hasVerifiedPayment &&
    /\b(?:confirmad[oa]|registrad[oa]|lugar\s+reservado|apartad[oa]|qr|pase|acceso)\b/i.test(lower)
  ) {
    reasons.push("paid_event_claim_before_payment");
  }

  if (!context.isFreeEvent && /\b(?:pago\s+aprobado|confirmo\s+tu\s+pago|te\s+di\s+acceso)\b/i.test(lower)) {
    reasons.push("unsupported_payment_claim");
  }

  return { ok: reasons.length === 0, reasons };
}

export function parseBotEngineMode(value: unknown): BotEngineMode {
  return value === "shadow" || value === "canary" || value === "live" || value === "safe"
    ? value
    : "legacy";
}

export function redactForModel(value: string | null | undefined): string {
  if (!value) return "";
  return stripInvisible(value)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi, "[EMAIL]")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[URL]")
    .replace(/\b(?:\+?52)?\s?\d[\d\s-]{8,}\b/g, "[PHONE]")
    .replace(/\b(?:qr|token|wamid|payment[_ -]?intent)\s*[:#-]?\s*[\w-]+\b/gi, "[ID]");
}

export function buildSafeReply(domain: ActiveDomain): string {
  if (domain === "service") {
    return "Puedo orientarte sobre nuestros servicios. ¿Qué necesitas resolver primero?";
  }
  if (domain === "event") {
    return "Con gusto te ayudo con el evento. ¿Quieres información de la fecha, el contenido o el pago?";
  }
  return "Con gusto te ayudo. ¿Qué información necesitas?";
}

export function validateBotDecision(input: unknown): {
  ok: boolean;
  decision?: BotDecision;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reasons: ["decision_not_object"] };
  }
  const value = input as Record<string, unknown>;
  const allowed = new Set([
    "domain", "intent", "confidence", "entityCandidates", "answerKey", "nextAction", "replyDraft",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) reasons.push(`unexpected_key:${key}`);
  }

  const domains: ActiveDomain[] = ["event", "service", "support", "general"];
  const nextActions: ExpectedReply[] = ["none", "event_choice", "name", "email", "payment_action", "service_goal"];
  if (!domains.includes(value.domain as ActiveDomain)) reasons.push("invalid_domain");
  if (typeof value.intent !== "string" || value.intent.length < 1 || value.intent.length > 80) reasons.push("invalid_intent");
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) reasons.push("invalid_confidence");
  if (!Array.isArray(value.entityCandidates)) reasons.push("invalid_entities");
  if (!nextActions.includes(value.nextAction as ExpectedReply)) reasons.push("invalid_next_action");
  if (typeof value.answerKey !== "string" || value.answerKey.length < 1 || value.answerKey.length > 120) reasons.push("invalid_answer_key");
  if (value.replyDraft !== undefined && (typeof value.replyDraft !== "string" || value.replyDraft.length > 700)) reasons.push("invalid_reply_draft");

  const entities = Array.isArray(value.entityCandidates) ? value.entityCandidates : [];
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") {
      reasons.push("invalid_entity");
      continue;
    }
    const candidate = entity as Record<string, unknown>;
    if (!["name", "email", "event", "button"].includes(String(candidate.type))) reasons.push("invalid_entity_type");
    if (typeof candidate.exactSpan !== "string" || candidate.exactSpan.length > 120) reasons.push("invalid_entity_span");
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    reasons: [],
    decision: {
      domain: value.domain as ActiveDomain,
      intent: value.intent as string,
      confidence: value.confidence as number,
      entityCandidates: entities as BotDecisionEntity[],
      answerKey: value.answerKey as string,
      nextAction: value.nextAction as ExpectedReply,
      ...(typeof value.replyDraft === "string" ? { replyDraft: value.replyDraft } : {}),
    },
  };
}
