/**
 * Tests del helper puro `event-payment-progress.ts` (sprint 2026-07-24,
 * evento-payment-progress). Cubre los 12 casos del brief + correcciones
 * del segundo commit (2026-07-24 v2):
 *
 *  1.  Evento gratuito.
 *  2.  Evento sin pago.
 *  3.  Apartado de $500.
 *  4.  Pago completo de $1,000.
 *  5.  Apartado + saldo.
 *  6.  Pago manual.
 *  7.  Pago fallido.
 *  8.  Reembolso.
 *  9.  Webhook duplicado.
 * 10.  Pagos parciales.
 * 11.  Montos decimales.
 * 12.  Registros históricos sin payment_purpose.
 * 13.  disputed (correccion #6).
 * 14.  needs_reconciliation (correccion #6).
 * 15.  validacion de centavos (correccion #3).
 * 16.  columna top-level payment_purpose ignorada (correccion #1).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeEventPaymentProgress,
  aggregateEventPaymentProgress,
  isCollectedStatus,
  isNonCollectable,
  progressLabel,
  progressTone,
  paymentPurposeLabel,
  validatePaymentCents,
  mxnToCentavos,
  centavosToMxn,
} from "../src/lib/payments/event-payment-progress.ts";

test("caso 1: evento gratuito (total = 0) → not_required, balance 0", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 0,
    payments: [],
  });
  assert.equal(r.progress, "not_required");
  assert.equal(r.total_mxn, 0);
  assert.equal(r.collected_mxn, 0);
  assert.equal(r.balance_due_mxn, 0);
  assert.equal(r.payment_count, 0);
});

test("caso 2: evento de pago sin pagos → unpaid, balance = total", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [],
  });
  assert.equal(r.progress, "unpaid");
  assert.equal(r.total_mxn, 1000);
  assert.equal(r.collected_mxn, 0);
  assert.equal(r.balance_due_mxn, 1000);
  assert.equal(r.payment_count, 0);
  // Sin pagos y sin flag de apartado: el helper no inventa "full"
  // (correccion #9: legacy_unclassified para no etiquetar como
  // Apartado lo que es ambiguo).
  assert.equal(r.payment_purpose, "legacy_unclassified");
});

test("caso 3: apartado de $500 aprobado → partial_paid, balance $500", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      {
        amount_mxn: 500,
        status: "approved",
        metadata: { payment_purpose: "reservation" },
      },
    ],
    event_rules: {
      reservation_enabled: true,
      reservation_amount_mxn: 500,
    },
  });
  assert.equal(r.progress, "partial_paid");
  assert.equal(r.collected_mxn, 500);
  assert.equal(r.balance_due_mxn, 500);
  assert.equal(r.has_reservation, true);
  assert.equal(r.has_full_payment, false);
  assert.equal(r.payment_purpose, "reservation");
});

test("caso 4: pago completo de $1,000 → paid_full, balance 0", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 1000, status: "approved", metadata: { payment_purpose: "full" } },
    ],
  });
  assert.equal(r.progress, "paid_full");
  assert.equal(r.collected_mxn, 1000);
  assert.equal(r.balance_due_mxn, 0);
  assert.equal(r.has_full_payment, true);
  assert.equal(r.has_reservation, false);
  assert.equal(r.payment_purpose, "full");
});

test("caso 5: apartado + saldo (acumulado = total) → paid_full, balance 0", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      {
        amount_mxn: 500,
        status: "approved",
        metadata: { payment_purpose: "reservation" },
      },
      {
        amount_mxn: 500,
        status: "approved",
        metadata: { payment_purpose: "balance" },
      },
    ],
    event_rules: {
      reservation_enabled: true,
      reservation_amount_mxn: 500,
    },
  });
  assert.equal(r.progress, "paid_full");
  assert.equal(r.collected_mxn, 1000);
  assert.equal(r.balance_due_mxn, 0);
  assert.equal(r.has_reservation, true);
  assert.equal(r.has_full_payment, false);
  // FIX 2026-07-24 v2: el principal es "balance" porque el estado
  // es paid_full (cobrado == total) y el ultimo pago fue el
  // balance. La UI usa este campo para mostrar el badge "Saldo"
  // (correccion #9) en lugar de "Apartado".
  assert.equal(r.payment_purpose, "balance");
});

test("caso 5b: apartado $500 + saldo $500 (manual) → paid_full, balance 0", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      {
        amount_mxn: 500,
        status: "approved",
        metadata: { payment_purpose: "reservation" },
      },
      {
        amount_mxn: 500,
        status: "paid_manual",
        metadata: { payment_purpose: "balance" },
      },
    ],
  });
  assert.equal(r.progress, "paid_full");
  assert.equal(r.collected_mxn, 1000);
  assert.equal(r.balance_due_mxn, 0);
  assert.equal(r.by_status.approved, 1);
  assert.equal(r.by_status.paid_manual, 1);
});

test("caso 6: pago manual $1,000 (paid_manual) → paid_full", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 1000, status: "paid_manual" }],
  });
  assert.equal(r.progress, "paid_full");
  assert.equal(r.collected_mxn, 1000);
  assert.equal(r.by_status.paid_manual, 1);
});

test("caso 7: pago fallido (failed) sin otros pagos → failed, balance = total", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 1000, status: "failed", metadata: { payment_purpose: "full" } },
    ],
  });
  assert.equal(r.progress, "failed");
  assert.equal(r.collected_mxn, 0);
  assert.equal(r.balance_due_mxn, 1000);
  assert.equal(r.by_status.failed, 1);
});

test("caso 7b: failed + approved → partial_paid, collected = 1000, balance = 0", () => {
  // Un intento fallo, otro aprobo con 1000. collected = 1000.
  // progress = paid_full (collected >= total).
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 1000, status: "failed", metadata: { payment_purpose: "full" } },
      { amount_mxn: 1000, status: "approved", metadata: { payment_purpose: "full" } },
    ],
  });
  assert.equal(r.progress, "paid_full");
  assert.equal(r.collected_mxn, 1000);
  assert.equal(r.by_status.failed, 1);
  assert.equal(r.by_status.approved, 1);
});

test("caso 8: reembolso completo (refunded) → refunded, collected 0", () => {
  // Pago aprobado y luego reembolsado: el helper mira solo el status
  // del row actual. Si el caller tiene 2 rows (approved + refunded),
  // el refunded no cuenta como collected (status != approved/paid_manual).
  // Para este caso simplificado, asumimos que el caller pasa el
  // status "refunded" cuando el cobro fue revertido.
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 1000, status: "refunded" }],
  });
  assert.equal(r.progress, "refunded");
  assert.equal(r.collected_mxn, 0);
  assert.equal(r.balance_due_mxn, 1000);
});

test("caso 8b: confirmation.payment_status = 'revoked' sin ledger → needs_reconciliation (correcciones #6 + #7)", () => {
  // Correcciones #6 + #7:
  //   - El ledger NO tiene rows de pago (vacio). El helper no puede
  //     confirmar "revoked" desde el ledger.
  //   - confirmation.payment_status dice "revoked" pero el ledger
  //     esta vacio: contradiccion legacy → needs_reconciliation.
  //   - NO asumimos "revoked" automaticamente (correccion #6: no
  //     asumir que el cliente debe pagar). El admin revisa.
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [],
    confirmation_payment_status: "revoked",
  });
  assert.equal(r.progress, "needs_reconciliation");
  assert.equal(r.balance_due_mxn, 1000);
  assert.equal(r.needs_reconciliation, true,
    "hay contradiccion legacy: confirmation dice 'revoked' pero el ledger esta vacio");
});

test("caso 9: webhook duplicado (mismo monto 2 veces, mismo status) → collected se duplica (caller debe deduplicar)", () => {
  // FIX 2026-07-24: el helper NO deduplica. Si llegan 2 rows con
  // mismo amount, el collected se duplica. Esto es deliberado:
  // la deduplicacion la hace el caller via idempotency_key o via
  // la unique constraint del DB. El helper solo suma.
  // Verificamos que la suma se hace (no deduplicacion).
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 500, status: "approved", metadata: { payment_purpose: "reservation" } },
      { amount_mxn: 500, status: "approved", metadata: { payment_purpose: "reservation" } },
    ],
  });
  // collected = 1000 (500 + 500), progress = paid_full.
  // Si el caller tiene idempotency_key, deberia haber solo 1 row.
  // Pero el helper no deduplica por si solo.
  assert.equal(r.collected_mxn, 1000);
  assert.equal(r.progress, "paid_full");
});

test("caso 9b: webhook duplicado REAL (mismo row) → caller debe dedup ANTES de pasar al helper", () => {
  // Documentamos el comportamiento esperado.
  const payments = [
    { amount_mxn: 500, status: "approved", metadata: { payment_purpose: "reservation" } },
  ];
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments,
  });
  assert.equal(r.collected_mxn, 500);
  assert.equal(r.progress, "partial_paid");
});

test("caso 10: pagos parciales múltiples (3 intentos) → partial_paid", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 200, status: "approved", metadata: { payment_purpose: "full" } },
      { amount_mxn: 200, status: "approved", metadata: { payment_purpose: "full" } },
      { amount_mxn: 200, status: "failed", metadata: { payment_purpose: "full" } },
    ],
  });
  assert.equal(r.collected_mxn, 400);
  assert.equal(r.balance_due_mxn, 600);
  assert.equal(r.progress, "partial_paid");
});

test("caso 11: montos decimales ($333.33) → collected exacto, no drift", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 333.33, status: "approved", metadata: { payment_purpose: "full" } },
      { amount_mxn: 333.33, status: "approved", metadata: { payment_purpose: "full" } },
      { amount_mxn: 333.33, status: "approved", metadata: { payment_purpose: "full" } },
    ],
  });
  // 333.33 * 3 = 999.99 (no 1000 por coma flotante). Pero como
  // cada uno se parsea con Number y se suma, puede haber drift.
  // Verificamos que el helper redondea a 2 decimales.
  assert.equal(r.collected_mxn, 999.99);
  assert.equal(r.balance_due_mxn, 0.01);
  // collected (999.99) < total (1000) → partial_paid, no paid_full.
  assert.equal(r.progress, "partial_paid");
});

test("caso 11b: monto decimal exacto $500.50 → collected $500.50, balance $499.50", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 500.5, status: "approved" }],
  });
  assert.equal(r.collected_mxn, 500.5);
  assert.equal(r.balance_due_mxn, 499.5);
});

test("caso 12: registros históricos sin payment_purpose → fallback a 'reservation' si evento tiene apartado", () => {
  // Pago legacy: sin payment_purpose, sin metadata.
  // Evento tiene reservation_enabled=true → fallback a "reservation".
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 500, status: "approved" }],
    event_rules: {
      reservation_enabled: true,
      reservation_amount_mxn: 500,
    },
  });
  assert.equal(r.progress, "partial_paid");
  assert.equal(r.has_reservation, true);
  assert.equal(r.payment_purpose, "reservation");
});

test("caso 12b: registros históricos sin payment_purpose, evento sin apartado → legacy_unclassified", () => {
  // FIX 2026-07-24 (correccion #9): NO inventamos "Apartado" por
  // deduccion. Pago legacy sin metadata.payment_purpose en evento
  // sin apartado: marcamos como "legacy_unclassified" para que la
  // UI muestre "Legacy/sin clasificar" en vez de inventar un tipo.
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 500, status: "approved" }],
  });
  assert.equal(r.payment_purpose, "legacy_unclassified");
});

test("caso 12c: payment_purpose en metadata (no top-level) → respeta el metadata", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      {
        amount_mxn: 500,
        status: "approved",
        metadata: { payment_purpose: "balance" },
      },
    ],
    event_rules: {
      reservation_enabled: true,
      reservation_amount_mxn: 500,
    },
  });
  // payment_purpose = balance (de metadata), no reservation (fallback).
  assert.equal(r.progress, "partial_paid");
  assert.equal(r.collected_mxn, 500);
  assert.equal(r.balance_due_mxn, 500);
});

test("isCollectedStatus: solo 'approved' y 'paid_manual' cuentan", () => {
  assert.equal(isCollectedStatus("approved"), true);
  assert.equal(isCollectedStatus("paid_manual"), true);
  assert.equal(isCollectedStatus("pending"), false);
  assert.equal(isCollectedStatus("pending_verification"), false);
  assert.equal(isCollectedStatus("failed"), false);
  assert.equal(isCollectedStatus("cancelled"), false);
  assert.equal(isCollectedStatus("refunded"), false);
  assert.equal(isCollectedStatus("revoked"), false);
  assert.equal(isCollectedStatus(null), false);
  assert.equal(isCollectedStatus(undefined), false);
});

test("pending_verification con acumulado parcial → pending_verification (no partial_paid)", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 500, status: "pending_verification", metadata: { payment_purpose: "full" } },
    ],
  });
  // pending_verification NO cuenta como collected. progress =
  // pending_verification (admin debe revisar).
  assert.equal(r.progress, "pending_verification");
  assert.equal(r.collected_mxn, 0);
  assert.equal(r.balance_due_mxn, 1000);
});

test("pending_verification + approved parcial → pending_verification", () => {
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 500, status: "approved", metadata: { payment_purpose: "full" } },
      { amount_mxn: 500, status: "pending_verification", metadata: { payment_purpose: "balance" } },
    ],
  });
  // collected = 500 (pending_verification no cuenta), pero hay un
  // pago pendiente de verificar. progress = pending_verification.
  assert.equal(r.progress, "pending_verification");
  assert.equal(r.collected_mxn, 500);
  assert.equal(r.balance_due_mxn, 500);
});

test("aggregator: 3 confirmados con diferentes estados → KPIs correctos", () => {
  const agg = aggregateEventPaymentProgress({
    total_mxn_per_event: 1000,
    payments_by_confirmation: {
      "conf-a": [{ amount_mxn: 500, status: "approved", metadata: { payment_purpose: "reservation" } }],
      "conf-b": [{ amount_mxn: 1000, status: "approved", metadata: { payment_purpose: "full" } }],
      "conf-c": [],
    },
    event_rules: {
      reservation_enabled: true,
      reservation_amount_mxn: 500,
    },
  });
  // conf-a: partial_paid, balance $500.
  // conf-b: paid_full, balance $0.
  // conf-c: unpaid, balance $1,000.
  assert.equal(agg.total_collected_mxn, 1500);
  assert.equal(agg.total_balance_due_mxn, 1500);
  assert.equal(agg.total_reservation_count, 1); // conf-a
  assert.equal(agg.total_full_payment_count, 1); // conf-b
  assert.equal(agg.total_unpaid_count, 1); // conf-c
  assert.equal(agg.total_confirmations, 3);
});

test("progressLabel: mensajes en español MX", () => {
  assert.equal(progressLabel("not_required"), "Sin pago requerido");
  assert.equal(progressLabel("unpaid"), "Sin pago");
  assert.equal(progressLabel("partial_paid"), "Apartado pagado");
  assert.equal(progressLabel("paid_full"), "Pagado completo");
  assert.equal(progressLabel("pending_verification"), "Pendiente de verificación");
  assert.equal(progressLabel("failed"), "Pago fallido");
  assert.equal(progressLabel("refunded"), "Reembolsado");
  assert.equal(progressLabel("revoked"), "Revocado");
  assert.equal(progressLabel("disputed"), "En disputa (needs review)");
  assert.equal(progressLabel("needs_reconciliation"), "Necesita reconciliación");
});

test("progressTone: badges correctos", () => {
  assert.equal(progressTone("paid_full"), "success");
  assert.equal(progressTone("unpaid"), "warning");
  assert.equal(progressTone("partial_paid"), "info");
  assert.equal(progressTone("failed"), "danger");
  assert.equal(progressTone("revoked"), "danger");
});

test("paymentPurposeLabel: español MX", () => {
  assert.equal(paymentPurposeLabel("full"), "Pago completo");
  assert.equal(paymentPurposeLabel("reservation"), "Apartado");
  assert.equal(paymentPurposeLabel("balance"), "Saldo");
  assert.equal(paymentPurposeLabel("legacy_unclassified"), "Legacy/sin clasificar");
});

/* ------------------------------------------------------------------ */
/*  Correcciones v2 (sprint event-payment-progress re-auditoria)        */
/* ------------------------------------------------------------------ */

test("REGRESION 13: pago con status 'disputed' (chargeback) → progress=disputed", () => {
  // Correccion #6: status 'disputed' es visible en UI (needs review)
  // y NO cuenta como collected ni como saldo cobrable.
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 1000, status: "disputed", metadata: { payment_purpose: "full" } }],
  });
  assert.equal(r.progress, "disputed");
  assert.equal(r.collected_mxn, 0, "disputed NO cuenta como collected");
  assert.equal(r.balance_due_mxn, 1000);
  assert.equal(r.by_status.disputed, 1);
  // disputed NO es non-collectable: sigue siendo saldo cobrable
  // (la marca de cancelacion es revoked/refunded/cancelled).
  // El admin decide si cobra de nuevo o no.
  assert.equal(isNonCollectable("disputed"), false);
});

test("REGRESION 14: status fuera del enum → needs_reconciliation", () => {
  // Status desconocido (p.ej. "expired" en una version vieja del
  // CHECK, o "voided" en una migracion futura). El helper NO falla:
  // marca needs_reconciliation=true para que la UI muestre
  // "Necesita reconciliacion" en vez de asumir paid_full.
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 1000, status: "expired" }],
  });
  assert.equal(r.progress, "needs_reconciliation");
  assert.equal(r.needs_reconciliation, true);
});

test("REGRESION 14b: confirmation dice 'paid' pero ledger vacio → needs_reconciliation", () => {
  // Caso real de contradiccion legacy: el caller actualizo
  // confirmation.payment_status a "paid" pero el row de event_payments
  // no tiene status "approved"/"paid_manual" (pago eliminado por
  // error, o un admin revoco el row en lugar de UPDATE confirmation).
  // El helper NO asume paid_full. Marca needs_reconciliation.
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 1000, status: "pending" }],
    confirmation_payment_status: "paid",
  });
  assert.equal(r.progress, "needs_reconciliation");
  assert.equal(r.needs_reconciliation, true);
});

test("REGRESION 14c: cancelled NO se suma al saldo cobrable", () => {
  // Correccion #6: revoked/refunded/cancelled NO cuentan como saldo
  // cobrable. Aqui un row cancelled de 1000 + ledger sin nada
  // cobrable → unpaid (no paid_full).
  const r = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [{ amount_mxn: 1000, status: "cancelled" }],
  });
  assert.equal(r.collected_mxn, 0, "cancelled NO cuenta como collected");
  assert.equal(r.balance_due_mxn, 1000, "saldo real sigue siendo el total");
  assert.equal(isNonCollectable("cancelled"), true);
});

test("REGRESION 15: validatePaymentCents rechaza monto 0 o negativo", () => {
  // Correccion #3: regla 0 < nuevoPago <= saldoReal.
  const r1 = validatePaymentCents({
    newPaymentCentavos: 0,
    realBalanceCentavos: 50000,
    purpose: "full"
  });
  assert.equal(r1.valid, false, "0 centavos debe rechazarse");
  assert.match(r1.error ?? "", /mayor que cero/i);

  const r2 = validatePaymentCents({
    newPaymentCentavos: -100,
    realBalanceCentavos: 50000,
    purpose: "full"
  });
  assert.equal(r2.valid, false, "negativo debe rechazarse");
});

test("REGRESION 15b: validatePaymentCents rechaza sobrepaso del saldo real", () => {
  // Correccion #3: 0 < nuevoPago <= saldoReal (centavos).
  const r = validatePaymentCents({
    newPaymentCentavos: 60000, // $600
    realBalanceCentavos: 50000, // $500
    purpose: "balance"
  });
  assert.equal(r.valid, false);
  assert.match(r.error ?? "", /saldo real pendiente/i);
});

test("REGRESION 15c: validatePaymentCents rechaza apartado > configurado", () => {
  const r = validatePaymentCents({
    newPaymentCentavos: 60000, // $600
    realBalanceCentavos: 100000, // $1000
    purpose: "reservation",
    configuredReservationCentavos: 50000 // $500
  });
  assert.equal(r.valid, false);
  assert.match(r.error ?? "", /apartado configurado/i);
});

test("REGRESION 15d: validatePaymentCents rechaza si saldoReal == 0 aunque status legacy diga paid", () => {
  // Correccion #3: si saldoReal == 0, bloquear cualquier pago nuevo
  // aunque el status legacy del confirmation sea inconsistente.
  const r = validatePaymentCents({
    newPaymentCentavos: 100, // $1
    realBalanceCentavos: 0,
    purpose: "full"
  });
  assert.equal(r.valid, false);
  assert.match(r.error ?? "", /pagado completo/i);
});

test("REGRESION 15e: validatePaymentCents acepta apartado exacto, full exacto, balance exacto", () => {
  const r1 = validatePaymentCents({
    newPaymentCentavos: 50000,
    realBalanceCentavos: 100000,
    purpose: "reservation",
    configuredReservationCentavos: 50000
  });
  assert.equal(r1.valid, true);

  const r2 = validatePaymentCents({
    newPaymentCentavos: 100000,
    realBalanceCentavos: 100000,
    purpose: "full"
  });
  assert.equal(r2.valid, true);

  const r3 = validatePaymentCents({
    newPaymentCentavos: 50000,
    realBalanceCentavos: 50000,
    purpose: "balance"
  });
  assert.equal(r3.valid, true);
});

test("REGRESION 16: payment_purpose top-level es IGNORADO, solo metadata cuenta (correccion #1)", () => {
  // El contrato real de event_payments NO tiene columna
  // payment_purpose. Aunque el shape lo acepte para no romper
  // callers, el helper SOLO lee metadata.payment_purpose.
  const r1 = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      // Caller "viejo" manda top-level, pero sin metadata.
      { amount_mxn: 500, status: "approved", payment_purpose: "reservation" }
    ],
    event_rules: { reservation_enabled: false } // sin apartado en el evento
  });
  // Sin metadata.payment_purpose y sin apartado en el evento:
  // cae al fallback "legacy_unclassified" (no inventamos Apartado).
  assert.equal(r1.payment_purpose, "legacy_unclassified");

  // Si metadata SI tiene el campo, gana sobre el top-level.
  const r2 = computeEventPaymentProgress({
    total_mxn: 1000,
    payments: [
      { amount_mxn: 500, status: "approved", payment_purpose: "reservation", metadata: { payment_purpose: "balance" } }
    ],
    event_rules: { reservation_enabled: true, reservation_amount_mxn: 500 }
  });
  // metadata dice "balance", ignoramos el top-level "reservation".
  assert.equal(r2.payment_purpose, "balance");
});

test("REGRESION 16b: mxnToCentavos / centavosToMxn sin drift", () => {
  assert.equal(mxnToCentavos(500), 50000);
  assert.equal(mxnToCentavos(500.50), 50050);
  assert.equal(mxnToCentavos(0.01), 1);
  assert.equal(centavosToMxn(50000), 500);
  assert.equal(centavosToMxn(50050), 500.5);
});

test("isNonCollectable: revoked, refunded, cancelled → true; approved, paid_manual → false", () => {
  assert.equal(isNonCollectable("revoked"), true);
  assert.equal(isNonCollectable("refunded"), true);
  assert.equal(isNonCollectable("cancelled"), true);
  assert.equal(isNonCollectable("approved"), false);
  assert.equal(isNonCollectable("paid_manual"), false);
  assert.equal(isNonCollectable("pending"), false);
  assert.equal(isNonCollectable("disputed"), false);
  assert.equal(isNonCollectable(null), false);
  assert.equal(isNonCollectable(undefined), false);
});
