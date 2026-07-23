/**
 * E2E unificado del funnel evento: WhatsApp -> registro -> email/QR ->
 * Stripe test -> webhook -> acceso.
 *
 * Seguridad:
 * - No usa DeepSeek, Meta ni Brevo reales.
 * - Usa un evento, lead y email sintéticos.
 * - El pago se representa con un Checkout Session test + webhook firmado.
 * - El teardown elimina todos los registros creados por este caso.
 */

import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readFileSync, existsSync } from "node:fs";

function loadEnv() {
  if (!existsSync(".env.local")) return;
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Faltan variables de Supabase");

// Forzar el agente determinista: no hay coste ni llamada externa al LLM.
delete process.env.DEEPSEEK_API_KEY;
process.env.AI_AGENT_PROVIDER = "mock";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const capturedWhatsApp = [];
const capturedEmails = [];

class MockNextResponse extends Response {
  static json(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(body), { ...init, headers });
  }
}

before(() => {
  // La ruta App Router importa `next/server`; el loader de tests ejecuta sin
  // el runtime de Next, así que proveemos únicamente el contrato HTTP usado.
  mock.module("next/server", {
    namedExports: {
      NextRequest: globalThis.Request,
      NextResponse: MockNextResponse,
    },
  });
  mock.module("../src/lib/whatsapp/index.ts", {
    namedExports: {
      getActiveWhatsAppProvider: () => ({
        name: "mock_meta",
        displayName: "Mock Meta (payments funnel E2E)",
        active: true,
        stub: true,
        send: async (args) => {
          capturedWhatsApp.push({ to: args.to, body: args.body ?? "", type: args.type ?? "text" });
          return { ok: true, externalId: `mock_wa_${Date.now()}`, demo: true };
        },
      }),
      REGISTRY: {},
    },
  });
  mock.module("../src/lib/email/brevo-client.ts", {
    namedExports: {
      sendEmail: async (args) => {
        capturedEmails.push({ to: args.to, subject: args.subject, html: args.html ?? "" });
        return { ok: true, messageId: `mock_email_${Date.now()}` };
      },
    },
  });
});

const created = {
  eventId: null,
  leadId: null,
  confirmationId: null,
  userId: null,
  paymentId: null,
};
const runId = `funnel-e2e-${Date.now()}`;
const testEmail = `${runId}@example.com`;
const testPhone = `+525599${String(Date.now()).slice(-6)}`;

async function cleanup() {
  if (created.eventId) {
    await supabase.from("event_access").delete().eq("event_id", created.eventId);
    await supabase.from("event_qr_tokens").delete().eq("event_id", created.eventId);
    await supabase.from("event_attendees").delete().eq("event_id", created.eventId);
    await supabase.from("event_payments").delete().eq("confirmation_id", created.confirmationId ?? "");
    await supabase.from("event_email_log").delete().eq("event_id", created.eventId);
  }
  if (created.confirmationId) await supabase.from("event_confirmations").delete().eq("id", created.confirmationId);
  if (created.leadId) {
    await supabase.from("lead_whatsapp_log").delete().eq("lead_id", created.leadId);
    await supabase.from("lead_whatsapp_conversations").delete().eq("lead_id", created.leadId);
    await supabase.from("leads").delete().eq("id", created.leadId);
  }
  if (created.userId) await supabase.auth.admin.deleteUser(created.userId);
  if (created.eventId) await supabase.from("events").delete().eq("id", created.eventId);
  await supabase.from("system_settings").upsert({
    key: "bot_global_mode",
    value: JSON.stringify("super_executive_v2"),
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
}

after(async () => {
  await cleanup();
});

test("funnel completo con Stripe test y webhook firmado", async () => {
  const starts = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const ends = new Date(starts.getTime() + 60 * 60 * 1000);
  const { data: event, error: eventError } = await supabase.from("events").insert({
    slug: runId,
    title: "QA funnel Stripe test",
    description: "Evento sintético para E2E automatizado.",
    location: "QA remoto",
    format: "virtual",
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    price_mxn: 10,
    currency: "MXN",
    status: "published",
    short_code: "Q" + String(Date.now()).slice(-3),
    requires_name: true,
    event_rules: { payment_mode: "test", personality: "", rules: [] },
  }).select("id, slug, title, price_mxn, starts_at").single();
  if (eventError) throw eventError;
  created.eventId = event.id;

  const { data: lead, error: leadError } = await supabase.from("leads").insert({
    phone: testPhone,
    phone_normalized: testPhone,
    name: "Pendiente",
    email: `pending-${runId}@example.com`,
    source: "synthetic_lab",
    status: "new",
    consent_to_contact: true,
    tags: [runId],
  }).select("id").single();
  if (leadError) throw leadError;
  created.leadId = lead.id;

  await supabase.from("system_settings").upsert({
    key: "bot_global_mode",
    value: JSON.stringify("human_first"),
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  const settings = await import("../src/lib/admin/system-settings-server.ts");
  settings.invalidateCache?.();

  const { processInboundMessage } = await import("../src/lib/whatsapp/bot-engine.ts");
  const conversation = await processInboundMessage({
    messageId: `${runId}-wa-1`,
    from: testPhone,
    contactName: "QA Test User",
    text: `QA Test User ${testEmail}`,
    type: "text",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  assert.equal(conversation.ok, true, conversation.note ?? "bot error");
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const { data: confirmation, error: confirmationError } = await supabase.from("event_confirmations")
    .select("id, event_id, email, phone_normalized, payment_status")
    .eq("event_id", event.id)
    .eq("email", testEmail)
    .maybeSingle();
  if (confirmationError) throw confirmationError;
  assert.ok(confirmation, "la conversación debe crear event_confirmation");
  assert.equal(confirmation.payment_status, "pending");
  created.confirmationId = confirmation.id;

  const { data: messages } = await supabase.from("lead_whatsapp_conversations")
    .select("direction, body")
    .eq("lead_id", lead.id);
  assert.ok((messages ?? []).some((m) => m.direction === "inbound"));
  assert.ok((messages ?? []).some((m) => m.direction === "outbound"));
  assert.ok(capturedWhatsApp.length >= 1, "debe capturarse outbound de WhatsApp");
  assert.ok(capturedEmails.some((e) => e.to === testEmail), "debe simularse email al lead");

  const { data: emailLog } = await supabase.from("event_email_log")
    .select("email_type, recipient, ok")
    .eq("event_id", event.id)
    .eq("recipient", testEmail);
  assert.ok((emailLog ?? []).some((e) => e.email_type === "qr_pass" && e.ok === true));

  const sessionId = `cs_test_${runId}`;
  const paymentIntentId = `pi_test_${runId}`;
  const productRef = JSON.stringify({ kind: "event", id: event.id, slug: event.slug, title: event.title, priceMXN: 10, startsAt: event.starts_at });
  const stripeEvent = {
    id: `evt_test_${runId}`,
    object: "event",
    api_version: "2025-09-30.clover",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    type: "checkout.session.completed",
    data: { object: {
      id: sessionId,
      object: "checkout.session",
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 1000,
      currency: "mxn",
      payment_intent: paymentIntentId,
      customer_email: testEmail,
      customer_details: { email: testEmail, name: "QA Test User" },
      metadata: {
        product_ref: productRef,
        user_id: "",
        user_email: testEmail,
        kind: "event",
        requested_payment_method: "card",
        payment_mode: "test",
        confirmation_id: confirmation.id,
      },
    } },
  };
  const rawPayload = JSON.stringify(stripeEvent);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  assert.ok(webhookSecret, "STRIPE_WEBHOOK_SECRET requerido para webhook test");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
  const signature = stripe.webhooks.generateTestHeaderString({ payload: rawPayload, secret: webhookSecret });
  const { POST } = await import("../src/app/api/webhooks/stripe/route.ts");
  const webhookResponse = await POST(new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: rawPayload,
  }));
  const webhookBody = await webhookResponse.json();
  assert.equal(webhookResponse.status, 200, JSON.stringify(webhookBody));

  const { data: payment, error: paymentError } = await supabase.from("event_payments")
    .select("id, status, amount_mxn, currency, stripe_mode, stripe_session_id, stripe_payment_intent_id")
    .eq("stripe_session_id", sessionId).single();
  if (paymentError) throw paymentError;
  created.paymentId = payment.id;
  assert.equal(payment.status, "approved");
  assert.equal(Number(payment.amount_mxn), 10);
  assert.equal(payment.currency, "MXN");
  assert.equal(payment.stripe_mode, "test");
  assert.equal(payment.stripe_payment_intent_id, paymentIntentId);

  const { data: paidConfirmation } = await supabase.from("event_confirmations")
    .select("payment_status").eq("id", confirmation.id).single();
  assert.equal(paidConfirmation.payment_status, "paid");
  const { data: access } = await supabase.from("event_access")
    .select("access_status, access_source, payment_id, user_id")
    .eq("confirmation_id", confirmation.id).single();
  assert.ok(access);
  assert.equal(access.access_status, "active");
  assert.equal(access.access_source, "event_purchase");
  assert.equal(access.payment_id, payment.id);
  created.userId = access.user_id;

  console.log(JSON.stringify({
    ok: true,
    event: { slug: event.slug, price_mxn: event.price_mxn, payment_mode: "test" },
    conversation: { inbound: (messages ?? []).filter((m) => m.direction === "inbound").length, outbound: (messages ?? []).filter((m) => m.direction === "outbound").length },
    email: { mock_sends: capturedEmails.length, qr_log: (emailLog ?? []).some((e) => e.email_type === "qr_pass" && e.ok === true) },
    payment: { status: payment.status, amount_mxn: payment.amount_mxn, stripe_mode: payment.stripe_mode },
    access: { status: access.access_status, source: access.access_source },
  }, null, 2));
});
