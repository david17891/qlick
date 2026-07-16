/**
 * REGRESION 2026-07-16 (sprint "Olvidar mi numero", sesion David "el
 * boton olvidar no limpia bien la memoria del bot, no me registro
 * esta vez").
 *
 * El endpoint `/api/admin/bot/reset-lead` (boton "Olvidar mi numero"
 * en admin/BotSimulatorTab) solo limpiaba:
 *   - wizard state del ultimo outbound
 *   - lead_profile.summary
 *
 * NO limpiaba los registros de eventos que el bot usa para detectar
 * "ya estas registrado":
 *   - leads.name / email (el bot decia "ya te tengo registrado David
 *     Martinez" aunque querias empezar de cero).
 *   - event_qr_tokens (el generateQrToken reutilizaba el QR previo).
 *   - event_confirmations (el bot disparaba "ya estas registrado" en
 *     interactive_event_inscribir).
 *   - event_payments (vinculadas a las confirmations).
 *   - event_access (FK a leads).
 *
 * El fix extiende `resetLeadContext` (en `src/lib/admin/reset-lead.ts`)
 * para limpiar TODO. Este test verifica que la funcion llama a las
 * tablas correctas en el orden correcto (payments ANTES de
 * confirmations por la FK) y devuelve el conteo.
 *
 * Privacy: 0 PII. Email y telefono sinteticos.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

// @ts-check

/* ────────────────────────────────────────────────────────────
 * Mock state: el mock de Supabase registra las llamadas a
 * `from(table)` y los `update/delete` para que el test verifique
 * que el codigo llama a las tablas correctas.
 * ──────────────────────────────────────────────────────────── */

const calls = {
  leadsUpdate: null,
  leadsUpdateHadNameOrEmail: false,
  outboundsUpdate: 0,
  profilesUpdate: 0,
  qrTokensDeleteCalled: false,
  confirmationsSelect: 0,
  confirmationsDeleteCalled: false,
  paymentsDeleteCalled: false,
  accessDeleteCalled: false,
  attendeesDelete: 0,
  // Orden de queries EJECUTADAS (.then()), no de metodos invocados
  // (.delete() es lazy, se invoca cuando se accede a la prop).
  executedQueries: [],
  paymentsDeleteBeforeConfirmations: true
};

const FAKE_LEAD = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "David Martinez",
  email: "david17891@gmail.com",
  phone_normalized: "+521234567890",
  status: "registered",
  whatsapp_status: "active"
};

const FAKE_CONFIRMATION_IDS = [
  "00000000-0000-0000-0000-0000000000a1",
  "00000000-0000-0000-0000-0000000000a2"
];

const FAKE_PREV_OUTBOUND = {
  id: "00000000-0000-0000-0000-000000000050",
  metadata: { awaiting_field: "name" }
};

const FAKE_PROFILE = {
  lead_id: FAKE_LEAD.id,
  summary: "Qlick test summary"
};

function makeChainable(table, parentWasDelete = false) {
  // `wasDelete` se setea cuando se accede a `.delete` en el chain.
  // Se lee en `.then()` para distinguir DELETE de SELECT en tablas
  // que tienen ambos (event_confirmations, event_payments). El
  // approach de "kind" no funciona porque el chain
  // `.delete().eq().select("id")` sobrescribe el kind a "select".
  let wasDelete = parentWasDelete;
  const make = () => makeChainable(table, wasDelete);
  const handler = {
    get(_t, prop) {
      if (prop === "maybeSingle") {
        return async () => {
          if (table === "leads") return { data: FAKE_LEAD, error: null };
          return { data: null, error: null };
        };
      }
      if (prop === "select") return (..._a) => make();
      if (prop === "eq") return (..._a) => make();
      if (prop === "in") return (..._a) => make();
      if (prop === "order") return (..._a) => make();
      if (prop === "limit") return (..._a) => make();
      if (prop === "update") {
        return (...args) => {
          if (table === "leads") {
            calls.leadsUpdate = args[0] ?? null;
            calls.leadsUpdateHadNameOrEmail = Boolean(
              args[0]?.name === null && args[0]?.email === null
            );
          } else if (table === "lead_whatsapp_conversations") {
            calls.outboundsUpdate += 1;
          } else if (table === "lead_profile") {
            calls.profilesUpdate += 1;
          }
          return make();
        };
      }
      if (prop === "delete") {
        wasDelete = true;
        if (table === "event_qr_tokens") calls.qrTokensDeleteCalled = true;
        if (table === "event_access") calls.accessDeleteCalled = true;
        if (table === "event_attendees") calls.attendeesDelete += 1;
        return (..._a) => make();
      }
      if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
        return () => "chainable";
      }
      if (prop === "then") {
        // El .then() se invoca cuando se hace `await`. Aca sabemos
        // si fue un DELETE (wasDelete) o un SELECT, y podemos
        // registrar el orden real de las queries ejecutadas.
        if (wasDelete && table === "event_payments") {
          calls.paymentsDeleteCalled = true;
          calls.executedQueries.push("event_payments");
        } else if (wasDelete && table === "event_confirmations") {
          if (!calls.paymentsDeleteCalled && calls.confirmationsDeleteCalled) {
            calls.paymentsDeleteBeforeConfirmations = false;
          }
          calls.confirmationsDeleteCalled = true;
          calls.executedQueries.push("event_confirmations");
        }
        return Promise.resolve().then.bind(
          Promise.resolve(
            (() => {
              if (table === "leads") return { data: FAKE_LEAD, error: null };
              if (table === "lead_whatsapp_conversations")
                return { data: [FAKE_PREV_OUTBOUND], error: null };
              if (table === "lead_profile")
                return { data: [FAKE_PROFILE], error: null };
              if (table === "event_confirmations") {
                calls.confirmationsSelect += 1;
                return {
                  data: FAKE_CONFIRMATION_IDS.map((id) => ({ id })),
                  error: null,
                };
              }
              return { data: null, error: null };
            })()
          )
        );
      }
      return make();
    },
    apply() {
      return make();
    }
  };
  return new Proxy(function () {}, handler);
}

function makeMockSupabaseClient() {
  return {
    from: (table) => makeChainable(table)
  };
}

before(() => {
  mock.module("../src/lib/supabase/admin", {
    namedExports: {
      createSupabaseAdminClient: () => makeMockSupabaseClient()
    }
  });
});

/* ────────────────────────────────────────────────────────────
 * Tests
 * ──────────────────────────────────────────────────────────── */

test("REGRESION resetLeadContext: limpia leads.name/email/status/whatsapp_status", async () => {
  const { resetLeadContext } = await import(
    "../src/lib/admin/reset-lead.ts"
  );
  const sb = makeMockSupabaseClient();

  const result = await resetLeadContext(sb, "+521234567890", {
    adminEmail: "admin@example.com",
  });

  assert.equal(result.ok, true);
  // El lead tenia name="David Martinez" y email="david17891@gmail.com",
  // por lo que el codigo DEBE haber limpiado ambos a null.
  assert.equal(
    calls.leadsUpdateHadNameOrEmail,
    true,
    `BUG REGRESION: resetLeadContext no limpio leads.name/email. update was: ${JSON.stringify(calls.leadsUpdate)}`
  );
  assert.equal(calls.leadsUpdate?.status, "new");
  assert.equal(calls.leadsUpdate?.whatsapp_status, "pending");
});

test("REGRESION resetLeadContext: borra event_qr_tokens, event_payments, event_access, event_confirmations", async () => {
  const { resetLeadContext } = await import(
    "../src/lib/admin/reset-lead.ts"
  );
  const sb = makeMockSupabaseClient();

  await resetLeadContext(sb, "+521234567890", { adminEmail: "admin@example.com" });

  assert.equal(
    calls.qrTokensDeleteCalled,
    true,
    `BUG REGRESION: resetLeadContext no borro event_qr_tokens`
  );
  assert.equal(
    calls.paymentsDeleteCalled,
    true,
    `BUG REGRESION: resetLeadContext no borro event_payments`
  );
  assert.equal(
    calls.accessDeleteCalled,
    true,
    `BUG REGRESION: resetLeadContext no borro event_access`
  );
  assert.equal(
    calls.confirmationsDeleteCalled,
    true,
    `BUG REGRESION: resetLeadContext no borro event_confirmations`
  );
});

test("REGRESION resetLeadContext: payments se borran ANTES de confirmations (FK)", async () => {
  const { resetLeadContext } = await import(
    "../src/lib/admin/reset-lead.ts"
  );
  const sb = makeMockSupabaseClient();

  await resetLeadContext(sb, "+521234567890", { adminEmail: "admin@example.com" });

  assert.equal(
    calls.paymentsDeleteBeforeConfirmations,
    true,
    `BUG REGRESION: event_payments se borraron DESPUES de event_confirmations, rompiendo la FK`
  );
});

test("REGRESION resetLeadContext: busca confirmations por phone Y email (>=2 SELECTs)", async () => {
  const { resetLeadContext } = await import(
    "../src/lib/admin/reset-lead.ts"
  );
  const sb = makeMockSupabaseClient();

  await resetLeadContext(sb, "+521234567890", { adminEmail: "admin@example.com" });

  // El codigo hace 2 SELECT a event_confirmations: uno por phone,
  // otro por email (porque el lead tiene email). Sin la segunda
  // busqueda, los payments de las confirmaciones por email quedan
  // huerfanos y rompen la FK.
  assert.ok(
    calls.confirmationsSelect >= 2,
    `BUG REGRESION: resetLeadContext no busco confirmations por email (solo hizo ${calls.confirmationsSelect} SELECTs, deberian ser >=2: uno por phone, uno por email).`
  );
});

test("REGRESION resetLeadContext: devuelve cleared con todos los counts", async () => {
  const { resetLeadContext } = await import(
    "../src/lib/admin/reset-lead.ts"
  );
  const sb = makeMockSupabaseClient();

  const result = await resetLeadContext(sb, "+521234567890", {
    adminEmail: "admin@example.com",
  });

  assert.equal(result.ok, true);
  const cleared = result.cleared ?? {};
  assert.ok("qrTokens" in cleared, `cleared.qrTokens faltante: ${JSON.stringify(cleared)}`);
  assert.ok("confirmations" in cleared, `cleared.confirmations faltante: ${JSON.stringify(cleared)}`);
  assert.ok("payments" in cleared, `cleared.payments faltante: ${JSON.stringify(cleared)}`);
  assert.ok("access" in cleared, `cleared.access faltante: ${JSON.stringify(cleared)}`);
  assert.ok("outbounds" in cleared);
  assert.ok("profiles" in cleared);
  assert.ok("attendees" in cleared);
});

test("REGRESION resetLeadContext: NO borra event_attendees sin alsoDeleteAttendees=true", async () => {
  const { resetLeadContext } = await import(
    "../src/lib/admin/reset-lead.ts"
  );
  const sb = makeMockSupabaseClient();

  await resetLeadContext(sb, "+521234567890", { adminEmail: "admin@example.com" });

  assert.equal(
    calls.attendeesDelete,
    0,
    `BUG: resetLeadContext borro event_attendees sin alsoDeleteAttendees=true`
  );
});
