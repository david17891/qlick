import { NextRequest, NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/events/events-server";
import { createConfirmation } from "@/lib/events/confirmations-server";
import { createOrReusePromoOrder } from "@/lib/events/promo-orders-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments";
import { appBaseUrl } from "@/lib/utils";
import { sendPromoRegistrationEmail } from "@/lib/email/event-promo";
import type { PaymentMethod } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMO_EVENT_SLUG = "desarrollo-estructura-curso-canaco";
const METHODS: PaymentMethod[] = ["card", "oxxo", "spei"];

interface PromoCheckoutBody {
  mode?: unknown;
  eventSlug?: unknown;
  paymentOption?: unknown;
  method?: unknown;
  primary?: { name?: unknown; email?: unknown; phone?: unknown };
  secondary?: { name?: unknown; email?: unknown; phone?: unknown };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sameOriginUrl(req: NextRequest, path: string): string {
  return `${new URL(req.url).origin}${path}`;
}

export async function POST(req: NextRequest) {
  let body: PromoCheckoutBody;
  try {
    body = (await req.json()) as PromoCheckoutBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido." }, { status: 400 });
  }
  const requestedEventSlug = text(body.eventSlug);
  // La oferta no es un cupón genérico: solo puede crear órdenes para el
  // evento CANACO. Ignorarlo y resolver otro slug permitiría aplicar $1,500
  // a cualquier evento publicado con precio de $1,000.
  if (requestedEventSlug && requestedEventSlug !== PROMO_EVENT_SLUG) {
    return NextResponse.json({ ok: false, error: "La promoción no está disponible para este evento." }, { status: 404 });
  }
  const eventSlug = PROMO_EVENT_SLUG;
  const mode = body.mode === "single" ? "single" : "promo";
  const paymentOption = body.paymentOption === "full" ? "full" : "reservation";
  const method = METHODS.includes(body.method as PaymentMethod) ? body.method as PaymentMethod : "card";
  const primary = {
    name: text(body.primary?.name),
    email: text(body.primary?.email),
    phone: text(body.primary?.phone),
  };
  if (!primary.name) return NextResponse.json({ ok: false, error: "El nombre de la primera persona es obligatorio." }, { status: 400 });

  const event = await getEventBySlug(eventSlug);
  if (!event || event.status !== "published") {
    return NextResponse.json({ ok: false, error: "La promoción no está disponible." }, { status: 404 });
  }
  if (Number(event.priceMXN ?? 0) !== 1000) {
    return NextResponse.json({ ok: false, error: "La promoción no está configurada para este evento." }, { status: 409 });
  }

  if (mode === "single") {
    const result = await createConfirmation({
      eventId: event.id,
      name: primary.name,
      email: primary.email,
      phoneRaw: primary.phone,
      source: "public_form",
    });
    if (!result.ok || !result.confirmation) {
      return NextResponse.json({ ok: false, error: result.note }, { status: 400 });
    }
    const redirectUrl = `${appBaseUrl()}/pagar/evento/${encodeURIComponent(event.slug)}?confirmation=${encodeURIComponent(result.confirmation.id)}&payment_option=${paymentOption}`;
    return NextResponse.json({ ok: true, mode: "single", confirmationId: result.confirmation.id, redirectUrl });
  }

  const orderResult = await createOrReusePromoOrder({
    eventId: event.id,
    primary,
    secondary: {
      name: text(body.secondary?.name),
      email: text(body.secondary?.email),
      phone: text(body.secondary?.phone),
    },
    paymentOption,
  });
  if (!orderResult.ok || !orderResult.checkout) {
    return NextResponse.json({ ok: false, error: orderResult.error ?? "No se pudo crear la orden promocional." }, { status: 400 });
  }
  const checkout = orderResult.checkout;
  const provider = getPaymentProvider();
  let stripeMode: "test" | "live" = "test";
  if (event.eventRules?.payment_mode === "live") stripeMode = "live";
  const successUrl = sameOriginUrl(req, `/promo/exito?order_id=${encodeURIComponent(checkout.orderId)}&session_id={CHECKOUT_SESSION_ID}`);
  const cancelUrl = sameOriginUrl(req, `/promo?cancelled=1`);
  try {
    const result = await provider.createCheckout({
      productRef: {
        kind: "event",
        id: event.id,
        slug: event.slug,
        title: `${event.title} · Promoción 2 personas`,
        priceMXN: checkout.totalAmountMxn,
        chargeAmountMXN: checkout.chargeAmountMxn,
        paymentPurpose: paymentOption === "reservation" ? "promo_pair_reservation" : "promo_pair_full",
        startsAt: event.startsAt,
      },
      userId: null,
      userEmail: checkout.primaryEmail ?? "",
      method,
      confirmationId: checkout.primaryConfirmationId,
      promoOrderId: checkout.orderId,
      successUrl,
      cancelUrl,
      mode: stripeMode,
    });

    // Keep the order linked to the provider session for admin support and
    // webhook reconciliation. This is additive and does not touch the
    // normal one-person checkout ledger.
    if (provider.name === "stripe") {
      const supabase = createSupabaseAdminClient();
      await supabase.from("event_promo_orders" as never).update({
        stripe_session_id: result.paymentId,
        stripe_mode: stripeMode,
        payment_option: paymentOption,
        updated_at: new Date().toISOString(),
      } as never).eq("id" as never, checkout.orderId);
    }

    if (provider.name === "mock" && result.status === "approved") {
      const supabase = createSupabaseAdminClient();
      const { data: payment } = await supabase.from("event_payments" as never).insert({
        confirmation_id: checkout.primaryConfirmationId,
        promo_order_id: checkout.orderId,
        method: "simulated_event_payment",
        status: "approved",
        amount_mxn: result.finalAmountMXN,
        currency: "MXN",
        external_reference: result.externalReference,
        idempotency_key: `mock:${checkout.orderId}:${paymentOption}`,
        metadata: { payment_purpose: paymentOption, source: "promo-checkout-mock" },
      } as never).select("id").maybeSingle();
      if (payment) {
        const { settlePromoOrder } = await import("@/lib/events/promo-orders-server");
        await settlePromoOrder({
          orderId: checkout.orderId,
          paymentId: (payment as { id: string }).id,
          paymentOption,
          amountPaidMxn: result.finalAmountMXN,
        });
      }
    }
    await sendPromoRegistrationEmail({
      event,
      recipient: checkout.primaryEmail,
      participantNames: checkout.participantNames,
      paymentUrl: result.redirectUrl ?? `${appBaseUrl()}/promo`,
      orderId: checkout.orderId,
    });
    return NextResponse.json({
      ok: true,
      mode: "promo",
      orderId: checkout.orderId,
      paymentOption,
      amountMxn: result.finalAmountMXN,
      provider: provider.name,
      flow: result.flow,
      redirectUrl: result.redirectUrl,
      instructions: result.instructions,
      paymentId: result.paymentId,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo iniciar el pago." }, { status: 500 });
  }
}
