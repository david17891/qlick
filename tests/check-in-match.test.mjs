/**
 * Unit tests para resolveConfirmationIdForCheckIn.
 *
 * Cubre el matching automatico entre check-in (QR scan o manual) y la
 * event_confirmations previa del mismo telefono. Si la persona se
 * confirmo antes y luego asiste, el attendee queda linkeado a esa
 * confirmation en vez de ser tratado como walk-in.
 *
 * FIX 2026-07-03 (sesion David "no se matcheo con el confirmado").
 *
 * Patron: se inyecta un mock de SupabaseClient con `select().eq().eq()
 * .maybeSingle()` chainable. No toca la DB real.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfirmationIdForCheckIn } from "../src/lib/events/check-in-match.ts";

/**
 * Mock minimalista del cliente de Supabase que implementa solo el
 * chain `from().select().eq().eq().maybeSingle()` usado por el helper.
 * Devuelve la `response` configurada cuando se llame a `.maybeSingle()`.
 */
function fakeSupabase(response) {
  const result = response;
  const terminator = {
    maybeSingle: async () => result,
  };
  const eq2 = {
    eq: () => terminator,
    maybeSingle: async () => result,
  };
  const eq1 = {
    eq: () => eq2,
    maybeSingle: async () => result,
  };
  const select = {
    eq: () => eq1,
    maybeSingle: async () => result,
  };
  const from = {
    select: () => select,
    eq: () => eq1,
    maybeSingle: async () => result,
  };
  return { from: () => from };
}

const FAKE_EVENT_ID = "11111111-2222-3333-4444-555555555555";
const FAKE_PHONE = "+5215511112222";
const FAKE_CONFIRMATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// ─────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────

test("resolveConfirmationIdForCheckIn: match encontrado devuelve el id", async () => {
  const supabase = fakeSupabase({
    data: { id: FAKE_CONFIRMATION_ID },
    error: null,
  });
  const result = await resolveConfirmationIdForCheckIn(
    supabase,
    FAKE_EVENT_ID,
    FAKE_PHONE,
  );
  assert.equal(result, FAKE_CONFIRMATION_ID);
});

// ─────────────────────────────────────────────────────────────
// Casos sin match (no hay confirmation previa -> walk-in legitimo)
// ─────────────────────────────────────────────────────────────

test("resolveConfirmationIdForCheckIn: sin match devuelve null", async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  const result = await resolveConfirmationIdForCheckIn(
    supabase,
    FAKE_EVENT_ID,
    FAKE_PHONE,
  );
  assert.equal(result, null);
});

// ─────────────────────────────────────────────────────────────
// Inputs invalidos (defensa)
// ─────────────────────────────────────────────────────────────

test("resolveConfirmationIdForCheckIn: phone null devuelve null sin tocar DB", async () => {
  // aunque el supabase estuviera roto, no debe llamarlo.
  let called = false;
  const supabase = {
    from: () => {
      called = true;
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    },
  };
  const result = await resolveConfirmationIdForCheckIn(supabase, FAKE_EVENT_ID, null);
  assert.equal(result, null);
  assert.equal(called, false, "no debe hacer query si phone es null");
});

test("resolveConfirmationIdForCheckIn: phone undefined devuelve null", async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  const result = await resolveConfirmationIdForCheckIn(
    supabase,
    FAKE_EVENT_ID,
    undefined,
  );
  assert.equal(result, null);
});

test("resolveConfirmationIdForCheckIn: eventId vacio devuelve null", async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  const result = await resolveConfirmationIdForCheckIn(supabase, "", FAKE_PHONE);
  assert.equal(result, null);
});

// ─────────────────────────────────────────────────────────────
// Failure modes (fail-safe: no bloquear el check-in)
// ─────────────────────────────────────────────────────────────

test("resolveConfirmationIdForCheckIn: error de DB devuelve null (no bloquea check-in)", async () => {
  const supabase = fakeSupabase({
    data: null,
    error: { code: "PGRST116", message: "DB timeout" },
  });
  const result = await resolveConfirmationIdForCheckIn(
    supabase,
    FAKE_EVENT_ID,
    FAKE_PHONE,
  );
  assert.equal(result, null, "fail-safe: un error no debe bloquear el check-in");
});

test("resolveConfirmationIdForCheckIn: excepcion del cliente devuelve null", async () => {
  const supabase = {
    from: () => {
      throw new Error("Network down");
    },
  };
  const result = await resolveConfirmationIdForCheckIn(
    supabase,
    FAKE_EVENT_ID,
    FAKE_PHONE,
  );
  assert.equal(result, null);
});
