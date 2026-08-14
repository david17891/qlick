import type Stripe from "stripe";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getStripeClient } from "@/lib/payments/stripe-provider";
import { POST as stripeWebhookPost } from "@/app/api/webhooks/stripe/route";

type ReconciliationMode = "off" | "shadow" | "live";

function modeFromEnv(): ReconciliationMode {
  const value = process.env.EVENT_PAYMENT_RECONCILIATION_MODE?.trim().toLowerCase();
  return value === "off" || value === "shadow" ? value : "live";
}

interface Candidate {
  sessionId: string;
  stripeMode: "test" | "live";
}

async function replayThroughSignedWebhook(
  session: Stripe.Checkout.Session,
  stripeMode: "test" | "live",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const state = session.status === "expired"
    ? "expired"
    : session.payment_status === "paid"
      ? "paid"
      : "pending";
  const eventType = state === "expired"
    ? "checkout.session.expired"
    : state === "paid"
      ? "checkout.session.async_payment_succeeded"
      : "checkout.session.completed";
  const payload = JSON.stringify({
    id: `evt_reconcile_${session.id}_${state}`,
    object: "event",
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    data: { object: session },
    livemode: stripeMode === "live",
    pending_webhooks: 1,
    request: null,
    type: eventType,
  });
  const secret = stripeMode === "live" ? process.env.STRIPE_WEBHOOK_SECRET_LIVE : process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error(`Falta STRIPE_WEBHOOK_SECRET_${stripeMode.toUpperCase()}`);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const request = new NextRequest("http://internal/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
  const response = await stripeWebhookPost(request);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

/**
 * Revisa sesiones Stripe pendientes. El webhook sigue siendo el camino
 * inmediato; este job cubre el retraso normal de OXXO/SPEI y webhooks que no
 * llegaron. Es idempotente: solo consulta sesiones ligadas a filas pending o
 * a órdenes promo aún no liquidadas.
 */
export async function runEventPaymentReconciliationJob(now = new Date()): Promise<Record<string, unknown>> {
  const mode = modeFromEnv();
  if (mode === "off") return { ok: true, mode, checked: 0, note: "Reconciliación desactivada." };
  if (!checkSupabaseConfig().configured) return { ok: true, mode: "demo_no_supabase", checked: 0 };

  const supabase = createSupabaseAdminClient();
  const candidates = new Map<string, Candidate>();
  const { data: pendingPayments, error: paymentsError } = await supabase
    .from("event_payments" as never)
    .select("stripe_session_id, stripe_mode")
    .eq("status" as never, "pending")
    .not("stripe_session_id" as never, "is", null)
    .limit(100);
  if (paymentsError) throw new Error(`No se pudieron leer pagos pendientes: ${paymentsError.message}`);
  for (const row of (pendingPayments ?? []) as unknown as Array<{ stripe_session_id: string; stripe_mode: string | null }>) {
    if (row.stripe_session_id) candidates.set(row.stripe_session_id, {
      sessionId: row.stripe_session_id,
      stripeMode: row.stripe_mode === "live" ? "live" : "test",
    });
  }

  const { data: promoOrders, error: promoError } = await supabase
    .from("event_promo_orders" as never)
    .select("stripe_session_id, stripe_mode")
    .in("status" as never, ["pending", "partial"])
    .not("stripe_session_id" as never, "is", null)
    .limit(100);
  if (promoError && promoError.code !== "42P01") throw new Error(`No se pudieron leer órdenes promo: ${promoError.message}`);
  for (const row of (promoOrders ?? []) as unknown as Array<{ stripe_session_id: string; stripe_mode: string | null }>) {
    if (row.stripe_session_id) candidates.set(row.stripe_session_id, {
      sessionId: row.stripe_session_id,
      stripeMode: row.stripe_mode === "live" ? "live" : "test",
    });
  }

  const result = {
    ok: true,
    mode,
    checked: 0,
    paid: 0,
    pending: 0,
    expired: 0,
    failed: 0,
    errors: 0,
    at: now.toISOString(),
  };
  for (const candidate of candidates.values()) {
    result.checked += 1;
    try {
      const stripe = getStripeClient(candidate.stripeMode);
      const session = await stripe.checkout.sessions.retrieve(candidate.sessionId) as Stripe.Checkout.Session;
      if (mode === "shadow") {
        if (session.status === "expired") result.expired += 1;
        else if (session.payment_status === "paid") result.paid += 1;
        else result.pending += 1;
        continue;
      }
      const outcome = await replayThroughSignedWebhook(session, candidate.stripeMode);
      const bodyMode = String(outcome.body.mode ?? "");
      if (bodyMode.includes("completed") || bodyMode.includes("settled")) result.paid += 1;
      else if (bodyMode.includes("expired")) result.expired += 1;
      else if (bodyMode.includes("pending")) result.pending += 1;
      else if (outcome.body.ok === false) result.failed += 1;
    } catch (error) {
      result.errors += 1;
      console.error("[cron/event-payment-reconciliation] error", {
        session_present: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
