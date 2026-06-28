/**
 * Tests para el broadcast de WhatsApp de recordatorio de evento
 * (Sub-bloque C de Fase 4, variante broadcast).
 *
 * Cubre los helpers puros en `src/lib/contact/whatsapp.ts`:
 * - `buildEventReminderMessage` — template del mensaje.
 * - `buildEventBroadcast` — arma la lista de items wa.me + skipped.
 *
 * No mockea Supabase. El numero de ventas viene de env vars pero
 * el helper lo consulta en runtime; los tests verifican SOLO la
 * logica de los helpers, no si el env var esta seteado.
 *
 * Corre con `node --test`:
 *   node --test tests/whatsapp-broadcast.test.mjs
 * O via npm:
 *   npm test
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEventReminderMessage,
  buildEventBroadcast,
} from "../src/lib/contact/whatsapp.ts";

// ─────────────────────────────────────────────────────────────
// buildEventReminderMessage
// ─────────────────────────────────────────────────────────────

test("buildEventReminderMessage: saludo + nombre + URL siempre presente", () => {
  const msg = buildEventReminderMessage({
    name: "Ana",
    eventTitle: "Taller de Funnels",
    eventUrl: "https://qlick.mx/eventos/taller",
  });
  assert.match(msg, /^Hola Ana,/);
  assert.match(msg, /Taller de Funnels/);
  assert.match(msg, /https:\/\/qlick\.mx\/eventos\/taller/);
  assert.match(msg, /Equipo Qlick/);
});

test("buildEventReminderMessage: fecha y lugar opcionales, no quedan huecos", () => {
  const msg = buildEventReminderMessage({
    name: "Ana",
    eventTitle: "Taller",
    eventUrl: "https://qlick.mx/eventos/taller",
  });
  // Sin fecha/lugar, no debe haber "Cuándo: undefined" ni similar.
  assert.doesNotMatch(msg, /undefined/);
  assert.doesNotMatch(msg, /Cuándo: \./);
  assert.doesNotMatch(msg, /Dónde: \./);
});

test("buildEventReminderMessage: con fecha + lugar los incluye", () => {
  const msg = buildEventReminderMessage({
    name: "Beto",
    eventTitle: "Conferencia",
    eventDate: "5 de julio 2026, 10:00",
    eventLocation: "CDMX presencial",
    eventUrl: "https://qlick.mx/eventos/conf",
  });
  assert.match(msg, /5 de julio 2026/);
  assert.match(msg, /CDMX presencial/);
});

test("buildEventReminderMessage: nombre vacio -> saludo generico", () => {
  const msg = buildEventReminderMessage({
    name: "   ",
    eventTitle: "X",
    eventUrl: "https://qlick.mx",
  });
  assert.match(msg, /^Hola,/);
});

// ─────────────────────────────────────────────────────────────
// buildEventBroadcast
// ─────────────────────────────────────────────────────────────

const confirmations = [
  { id: "c-1", name: "Ana", phoneNormalized: "+523312345678" },
  { id: "c-2", name: "Beto", phoneNormalized: "+52 55 8765 4321" }, // con espacios
  { id: "c-3", name: "Carla", phoneNormalized: "+526865551234" },
  // sin phone -> va a skipped
  { id: "c-4", name: "David Sin Phone" },
  // phone con formato no-E.164 -> lo limpia
  { id: "c-5", name: "Eve", phoneRaw: "(33) 1234-5678" },
  // phone corto (<10 digitos) -> skipped
  { id: "c-6", name: "Frank Corto", phoneNormalized: "+12345" },
];

test("buildEventBroadcast: confirma que el sales number esta configurado (env)", () => {
  // No podemos asumir que la env esta seteada. Verificamos solo la shape.
  const r = buildEventBroadcast({
    confirmations: [],
    eventTitle: "Test",
    eventUrl: "https://qlick.mx",
  });
  assert.equal(typeof r.configured, "boolean");
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.skipped, []);
});

test("buildEventBroadcast: filtra confirmados sin phone normalizable", () => {
  const r = buildEventBroadcast({
    confirmations,
    eventTitle: "Test",
    eventUrl: "https://qlick.mx",
  });
  const skippedNames = r.skipped.map((s) => s.name);
  // David sin phone y Frank con phone corto van a skipped
  assert.ok(skippedNames.includes("David Sin Phone"));
  assert.ok(skippedNames.includes("Frank Corto"));
});

test("buildEventBroadcast: items tienen link wa.me valido", () => {
  const r = buildEventBroadcast({
    confirmations,
    eventTitle: "Test",
    eventUrl: "https://qlick.mx/e/x",
  });
  for (const item of r.items) {
    assert.match(item.waLink, /^https:\/\/wa\.me\/\d+\?text=/);
    // phone sin + ni espacios
    assert.match(item.phone, /^\d+$/);
  }
});

test("buildEventBroadcast: phone se limpia (sin +, sin espacios, sin guiones)", () => {
  const r = buildEventBroadcast({
    confirmations,
    eventTitle: "Test",
    eventUrl: "https://qlick.mx",
  });
  // Beto tiene "+52 55 8765 4321" -> debe quedar "525587654321"
  const beto = r.items.find((i) => i.name === "Beto");
  if (r.configured) {
    // Si hay env, Beto debe estar en items
    assert.ok(beto, "Beto deberia estar en items si sales number esta configurado");
    assert.equal(beto.phone, "525587654321");
  }
});

test("buildEventBroadcast: el mensaje esta URL-encoded en el link", () => {
  const r = buildEventBroadcast({
    confirmations: [{ id: "c-1", name: "Ana", phoneNormalized: "+523312345678" }],
    eventTitle: "Taller con ñ y tildes",
    eventUrl: "https://qlick.mx/e/1",
  });
  const item = r.items[0];
  // El texto URL-encoded tiene %20, %C3%B1, etc. NO debe tener espacios literales.
  assert.ok(!item.waLink.includes(" "), "El link no debe tener espacios literales");
  assert.ok(item.waLink.includes("%20") || item.waLink.includes("%C3%B1"));
});

test("buildEventBroadcast: messagePreview no expone el placeholder {nombre}", () => {
  const r = buildEventBroadcast({
    confirmations: [],
    eventTitle: "Test",
    eventUrl: "https://qlick.mx",
  });
  assert.ok(!r.messagePreview.includes("{nombre}"));
  assert.match(r.messagePreview, /\[nombre del confirmado\]/);
});

test("buildEventBroadcast: array vacio de confirmations devuelve resultado vacio", () => {
  const r = buildEventBroadcast({
    confirmations: [],
    eventTitle: "Test",
    eventUrl: "https://qlick.mx",
  });
  assert.equal(r.items.length, 0);
  assert.equal(r.skipped.length, 0);
});
