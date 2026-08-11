import { test } from "node:test";
import assert from "node:assert/strict";

test("event registration state: only verified payment confirms", async () => {
  const {
    isVerifiedEventPayment,
    isEventRegistrationConfirmed,
    registrationStatusForPayment,
  } = await import("../src/lib/events/event-registration-state.ts");

  assert.equal(isVerifiedEventPayment("pending"), false);
  assert.equal(isVerifiedEventPayment("pending_verification"), false);
  assert.equal(isVerifiedEventPayment("partial"), true);
  assert.equal(isVerifiedEventPayment("paid"), true);
  assert.equal(isEventRegistrationConfirmed({
    registration_status: "payment_pending",
    payment_status: "paid",
  }), false);
  assert.equal(isEventRegistrationConfirmed({ payment_status: "paid" }), true);
  assert.equal(registrationStatusForPayment("partial"), "confirmed");
  assert.equal(registrationStatusForPayment("pending"), "payment_pending");
});

test("payment follow-up copy never promises confirmation before payment", async () => {
  const { buildPaymentFollowupBody, PAYMENT_NUDGE_4H, PAYMENT_LAST_DAY } =
    await import("../src/lib/cron/event-payment-followups.ts");
  const event = {
    id: "event-synthetic",
    slug: "demo",
    title: "Masterclass de ventas",
    starts_at: "2026-08-20T18:00:00.000Z",
    status: "published",
    price_mxn: 500,
    event_rules: { reservation_enabled: true, reservation_amount_mxn: 100 },
  };
  const body = buildPaymentFollowupBody({
    kind: PAYMENT_NUDGE_4H,
    attendeeName: "Ana",
    event,
    checkoutUrl: "https://qlick.digital/pagar/evento/demo?confirmation=synthetic",
  });
  assert.match(body, /apartado es de \$100/);
  assert.match(body, /https:\/\/qlick\.digital/);
  assert.doesNotMatch(body, /confirmad[oa]|registrad[oa]|lugar apartado/i);

  const lastDay = buildPaymentFollowupBody({
    kind: PAYMENT_LAST_DAY,
    attendeeName: "Ana",
    event,
    checkoutUrl: "https://qlick.digital/pagar/evento/demo?confirmation=synthetic",
  });
  assert.match(lastDay, /es mañana/i);
  assert.match(lastDay, /Tu QR se envía al verificar el pago/i);
});

test("payment follow-up job is safely off by default in demo", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalMode = process.env.EVENT_PAYMENT_FOLLOWUP_MODE;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.EVENT_PAYMENT_FOLLOWUP_MODE;
  try {
    const { runEventPaymentFollowupsJob } = await import(
      "../src/lib/cron/event-payment-followups.ts"
    );
    const result = await runEventPaymentFollowupsJob(new Date("2026-08-10T16:00:00Z"));
    assert.equal(result.ok, true);
    assert.equal(result.demo, true);
    assert.equal(result.sent, 0);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    if (originalMode === undefined) delete process.env.EVENT_PAYMENT_FOLLOWUP_MODE;
    else process.env.EVENT_PAYMENT_FOLLOWUP_MODE = originalMode;
  }
});
