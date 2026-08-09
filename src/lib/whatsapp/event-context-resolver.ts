/**
 * Resolver puro de evento para WhatsApp.
 *
 * El lead es global, pero el contexto del mensaje pertenece a un evento. Este
 * módulo no consulta Supabase ni decide sobre pagos: solo devuelve una
 * coincidencia explicable y su nivel de confianza.
 */

export type EventResolverConfidence = "explicit" | "contextual" | "fallback";

export interface EventResolverEvent {
  id: string;
  slug: string;
  shortCode?: string | null;
  title: string;
  location?: string | null;
}

export interface EventResolverMessage {
  direction: "inbound" | "outbound";
  body?: string | null;
  buttonId?: string | null;
}

export interface EventResolverMatch {
  event: EventResolverEvent;
  confidence: EventResolverConfidence;
  reason: string;
}

export interface ResolveEventContextInput {
  body?: string | null;
  buttonId?: string | null;
  messages?: EventResolverMessage[];
  events: EventResolverEvent[];
  allowSingleEventFallback?: boolean;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function meaningfulWords(value: string): string[] {
  const stopWords = new Set([
    "con",
    "cuando",
    "como",
    "de",
    "del",
    "donde",
    "el",
    "en",
    "la",
    "las",
    "los",
    "para",
    "por",
    "que",
    "un",
    "una",
    "y",
  ]);
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));
}

function extractButtonSlug(buttonId: string | null | undefined): string | null {
  if (!buttonId) return null;
  const match = buttonId.match(
    /^(?:evt_(?:info|inscribir|yes|register)|confirm_inscription)_(.+)$/i,
  );
  return match?.[1] ?? null;
}

function matchByButton(
  buttonId: string | null | undefined,
  events: EventResolverEvent[],
): EventResolverMatch | null {
  const slug = extractButtonSlug(buttonId);
  if (!slug) return null;
  const event = events.find((candidate) => candidate.slug === slug);
  return event
    ? { event, confidence: "explicit", reason: "button_slug" }
    : null;
}

function matchByShortCode(
  text: string,
  events: EventResolverEvent[],
): EventResolverMatch | null {
  const byCode = new Map(
    events
      .filter((event) => event.shortCode)
      .map((event) => [normalize(event.shortCode ?? ""), event]),
  );
  const tokens = normalize(text).match(/\b[a-z0-9]{4}\b/g) ?? [];
  for (const token of tokens) {
    const event = byCode.get(token);
    if (event) return { event, confidence: "explicit", reason: "short_code" };
  }
  return null;
}

function matchByCatalogIndex(
  text: string,
  events: EventResolverEvent[],
): EventResolverMatch | null {
  const normalized = normalize(text);
  const numeric = normalized.match(
    /(?:^|\b)(?:evento|opcion|numero)\s*(\d+)\b|^\s*(?:el\s+)?(\d+)\s*[).:\-]?\s*$/,
  );
  const bracketed = normalized.match(/\[(\d+)\]/);
  const ordinal = normalized.match(/\b(?:el\s+)?(primero|segundo|tercero|cuarto|quinto)\b/);
  const rawIndex = bracketed?.[1] ?? numeric?.[1] ?? numeric?.[2];
  const ordinalIndex = ordinal
    ? { primero: 1, segundo: 2, tercero: 3, cuarto: 4, quinto: 5 }[
        ordinal[1] as "primero" | "segundo" | "tercero" | "cuarto" | "quinto"
      ]
    : null;
  const index = rawIndex ? Number.parseInt(rawIndex, 10) : ordinalIndex;
  if (!index || index < 1 || index > events.length) return null;
  return {
    event: events[index - 1],
    confidence: "explicit",
    reason: bracketed ? "catalog_index" : ordinal ? "catalog_ordinal" : "leading_number",
  };
}

function matchByText(
  text: string,
  events: EventResolverEvent[],
): EventResolverMatch | null {
  const normalized = normalize(text);

  const slugMatches = events.filter((event) => normalized.includes(normalize(event.slug)));
  if (slugMatches.length === 1) {
    return { event: slugMatches[0], confidence: "explicit", reason: "slug_text" };
  }

  const titleScores = events.map((event) => {
    const words = meaningfulWords(event.title);
    const matches = words.filter((word) => normalized.includes(word));
    const distinctive = matches.some((word) => word.length >= 6);
    const phrase = words.some(
      (word, index) => index > 0 && normalized.includes(`${words[index - 1]} ${word}`),
    );
    return { event, score: matches.length + (phrase ? 2 : 0), distinctive };
  });
  const bestScore = Math.max(...titleScores.map((candidate) => candidate.score), 0);
  const titleMatches = titleScores.filter(
    (candidate) => candidate.score === bestScore && candidate.score > 0,
  );
  if (titleMatches.length === 1 && (bestScore >= 2 || titleMatches[0].distinctive)) {
    return { event: titleMatches[0].event, confidence: "contextual", reason: "title_text" };
  }

  const locationScores = events.map((event) => ({
    event,
    score: meaningfulWords(event.location ?? "").filter((word) => normalized.includes(word)).length,
  }));
  const bestLocation = Math.max(...locationScores.map((candidate) => candidate.score), 0);
  const locationMatches = locationScores.filter(
    (candidate) => candidate.score === bestLocation && candidate.score > 0,
  );
  return locationMatches.length === 1
    ? { event: locationMatches[0].event, confidence: "contextual", reason: "location_text" }
    : null;
}

function resolveFromText(
  text: string | null | undefined,
  events: EventResolverEvent[],
): EventResolverMatch | null {
  if (!text?.trim()) return null;
  return matchByShortCode(text, events) ?? matchByCatalogIndex(text, events) ?? matchByText(text, events);
}

export function resolveEventContext(input: ResolveEventContextInput): EventResolverMatch | null {
  if (input.events.length === 0) return null;

  const buttonMatch = matchByButton(input.buttonId, input.events);
  if (buttonMatch) return buttonMatch;

  const directMatch = resolveFromText(input.body, input.events);
  if (directMatch) return directMatch;

  const messages = [...(input.messages ?? [])].reverse();
  for (const message of messages) {
    const messageButtonMatch = matchByButton(message.buttonId, input.events);
    if (messageButtonMatch) {
      return { ...messageButtonMatch, confidence: "contextual", reason: "conversation_button" };
    }
    const messageMatch = resolveFromText(message.body, input.events);
    if (messageMatch) {
      return { ...messageMatch, confidence: "contextual", reason: `conversation_${messageMatch.reason}` };
    }
  }

  if (input.allowSingleEventFallback && input.events.length === 1) {
    return { event: input.events[0], confidence: "fallback", reason: "single_active_event" };
  }
  return null;
}
