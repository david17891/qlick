// Test directo de matchTextToEvent con los bodies reales de la conversación
// de David. NO se conecta a Supabase — replica la lógica localmente.

const event = {
  slug: "marketing-ia-para-emprendedores-pago",
  title: "Marketing + IA para Emprendedores (Copia - Pago)",
  shortCode: "PYT5",
  location: "CANACA",
};

function matchShortCode(text, allEvents) {
  const regex = /\b([A-Z0-9]{4})\b/g;
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) return null;
  const byCode = new Map();
  for (const evt of allEvents) {
    if (evt.shortCode) byCode.set(evt.shortCode.toUpperCase(), evt);
  }
  for (const m of matches) {
    const code = m[1].toUpperCase();
    const evt = byCode.get(code);
    if (evt) return { event: evt, reason: `short_code(${code})` };
  }
  return null;
}

function matchTextToEvent(text, allEvents) {
  const body = text.toLowerCase();
  const codeMatch = matchShortCode(text, allEvents);
  if (codeMatch) return codeMatch;
  // (skip index/ordinal heuristics — solo nos interesa slug/title)
  // 2) Slug textual
  for (const evt of allEvents) {
    if (body.includes(evt.slug.toLowerCase())) {
      return { event: evt, reason: "slug" };
    }
  }
  // 3) Titulo (palabras >3 chars)
  for (const evt of allEvents) {
    const titleWords = evt.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const matched = titleWords.filter((w) => body.includes(w));
    if (matched.length >= 1) {
      return { event: evt, reason: `title(${matched.length})`, matched };
    }
  }
  // 4) Location
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

const allEvents = [event];

const outbounds = [
  // outbound 3 (truncado en la BD, el real es mas largo)
  "Para inscribirte al taller *Marketing + IA para Emprendedores (Copia - Pago)* necesito tu nombre completo (así queda en tu constancia de asistencia). ¿Me lo pasas? Ej: \"Juan Pérez\".",
  // outbound 4 (truncado)
  "Gracias, David. Solo necesito tu correo electrónico para enviarte los detalles del evento \"Marketing + IA para Emprendedores\" del 17 de julio en CANACA. ¿Cuál es tu mejor correo?",
  // variant: short code
  "Tu evento es PYT5, el 17 de julio.",
];

console.log("===== TESTS matchTextToEvent =====\n");
for (const body of outbounds) {
  const r = matchTextToEvent(body, allEvents);
  console.log(`body: ${body.slice(0, 80)}...`);
  console.log(`  match: ${r ? `${r.reason} -> ${r.event.slug}` : "NULL ❌"}`);
  console.log();
}

// Test que palabras del título matchean
console.log("===== Title words analysis =====");
const titleWords = event.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
console.log("title words (>3 chars):", titleWords);
const body3 = "Para inscribirte al taller *Marketing + IA para Emprendedores (Copia - Pago)* necesito tu nombre completo (así queda en tu constancia de asistencia). ¿Me lo pasas? Ej: \"Juan Pérez\".";
const body4 = "Gracias, David. Solo necesito tu correo electrónico para enviarte los detalles del evento \"Marketing + IA para Emprendedores\" del 17 de julio en CANACA. ¿Cuál es tu mejor correo?";

for (const w of titleWords) {
  console.log(`  '${w}' in outbound3: ${body3.toLowerCase().includes(w)}, in outbound4: ${body4.toLowerCase().includes(w)}`);
}
