/**
 * REGRESION 2026-07-24 (sprint event-payment-progress).
 *
 * Tests de validacion de `registerManualPayment` que cubren las nuevas
 * reglas del sprint:
 *
 *   1. Apartado valido ($500 <= $500 configurado en evento).
 *   2. Apartado invalido (>$500) es rechazado.
 *   3. Saldo exacto: acumulado + nuevo = total → isFullyPaid.
 *   4. Saldo sobrepago: nuevo > saldo real → rechazado.
 *   5. Pago completo sobrepago: nuevo > total → rechazado.
 *   6. Promover `event_confirmations.payment_status` a "paid" cuando
 *      el acumulado llega al total.
 *   7. Mantener `payment_status` en "pending" cuando el acumulado es
 *      < total (apartado, no full).
 *
 * Mock del cliente admin de Supabase via `node:test` mocks. Patron
 * equivalente a `whatsapp-bot-implicit-capture-reservation.test.mjs`
 * (chainable proxy con `from` → `select`/`insert`/`update` → `eq` →
 * `maybeSingle`/`single`).
 *
 * Privacy: 0 PII. IDs y emails sinteticos. `mavis+...@qlick.app`.
 *
 * NO hace cargos live. NO toca Stripe. NO toca CANACO. NO toca el
 * evento real.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

// @ts-check

/* ────────────────────────────────────────────────────────────
 * Fakes: evento + confirmation + pagos previos
 * ──────────────────────────────────────────────────────────── */

const EVENT_ID = "00000000-0000-0000-0000-00000000CAFE";
const CONFIRMATION_ID = "00000000-0000-0000-0000-00000000BEEF";
const ADMIN_EMAIL = "mavis+admin-test@qlick.app";

/** Evento CANACO-like: total $1,000, apartado $500, saldo $500. */
const FAKE_EVENT_RESERVATION = {
  id: EVENT_ID,
  slug: "evento-test-apartado",
  short_code: "TST1",
  title: "Evento Test Apartado",
  price_mxn: 1000,
  event_rules: {
    personality: "Bot amable",
    rules: ["Usa tuteo."],
    payment_mode: "test",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
    balance_due_note: "el dia del evento"
  }
};

/** Confirmation del confirmado. */
const FAKE_CONFIRMATION = {
  id: CONFIRMATION_ID,
  event_id: EVENT_ID,
  name: "Test User",
  email: "mavis+manual-test@qlick.app",
  phone_normalized: "+5215511112222",
  source: "manual_admin",
  payment_status: "pending"
};

/**
 * Tabla controlada de pagos previos del CONFIRMATION_ID. Cada test
 * setea el contenido antes de invocar `registerManualPayment`.
 */
let prevPaymentsTable = [];

/** Captura del payload del insert en event_payments. */
let lastPaymentInsert = null;
/** Captura del update al confirmation. */
let lastConfirmationUpdate = null;

/* ────────────────────────────────────────────────────────────
 * Mock del Supabase admin client (chainable proxy)
 * ──────────────────────────────────────────────────────────── */

/**
 * Crea un chainable que soporta toda la gramatica del cliente
 * Supabase JS: `.select().eq().eq().maybeSingle()`, `.insert().select().single()`,
 * `.update().eq()`, etc.
 *
 * El `state` lleva cuenta de que "tabla" estamos consultando y los
 * filtros aplicados (.eq). El "dataSource" dicta que data devolver en
 * `.maybeSingle()` / `.single()` / `.then`.
 */
function makeChainable(table) {
  const state = {
    table,
    filters: [],
    isInsert: false,
    isUpdate: false,
    isUpsert: false,
    insertPayload: null,
    updatePayload: null,
    selectColumns: null
  };

  function maybeSingleData() {
    if (state.table === "event_confirmations") {
      return FAKE_CONFIRMATION;
    }
    if (state.table === "events") {
      return FAKE_EVENT_RESERVATION;
    }
    if (state.table === "event_payments") {
      // Filtrar prevPaymentsTable por confirmation_id si hay eq.
      const confFilter = state.filters.find((f) => f.col === "confirmation_id");
      if (confFilter) {
        return prevPaymentsTable;
      }
      return prevPaymentsTable;
    }
    return null;
  }

  function singleData() {
    if (state.isInsert && state.table === "event_payments") {
      return { id: "fake-payment-id" };
    }
    if (state.table === "event_confirmations") return FAKE_CONFIRMATION;
    if (state.table === "events") return FAKE_EVENT_RESERVATION;
    return { id: "fake-id" };
  }

  const chainable = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "from") return () => chainable; // no-op (already on from)
      if (prop === "select") {
        return (cols) => {
          state.selectColumns = cols;
          return chainable;
        };
      }
      if (prop === "eq") {
        return (col, val) => {
          state.filters.push({ col, val });
          return chainable;
        };
      }
      if (prop === "in") {
        return () => chainable;
      }
      if (prop === "maybeSingle") {
        return async () => {
          const data = maybeSingleData();
          return { data, error: null };
        };
      }
      if (prop === "single") {
        return async () => {
          const data = singleData();
          return { data, error: null };
        };
      }
      if (prop === "insert") {
        return (payload) => {
          state.isInsert = true;
          state.insertPayload = payload;
          if (state.table === "event_payments") {
            lastPaymentInsert = payload;
          }
          return chainable;
        };
      }
      if (prop === "upsert") {
        return (payload) => {
          state.isUpsert = true;
          return chainable;
        };
      }
      if (prop === "update") {
        return (payload) => {
          state.isUpdate = true;
          state.updatePayload = payload;
          if (state.table === "event_confirmations") {
            lastConfirmationUpdate = payload;
          }
          return chainable;
        };
      }
      if (prop === "rpc") {
        // get_user_id_by_email: simulamos que no hay user, asi no
        // creamos event_access (path del guest checkout manual).
        return async () => ({ data: null, error: null });
      }
      if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
        return () => "chainable";
      }
      // Por defecto, devolver un Promise que resuelve como si fuera
      // un .then() (esto es lo que Supabase hace para promesas auto).
      if (prop === "then") {
        let data = null;
        if (state.table === "event_payments" && state.isInsert) {
          data = [{ id: "fake-payment-id" }];
        } else if (state.table === "event_payments") {
          data = prevPaymentsTable;
        }
        return (resolve) => resolve({ data, error: null });
      }
      return chainable;
    },
    apply() {
      return chainable;
    }
  });

  return chainable;
}

function makeMockSupabaseClient() {
  return {
    from: (table) => makeChainable(table),
    // rpc: get_user_id_by_email. Devolvemos null (guest manual,
    // sin user de auth, sin crear event_access).
    rpc: async (_name, _args) => ({ data: null, error: null })
  };
}

before(() => {
  mock.module("../src/lib/supabase/admin", {
    namedExports: {
      createSupabaseAdminClient: () => makeMockSupabaseClient()
    }
  });
  mock.module("../src/lib/supabase/health", {
    namedExports: {
      checkSupabaseConfig: () => ({ configured: true, mode: "configured" })
    }
  });
  // El logAdminAction se llama desde registerManualPayment. Mockeamos
  // para que no falle.
  mock.module("../src/lib/crm/audit-server", {
    namedExports: {
      logAdminAction: async () => ({ ok: true })
    }
  });
  // grantEventAccess: como get_user_id_by_email devuelve null, no
  // deberia invocarse, pero por las dudas mockeamos a no-op.
  mock.module("../src/lib/lms/event-entitlements", {
    namedExports: {
      grantEventAccess: async () => ({ id: "fake-access-id" })
    }
  });
  // sendEmail: no-op best-effort. Si el email no se manda, no rompe.
  mock.module("../src/lib/email/brevo-client", {
    namedExports: {
      sendEmail: async () => ({ ok: true })
    }
  });
  // Email template: no-op (no se usa en estos tests si email==null).
  mock.module("../src/lib/email/templates/payment-confirmed", {
    namedExports: {
      renderPaymentConfirmedEmail: () => ({
        subject: "fake",
        html: "<p>fake</p>",
        text: "fake"
      })
    }
  });
});

/**
 * Helper: resetea los mocks y los registros previos.
 */
function resetMocks() {
  prevPaymentsTable = [];
  lastPaymentInsert = null;
  lastConfirmationUpdate = null;
  // STRIPE_SECRET_KEY no se usa porque method=cash en estos tests.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.SUPABASE_SECRET_KEY ??= "eyJhbGciOiJIUzI1NiJ9.fake.fake";
}

/* ────────────────────────────────────────────────────────────
 * Tests
 * ──────────────────────────────────────────────────────────── */

test("apartado valido ($500) sin pagos previos → ok, payment_purpose=reservation, payment_status=pending", async () => {
  resetMocks();
  const { registerManualPayment } = await import(
    "../src/lib/payments/manual-payment.ts"
  );

  const result = await registerManualPayment({
    eventId: EVENT_ID,
    confirmationId: CONFIRMATION_ID,
    method: "cash",
    amountMXN: 500,
    paymentPurpose: "reservation",
    actorEmail: ADMIN_EMAIL
  });

  assert.equal(result.ok, true, `esperaba ok=true, got: ${JSON.stringify(result)}`);
  // payment_purpose se persiste en metadata (no columna top-level).
  assert.equal(
    lastPaymentInsert?.metadata?.payment_purpose,
    "reservation",
    "el INSERT en event_payments debe persistir metadata.payment_purpose=reservation"
  );
  assert.equal(
    lastPaymentInsert?.amount_mxn,
    500,
    "el INSERT en event_payments debe persistir amount_mxn=500 (no centavos)"
  );
  // payment_status del confirmation debe seguir "pending" porque
  // acumulado $500 < total $1,000.
  assert.equal(
    lastConfirmationUpdate?.payment_status,
    "pending",
    `confirmation.payment_status debe quedar en 'pending' (acumulado < total). Got: ${lastConfirmationUpdate?.payment_status}`
  );
});

test("apartado invalido (>$500) → rechaza con error explicito, sin INSERT", async () => {
  resetMocks();
  const { registerManualPayment } = await import(
    "../src/lib/payments/manual-payment.ts"
  );

  const result = await registerManualPayment({
    eventId: EVENT_ID,
    confirmationId: CONFIRMATION_ID,
    method: "cash",
    amountMXN: 600,
    paymentPurpose: "reservation",
    actorEmail: ADMIN_EMAIL
  });

  assert.equal(result.ok, false, "esperaba ok=false por sobrepaso de apartado");
  assert.ok(
    /apartado configurado/i.test(result.error ?? ""),
    `error debe mencionar el apartado configurado. Got: ${result.error}`
  );
  assert.equal(
    lastPaymentInsert,
    null,
    "NO debe haber INSERT en event_payments cuando la validacion rechaza"
  );
});

test("saldo exacto ($500 con prev $500) → acumulado = total, payment_status=paid_manual", async () => {
  resetMocks();
  // Prev payments: 1 row de $500 reservation ya cobrado.
  prevPaymentsTable = [
    {
      id: "prev-1",
      amount_mxn: 500,
      status: "paid_manual",
      payment_purpose: "reservation",
      metadata: null
    }
  ];
  const { registerManualPayment } = await import(
    "../src/lib/payments/manual-payment.ts"
  );

  const result = await registerManualPayment({
    eventId: EVENT_ID,
    confirmationId: CONFIRMATION_ID,
    method: "cash",
    amountMXN: 500,
    paymentPurpose: "balance",
    actorEmail: ADMIN_EMAIL
  });

  assert.equal(result.ok, true, `esperaba ok=true, got: ${JSON.stringify(result)}`);
  assert.equal(
    lastPaymentInsert?.metadata?.payment_purpose,
    "balance",
    "el INSERT debe persistir metadata.payment_purpose=balance"
  );
  // Acumulado $500 + $500 = $1,000 = total → isFullyPaid → "paid_manual"
  // (porque method=cash → finalConfirmationStatus="paid_manual").
  assert.equal(
    lastConfirmationUpdate?.payment_status,
    "paid_manual",
    `confirmation.payment_status debe ser 'paid_manual' (cash + fully paid). Got: ${lastConfirmationUpdate?.payment_status}`
  );
});

test("saldo sobrepago ($600 con prev $500, total $1,000) → rechaza, sin INSERT", async () => {
  resetMocks();
  prevPaymentsTable = [
    {
      id: "prev-1",
      amount_mxn: 500,
      status: "paid_manual",
      payment_purpose: "reservation",
      metadata: null
    }
  ];
  const { registerManualPayment } = await import(
    "../src/lib/payments/manual-payment.ts"
  );

  const result = await registerManualPayment({
    eventId: EVENT_ID,
    confirmationId: CONFIRMATION_ID,
    method: "cash",
    amountMXN: 600,
    paymentPurpose: "balance",
    actorEmail: ADMIN_EMAIL
  });

  assert.equal(result.ok, false, "saldo sobrepago debe rechazarse");
  assert.ok(
    /saldo real pendiente/i.test(result.error ?? ""),
    `error debe mencionar saldo real pendiente. Got: ${result.error}`
  );
  assert.equal(
    lastPaymentInsert,
    null,
    "NO debe haber INSERT cuando se rechaza el sobrepago"
  );
});

test("pago completo sobrepago ($1,500 con total $1,000) → rechaza, sin INSERT", async () => {
  resetMocks();
  const { registerManualPayment } = await import(
    "../src/lib/payments/manual-payment.ts"
  );

  const result = await registerManualPayment({
    eventId: EVENT_ID,
    confirmationId: CONFIRMATION_ID,
    method: "cash",
    amountMXN: 1500,
    paymentPurpose: "full",
    actorEmail: ADMIN_EMAIL
  });

  assert.equal(result.ok, false, "pago completo > total debe rechazarse");
  assert.ok(
    /pago completo debe ser exactamente/i.test(result.error ?? "") ||
      /excede el apartado configurado/i.test(result.error ?? "") ||
      /saldo real/i.test(result.error ?? ""),
    `error debe mencionar validacion de pago. Got: ${result.error}`
  );
  assert.equal(
    lastPaymentInsert,
    null,
    "NO debe haber INSERT cuando se rechaza el sobrepago"
  );
});

test("promover a paid cuando acumulado = total: full de $1,000 sin prev → paid_manual", async () => {
  resetMocks();
  const { registerManualPayment } = await import(
    "../src/lib/payments/manual-payment.ts"
  );

  const result = await registerManualPayment({
    eventId: EVENT_ID,
    confirmationId: CONFIRMATION_ID,
    method: "cash",
    amountMXN: 1000,
    paymentPurpose: "full",
    actorEmail: ADMIN_EMAIL
  });

  assert.equal(result.ok, true, `esperaba ok=true, got: ${JSON.stringify(result)}`);
  assert.equal(
    lastPaymentInsert?.metadata?.payment_purpose,
    "full",
    "el INSERT debe persistir metadata.payment_purpose=full"
  );
  // Sin prev + full $1,000 = total → isFullyPaid → "paid_manual" (cash)
  assert.equal(
    lastConfirmationUpdate?.payment_status,
    "paid_manual",
    `confirmation.payment_status debe ser 'paid_manual' cuando acumulado=total. Got: ${lastConfirmationUpdate?.payment_status}`
  );
});

test("mantener pending cuando acumulado < total: apartado de $500 → pending", async () => {
  resetMocks();
  const { registerManualPayment } = await import(
    "../src/lib/payments/manual-payment.ts"
  );

  const result = await registerManualPayment({
    eventId: EVENT_ID,
    confirmationId: CONFIRMATION_ID,
    method: "cash",
    amountMXN: 500,
    paymentPurpose: "reservation",
    actorEmail: ADMIN_EMAIL
  });

  assert.equal(result.ok, true, `esperaba ok=true, got: ${JSON.stringify(result)}`);
  // Acumulado $500 < total $1,000 → "pending" (NO se promueve a paid).
  assert.equal(
    lastConfirmationUpdate?.payment_status,
    "pending",
    `confirmation.payment_status debe quedar en 'pending' (acumulado < total). Got: ${lastConfirmationUpdate?.payment_status}`
  );
  assert.equal(
    lastPaymentInsert?.metadata?.payment_purpose,
    "reservation",
    "el INSERT debe persistir metadata.payment_purpose=reservation"
  );
});
