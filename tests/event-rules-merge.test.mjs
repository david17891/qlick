/**
 * Tests del helper `event-rules-merge.ts` (sprint apartado CANACO, 2026-07-23).
 *
 * Cubre los 8 casos del brief + casos extremos de defensa:
 *   1. Apartado válido.
 *   2. Apartado igual al total → inválido.
 *   3. Apartado mayor al total → inválido.
 *   4. Evento gratuito con apartado → inválido (limpia campos).
 *   5. Cálculo correcto del saldo.
 *   6. Preservación de payment_mode, personalidad y reglas.
 *   7. Evento existente CANACO conservando $500/$500.
 *   8. Evento sin apartado mostrando solamente pago completo.
 *
 * El helper es PURO (sin imports de React, Supabase, fs), así que los
 * tests son rápidos y deterministas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReservationAmount,
  computeBalance,
  validateReservation,
  buildEventRulesFromForm,
} from "../src/lib/events/event-rules-merge.ts";

/* ------------------------------------------------------------------ */
/* parseReservationAmount                                              */
/* ------------------------------------------------------------------ */

test("parseReservationAmount: string vacio → null", () => {
  assert.equal(parseReservationAmount(""), null);
  assert.equal(parseReservationAmount("   "), null);
  assert.equal(parseReservationAmount(null), null);
  assert.equal(parseReservationAmount(undefined), null);
});

test("parseReservationAmount: entero positivo", () => {
  assert.equal(parseReservationAmount("500"), 500);
  assert.equal(parseReservationAmount("1"), 1);
  assert.equal(parseReservationAmount("1000000"), 1000000);
});

test("parseReservationAmount: decimal con hasta 2 lugares", () => {
  assert.equal(parseReservationAmount("500.50"), 500.5);
  assert.equal(parseReservationAmount("500.5"), 500.5);
  assert.equal(parseReservationAmount("0.99"), 0.99);
});

test("parseReservationAmount: decimal con > 2 lugares → null (decimales excesivos)", () => {
  assert.equal(parseReservationAmount("500.999"), null);
  assert.equal(parseReservationAmount("1.234"), null);
});

test("parseReservationAmount: separador de miles con coma MX", () => {
  // FIX 2026-07-23 (auditoría David): "1,500" es miles MX, "1,500.50"
  // es miles + decimal MX. Ambos válidos.
  assert.equal(parseReservationAmount("1,500.50"), 1500.5);
  assert.equal(parseReservationAmount("1,500"), 1500);
  assert.equal(parseReservationAmount("1,500,000.99"), 1500000.99);
});

test("parseReservationAmount: decimal sin punto (MX ambiguo) → null", () => {
  // FIX 2026-07-23 (auditoría David): "10,50" puede ser "10.50" (decimal)
  // o "1050" (miles mal escritos). No adivinamos. Devolvemos null para
  // que el form muestre error y el admin lo corrija a "10.50" explícito.
  assert.equal(parseReservationAmount("10,50"), null);
  assert.equal(parseReservationAmount("1,50"), null);
  assert.equal(parseReservationAmount("1,5"), null);
});

test("parseReservationAmount: miles mal formateados → null", () => {
  // Los grupos después de la primera coma deben ser EXACTAMENTE 3 dígitos.
  assert.equal(parseReservationAmount("1,50,000"), null);
  assert.equal(parseReservationAmount("1234,567"), null);
  assert.equal(parseReservationAmount(",500"), null);
});

test("parseReservationAmount: formato europeo → null", () => {
  // Formato europeo es "1.500,50" (punto para miles, coma para decimal).
  // NO lo aceptamos. Solo MX: coma para miles, punto para decimal.
  assert.equal(parseReservationAmount("1.500,50"), null);
  assert.equal(parseReservationAmount("1.500"), null);
});

test("parseReservationAmount: negativos → null", () => {
  assert.equal(parseReservationAmount("-500"), null);
  assert.equal(parseReservationAmount("-0.01"), null);
});

test("parseReservationAmount: no numerico → null", () => {
  assert.equal(parseReservationAmount("abc"), null);
  assert.equal(parseReservationAmount("500abc"), null);
  assert.equal(parseReservationAmount("--500"), null);
});

/* ------------------------------------------------------------------ */
/* computeBalance                                                      */
/* ------------------------------------------------------------------ */

test("computeBalance: caso normal 1000 - 500 = 500", () => {
  assert.equal(computeBalance(1000, 500), 500);
});

test("computeBalance: 1000 - 333.33 = 666.67 (redondeo 2 decimales)", () => {
  assert.equal(computeBalance(1000, 333.33), 666.67);
});

test("computeBalance: entradas invalidas → null", () => {
  assert.equal(computeBalance(0, 500), null);
  assert.equal(computeBalance(1000, 0), null);
  assert.equal(computeBalance(1000, 1000), null); // apartado == total
  assert.equal(computeBalance(1000, 1500), null); // apartado > total
  assert.equal(computeBalance(null, 500), null);
  assert.equal(computeBalance(1000, null), null);
});

/* ------------------------------------------------------------------ */
/* validateReservation                                                 */
/* ------------------------------------------------------------------ */

test("validateReservation: caso 1 — apartado valido 500/1000", () => {
  const r = validateReservation({ priceMXN: 1000, enabled: true, amount: 500 });
  assert.equal(r.valid, true);
  assert.equal(r.error, null);
  assert.equal(r.balance, 500);
  assert.equal(r.shouldClearReservationFields, false);
});

test("validateReservation: caso 2 — apartado igual al total → invalido", () => {
  const r = validateReservation({ priceMXN: 1000, enabled: true, amount: 1000 });
  assert.equal(r.valid, false);
  assert.ok(r.error, "debe tener mensaje de error");
  assert.ok(r.error.includes("menor que"), "error debe decir 'menor que'");
  assert.equal(r.shouldClearReservationFields, true);
});

test("validateReservation: caso 3 — apartado mayor al total → invalido", () => {
  const r = validateReservation({ priceMXN: 1000, enabled: true, amount: 1200 });
  assert.equal(r.valid, false);
  assert.ok(r.error);
  assert.equal(r.shouldClearReservationFields, true);
});

test("validateReservation: caso 4 — evento free con apartado activado → invalido y limpia", () => {
  const r = validateReservation({ priceMXN: 0, enabled: true, amount: 500 });
  assert.equal(r.valid, false);
  assert.ok(r.error?.toLowerCase().includes("gratuito"));
  assert.equal(r.shouldClearReservationFields, true);
});

test("validateReservation: evento free con apartado desactivado → valido, limpia", () => {
  const r = validateReservation({ priceMXN: 0, enabled: false, amount: 500 });
  assert.equal(r.valid, true);
  assert.equal(r.shouldClearReservationFields, true);
});

test("validateReservation: apartado vacio o NaN → invalido", () => {
  const r1 = validateReservation({ priceMXN: 1000, enabled: true, amount: null });
  assert.equal(r1.valid, false);
  assert.ok(r1.error?.includes("monto"));

  const r2 = validateReservation({ priceMXN: 1000, enabled: true, amount: NaN });
  assert.equal(r2.valid, false);
});

test("validateReservation: apartado 0 o negativo → invalido", () => {
  const r1 = validateReservation({ priceMXN: 1000, enabled: true, amount: 0 });
  assert.equal(r1.valid, false);
  const r2 = validateReservation({ priceMXN: 1000, enabled: true, amount: -50 });
  assert.equal(r2.valid, false);
});

test("validateReservation: de pago con apartado desactivado → valido, limpia", () => {
  const r = validateReservation({ priceMXN: 1000, enabled: false, amount: 999 });
  assert.equal(r.valid, true);
  assert.equal(r.balance, null);
  assert.equal(r.shouldClearReservationFields, true);
});

/* ------------------------------------------------------------------ */
/* buildEventRulesFromForm — el corazón de la persistencia             */
/* ------------------------------------------------------------------ */

/** Helper de test: arma los cambios del form con valores por defecto razonables. */
function makeChanges(overrides = {}) {
  return {
    personality: "Bot casual",
    rules: ["Regla 1", "Regla 2"],
    paymentMode: "test",
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: false,
      amount: null,
    }),
    reservationAmountParsed: null,
    ...overrides,
  };
}

test("buildEventRulesFromForm: caso 5 — calculo correcto del saldo 990 (1000 - 10)", () => {
  const changes = makeChanges({
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: true,
      amount: 10,
    }),
    reservationAmountParsed: 10,
  });
  const out = buildEventRulesFromForm({ current: null, changes });
  assert.equal(out.reservation_enabled, true);
  assert.equal(out.reservation_amount_mxn, 10);
  assert.equal(out.balance_amount_mxn, 990);
  assert.equal(out.balance_due_note, "el día del evento");
});

test("buildEventRulesFromForm: caso 6 — preserva payment_mode, personalidad y reglas", () => {
  const current = {
    personality: "Bot vieja",
    rules: ["Regla vieja"],
    payment_mode: "live",
    // Campo extra (futuro) que NO debe perderse:
    cohort_id: "Q3-2026",
  };
  const changes = makeChanges({
    personality: "Bot nueva",
    rules: ["Regla nueva", "Regla nueva 2"],
    paymentMode: "test",
  });
  const out = buildEventRulesFromForm({ current, changes });
  assert.equal(out.personality, "Bot nueva");
  assert.deepEqual(out.rules, ["Regla nueva", "Regla nueva 2"]);
  assert.equal(out.payment_mode, "test");
  // Campo extra preservado.
  assert.equal(out.cohort_id, "Q3-2026");
});

test("buildEventRulesFromForm: caso 7 — CANACO conserva $500/$500 tras edicion", () => {
  // Simulamos el estado actual de CANACO en DB: price_mxn: 1000,
  // event_rules con personality, rules, payment_mode=test, y apartado
  // activado en 500 (este es el estado "objetivo" tras configurar el
  // panel). El helper debe preservarlo al guardar.
  const current = {
    personality: "Bot amable, cercano y profesional, con espa\u00f1ol mexicano neutro.",
    rules: [
      "Usa tuteo mexicano, nunca voseo rioplatense.",
      "Explica que el precio total es de $1,000 MXN y que el apartado en l\u00ednea es de $500 MXN.",
      "Aclara que el saldo de $500 MXN se liquida el 20 de agosto de 2026 en CANACO.",
    ],
    payment_mode: "test",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
    balance_due_note: "el d\u00eda del evento",
  };
  // El admin edita el t\u00edtulo (no toca ni precio ni apartado). El form
  // manda el mismo apartado y los mismos campos.
  const changes = makeChanges({
    personality: current.personality,
    rules: current.rules,
    paymentMode: "test",
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: true,
      amount: 500,
    }),
    reservationAmountParsed: 500,
  });
  const out = buildEventRulesFromForm({ current, changes });
  // Apartado intacto: 500/1000.
  assert.equal(out.reservation_enabled, true);
  assert.equal(out.reservation_amount_mxn, 500);
  assert.equal(out.balance_amount_mxn, 500);
  // Personality y rules intactos.
  assert.equal(out.personality, current.personality);
  assert.deepEqual(out.rules, current.rules);
  // Payment mode intacto.
  assert.equal(out.payment_mode, "test");
});

test("buildEventRulesFromForm: caso 8 — sin apartado muestra solo pago completo", () => {
  // current con apartado activado.
  const current = {
    personality: "Bot legacy con apartado",
    rules: ["Regla legacy"],
    payment_mode: "test",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
  };
  // El admin desactiva el checkbox (el form siempre manda personality y
  // rules, no es parte del scope de este test cambiarlos — solo apartado).
  const changes = makeChanges({
    personality: current.personality,
    rules: current.rules,
    paymentMode: "test",
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: false,
      amount: null,
    }),
    reservationAmountParsed: null,
  });
  const out = buildEventRulesFromForm({ current, changes });
  // Apartado limpiado.
  assert.equal(out.reservation_enabled, false);
  assert.equal(out.reservation_amount_mxn, undefined);
  assert.equal(out.balance_amount_mxn, undefined);
  // Otros campos preservados.
  assert.equal(out.personality, "Bot legacy con apartado");
  assert.deepEqual(out.rules, ["Regla legacy"]);
  assert.equal(out.payment_mode, "test");
});

test("buildEventRulesFromForm: desactivar en evento free limpia todo", () => {
  const current = {
    personality: "X",
    rules: ["r1"],
    payment_mode: "test",
  };
  const changes = makeChanges({
    reservation: validateReservation({
      priceMXN: 0,
      enabled: false,
      amount: null,
    }),
  });
  const out = buildEventRulesFromForm({ current, changes });
  assert.equal(out.reservation_enabled, false);
  // Los campos reservation_* no aparecen (undefined).
  assert.equal(out.reservation_amount_mxn, undefined);
  assert.equal(out.balance_amount_mxn, undefined);
});

test("buildEventRulesFromForm: free + apartado activado en form → limpia al persistir", () => {
  // Edge case: el form YA validó y bloqueó esto (valid=false), pero por
  // defensa, si llega al merge, debe limpiar (no persistir enabled=true).
  const current = null;
  const changes = makeChanges({
    reservation: validateReservation({
      priceMXN: 0,
      enabled: true,
      amount: 500,
    }),
    reservationAmountParsed: 500,
  });
  const out = buildEventRulesFromForm({ current, changes });
  // shouldClearReservationFields=true fuerza enabled=false.
  assert.equal(out.reservation_enabled, false);
  assert.equal(out.reservation_amount_mxn, undefined);
});

test("buildEventRulesFromForm: edicion sin tocar apartado en evento de pago conserva config", () => {
  // El admin edita el evento de pago con apartado. NO toca el checkbox
  // ni el monto. El form debe reenviar los mismos valores para que el
  // merge los confirme.
  const current = {
    personality: "Bot v1",
    rules: ["r1"],
    payment_mode: "test",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
  };
  const changes = makeChanges({
    personality: "Bot v2", // s\u00ed cambi\u00f3 personalidad
    rules: ["r1"],
    paymentMode: "test",
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: true,
      amount: 500,
    }),
    reservationAmountParsed: 500,
  });
  const out = buildEventRulesFromForm({ current, changes });
  assert.equal(out.personality, "Bot v2");
  assert.equal(out.reservation_enabled, true);
  assert.equal(out.reservation_amount_mxn, 500);
  assert.equal(out.balance_amount_mxn, 500);
});

test("buildEventRulesFromForm: CANACO pre-PR sin reservation_* (estado actual en DB) → preserva estado", () => {
  // Estado REAL de CANACO hoy (consultado en DB 2026-07-23): NO tiene
  // reservation_*. Solo personality + rules. El PR no debe agregarle
  // apartado automáticamente — eso lo hace el admin desde el panel.
  // El test verifica que tras un save "neutro" (sin tocar apartado),
  // CANACO sigue exactamente como está.
  const current = {
    personality:
      "Bot amable, cercano y profesional, con espa\u00f1ol mexicano neutro.",
    rules: [
      "Usa tuteo mexicano, nunca voseo rioplatense.",
      "Explica que el precio total es de $1,000 MXN y que el apartado en l\u00ednea es de $500 MXN.",
      "Aclara que el saldo de $500 MXN se liquida el 20 de agosto de 2026 en CANACO.",
      "No inventes direcci\u00f3n, cupos, descuentos, materiales ni constancias.",
      "Si preguntan por direcci\u00f3n exacta, indica que est\u00e1 por confirmar y canaliza con el equipo humano.",
      "Para apartar, env\u00eda el enlace oficial de pago y no confirmes el apartado hasta que el webhook confirme el cobro.",
    ],
    payment_mode: "test",
  };
  const changes = makeChanges({
    personality: current.personality,
    rules: current.rules,
    paymentMode: "test",
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: false,
      amount: null,
    }),
  });
  const out = buildEventRulesFromForm({ current, changes });
  // NO se le agrega reservation_* automáticamente.
  assert.equal(out.reservation_enabled, false);
  assert.equal(out.reservation_amount_mxn, undefined);
  assert.equal(out.balance_amount_mxn, undefined);
  // Lo que tiene CANACO se preserva.
  assert.equal(out.personality, current.personality);
  assert.deepEqual(out.rules, current.rules);
  assert.equal(out.payment_mode, "test");
});

test("buildEventRulesFromForm: precioMXN undefined → tratar como free", () => {
  const changes = makeChanges({
    reservation: validateReservation({
      priceMXN: undefined,
      enabled: true,
      amount: 500,
    }),
    reservationAmountParsed: 500,
  });
  const out = buildEventRulesFromForm({ current: null, changes });
  // shouldClearReservationFields=true → enabled=false.
  assert.equal(out.reservation_enabled, false);
  assert.equal(out.reservation_amount_mxn, undefined);
});

test("buildEventRulesFromForm: trimea personality y rules", () => {
  const changes = makeChanges({
    personality: "  Bot con espacios  ",
    rules: ["  regla 1  ", "  ", "regla 2"],
  });
  const out = buildEventRulesFromForm({ current: null, changes });
  assert.equal(out.personality, "Bot con espacios");
  assert.deepEqual(out.rules, ["regla 1", "regla 2"]);
});

/* ------------------------------------------------------------------ */
/* FIX 2026-07-23 (auditoría David): preservación de payment_mode      */
/* ------------------------------------------------------------------ */

test("buildEventRulesFromForm: payment_mode undefined en changes → preserva el current 'live'", () => {
  // Caso del bug: el admin edita un evento que tenía payment_mode='live'
  // y no toca el modo de Stripe. El server llama al helper con
  // payment_mode=undefined. El helper debe preservar el current.
  const current = {
    personality: "Bot v1",
    rules: ["r1"],
    payment_mode: "live",
  };
  const changes = makeChanges({
    personality: "Bot v2", // cambió personalidad, no payment_mode
    rules: ["r1"],
    paymentMode: undefined, // NO lo está cambiando
  });
  const out = buildEventRulesFromForm({ current, changes });
  assert.equal(out.personality, "Bot v2");
  assert.equal(out.payment_mode, "live"); // preservado, no pisado a "test"
});

test("buildEventRulesFromForm: payment_mode 'test' en changes → pisa el current 'live'", () => {
  // Caso opuesto: el admin SÍ quiere cambiar el modo.
  const current = {
    personality: "X",
    rules: [],
    payment_mode: "live",
  };
  const changes = makeChanges({
    paymentMode: "test",
  });
  const out = buildEventRulesFromForm({ current, changes });
  assert.equal(out.payment_mode, "test");
});

test("buildEventRulesFromForm: payment_mode 'test' en changes con current undefined → setea 'test'", () => {
  // Creación de evento nuevo: no hay current, el form provee 'test'.
  const changes = makeChanges({
    paymentMode: "test",
  });
  const out = buildEventRulesFromForm({ current: null, changes });
  assert.equal(out.payment_mode, "test");
});

test("buildEventRulesFromForm: payment_mode undefined con current undefined → queda undefined", () => {
  // El form admin SIEMPRE provee paymentMode. Pero defense in depth:
  // si llega undefined y no hay current, no se setea nada.
  const changes = makeChanges({
    paymentMode: undefined,
  });
  const out = buildEventRulesFromForm({ current: null, changes });
  assert.equal(out.payment_mode, undefined);
});

test("buildEventRulesFromForm: CANACO con payment_mode undefined NO lo baja a 'test'", () => {
  // Test de regresión específico del bug de David: si CANACO tiene
  // payment_mode='live' (futuro) y un admin edita el título sin
  // tocar el modo, el helper no debe pisarlo a 'test'.
  const current = {
    personality: "Bot amable, cercano y profesional.",
    rules: ["r1"],
    payment_mode: "live",
  };
  const changes = makeChanges({
    personality: "Bot amable, cercano y profesional.",
    rules: ["r1"],
    paymentMode: undefined,
  });
  const out = buildEventRulesFromForm({ current, changes });
  assert.equal(out.payment_mode, "live");
});

/* ------------------------------------------------------------------ */
/* FIX 2026-07-24 (auditoría David, ronda 3): preserveReservation     */
/* ------------------------------------------------------------------ */

test("buildEventRulesFromForm: preserveReservation=true preserva apartado del current", () => {
  // Caso del bug: CANACO tiene apartado $500 configurado. El admin
  // edita SOLO la personalidad. El form no debería poder (siempre
  // manda el valor del checkbox), pero un caller externo (API) podría
  // mandar eventRules sin reservation_enabled. Antes mi código lo
  // interpretaba como "false" y borraba el apartado. Ahora con
  // preserveReservation=true, se preserva.
  const current = {
    personality: "Bot v1",
    rules: ["r1"],
    payment_mode: "test",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
    balance_due_note: "el día del evento",
  };
  const changes = makeChanges({
    personality: "Bot v2", // solo cambió personalidad
    rules: ["r1", "r2"],
    paymentMode: undefined, // tampoco payment_mode
    preserveReservation: true, // el caller NO toca el apartado
    // reservation.enabled y amount no importan acá porque
    // preserveReservation=true los ignora.
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: false, // irrelevante
      amount: null,
    }),
    reservationAmountParsed: null,
  });
  const out = buildEventRulesFromForm({ current, changes });
  // Apartado preservado exacto.
  assert.equal(out.reservation_enabled, true);
  assert.equal(out.reservation_amount_mxn, 500);
  assert.equal(out.balance_amount_mxn, 500);
  assert.equal(out.balance_due_note, "el día del evento");
  // Personalidad y rules actualizados.
  assert.equal(out.personality, "Bot v2");
  assert.deepEqual(out.rules, ["r1", "r2"]);
  // Payment_mode preservado.
  assert.equal(out.payment_mode, "test");
});

test("buildEventRulesFromForm: preserveReservation=true con current sin apartado → no activa", () => {
  // Si el current NO tiene apartado y el caller no incluye apartado
  // en el input, el resultado NO debe activar apartado. La regla es
  // "preservar", no "agregar default".
  const current = {
    personality: "X",
    rules: [],
    payment_mode: "test",
  };
  const changes = makeChanges({
    personality: "X",
    rules: [],
    paymentMode: undefined,
    preserveReservation: true,
  });
  const out = buildEventRulesFromForm({ current, changes });
  // No se activa apartado.
  assert.equal(out.reservation_enabled, undefined);
  assert.equal(out.reservation_amount_mxn, undefined);
});

test("buildEventRulesFromForm: preserveReservation=false con enabled=false → limpia", () => {
  // Caso opuesto: el caller QUIERE desactivar el apartado
  // explícitamente. El form manda reservationEnabled=false.
  const current = {
    personality: "X",
    rules: [],
    payment_mode: "test",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
  };
  const changes = makeChanges({
    personality: "X",
    rules: [],
    paymentMode: "test",
    preserveReservation: false, // explícito: el caller SÍ toca apartado
    reservation: validateReservation({
      priceMXN: 1000,
      enabled: false, // desactivado
      amount: null,
    }),
  });
  const out = buildEventRulesFromForm({ current, changes });
  // Apartado limpiado.
  assert.equal(out.reservation_enabled, false);
  assert.equal(out.reservation_amount_mxn, undefined);
  assert.equal(out.balance_amount_mxn, undefined);
});

test("buildEventRulesFromForm: CANACO update parcial personalidad → apartado $500 preservado", () => {
  // Test de regresión específico del escenario CANACO. CANACO hoy
  // NO tiene reservation_*, pero si el admin lo configura ($500) y
  // después edita la personalidad desde el panel, el update parcial
  // NO debe borrar el apartado. Aunque en la práctica el form admin
  // siempre manda el valor del checkbox (no puede mandar undefined),
  // defense in depth: este test simula el caso de un caller que
  // manda eventRules sin los campos de apartado.
  const current = {
    personality: "Bot v1",
    rules: ["r1"],
    payment_mode: "live",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
    balance_due_note: "el día del evento",
  };
  // El server detecta que no vienen campos de apartado y setea
  // preserveReservation=true. El form provee personalidad nueva.
  const changes = makeChanges({
    personality: "Bot v2 (editado)",
    rules: ["r1"],
    paymentMode: undefined, // no se cambia
    preserveReservation: true, // el server detecta update parcial
  });
  const out = buildEventRulesFromForm({ current, changes });
  assert.equal(out.reservation_enabled, true);
  assert.equal(out.reservation_amount_mxn, 500);
  assert.equal(out.balance_amount_mxn, 500);
  assert.equal(out.balance_due_note, "el día del evento");
  assert.equal(out.payment_mode, "live");
  assert.equal(out.personality, "Bot v2 (editado)");
});
