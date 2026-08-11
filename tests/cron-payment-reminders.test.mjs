import { test } from "node:test";
import assert from "node:assert/strict";

test("buildPaymentReminderBody: CTA directo con link de pago", async () => {
  const { buildPaymentReminderBody } = await import(
    "../src/lib/cron/payment-reminders.ts"
  );
  const body = buildPaymentReminderBody({
    attendeeName: "Ana",
    eventTitle: "Masterclass de ventas",
    checkoutUrl: "https://qlick.digital/pagar/evento/demo?confirmation=synthetic",
  });

  assert.match(body, /Hola Ana/);
  assert.match(body, /Recibimos tus datos/i);
  assert.match(body, /para confirmar tu asistencia/i);
  assert.doesNotMatch(body, /confirmado|registrado|lugar apartado/i);
  assert.match(body, /https:\/\/qlick\.digital\/pagar\/evento\/demo/);
  assert.match(body, /Si ya realizaste el pago, ignora este mensaje/i);
});

test("buildPaymentReminderBody: nombre vacío usa saludo neutro y escapa HTML", async () => {
  const { buildPaymentReminderBody } = await import(
    "../src/lib/cron/payment-reminders.ts"
  );
  const body = buildPaymentReminderBody({
    attendeeName: null,
    eventTitle: "Evento <demo>",
    checkoutUrl: "https://example.com/pago",
  });

  assert.match(body, /Hola 👋/);
  assert.doesNotMatch(body, /<demo>/);
  assert.match(body, /&lt;demo&gt;/);
});

test("runPaymentRemindersJob: modo demo sin Supabase", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { runPaymentRemindersJob } = await import(
      "../src/lib/cron/payment-reminders.ts"
    );
    const result = await runPaymentRemindersJob(new Date("2026-08-10T00:00:00Z"));
    assert.equal(result.ok, true);
    assert.equal(result.demo, true);
    assert.equal(result.sent, 0);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
