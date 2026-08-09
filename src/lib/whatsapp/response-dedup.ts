/**
 * Evita repetir una respuesta inicial cuando Meta entrega dos mensajes del
 * mismo lead prácticamente al mismo tiempo.
 *
 * Esta regla es deliberadamente estrecha: solo aplica a welcome/greeting,
 * exige el mismo texto y solo considera respuestas previamente enviadas por
 * el bot o por una plantilla automática. No bloquea captura, pagos ni
 * mensajes manuales.
 */

export type InitialResponseIntent = "welcome" | "greeting";

export interface RapidDuplicateResponseInput {
  candidateIntent: string;
  candidateBody: string | null | undefined;
  lastOutboundBody: string | null | undefined;
  lastOutboundCreatedAt: string | null | undefined;
  lastOutboundAutoSource: string | null | undefined;
  now?: Date;
  maxAgeMs?: number;
}

export interface RapidDuplicateResponseResult {
  suppress: boolean;
  reason: "rapid_duplicate_initial_response" | "not_duplicate";
}

const INITIAL_RESPONSE_INTENTS = new Set<InitialResponseIntent>([
  "welcome",
  "greeting"
]);

function normalizeBody(body: string | null | undefined): string {
  return (body ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Devuelve true únicamente para una respuesta inicial idéntica enviada en
 * una ventana corta. Un timestamp inválido o metadata ausente dejan pasar la
 * respuesta: ante duda, el bot conserva su comportamiento normal.
 */
export function shouldSuppressRapidDuplicateResponse(
  input: RapidDuplicateResponseInput
): RapidDuplicateResponseResult {
  if (!INITIAL_RESPONSE_INTENTS.has(input.candidateIntent as InitialResponseIntent)) {
    return { suppress: false, reason: "not_duplicate" };
  }

  if (
    input.lastOutboundAutoSource !== "bot" &&
    input.lastOutboundAutoSource !== "template"
  ) {
    return { suppress: false, reason: "not_duplicate" };
  }

  const candidate = normalizeBody(input.candidateBody);
  const previous = normalizeBody(input.lastOutboundBody);
  if (!candidate || candidate !== previous) {
    return { suppress: false, reason: "not_duplicate" };
  }

  const previousAt = Date.parse(input.lastOutboundCreatedAt ?? "");
  if (!Number.isFinite(previousAt)) {
    return { suppress: false, reason: "not_duplicate" };
  }

  const now = input.now ?? new Date();
  const ageMs = now.getTime() - previousAt;
  const maxAgeMs = input.maxAgeMs ?? 15_000;
  if (ageMs < 0 || ageMs > maxAgeMs) {
    return { suppress: false, reason: "not_duplicate" };
  }

  return {
    suppress: true,
    reason: "rapid_duplicate_initial_response"
  };
}
