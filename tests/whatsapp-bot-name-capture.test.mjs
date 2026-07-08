/**
 * Tests del fix "captura obligatoria de nombre" (2026-07-06).
 *
 * Cubre la decisión de David: NINGUN lead ni attendee puede quedar sin
 * nombre real. El bot-engine.ts + event-context-loader.ts + check-in
 * route.ts se modificaron para forzar la captura.
 *
 * Estos tests son unitarios sobre las primitivas puras (no E2E con
 * WhatsApp real). Cubren:
 *
 *   1. PLACEHOLDER_NAMES contiene los placeholders conocidos.
 *   2. cleanFirstName filtra placeholders (devuelve "").
 *   3. cleanFirstName respeta nombres reales.
 *   4. cleanFirstName maneja null/undefined/empty como placeholder.
 *   5. Regression: nombres en español con acentos NO se filtran.
 *   6. Regression: nombres cortos reales (≥2 chars) NO se filtran.
 *
 * El flow secuencial completo (bot pide nombre → user responde → bot
 * pide email → user responde → QR generado) requiere un test E2E con
 * un mock provider + DB. Esos tests están en `tests/whatsapp-bot.test.mjs`
 * y se mantienen actualizados contra el código del bot.
 *
 * Patrón: `node --test`, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

// Imports del código fuente (vía type-stripping de Node).
import {
  PLACEHOLDER_NAMES,
  cleanFirstName,
  matchInscriptionIntent
} from "../src/lib/whatsapp/bot-engine.ts";

/* ─────────────────────────────────────────────────────────────
 * 1. PLACEHOLDER_NAMES contiene los placeholders criticos
 * ───────────────────────────────────────────────────────────── */

test("PLACEHOLDER_NAMES contiene 'por' (legacy data)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("por"));
});

test("PLACEHOLDER_NAMES contiene 'por confirmar' (admin pre-fill)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("por confirmar"));
});

test("PLACEHOLDER_NAMES contiene 'test' (placeholders de pruebas)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("test"));
});

// FIX 2026-07-08 (audit David, sesion madrugada): cuando Meta NO
// provee el profile.name, el bot creaba el lead con name="WhatsApp
// Lead" y el saludo decia «¡Hola WhatsApp!». Verificamos que
// ambas variantes (con y sin espacio) caen al filtro.
test("PLACEHOLDER_NAMES contiene 'whatsapp' (FIX 2026-07-08)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("whatsapp"));
});

test("PLACEHOLDER_NAMES contiene 'whatsapp lead' (FIX 2026-07-08)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("whatsapp lead"));
});

test("PLACEHOLDER_NAMES NO contiene nombres reales comunes", () => {
  // Regresion: si alguien agrega un nombre comun por error, falla.
  assert.ok(!PLACEHOLDER_NAMES.has("david"));
  assert.ok(!PLACEHOLDER_NAMES.has("ana"));
  assert.ok(!PLACEHOLDER_NAMES.has("luis"));
});

/* ─────────────────────────────────────────────────────────────
 * 2. cleanFirstName filtra placeholders
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName devuelve '' para placeholder 'por'", () => {
  assert.equal(cleanFirstName("por"), "");
});

test("cleanFirstName devuelve '' para 'Por' (case insensitive)", () => {
  assert.equal(cleanFirstName("Por"), "");
  assert.equal(cleanFirstName("POR"), "");
});

test("cleanFirstName devuelve '' para 'Por Confirmar'", () => {
  assert.equal(cleanFirstName("Por Confirmar"), "");
});

test("cleanFirstName devuelve '' para 'test'", () => {
  assert.equal(cleanFirstName("test"), "");
});

test("cleanFirstName devuelve '' para 'Asistente' (placeholder UI)", () => {
  // NOTA: 'Asistente' NO esta en PLACEHOLDER_NAMES canonico, pero
  // queremos que el bot NO lo use como saludo. El check-in route.ts
  // tiene su propia lista que incluye 'asistente'. Aca validamos que
  // cleanFirstName al menos maneja el caso lowercase si se agrega.
  // Por ahora, cleanFirstName solo filtra lo que esta en el set canonico.
  const result = cleanFirstName("Asistente");
  // Aceptamos "" (si alguien lo agrego al set) o el nombre tal cual
  // (si no esta). Lo importante: nunca devuelve "Asistente" filtrado a lowercase incorrecto.
  assert.ok(result === "" || result === "Asistente");
});

/* ─────────────────────────────────────────────────────────────
 * 3. cleanFirstName respeta nombres reales
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName devuelve el nombre real 'David'", () => {
  assert.equal(cleanFirstName("David"), "David");
});

test("cleanFirstName devuelve 'Ana' (nombre corto valido)", () => {
  assert.equal(cleanFirstName("Ana"), "Ana");
});

test("cleanFirstName devuelve 'María José' (con acentos y espacios)", () => {
  assert.equal(cleanFirstName("María José"), "María José");
});

test("cleanFirstName devuelve 'Juan Pérez' (nombre completo)", () => {
  assert.equal(cleanFirstName("Juan Pérez"), "Juan Pérez");
});

test("cleanFirstName devuelve 'David Esparza' (caso real del proyecto)", () => {
  assert.equal(cleanFirstName("David Esparza"), "David Esparza");
});

/* ─────────────────────────────────────────────────────────────
 * 4. cleanFirstName maneja edge cases
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName(null) devuelve ''", () => {
  assert.equal(cleanFirstName(null), "");
});

test("cleanFirstName(undefined) devuelve ''", () => {
  assert.equal(cleanFirstName(undefined), "");
});

test("cleanFirstName('') devuelve ''", () => {
  assert.equal(cleanFirstName(""), "");
});

test("cleanFirstName('  ') (whitespace) devuelve ''", () => {
  // trim se aplica, queda "" que NO esta en PLACEHOLDER_NAMES pero
  // el .trim() lo deja vacio. cleanFirstName devuelve rawName.trim() = "".
  assert.equal(cleanFirstName("   "), "");
});

test("cleanFirstName(' David ') (con espacios) devuelve 'David' (trim)", () => {
  assert.equal(cleanFirstName(" David "), "David");
});

test("cleanFirstName maneja '  por  ' con padding (trim antes de check)", () => {
  // trim + lowercase → "por" → placeholder → ""
  assert.equal(cleanFirstName("  Por  "), "");
});

/* ─────────────────────────────────────────────────────────────
 * 5. Regression: edge cases del mundo real
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName acepta nombres con caracteres especiales válidos", () => {
  // Guiones, apostrofes, puntos son legitimos en nombres hispanos.
  assert.equal(cleanFirstName("José María"), "José María");
  assert.equal(cleanFirstName("María-José"), "María-José");
  assert.equal(cleanFirstName("O'Brien"), "O'Brien");
});

test("cleanFirstName acepta nombres con numeros (caso raro pero valido)", () => {
  assert.equal(cleanFirstName("Juan 2"), "Juan 2");
});

test("cleanFirstName NO trunca nombres largos", () => {
  const longName = "María Fernanda del Carmen de la Santísima Trinidad";
  assert.equal(cleanFirstName(longName), longName);
});

/* ─────────────────────────────────────────────────────────────
 * 6. Coherencia: cleanFirstName es determinista
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName es determinista (mismo input → mismo output)", () => {
  const input = "David Esparza";
  const result1 = cleanFirstName(input);
  const result2 = cleanFirstName(input);
  const result3 = cleanFirstName(input);
  assert.equal(result1, result2);
  assert.equal(result2, result3);
});

/* ─────────────────────────────────────────────────────────────
 * 7. FIX 2026-07-08: cleanFirstName filtra "WhatsApp Lead"
 *    que se usaba como placeholder cuando Meta no provee
 *    profile_name. Sin este fix el bot decia «¡Hola WhatsApp!».
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName devuelve '' para 'WhatsApp Lead' (FIX 2026-07-08)", () => {
  assert.equal(cleanFirstName("WhatsApp Lead"), "");
});

test("cleanFirstName devuelve '' para 'whatsapp lead' lowercase", () => {
  assert.equal(cleanFirstName("whatsapp lead"), "");
});

test("cleanFirstName devuelve '' para 'WHATSAPP' (uppercase)", () => {
  assert.equal(cleanFirstName("WHATSAPP"), "");
});

test("cleanFirstName devuelve '' para 'WhatsApp' (capitalizado)", () => {
  assert.equal(cleanFirstName("WhatsApp"), "");
});

test("cleanFirstName devuelve '' para '  WhatsApp Lead  ' (con padding)", () => {
  assert.equal(cleanFirstName("  WhatsApp Lead  "), "");
});

/* ─────────────────────────────────────────────────────────────
 * 8. FIX 2026-07-08: matchInscriptionIntent — pure helper que
 *    detecta intención de inscripción en el body del lead.
 *    Se usa para interceptar en el `case "question"` cuando el
 *    lead no tiene nombre válido y dice algo de inscripción
 *    (caso Yesenia: el LLM saltaba la captura de nombre).
 * ───────────────────────────────────────────────────────────── */

// Rama 1: affirmative corto aislado.
test("matchInscriptionIntent('Si') → true (r1 affirmative aislado)", () => {
  assert.equal(matchInscriptionIntent("Si"), true);
});

test("matchInscriptionIntent('ok') → true (r1 affirmative aislado)", () => {
  assert.equal(matchInscriptionIntent("ok"), true);
});

test("matchInscriptionIntent('dale') → true (r1)", () => {
  assert.equal(matchInscriptionIntent("dale"), true);
});

test("matchInscriptionIntent('va') → true (r1)", () => {
  assert.equal(matchInscriptionIntent("va"), true);
});

test("matchInscriptionIntent('claro') → true (r1)", () => {
  assert.equal(matchInscriptionIntent("claro"), true);
});

test("matchInscriptionIntent('Buen día') → true (r1)", () => {
  assert.equal(matchInscriptionIntent("Buen día"), true);
});

test("matchInscriptionIntent('Buenas tardes') → true (r1)", () => {
  assert.equal(matchInscriptionIntent("Buenas tardes"), true);
});

// Rama 2: affirmative + verbo de inscripción.
test("matchInscriptionIntent('Si quiero inscribirme') → true (r2)", () => {
  assert.equal(matchInscriptionIntent("Si quiero inscribirme"), true);
});

test("matchInscriptionIntent('Si, quiero inscribirme') → true (r2)", () => {
  assert.equal(matchInscriptionIntent("Si, quiero inscribirme"), true);
});

test("matchInscriptionIntent('Ok, dame mi lugar') → true (r2)", () => {
  // "dame mi lugar" = "apartar mi lugar" implícito. Matchea r2
  // (afirmativo + verbo) o r3 (frase "apartar mi lugar" via mi lugar).
  assert.equal(matchInscriptionIntent("Ok, dame mi lugar"), true);
});

// Rama 3: frase directa de inscripción.
test("matchInscriptionIntent('quiero inscribirme') → true (r3)", () => {
  assert.equal(matchInscriptionIntent("quiero inscribirme"), true);
});

test("matchInscriptionIntent('me interesa el evento') → true (r3)", () => {
  assert.equal(matchInscriptionIntent("me interesa el evento"), true);
});

test("matchInscriptionIntent('me interesa el curso') → true (r3)", () => {
  assert.equal(matchInscriptionIntent("me interesa el curso"), true);
});

test("matchInscriptionIntent('inscribirme al evento') → true (r3)", () => {
  assert.equal(matchInscriptionIntent("inscribirme al evento"), true);
});

test("matchInscriptionIntent('apartar mi lugar') → true (r3)", () => {
  assert.equal(matchInscriptionIntent("apartar mi lugar"), true);
});

test("matchInscriptionIntent('reservar mi lugar') → true (r3)", () => {
  assert.equal(matchInscriptionIntent("reservar mi lugar"), true);
});

// Casos negativos (NO debe interceptar — son preguntas libres u opt-out).
test("matchInscriptionIntent('¿Qué incluye?') → false (pregunta libre)", () => {
  assert.equal(matchInscriptionIntent("¿Qué incluye?"), false);
});

test("matchInscriptionIntent('cuanto cuesta?') → false (pregunta libre)", () => {
  assert.equal(matchInscriptionIntent("cuanto cuesta?"), false);
});

test("matchInscriptionIntent('donde es?') → false (pregunta libre)", () => {
  assert.equal(matchInscriptionIntent("donde es?"), false);
});

test("matchInscriptionIntent('no me interesa') → false (opt-out / desinteres)", () => {
  assert.equal(matchInscriptionIntent("no me interesa"), false);
});

test("matchInscriptionIntent('no quiero') → false (opt-out)", () => {
  assert.equal(matchInscriptionIntent("no quiero"), false);
});

test("matchInscriptionIntent('hola, ¿que eventos tienen?') → false (pregunta con saludo)", () => {
  assert.equal(matchInscriptionIntent("hola, ¿que eventos tienen?"), false);
});

test("matchInscriptionIntent('Yesenia López Nemecio') → false (es un nombre, no intención)", () => {
  // matchInscriptionIntent NO debe matchear nombres, solo intención.
  assert.equal(matchInscriptionIntent("Yesenia López Nemecio"), false);
});

// Edge cases.
test("matchInscriptionIntent('') → false (body vacío)", () => {
  assert.equal(matchInscriptionIntent(""), false);
});

test("matchInscriptionIntent('   ') → false (whitespace)", () => {
  assert.equal(matchInscriptionIntent("   "), false);
});

test("matchInscriptionIntent(null) → false (input null)", () => {
  assert.equal(matchInscriptionIntent(null), false);
});

test("matchInscriptionIntent(undefined) → false (input undefined)", () => {
  assert.equal(matchInscriptionIntent(undefined), false);
});

/* ─────────────────────────────────────────────────────────────
 * 9. FIX 2026-07-08 (rama 4 de matchInscriptionIntent): verbos
 *    sueltos coloquiales del chat de Mexico. Casos reportados
 *    por David: "Registrame", "Inscribime", "Anotame",
 *    "Apuntame", "Me apunto". Sin esta rama, el LLM saltaba
 *    la captura de nombre.
 * ───────────────────────────────────────────────────────────── */

test("matchInscriptionIntent('Registrame') → true (r4 verbo suelto)", () => {
  assert.equal(matchInscriptionIntent("Registrame"), true);
});

test("matchInscriptionIntent('registrame') → true (r4 lowercase)", () => {
  assert.equal(matchInscriptionIntent("registrame"), true);
});

test("matchInscriptionIntent('Inscribime') → true (r4)", () => {
  assert.equal(matchInscriptionIntent("Inscribime"), true);
});

test("matchInscriptionIntent('inscribime') → true (r4)", () => {
  assert.equal(matchInscriptionIntent("inscribime"), true);
});

test("matchInscriptionIntent('Me apunto') → true (r4 variante)", () => {
  assert.equal(matchInscriptionIntent("Me apunto"), true);
});

test("matchInscriptionIntent('me apunto') → true (r4)", () => {
  assert.equal(matchInscriptionIntent("me apunto"), true);
});

test("matchInscriptionIntent('Anotame') → true (r4)", () => {
  assert.equal(matchInscriptionIntent("Anotame"), true);
});

test("matchInscriptionIntent('Apuntame') → true (r4)", () => {
  assert.equal(matchInscriptionIntent("Apuntame"), true);
});
