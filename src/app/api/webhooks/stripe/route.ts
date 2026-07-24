/**
 * Webhook de Stripe — POST /api/webhooks/stripe
 *
 * Maneja eventos asincrónicos de Stripe que llegan DESPUÉS del checkout:
 *   - checkout.session.completed → grant(Access|EventAccess)
 *   - checkout.session.async_payment_succeeded → mismo (OXXO/SPEI)
 *   - checkout.session.async_payment_failed → marca payment rejected
 *   - checkout.session.expired → marca payment expired/cancelled
 *   - charge.refunded → revokeAccess + revokeEventAccess (Fase 4, ya funciona aquí)
 *
 * SEGURIDAD:
 *   - Verifica firma con STRIPE_WEBHOOK_SECRET antes de procesar.
 *   - 401 si la firma no válida (anti-spoofing).
 *   - 200 rápido para que Stripe NO reintente — siempre devolvemos 200
 *     una vez que el evento se persiste, incluso si falla la lógica de
 *     grant (loggeamos el error pero devolvemos 200 para no loopear).
 *
 * IDEMPOTENCIA:
 *   - Lee `stripe-signature` y verifica con `stripe.webhooks.constructEvent`.
 *   - Inserta en `payments` con `idempotency_key = 'stripe_evt:' + event.id`.
 *   - Si el evento ya fue procesado (INSERT conflict), retorna 200 sin
 *     reprocesar. Stripe puede reintentar y NO debe causar grants duplicados.
 *
 * MULTI-PRODUCTO:
 *   - Lee `metadata.product_ref` (serializado en createCheckout).
 *   - Si `kind === 'course'` → grantAccess({source: 'stripe', ...}).
 *   - Si `kind === 'event' | 'masterclass'` → grantEventAccess(
 *       {source: 'event_purchase', ...}).
 *
 * DEV-ONLY:
 *   - `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
 *     en dev local. En prod, registrar endpoint en Stripe Dashboard.
 *
 * TYPE NARROWING (súper-auditoría 2026-07-12, AUDIT-007+009):
 *   - El parseo de eventos YA usa narrowing por discriminador desde
 *     antes de esta auditoría:
 *       - `event.data.object as Stripe.Checkout.Session` (línea 299, 505, 565)
 *       - `event.data.object as Stripe.Charge` (línea 618)
 *       - `event.data.object as CheckoutSession` (type alias interno)
 *   - Los 9 type-bypasses restantes (`as any` + `@ts-ignore`) están en
 *     QUERIES a Supabase (NO en el parseo de eventos), y son legítimos
 *     por typegen stale:
 *       - `payments.course_id` es nullable en DB (migration 20260707110000)
 *         pero el typegen local aún dice NOT NULL.
 *       - `event_access` no tiene typegen en `src/types/supabase.ts`.
 *     La fix definitivo es regenerar el typegen con `supabase gen types
 *     typescript --local > src/types/supabase.ts` (script de typegen
 *     pendiente — fuera del scope de este sprint).
 *
 * @see docs/PAYMENTS_STRIPE_SETUP.md para la guía de setup.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { grantAccess } from "@/lib/lms/entitlements";
import { errorLog, infoLog } from "@/lib/log";
import { grantEventAccess, revokeEventAccess } from "@/lib/lms/event-entitlements";
import { notifyLeadPaymentConfirmed as notifyLeadPaymentConfirmedLib } from "@/lib/payments/notify-lead-payment-confirmed";
import { findConfirmationIdForEvent } from "@/lib/events/find-confirmation-id";
import { ensureEventConfirmation } from "@/lib/events/ensure-event-confirmation";
import { logAdminAction } from "@/lib/crm/audit-server";
import {
  extractProductRefFromMetadata,
  verifyStripeWebhookSignature,
} from "@/lib/payments/stripe-provider";
// ProductRef viene del barrel público (también re-exportado por stripe-provider
// para uso interno).
import type { ProductRef } from "@/lib/payments/payment-provider";
import type { PaymentStatus } from "@/types";

// Forzar runtime Node.js (no Edge) — Stripe SDK + Supabase necesitan Node APIs.
export const runtime = "nodejs";
// Forzar dinámico — nunca cachear.
export const dynamic = "force-dynamic";

interface ProcessOutcome {
  status: number;
  body: Record<string, unknown>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validar signature.
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "Falta stripe-signature header." },
      { status: 400 }
    );
  }

  // 2. Leer raw body (Stripe necesita el buffer literal para verificar firma).
  const rawBody = await req.text();

  // FIX 2026-07-18 (sprint Stripe Live prep): 2 secrets (test + live).
  // El helper erifyStripeWebhookSignature prueba con ambos y
  // retorna el evento + el modo (test | live) que verifico. Si
  // ninguno matchea, tira error 401.
  let event: Stripe.Event;
  let verifiedMode: "test" | "live" = "test";
  try {
    const outcome = await verifyStripeWebhookSignature(rawBody, signature, 300);
    event = outcome.event;
    verifiedMode = outcome.mode;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? `Firma inválida: ${err.message}`
            : "Firma inválida.",
      },
      { status: 401 }
    );
  }

  // 3. Procesar según tipo de evento.
  try {
    const outcome = await processStripeEvent(event, verifiedMode);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    // Loggear pero devolver 500 — Stripe va a reintentar.
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] error procesando evento", {
      event_id: event.id,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno procesando evento.",
        event_id: event.id,
      },
      { status: 500 }
    );
  }
}

async function processStripeEvent(
  event: Stripe.Event,
  stripeMode: "test" | "live"
): Promise<ProcessOutcome> {
  // Idempotencia: chequeamos si ya vimos este evento. Si sí, no procesamos
  // de nuevo (Stripe puede repetir delivery).
  const idempotencyKey = `stripe_evt:${event.id}`;

  // Modo dry-run: si Supabase no está configurado, loggeamos y devolvemos 200
  // sin persistir (útil para dev local sin DB).
  if (!checkSupabaseConfig().configured) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "demo_no_supabase",
        event_id: event.id,
        type: event.type,
        note: "Stripe event recibido pero Supabase no configurado (demoMode). Sin grants.",
      },
    };
  }

  const supabase = createSupabaseAdminClient();

  // Ledger durable: un evento ya procesado no se vuelve a ejecutar aunque
  // no haya creado un payment (por ejemplo, un tipo ignorado). Si el row
  // quedó en `received` por un timeout, permitimos reintento.
  const { data: receipt } = await supabase
    .from("stripe_webhook_receipts")
    .select("status")
    .eq("event_id", event.id)
    .maybeSingle();
  if (receipt && ["processed", "ignored"].includes(String(receipt.status))) {
    return {
      status: 200,
      body: { ok: true, mode: "receipt_idempotent_skip", event_id: event.id },
    };
  }
  const { error: receiptInsertError } = await supabase
    .from("stripe_webhook_receipts")
    .upsert(
      {
        event_id: event.id,
        event_type: event.type,
        stripe_mode: stripeMode,
        status: "received",
        received_at: new Date().toISOString(),
      } as never,
      { onConflict: "event_id" }
    );
  if (receiptInsertError && receiptInsertError.code !== "42P01") {
    throw new Error(`No se pudo registrar receipt Stripe: ${receiptInsertError.message}`);
  }

  // Chequear duplicado por idempotency_key antes de hacer cualquier cosa.
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingPayment) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "idempotent_skip",
        event_id: event.id,
        payment_id: existingPayment.id,
        note: "Evento ya procesado, no se reprocesa.",
      },
    };
  }

  let outcome: ProcessOutcome;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      outcome = await handleCheckoutCompleted(event, idempotencyKey, stripeMode);
      break;
    case "checkout.session.async_payment_failed":
      outcome = await handleCheckoutFailed(event, idempotencyKey, stripeMode);
      break;
    case "checkout.session.expired":
      outcome = await handleCheckoutExpired(event, idempotencyKey, stripeMode);
      break;
    case "charge.refunded":
      outcome = await handleChargeRefunded(event, idempotencyKey);
      break;
    case "charge.dispute.created":
      outcome = await handleChargeDispute(event, idempotencyKey);
      break;
    case "payment_intent.payment_failed":
      outcome = await handlePaymentIntentFailed(event, idempotencyKey);
      break;
    default:
      outcome = {
        status: 200,
        body: {
          ok: true,
          event_id: event.id,
          type: event.type,
          note: "Tipo de evento ignorado.",
        },
      };
  }

  if (receiptInsertError?.code !== "42P01") {
    await supabase
      .from("stripe_webhook_receipts")
      .update({
        status: outcome.body.ok === false ? "failed" : "processed",
        processed_at: new Date().toISOString(),
      } as never)
      .eq("event_id", event.id);
  }
  return outcome;
}

/* ------------------------------------------------------------------ */
/* Handlers por evento                                                 */
/* ------------------------------------------------------------------ */

type CheckoutSession = Stripe.Checkout.Session;
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Registra una sesión de pago diferido (OXXO/SPEI) sin otorgar acceso.
 * Stripe emite `checkout.session.completed` al crear el voucher, pero la
 * fuente de verdad es `payment_status`; el grant solo ocurre en
 * `async_payment_succeeded`.
 */
async function handleCheckoutPending(
  session: CheckoutSession,
  idempotencyKey: string,
  stripeMode: "test" | "live"
): Promise<ProcessOutcome> {
  const productRef = extractProductRefFromMetadata(
    session.metadata as Record<string, string> | null
  );
  if (!productRef) {
    return {
      status: 200,
      body: { ok: true, mode: "pending_no_product_ref", session_id: session.id },
    };
  }
  const supabase = createSupabaseAdminClient();
  const stripePaymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const amountMXN =
    typeof session.amount_total === "number" ? session.amount_total / 100 : 0;

  if (productRef.kind === "service") {
    const { error } = await supabase
      .from("service_orders")
      .update({
        payment_status: "processing",
        payment_reference: session.id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: stripePaymentIntentId,
      } as never)
      .eq("id", productRef.orderId)
      .eq("payment_status", "pending");
    if (error && error.code !== "42P01") {
      throw new Error(`Error registrando service_order pending: ${error.message}`);
    }
    return {
      status: 200,
      body: { ok: true, mode: "service_checkout_pending", order_id: productRef.orderId },
    };
  }

  if (productRef.kind === "event" || productRef.kind === "masterclass") {
    let confirmationId = session.metadata?.confirmation_id ?? null;
    if (confirmationId) {
      const { data: confirmation } = await supabase
        .from("event_confirmations")
        .select("id, event_id")
        .eq("id", confirmationId)
        .eq("event_id", productRef.id)
        .maybeSingle();
      if (!confirmation) confirmationId = null;
    }
    if (!confirmationId && sessionEmailFromCheckout(session)) {
      const ensured = await ensureEventConfirmation({
        eventId: productRef.id,
        email: sessionEmailFromCheckout(session) as string,
        name: session.customer_details?.name ?? null,
        source: "public_form",
        paymentStatus: "pending",
      });
      confirmationId = ensured?.confirmationId ?? null;
    }
    if (!confirmationId) {
      return {
        status: 200,
        body: {
          ok: true,
          mode: "pending_unattributed",
          event_id: session.id,
          note: "Voucher creado; falta confirmation_id para reconciliarlo.",
        },
      };
    }
    const { error } = await supabase
      .from("event_payments")
      .upsert(
        {
          confirmation_id: confirmationId,
          method: "stripe",
          status: "pending",
          amount_mxn: amountMXN,
          currency: session.currency?.toUpperCase() ?? "MXN",
          external_reference: session.id,
          idempotency_key: idempotencyKey,
          stripe_session_id: session.id,
          stripe_payment_intent_id: stripePaymentIntentId,
          stripe_mode: stripeMode,
          metadata: {
            source: "stripe-webhook",
            payment_status: session.payment_status,
            payment_purpose: productRef.paymentPurpose ?? "full",
            event_total_mxn: productRef.priceMXN,
          },
        } as never,
        { onConflict: "stripe_session_id" }
      );
    if (error && error.code !== "23505") {
      throw new Error(`Error registrando event_payment pending: ${error.message}`);
    }
  } else {
    const userId = session.metadata?.user_id ?? "";
    if (!userId) {
      return {
        status: 200,
        body: { ok: true, mode: "pending_no_user", event_id: session.id },
      };
    }
    const { error } = await supabase
      .from("payments")
      .upsert(
        {
          user_id: userId,
          course_id: productRef.id,
          provider: "stripe",
          external_reference: session.id,
          amount_mxn: amountMXN,
          discount_mxn: 0,
          currency: session.currency?.toUpperCase() ?? "MXN",
          status: "pending",
          method: detectMethodFromSession(session),
          idempotency_key: idempotencyKey,
          stripe_session_id: session.id,
          stripe_payment_intent_id: stripePaymentIntentId,
          stripe_mode: stripeMode,
        } as never,
        { onConflict: "stripe_session_id" }
      );
    if (error && error.code !== "23505") {
      throw new Error(`Error registrando payment pending: ${error.message}`);
    }
  }
  return {
    status: 200,
    body: {
      ok: true,
      mode: "checkout_pending",
      event_id: session.id,
      payment_status: session.payment_status ?? "unpaid",
    },
  };
}

function sessionEmailFromCheckout(session: CheckoutSession): string | null {
  return session.customer_email ?? session.customer_details?.email ?? null;
}

async function resolveEventConfirmationForSession(args: {
  supabase: AdminClient;
  session: CheckoutSession;
  eventId: string;
  paymentStatus: "pending" | "paid";
}): Promise<string | null> {
  const { supabase, session, eventId, paymentStatus } = args;
  let confirmationId = session.metadata?.confirmation_id ?? null;
  if (confirmationId) {
    const { data: confirmation } = await supabase
      .from("event_confirmations")
      .select("id")
      .eq("id", confirmationId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!confirmation) confirmationId = null;
  }
  const email = sessionEmailFromCheckout(session);
  if (!confirmationId && email) {
    const ensured = await ensureEventConfirmation({
      eventId,
      email,
      name: session.customer_details?.name ?? null,
      source: "public_form",
      paymentStatus,
    });
    confirmationId = ensured?.confirmationId ?? null;
  }
  return confirmationId;
}

async function recordEventCheckoutTerminalState(args: {
  supabase: AdminClient;
  session: CheckoutSession;
  productRef: Extract<ProductRef, { kind: "event" | "masterclass" }>;
  stripeMode: "test" | "live";
  status: "failed" | "cancelled";
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const { supabase, session, productRef, stripeMode, status, metadata } = args;
  const confirmationId = await resolveEventConfirmationForSession({
    supabase,
    session,
    eventId: productRef.id,
    paymentStatus: "pending",
  });
  if (!confirmationId) return false;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const { data: existing, error: lookupError } = await supabase
    .from("event_payments")
    .select("id, status")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (lookupError) throw new Error(`Error buscando event_payment terminal: ${lookupError.message}`);

  // Un evento tardío (expired/failed) nunca debe degradar un pago ya aprobado.
  if (existing && existing.status !== "pending") return true;
  const payload = {
    confirmation_id: confirmationId,
    method: "stripe",
    status,
    amount_mxn: typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
    currency: session.currency?.toUpperCase() ?? "MXN",
    external_reference: session.id,
    idempotency_key: `stripe_terminal:${session.id}:${status}`,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_mode: stripeMode,
    metadata: {
      source: "stripe-webhook",
      terminal_status: status,
      payment_status: session.payment_status,
      ...metadata,
    },
  } as never;
  const { error } = existing
    ? await supabase.from("event_payments").update(payload).eq("id", existing.id)
    : await supabase.from("event_payments").insert(payload);
  if (error && error.code !== "23505") {
    throw new Error(`Error registrando event_payment terminal: ${error.message}`);
  }
  return true;
}

async function handleServiceCheckoutCompleted(
  session: CheckoutSession,
  productRef: Extract<ProductRef, { kind: "service" }>,
  stripeMode: "test" | "live",
  stripeEventId: string
): Promise<ProcessOutcome> {
  const supabase = createSupabaseAdminClient();
  const { data: order, error: orderError } = await supabase
    .from("service_orders")
    .select("id, status, amount_mxn, payment_status")
    .eq("id", productRef.orderId)
    .maybeSingle();
  if (orderError?.code === "42P01") {
    return {
      status: 200,
      body: { ok: false, mode: "service_schema_missing", order_id: productRef.orderId },
    };
  }
  if (orderError || !order) {
    return {
      status: 200,
      body: { ok: false, mode: "service_order_not_found", order_id: productRef.orderId },
    };
  }

  const actualAmount =
    typeof session.amount_total === "number" ? session.amount_total / 100 : 0;
  const expectedAmount = Number((order as { amount_mxn: number }).amount_mxn);
  if (Math.round(actualAmount * 100) !== Math.round(expectedAmount * 100)) {
    await supabase
      .from("service_orders")
      .update({ payment_status: "failed" } as never)
      .eq("id", productRef.orderId);
    return {
      status: 200,
      body: {
        ok: false,
        mode: "service_amount_discrepancy",
        order_id: productRef.orderId,
        expected_mxn: expectedAmount,
        actual_mxn: actualAmount,
      },
    };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const currentStatus = (order as { status: string }).status;
  const nextStatus = currentStatus === "pending_contact" ? "contacted" : currentStatus;
  const { error: updateError } = await supabase
    .from("service_orders")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      payment_mode: stripeMode === "live" ? "stripe" : "test",
      payment_reference: session.id,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      status: nextStatus,
    } as never)
    .eq("id", productRef.orderId);
  if (updateError) {
    throw new Error(`Error marcando service_order paid: ${updateError.message}`);
  }

  await supabase.from("service_order_events").insert({
    order_id: productRef.orderId,
    type: "payment_received",
    actor_id: "stripe-webhook",
    actor_type: "system",
    payload: {
      stripe_event_id: stripeEventId,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      stripe_mode: stripeMode,
      amount_mxn: actualAmount,
    },
  } as never);

  return {
    status: 200,
    body: {
      ok: true,
      mode: "service_payment_processed",
      order_id: productRef.orderId,
      payment_status: "paid",
    },
  };
}

/**
 * Resuelve el user_id de un Checkout Session:
 * - Si metadata.user_id está presente (usuario logueado al pagar), lo usa.
 * - Si no (guest checkout desde 2026-07-08), busca al user por email y
 *   si no existe lo crea con email_confirm: true.
 * - Si no hay ni user_id ni email, devuelve null (caller decide qué hacer).
 *
 * Idempotencia: si el user ya existe, no se crea duplicado. El lookup usa
 * listUsers paginado (suficiente para volumen actual; migrar a getUserById
 * cuando Supabase JS lo exponga).
 */
async function resolveOrCreateUserId(
  supabase: AdminClient,
  metadataUserId: string,
  sessionEmail: string | null
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!sessionEmail) return null;

  // 1. Buscar user existente por email.
  //    SECURITY: usamos perPage: 1000 para cubrir volumen actual. Si
  //    llegamos a >1000 usuarios, este listado va a fallar y crearemos
  //    duplicados. Solución definitiva: crear una SQL function `lookup_user_id_by_email`
  //    que consulte auth.users directamente. TODO cuando crucemos 500 users.
  try {
    const { data: listData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existing = listData?.users?.find(
      (u) => u.email?.toLowerCase() === sessionEmail.toLowerCase()
    );
    if (existing) return existing.id;
  } catch (err) {
    // Si falla el lookup, seguimos a crear (puede que la cuenta exista
    // pero falle el list por permisos o tamaño). createUser error lo
    // manejamos abajo.
    // eslint-disable-next-line no-console
    console.warn("[stripe-webhook] listUsers falló (continuamos con createUser)", {
      email_present: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Crear user nuevo con email confirmado (guest puede recibir magic
  //    link inmediatamente).
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: sessionEmail,
    email_confirm: true,
  });
  if (created?.user?.id) return created.user.id;

  // 3. Si createUser falló por "already exists" (carrera concurrente),
  //    intentar el lookup otra vez.
  if (createError && /already.*registered|already.*exists/i.test(createError.message)) {
    try {
      const { data: listData } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const existing = listData?.users?.find(
        (u) => u.email?.toLowerCase() === sessionEmail.toLowerCase()
      );
      if (existing) return existing.id;
    } catch {
      // ignore
    }
  }

  // eslint-disable-next-line no-console
  console.error("[stripe-webhook] resolveOrCreateUserId falló", {
    email_present: true,
    error: createError?.message ?? "unknown",
  });
  return null;
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
  idempotencyKey: string,
  stripeMode: "test" | "live"
): Promise<ProcessOutcome> {
  const session = event.data.object as CheckoutSession;
  // `checkout.session.completed` también se emite al crear un voucher OXXO
  // o una instrucción SPEI. En ese momento payment_status no es `paid` y no
  // se debe crear acceso, notificar ni marcar la confirmation como pagada.
  const isPaid =
    event.type === "checkout.session.async_payment_succeeded" ||
    session.payment_status === "paid";
  if (!isPaid) {
    return handleCheckoutPending(session, idempotencyKey, stripeMode);
  }
  const productRef = extractProductRefFromMetadata(
    session.metadata as Record<string, string> | null
  );
  if (!productRef) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "no_product_ref",
        event_id: event.id,
        note: "Sin product_ref en metadata. Session probablemente creada fuera del flujo Qlick.",
      },
    };
  }

  if (productRef.kind === "service") {
    return handleServiceCheckoutCompleted(session, productRef, stripeMode, event.id);
  }

  // 1. Resolver user_id (puede venir de metadata o ser guest checkout).
  //    Guest checkout (desde 2026-07-08): metadata.user_id es "" y
  //    session.customer_email tiene el email del comprador. Buscamos al
  //    usuario por email; si no existe, lo creamos.
  const supabase = createSupabaseAdminClient();
  const metadataUserId = (session.metadata?.user_id as string | undefined) ?? "";
  const sessionEmail =
    (session.customer_email as string | undefined) ??
    (session.customer_details?.email as string | undefined) ??
    null;

  const resolvedUserId = await resolveOrCreateUserId(
    supabase,
    metadataUserId,
    sessionEmail
  );
  if (!resolvedUserId) {
    // No hay forma de grant access sin un user_id. Loggeamos y retornamos
    // 200 para que Stripe no reintente, pero marcamos el fallo.
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] sin user_id ni email resolvable", {
      event_id: event.id,
      session_id: session.id,
      metadata_user_id: metadataUserId || null,
      session_email_present: Boolean(sessionEmail),
    });
    return {
      status: 200,
      body: {
        ok: false,
        mode: "no_user_resolvable",
        event_id: event.id,
        note:
          "No se pudo resolver user_id ni crear cuenta (sin email). Investigar manualmente.",
      },
    };
  }
  const userId = resolvedUserId;

  // amount_total en centavos. Convertir a MXN.
  const amountTotalMXN =
    typeof session.amount_total === "number" ? session.amount_total / 100 : 0;

  // FASE 2 V1: VALIDACION DE MONTO EXACTO (anti-fraude).
  // Comparamos session.amount_total (lo que Stripe realmente cobbro)
  // contra productRef.priceMXN (lo que el sistema creo como esperado).
  // Si difieren, NO otorgamos access: insertamos payment con status
  // 'suspicious_amount_discrepancy' para auditoria y devolvemos 200
  // (Stripe no debe reintentar eventos legitimos).
  //
  // Razon: si alguien manipula la sesion (via extension, MITM, bug),
  // podria pagar $1 en vez de $200. Sin esta validacion, le dariamos
  // el curso igual. Con esta validacion, el grant se bloquea y queda
  // traza forense.
  //
  // Edge case: scholarships (productRef.priceMXN === 0) NO deberian
  // llegar al webhook (se otorgan inline en /create-checkout). Si llegan,
  // es bug — loggeamos y dejamos pasar (la UI de scholarship ya otorgo
  // access, duplicar el grant daria unique constraint violation).
  const expectedChargeMXN = productRef.chargeAmountMXN ?? productRef.priceMXN;
  const expectedAmountCentavos = Math.round(expectedChargeMXN * 100);
  const actualAmountCentavos =
    typeof session.amount_total === "number" ? session.amount_total : 0;
  if (
    expectedChargeMXN > 0 &&
    actualAmountCentavos !== expectedAmountCentavos
  ) {
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] AMOUNT DISCREPANCY (anti-fraude)", {
      event_id: event.id,
      session_id: session.id,
      user_id: userId,
      product_kind: productRef.kind,
      product_id: productRef.id,
      expected_mxn: expectedChargeMXN,
      actual_mxn: actualAmountCentavos / 100,
      expected_centavos: expectedAmountCentavos,
      actual_centavos: actualAmountCentavos,
      delta_centavos: actualAmountCentavos - expectedAmountCentavos,
    });
    // Registrar el intento en el ledger correcto. Los eventos usan
    // `event_payments`; nunca deben caer en `payments` con course_id NULL.
    if (productRef.kind === "event" || productRef.kind === "masterclass") {
      await recordEventCheckoutTerminalState({
        supabase,
        session,
        productRef,
        stripeMode,
        status: "failed",
        metadata: {
          reason: "amount_discrepancy",
          expected_mxn: expectedChargeMXN,
          actual_mxn: actualAmountCentavos / 100,
          expected_centavos: expectedAmountCentavos,
          actual_centavos: actualAmountCentavos,
        },
      });
    } else {
      // payments.metadata NO existe en DB; los detalles quedan en los
      // campos de auditoría del webhook y el estado dedicado.
      await supabase.from("payments").insert({
        user_id: userId,
        course_id: productRef.id,
        provider: "stripe",
        external_reference: session.id,
        amount_mxn: actualAmountCentavos / 100,
        discount_mxn: 0,
        currency: session.currency ?? "MXN",
        status: "suspicious_amount_discrepancy",
        method: detectMethodFromSession(session),
        idempotency_key: `suspicious:${idempotencyKey}`,
      });
    }
    return {
      status: 200,
      body: {
        ok: false,
        mode: "amount_discrepancy_blocked",
        event_id: event.id,
        note:
          "Monto de Stripe no coincide con precio del curso. Grant bloqueado. Investigar.",
        expected_mxn: productRef.priceMXN,
        actual_mxn: actualAmountCentavos / 100,
      },
    };
  }

  // FIX 2026-07-16 (sprint event-payments FK): para eventos, el
  // payment se inserta en `event_payments` (tabla separada de
  // eventos, con FK a `event_confirmations`). Para cursos, sigue
  // en `payments` (legacy). El `event_access.payment_id` apunta a
  // `event_payments.id` después de la migration 20260716120000.
  let payment: { id: string };
  let eventConfirmationId: string | null = null;
  if (productRef.kind === "event" || productRef.kind === "masterclass") {
    // Evento: INSERT en event_payments. Vinculamos a la confirmation
    // del lead via lookup por EMAIL del customer de Stripe (no por
    // userId: `userId` aqui es `auth.user.id`, no `leads.id`, y el
    // helper legacy `findConfirmationIdForEvent` busca por `leads.id`
    // → no matchea). Fallback al helper legacy si email lookup no
    // encuentra (caso raro de guest checkout sin email). Si TODO
    // falla, NO podemos insertar con confirmation_id=null (NOT NULL),
    // asi que devolvemos 200 con mode explicito para que Stripe no
    // reintente y el operador investigue.
    //
    // FIX 2026-07-16b: el commit c33884a (email lookup) solo se habia
    // aplicado al GRANT event_access, no al INSERT de event_payments.
    // El INSERT seguia usando findConfirmationIdForEvent({leadId:userId})
    // que siempre retornaba null → 23502 (NOT NULL). Ahora se hace el
    // email lookup ANTES del INSERT, con el mismo patron que el GRANT.
    //
    // FIX 2026-07-17 (sprint event-payments bug 13, David
    // "después de pagar, esperar que se registre mi pago"): si NO
    // existe la confirmation (caso de guest checkout directo, sin
    // flow previo del bot), la CREAMOS con source='public_form' y
    // payment_status='paid' (porque el cargo ya paso). Esto evita
    // perder el pago (Stripe ya cobro, Qlick no registro nada, lead
    // se queda colgado). El helper `ensureEventConfirmation` busca
    // por email o phone, y si no encuentra, inserta con datos
    // basicos (nombre del customer, email, etc).
    //
    // Caso real David 2026-07-17: pago evento $1000 MXN, sin flow
    // previo del bot. Webhook retorno mode='confirmation_not_found'
    // sin crear event_payment, event_access, ni email QR. Recover
    // manual + fix.
    //
    // FIX 2026-07-18 (sprint atribución de pagos, David "el link de
    // pago es generico, como se relaciona con el cliente"): si el
    // checkout session trae `metadata.confirmation_id` (seteado por
    // el bot al construir el link con `?confirmation=xxx`), lo
    // usamos DIRECTAMENTE sin pasar por ensureEventConfirmation.
    // Esto es 100% confiable: el cargo queda atribuido a la
    // confirmation que el bot ya creó (mismo email, mismo
    // evento). Si el email del customer de Stripe difiere
    // (caso edge: esposa paga con su email), igual funciona
    // porque la atribución es por confirmation_id, no por
    // email. Fallback a ensureEventConfirmation solo si NO
    // hay confirmation_id en metadata.
    let confLookup: string | null = null;
    const metadataConfirmationId = session.metadata?.confirmation_id;
    if (metadataConfirmationId && typeof metadataConfirmationId === "string") {
      // Nunca confiar solo en metadata enviada por el cliente: la
      // confirmation debe pertenecer al mismo evento cobrado.
      const { data: attributedConfirmation } = await supabase
        .from("event_confirmations")
        .select("id, event_id")
        .eq("id", metadataConfirmationId)
        .eq("event_id", productRef.id)
        .maybeSingle();
      confLookup = attributedConfirmation?.id ?? null;
      if (!confLookup) {
        console.error("[stripe-webhook] confirmation_id inválido o de otro evento", {
          event_id: event.id,
          confirmation_id: metadataConfirmationId,
          event_ref: productRef.id,
        });
      }
      // eslint-disable-next-line no-console
      console.log(
        "[stripe-webhook] event_confirmation desde metadata.confirmation_id",
        {
          confirmationId: confLookup,
          eventId: productRef.id,
          sessionId: session.id,
        }
      );
    }
    if (!confLookup && sessionEmail) {
      const ensured = await ensureEventConfirmation({
        eventId: productRef.id,
        email: sessionEmail,
        name: (session.customer_details?.name as string | undefined) ?? null,
        // No tenemos phone del session de Stripe; lo dejamos null.
        // Si hay una confirmation previa con phone matching, el
        // helper la encuentra via el lookup por phone.
        source: "public_form",
        paymentStatus: "paid",
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[stripe-webhook] ensureEventConfirmation throw", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      });
      if (ensured) {
        confLookup = ensured.confirmationId;
        if (ensured.created) {
          // eslint-disable-next-line no-console
          console.log(
            "[stripe-webhook] event_confirmation creada via ensureEventConfirmation (guest checkout)",
            {
              confirmationId: ensured.confirmationId,
              source: ensured.source,
              eventId: productRef.id,
              email_present: Boolean(sessionEmail),
            }
          );
        }
      }
    }
    if (!confLookup) {
      // Fallback final: helper legacy (busca por leads.id con
      // phone/email). Si userId es auth.user.id, este helper va a
      // fallar (leads.id != auth.user.id), pero lo dejamos como
      // safety net.
      confLookup = await findConfirmationIdForEvent({
        eventId: productRef.id,
        leadId: userId,
      }).catch(() => null);
    }
    if (!confLookup) {
      // eslint-disable-next-line no-console
      console.error(
        "[stripe-webhook] no se encontro/creo confirmation para event_payment",
        {
          event_id: event.id,
          session_id: session.id,
          event_id_ref: productRef.id,
          user_id: userId,
          session_email_present: Boolean(sessionEmail),
        }
      );
      return {
        status: 200,
        body: {
          ok: false,
          mode: "confirmation_not_found",
          event_id: event.id,
          note:
            "No se encontro ni se pudo crear event_confirmation (sin email del session). Investigar manualmente.",
        },
      };
    }
    eventConfirmationId = confLookup;
    const stripePaymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    const { data: existingEventPayment } = await supabase
      .from("event_payments")
      .select("id, confirmation_id, status")
      .eq("stripe_session_id", session.id)
      .maybeSingle();
    if (existingEventPayment) {
      const { data: promoted, error: promoteError } = await supabase
        .from("event_payments")
        .update({
          status: "approved",
          stripe_payment_intent_id: stripePaymentIntentId,
          stripe_mode: stripeMode,
          external_reference: session.id,
        } as never)
        .eq("id", existingEventPayment.id)
        .select("id, confirmation_id")
        .single();
      if (promoteError || !promoted) {
        throw new Error(`Error promoviendo event_payment pendiente: ${promoteError?.message ?? "unknown"}`);
      }
      eventConfirmationId = (promoted as { confirmation_id: string }).confirmation_id;
      payment = promoted as unknown as { id: string };
    } else {
    const { data: evPayment, error: evPayErr } = await supabase
      .from("event_payments")
      .insert({
        confirmation_id: confLookup,
        // FIX 2026-07-16c (sprint event-payments FK): usar 'stripe'
        // (provider), no el method específico (card/oxxo/spei) que
        // retorna detectMethodFromSession. El CHECK
        // event_payments_method_check solo acepta:
        // 'stripe', 'cash', 'card_manual', 'transfer', 'other',
        // 'simulated_event_payment'. La granularidad card/oxxo/spei
        // queda en `metadata.method` o en `payment_method_types` del
        // session si se necesita reportear.
        method: "stripe",
        status: "approved",
        amount_mxn: amountTotalMXN,
        currency: "MXN",
        external_reference: session.id,
        idempotency_key: idempotencyKey,
        stripe_session_id: session.id,
        stripe_payment_intent_id: stripePaymentIntentId,
        stripe_mode: stripeMode,
        metadata: {
          source: "stripe-webhook",
          session_id: session.id,
          user_id: userId,
          payment_purpose: productRef.paymentPurpose ?? "full",
          event_total_mxn: productRef.priceMXN,
        },
      } as never)
      .select("id")
      .single();
    if (evPayErr || !evPayment) {
      if (evPayErr?.code === "23505") {
        // Idempotencia: ya existe el row (corredor concurrente).
        return {
          status: 200,
          body: {
            ok: true,
            mode: "race_idempotent",
            event_id: event.id,
            note: "event_payment ya existía por carrera concurrente.",
          },
        };
      }
      throw new Error(
        `Error insertando event_payment: ${evPayErr?.message ?? "unknown"}`
      );
    }
    payment = evPayment as unknown as { id: string };
    eventConfirmationId = confLookup;
    }
  } else {
    // Curso: INSERT en payments (legacy, no se mueve).
    const stripePaymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    const { data: existingCoursePayment } = await supabase
      .from("payments")
      .select("id, status")
      .eq("stripe_session_id", session.id)
      .maybeSingle();
    if (existingCoursePayment) {
      const { data: promoted, error: promoteError } = await supabase
        .from("payments")
        .update({
          status: "approved",
          stripe_payment_intent_id: stripePaymentIntentId,
          stripe_mode: stripeMode,
          external_reference: session.id,
        } as never)
        .eq("id", existingCoursePayment.id)
        .select("id")
        .single();
      if (promoteError || !promoted) {
        throw new Error(`Error promoviendo payment pendiente: ${promoteError?.message ?? "unknown"}`);
      }
      payment = promoted as { id: string };
    } else {
    const { data: coursePayment, error: payErr } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        course_id: productRef.kind === "course" ? productRef.id : null,
        provider: "stripe",
        external_reference: session.id,
        amount_mxn: amountTotalMXN,
        discount_mxn: 0,
        currency: "MXN",
        status: "approved" as PaymentStatus,
        method: detectMethodFromSession(session),
        idempotency_key: idempotencyKey,
        stripe_session_id: session.id,
        stripe_payment_intent_id: stripePaymentIntentId,
        stripe_mode: stripeMode,
      } as never)
      .select("id")
      .single();

    if (payErr || !coursePayment) {
      if (payErr?.code === "23505") {
        return {
          status: 200,
          body: {
            ok: true,
            mode: "race_idempotent",
            event_id: event.id,
            note: "Payment ya existía por carrera concurrente.",
          },
        };
      }
      throw new Error(
        `Error insertando payment: ${payErr?.message ?? "unknown"}`
      );
    }
    payment = coursePayment as { id: string };
    }
  }
  // 2. Grant access según kind.
  const reason = `stripe_${event.type}_${new Date().toISOString().slice(0, 16)}`;

  if (productRef.kind === "course") {
    // FIX 2026-07-16 (audit pago dinero real): verificar que el curso
    // está publicado antes de grant access. Si está draft/archived/
    // cancelled, NO grant (pago queda en DB como sospechoso).
    const { data: courseRow } = await supabase
      .from("courses")
      .select("id, status")
      .eq("id", productRef.id)
      .maybeSingle();
    if (!courseRow || (courseRow as { status?: string }).status !== "published") {
      console.error("[stripe-webhook] CURSO no publicado, grant bloqueado", {
        event_id: event.id,
        courseId: productRef.id,
        status: (courseRow as { status?: string } | null)?.status ?? "no encontrado",
      });
      return {
        status: 200,
        body: {
          ok: false,
          mode: "course_not_published",
          event_id: event.id,
          note: "Curso no está publicado. Grant bloqueado. Investigar.",
        },
      };
    }
    await grantAccess({
      userId,
      courseId: productRef.id,
      source: "stripe",
      paymentId: payment.id,
      grantedReason: reason,
    });
  } else {
    // FIX 2026-07-16 (audit pago dinero real): verificar que el evento
    // está publicado antes de grant access. Si está draft/cancelled/
    // archived, NO grant access (pago queda en DB como aprobado pero
    // sin access). Esto es importante: si David cancela un evento
    // DESPUÉS de que alguien pagó, no queremos darle access.
    const { data: eventRow } = await supabase
      .from("events")
      .select("id, status, starts_at")
      .eq("id", productRef.id)
      .maybeSingle();
    if (!eventRow || (eventRow as { status?: string }).status !== "published") {
      console.error("[stripe-webhook] EVENTO no publicado, grant bloqueado", {
        event_id: event.id,
        eventId: productRef.id,
        status: (eventRow as { status?: string } | null)?.status ?? "no encontrado",
      });
      return {
        status: 200,
        body: {
          ok: false,
          mode: "event_not_published",
          event_id: event.id,
          note: "Evento no está publicado. Grant bloqueado. Investigar (posible refund).",
        },
      };
    }
    const isReservation =
      (productRef.kind === "event" || productRef.kind === "masterclass") &&
      productRef.paymentPurpose === "reservation";
    if (isReservation) {
      // El apartado confirma la intención y se registra en el ledger, pero
      // no entrega acceso completo ni cambia la confirmación a `paid`.
      if (eventConfirmationId) {
        const { error: pendingError } = await supabase
          .from("event_confirmations")
          .update({ payment_status: "pending" } as never)
          .eq("id", eventConfirmationId)
          .neq("payment_status", "revoked");
        if (pendingError) {
          errorLog("[stripe-webhook] reservation payment_status update fallo", {
            confirmationId: eventConfirmationId,
            error: pendingError.message,
          });
        }
        try {
          await notifyLeadPaymentConfirmedLib({
            confirmationId: eventConfirmationId,
            eventId: productRef.id,
            amountTotalMXN,
            paymentPurpose: "reservation",
            logSource: "stripe-webhook",
          });
        } catch (notifyErr) {
          errorLog("[stripe-webhook] reservation notification fallo", {
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }
      return {
        status: 200,
        body: {
          ok: true,
          mode: "reservation_payment_processed",
          event_id: event.id,
          payment_id: payment.id,
          payment_purpose: "reservation",
          access_granted: false,
          confirmation_payment_status: "pending",
        },
      };
    }
    // event | masterclass → grantEventAccess.
    // FIX sprint 2026-07-15d + 2026-07-15f: el bot-engine ya crea el
    // event_access con source='event_pay_at_door' al confirmar la
    // inscripcion (commit 2). Aqui en el webhook promovemos el access
    // a 'event_purchase' (pago online confirmado). Pasamos
    // confirmationId para que la idempotencia matchee el access del
    // bot (sino GRANT busca por userId y como el bot dejo userId=null
    // no encontraria el access existente).
    //
    // FIX 2026-07-16 (sprint event-payments FK): buscar confirmation
    // por email del customer de Stripe (mas robusto que por userId,
    // que a veces es auth.user.id y no matchea con leads.id).
    //
    // FIX 2026-07-17 (sprint event-payments bug 13, David
    // "después de pagar, esperar que se registre mi pago"): si no
    // existe confirmation, CREAR via ensureEventConfirmation. Esto
    // es idempotente con el primer bloque (que ya paso por el mismo
    // helper), pero lo dejamos explicito aca tambien por si el
    // codigo se reorganiza. En la practica, el primer bloque ya
    // garantizo que confLookup != null.
    // FIX 2026-07-15f (auditoria): fallback a findConfirmationIdForEvent
    // si el email lookup falla (caso raro de guest checkout sin email).
    const sessionEmail =
      (session.customer_email as string | undefined) ??
      (session.customer_details?.email as string | undefined) ??
      null;
    // Reusar la confirmation ya validada durante el INSERT de
    // event_payments. Nunca volver a resolver por email aquí: eso podía
    // atribuir el access a otra confirmation si el pagador usaba un email
    // distinto al del lead.
    const confLookup = eventConfirmationId ?? (await findConfirmationIdForEvent({
        eventId: productRef.id,
        leadId: userId,
      }).catch(() => null));
    await grantEventAccess({
      userId,
      confirmationId: confLookup,
      eventId: productRef.id,
      source: "event_purchase",
      paymentId: payment.id,
      grantedReason: reason,
    });

    // FIX 2026-07-16d (sprint event-payments FK): actualizar
    // `event_confirmations.payment_status = 'paid'` después del GRANT.
    // Antes este paso se saltaba — el webhook confiaba en el caller
    // (mark-paid, simulator, etc) para hacerlo. Pero en el path de
    // checkout online (Stripe webhook), NADIE lo hacia: el estado se
    // quedaba en 'pending' aunque el pago estaba 'approved'. El
    // notifyLeadPaymentConfirmed abajo reenvía el email con el badge
    // de pago, pero el `payment_status` en BD estaba stale. Esto
    // causaba que la UI mostrara "Pago pendiente" aunque el cargo
    // ya estuviera cobrado. Lo arreglamos acá, idempotente.
    if (confLookup) {
      const { error: confUpdErr } = await supabase
        .from("event_confirmations")
        .update({ payment_status: "paid" } as never)
        .eq("id", confLookup);
      if (confUpdErr) {
        // No rompemos el flow si falla (el pago está approved igual).
        // Solo loggeamos.
        errorLog("[stripe-webhook] update confirmation payment_status fallo", {
          confirmationId: confLookup,
          error: confUpdErr.message,
        });
      }
    }

    // FIX sprint 2026-07-15d: notificar al lead por WhatsApp que su
    // pago se confirmo. Tambien re-enviar el email del QR con el
    // estado actualizado (badge "PAGADO"). El email se manda via
    // sendQrPassForConfirmation (helper que ya existe y que el form
    // publico usa).
    //
    // FIX 2026-07-20: Await the notification to prevent Vercel from
    // terminating the serverless function before the background tasks complete.
    try {
      await notifyLeadPaymentConfirmed({
        confirmationId: confLookup ?? "",
        eventId: productRef.id,
        amountTotalMXN,
      });
    } catch (notifyErr) {
      errorLog("[stripe-webhook] notifyLeadPaymentConfirmed throw", {
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: "checkout_completed",
      event_id: event.id,
      payment_id: payment.id,
      product_ref: productRef,
      access_granted: true,
    },
  };
}

/**
 * FIX sprint 2026-07-15f (auditoria): busca el confirmationId del
 * lead para un evento. Se usa en el webhook de Stripe para que el
 * grantEventAccess pueda matchear el access existente del bot
 * (sino busca por userId y como el bot dejo userId=null no
 * encontraria el access).
 *
 * Estrategia:
 * 1. JOIN leads con event_confirmations por phone_normalized.
 * 2. Fallback: por email.
 * 3. Fallback: el mas reciente del evento (puede haber mas de 1
 *    confirmation por lead si se inscribio 2 veces — pero el
 *    checkout es 1 a 1).
 */
/**
 * FIX sprint 2026-07-15d: notifica al lead por WhatsApp + re-envia
 * el email del QR cuando Stripe confirma el pago de un evento.
 *
 * FIX auditoria 2026-07-15f: la logica vive ahora en
 * `@/lib/payments/notify-lead-payment-confirmed` y la reusamos aca,
 * en el simulator dev (`/api/dev/simulate-webhook`) y en el mark-paid
 * endpoint (`/api/staff/check-in/mark-paid`). El patron de "pago
 * confirmado → notificar al lead" es el mismo en los 3 lugares.
 *
 * Este wrapper solo agrega el `logSource` correcto para que los logs
 * del webhook de Stripe sean trazables.
 *
 * **No se exporta:** este archivo es una Next.js Route, asi que solo
 * puede exportar HTTP methods (GET, POST, etc). Los callers externos
 * deben importar `notifyLeadPaymentConfirmed` directamente desde
 * `@/lib/payments/notify-lead-payment-confirmed`.
 */
async function notifyLeadPaymentConfirmed(args: {
  confirmationId: string;
  eventId: string;
  amountTotalMXN: number;
}): Promise<void> {
  return notifyLeadPaymentConfirmedLib({
    ...args,
    logSource: "stripe-webhook",
  });
}

async function handleCheckoutFailed(
  event: Stripe.Event,
  idempotencyKey: string,
  stripeMode: "test" | "live"
): Promise<ProcessOutcome> {
  const session = event.data.object as CheckoutSession;
  const supabase = createSupabaseAdminClient();
  const productRef = extractProductRefFromMetadata(
    session.metadata as Record<string, string> | null
  );
  if (productRef?.kind === "service") {
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    await supabase
      .from("service_orders")
      .update({
        payment_status: "failed",
        payment_reference: session.id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
      } as never)
      .eq("id", productRef.orderId);
    return {
      status: 200,
      body: { ok: true, mode: "service_checkout_failed", order_id: productRef.orderId },
    };
  }
  if (productRef?.kind === "event" || productRef?.kind === "masterclass") {
    const recorded = await recordEventCheckoutTerminalState({
      supabase,
      session,
      productRef,
      stripeMode,
      status: "failed",
    });
    return {
      status: 200,
      body: {
        ok: true,
        mode: recorded ? "event_checkout_failed" : "event_checkout_failed_unattributed",
        event_id: event.id,
      },
    };
  }
  const userId = (session.metadata?.user_id as string | undefined) ?? "";

  if (!userId) {
    // Sin user_id: registrar el payment como rejected pero sin FK a user.
    // Por ahora, retornamos un acknowledge — no fallamos el webhook.
    return {
      status: 200,
      body: {
        ok: true,
        mode: "no_user_failed",
        event_id: event.id,
        note: "Sin user_id; ignora rejected.",
      },
    };
  }

  // Insertar payment con status rejected (idempotente).
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      course_id: null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn:
        typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
      discount_mxn: 0,
      currency: "MXN",
      status: "rejected" as PaymentStatus,
      method: detectMethodFromSession(session),
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (payErr && payErr.code !== "23505") {
    throw new Error(
      `Error insertando payment rechazado: ${payErr.message}`
    );
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: "checkout_failed",
      event_id: event.id,
      payment_id: payment?.id ?? null,
    },
  };
}

async function handleCheckoutExpired(
  event: Stripe.Event,
  idempotencyKey: string,
  stripeMode: "test" | "live"
): Promise<ProcessOutcome> {
  // Sesión expirada (ej. OXXO voucher no pagado en 3 días).
  const session = event.data.object as CheckoutSession;
  const supabase = createSupabaseAdminClient();
  const productRef = extractProductRefFromMetadata(
    session.metadata as Record<string, string> | null
  );
  if (productRef?.kind === "service") {
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    await supabase
      .from("service_orders")
      .update({
        payment_status: "failed",
        payment_reference: session.id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
      } as never)
      .eq("id", productRef.orderId)
      .neq("payment_status", "paid");
    return {
      status: 200,
      body: { ok: true, mode: "service_checkout_expired", order_id: productRef.orderId },
    };
  }
  if (productRef?.kind === "event" || productRef?.kind === "masterclass") {
    const recorded = await recordEventCheckoutTerminalState({
      supabase,
      session,
      productRef,
      stripeMode,
      status: "cancelled",
    });
    return {
      status: 200,
      body: {
        ok: true,
        mode: recorded ? "event_checkout_expired" : "event_checkout_expired_unattributed",
        event_id: event.id,
      },
    };
  }
  const userId = (session.metadata?.user_id as string | undefined) ?? "";

  if (!userId) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "no_user_expired",
        event_id: event.id,
      },
    };
  }

  const { error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      course_id: null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn:
        typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
      discount_mxn: 0,
      currency: "MXN",
      status: "expired" as PaymentStatus,
      method: detectMethodFromSession(session),
      idempotency_key: idempotencyKey,
    });

  if (payErr && payErr.code !== "23505") {
    throw new Error(
      `Error insertando payment expirado: ${payErr.message}`
    );
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: "checkout_expired",
      event_id: event.id,
    },
  };
}

async function handleChargeRefunded(
  event: Stripe.Event,
  idempotencyKey: string
): Promise<ProcessOutcome> {
  // Fase 4 (anticipada): cuando un charge se reembolsa, revocamos access.
  const charge = event.data.object as Stripe.Charge;
  const supabase = createSupabaseAdminClient();

  // Buscar payment por external_reference (charge.payment_intent === session.id).
  // FIX 2026-07-16 (sprint event-payments FK): buscar primero en
  // `payments` (cursos), si no encuentra, en `event_payments`
  // (eventos). Antes solo buscaba en `payments`, por lo que refunds
  // de eventos quedaban huérfanos.
  const externalRef =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? charge.id);
  const paymentIntentRef =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  const chargeRef = charge.id;

  let paymentKind: "course" | "event" | "service" | null = null;
  let paymentId: string | null = null;
  let paymentUserId: string | null = null;
  let courseId: string | null = null;
  let eventConfirmationIdForRefund: string | null = null;
  let serviceOrderIdForRefund: string | null = null;

  // 1) Buscar en payments (cursos).
  const courseSelect = "id, user_id, course_id";
  const { data: coursePayByPi } = paymentIntentRef
    ? await supabase
        .from("payments")
        .select(courseSelect)
        .eq("provider", "stripe")
        .eq("stripe_payment_intent_id", paymentIntentRef)
        .maybeSingle()
    : { data: null };
  const { data: coursePayByCharge } = !coursePayByPi
    ? await supabase
        .from("payments")
        .select(courseSelect)
        .eq("provider", "stripe")
        .eq("stripe_charge_id", chargeRef)
        .maybeSingle()
    : { data: null };
  const { data: coursePay } = !coursePayByPi && !coursePayByCharge
    ? await supabase
        .from("payments")
        .select(courseSelect)
        .eq("provider", "stripe")
        .eq("external_reference", externalRef)
        .maybeSingle()
    : { data: null };
  const resolvedCoursePay = coursePayByPi ?? coursePayByCharge ?? coursePay;
  if (resolvedCoursePay) {
    paymentKind = "course";
    paymentId = (resolvedCoursePay as { id: string }).id;
    paymentUserId = (resolvedCoursePay as { user_id: string | null }).user_id;
    courseId = (resolvedCoursePay as { course_id: string | null }).course_id;
  } else {
    // 2) Buscar en event_payments (eventos).
    const { data: evPayByPi } = paymentIntentRef
      ? await supabase
          .from("event_payments")
          .select("id, confirmation_id, amount_mxn, status")
          .eq("stripe_payment_intent_id", paymentIntentRef)
          .maybeSingle()
      : { data: null };
    const { data: evPayByCharge } = !evPayByPi
      ? await supabase
          .from("event_payments")
          .select("id, confirmation_id, amount_mxn, status")
          .eq("stripe_charge_id", chargeRef)
          .maybeSingle()
      : { data: null };
    const { data: evPayByExternal } = !evPayByPi && !evPayByCharge
      ? await supabase
          .from("event_payments")
          .select("id, confirmation_id, amount_mxn, status")
          .eq("external_reference", externalRef)
          .maybeSingle()
      : { data: null };
    const evPay = evPayByPi ?? evPayByCharge ?? evPayByExternal;
    if (evPay) {
      paymentKind = "event";
      paymentId = (evPay as { id: string }).id;
      eventConfirmationIdForRefund = (evPay as { confirmation_id: string }).confirmation_id;
      // El user_id del event_payment se resuelve via el access
      // (event_access.user_id linkeado por payment_id).
    } else {
      const { data: serviceByPi } = paymentIntentRef
        ? await supabase
            .from("service_orders")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntentRef)
            .maybeSingle()
        : { data: null };
      const { data: serviceByCharge } = !serviceByPi
        ? await supabase
            .from("service_orders")
            .select("id")
            .eq("stripe_charge_id", chargeRef)
            .maybeSingle()
        : { data: null };
      const { data: serviceByExternal } = !serviceByPi && !serviceByCharge
        ? await supabase
            .from("service_orders")
            .select("id")
            .eq("payment_reference", externalRef)
            .maybeSingle()
        : { data: null };
      const serviceOrder = serviceByPi ?? serviceByCharge ?? serviceByExternal;
      if (serviceOrder) {
        paymentKind = "service";
        serviceOrderIdForRefund = (serviceOrder as { id: string }).id;
        paymentId = serviceOrderIdForRefund;
      }
    }
  }

  if (!paymentId || !paymentKind) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "refund_no_payment",
        event_id: event.id,
        note: "Refund recibido pero sin payment asociado en Qlick. Probablemente creado fuera del flujo.",
      },
    };
  }

  // Marcar payment como refunded.
  if (paymentKind === "course") {
    await supabase
      .from("payments")
      .update({ status: "refunded" as PaymentStatus, stripe_charge_id: chargeRef } as never)
      .eq("id", paymentId);
  } else if (paymentKind === "event") {
    await supabase
      .from("event_payments")
      .update({ status: "refunded", stripe_charge_id: chargeRef } as never)
      .eq("id", paymentId);
  } else if (paymentKind === "service" && serviceOrderIdForRefund) {
    await supabase
      .from("service_orders")
      .update({
        payment_status: "refunded",
        stripe_charge_id: chargeRef,
      } as never)
      .eq("id", serviceOrderIdForRefund);
    await supabase.from("service_order_events").insert({
      order_id: serviceOrderIdForRefund,
      type: "status_change",
      actor_id: "stripe-webhook",
      actor_type: "system",
      payload: { payment_status: "refunded", stripe_event_id: event.id },
    } as never);
  }

  // Revocar access.
  const revokeReason = `refunded_via_stripe_${event.id}`;
  if (paymentKind === "course" && courseId && paymentUserId) {
    // Para revocación de course importamos revokeAccess desde entitlements.
    const { revokeAccess } = await import("@/lib/lms/entitlements");
    await revokeAccess({
      userId: paymentUserId,
      courseId,
      reason: revokeReason,
    });
  } else if (paymentKind === "event") {
    // Evento: buscar event_access por payment_id.
    if (eventConfirmationIdForRefund) {
      // La confirmación es la vista que consume el QR y el admin. Al
      // revocar el acceso por refund debe dejar de mostrarse como pagada.
      await supabase
        .from("event_confirmations")
        .update({ payment_status: "revoked" } as never)
        .eq("id", eventConfirmationIdForRefund)
        .in("payment_status", ["paid", "paid_manual"]);
    }
    const { data: eventAccess } = await supabase
      .from("event_access")
      .select("id, user_id, event_id")
      .eq("payment_id", paymentId)
      .eq("access_status", "active")
      .maybeSingle();

    const ea = eventAccess as
      | { id: string; user_id: string | null; event_id: string }
      | null;
    if (ea || eventConfirmationIdForRefund) {
      await revokeEventAccess({
        userId: ea?.user_id ?? null,
        eventId: ea?.event_id ?? null,
        paymentId,
        confirmationId: eventConfirmationIdForRefund,
        reason: revokeReason,
      });
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: "refund_processed",
      event_id: event.id,
      payment_id: paymentId,
    },
  };
}

/**
 * FIX 2026-07-18 (sprint Stripe Live prep):
 * `charge.dispute.created` — el cliente inició un chargeback en su banco.
 *
 * Comportamiento:
 *  1. Buscar el payment asociado en `payments` (cursos) o `event_payments`
 *     (eventos) por el `charge.id` o `payment_intent.id` en
 *     `external_reference`.
 *  2. Marcar el payment como `disputed` (NO revocar access todavía: la
 *     disputa puede resolverse a nuestro favor con evidencia).
 *  3. Loggear via `logAdminAction` para que aparezca en el admin
 *     y David pueda responder dentro del plazo de Stripe
 *     (evidence_due_by date en el payload).
 *
 * Si no encontramos payment, devolvemos 200 + `dispute_no_payment` para
 * no acumular retries (es un caso edge: la disputa es de un charge
 * creado fuera del flujo de Qlick).
 */
async function handleChargeDispute(
  event: Stripe.Event,
  _idempotencyKey: string
): Promise<ProcessOutcome> {
  const dispute = event.data.object as Stripe.Dispute;
  const supabase = createSupabaseAdminClient();

  // Resolver el charge para obtener el payment_intent.
  // Stripe a veces incluye el charge completo en el dispute, pero por
  // seguridad lo cargamos si solo tenemos el charge id.
  let chargeId: string | null = null;
  let paymentIntentId: string | null = null;
  if (typeof dispute.charge === "string") {
    chargeId = dispute.charge;
  } else if (dispute.charge) {
    chargeId = dispute.charge.id;
    if (typeof dispute.charge.payment_intent === "string") {
      paymentIntentId = dispute.charge.payment_intent;
    } else if (dispute.charge.payment_intent) {
      paymentIntentId = dispute.charge.payment_intent.id;
    }
  }

  // Buscar primero por payment_intent (más preciso) y luego por charge.
  // El `external_reference` se setea con `session.id` o `payment_intent.id`
  // en el path de create-checkout (ver `createCheckout` en stripe-provider.ts).
  let paymentKind: "course" | "event" | "service" | null = null;
  let paymentId: string | null = null;

  if (paymentIntentId) {
    const { data: coursePay } = await supabase
      .from("payments")
      .select("id")
      .eq("provider", "stripe")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (coursePay) {
      paymentKind = "course";
      paymentId = (coursePay as { id: string }).id;
    } else {
      const { data: evPay } = await supabase
        .from("event_payments")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (evPay) {
        paymentKind = "event";
        paymentId = (evPay as { id: string }).id;
      } else {
        const { data: serviceOrder } = await supabase
          .from("service_orders")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle();
        if (serviceOrder) {
          paymentKind = "service";
          paymentId = (serviceOrder as { id: string }).id;
        }
      }
    }
  }

  // Fallback: buscar por charge.id.
  if (!paymentId && chargeId) {
    const { data: coursePay } = await supabase
      .from("payments")
      .select("id")
      .eq("provider", "stripe")
      .eq("stripe_charge_id", chargeId)
      .maybeSingle();
    if (coursePay) {
      paymentKind = "course";
      paymentId = (coursePay as { id: string }).id;
    } else {
      const { data: evPay } = await supabase
        .from("event_payments")
        .select("id")
        .eq("stripe_charge_id", chargeId)
        .maybeSingle();
      if (evPay) {
        paymentKind = "event";
        paymentId = (evPay as { id: string }).id;
      } else {
        const { data: serviceOrder } = await supabase
          .from("service_orders")
          .select("id")
          .eq("stripe_charge_id", chargeId)
          .maybeSingle();
        if (serviceOrder) {
          paymentKind = "service";
          paymentId = (serviceOrder as { id: string }).id;
        }
      }
    }
  }

  if (!paymentId || !paymentKind) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "dispute_no_payment",
        event_id: event.id,
        note: "Disputa recibida pero sin payment asociado en Qlick. Probablemente creado fuera del flujo.",
      },
    };
  }

  // Marcar como disputed. NO revocar access (la disputa puede ganarse).
  if (paymentKind === "course") {
    await supabase
      .from("payments")
      .update({ status: "disputed" as PaymentStatus })
      .eq("id", paymentId);
  } else if (paymentKind === "event") {
    await supabase
      .from("event_payments")
      .update({ status: "disputed" })
      .eq("id", paymentId);
  } else {
    await supabase
      .from("service_orders")
      .update({ payment_status: "disputed" } as never)
      .eq("id", paymentId);
    await supabase.from("service_order_events").insert({
      order_id: paymentId,
      type: "status_change",
      actor_id: "stripe-webhook",
      actor_type: "system",
      payload: { payment_status: "disputed", stripe_event_id: event.id },
    } as never);
  }

  // Audit log: queda en el admin para que David lo vea y responda.
  await logAdminAction({
    actor_email: "stripe-webhook",
    action: "payment_dispute_created",
    entity_type:
      paymentKind === "course"
        ? "payment"
        : paymentKind === "event"
          ? "event_payment"
          : "service_order",
    entity_id: paymentId,
    metadata: {
      dispute_id: dispute.id,
      reason: dispute.reason,
      amount_cents: dispute.amount,
      currency: dispute.currency,
      evidence_due_by: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null,
      charge_id: chargeId,
      payment_intent_id: paymentIntentId,
      stripe_event_id: event.id,
    },
    before: null,
    after: { status: "disputed" },
  });

  return {
    status: 200,
    body: {
      ok: true,
      mode: "dispute_processed",
      event_id: event.id,
      payment_id: paymentId,
      payment_kind: paymentKind,
    },
  };
}

/**
 * FIX 2026-07-18 (sprint Stripe Live prep):
 * `payment_intent.payment_failed` — la tarjeta fue rechazada (3DS
 * failure, fondos insuficientes, card expired, etc.).
 *
 * Llega ANTES de `checkout.session.expired` (que también disparamos
 * en el switch). Marcamos cualquier payment existente como `failed`
 * para que el admin pueda ver el motivo exacto en el panel.
 *
 * Si no hay payment (porque el checkout nunca completó), devolvemos
 * 200 + `failed_no_payment` para no acumular retries.
 */
async function handlePaymentIntentFailed(
  event: Stripe.Event,
  _idempotencyKey: string
): Promise<ProcessOutcome> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const supabase = createSupabaseAdminClient();

  // Buscar en payments (cursos) por external_reference = payment_intent.id.
  let paymentKind: "course" | "event" | "service" | null = null;
  let paymentId: string | null = null;

  const { data: coursePayByPi } = await supabase
    .from("payments")
    .select("id")
    .eq("provider", "stripe")
    .eq("stripe_payment_intent_id", pi.id)
    .maybeSingle();
  const { data: coursePay } = coursePayByPi
    ? { data: coursePayByPi }
    : await supabase
        .from("payments")
        .select("id")
        .eq("provider", "stripe")
        .eq("external_reference", pi.id)
        .maybeSingle();
  if (coursePay) {
    paymentKind = "course";
    paymentId = (coursePay as { id: string }).id;
  } else {
    const { data: evPayByPi } = await supabase
      .from("event_payments")
      .select("id")
      .eq("stripe_payment_intent_id", pi.id)
      .maybeSingle();
    const { data: evPay } = evPayByPi
      ? { data: evPayByPi }
      : await supabase
          .from("event_payments")
          .select("id")
          .eq("external_reference", pi.id)
          .maybeSingle();
    if (evPay) {
      paymentKind = "event";
      paymentId = (evPay as { id: string }).id;
    } else {
      const { data: serviceOrder } = await supabase
        .from("service_orders")
        .select("id")
        .eq("stripe_payment_intent_id", pi.id)
        .maybeSingle();
      if (serviceOrder) {
        paymentKind = "service";
        paymentId = (serviceOrder as { id: string }).id;
      }
    }
  }

  if (!paymentId || !paymentKind) {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "failed_no_payment",
        event_id: event.id,
        note: "PaymentIntent.failed recibido pero sin payment en Qlick (probablemente checkout nunca completó).",
      },
    };
  }

  // Marcar como failed. NO crear access ni enviar email (eso lo hace
  // el handler de checkout.session.completed cuando llega el success).
  if (paymentKind === "course") {
    await supabase
      .from("payments")
      .update({ status: "failed" as PaymentStatus })
      .eq("id", paymentId);
  } else if (paymentKind === "event") {
    await supabase
      .from("event_payments")
      .update({ status: "failed" })
      .eq("id", paymentId);
  } else {
    await supabase
      .from("service_orders")
      .update({ payment_status: "failed" } as never)
      .eq("id", paymentId)
      .neq("payment_status", "paid");
    await supabase.from("service_order_events").insert({
      order_id: paymentId,
      type: "status_change",
      actor_id: "stripe-webhook",
      actor_type: "system",
      payload: { payment_status: "failed", stripe_event_id: event.id },
    } as never);
  }

  // Audit log con el motivo del fallo (decline_code, last_payment_error).
  await logAdminAction({
    actor_email: "stripe-webhook",
    action: "payment_failed",
    entity_type:
      paymentKind === "course"
        ? "payment"
        : paymentKind === "event"
          ? "event_payment"
          : "service_order",
    entity_id: paymentId,
    metadata: {
      payment_intent_id: pi.id,
      decline_code: pi.last_payment_error?.code ?? null,
      decline_message: pi.last_payment_error?.message ?? null,
      payment_method: pi.payment_method_types?.[0] ?? null,
      stripe_event_id: event.id,
    },
    before: null,
    after: { status: "failed" },
  });

  return {
    status: 200,
    body: {
      ok: true,
      mode: "payment_failed_processed",
      event_id: event.id,
      payment_id: paymentId,
      payment_kind: paymentKind,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Intenta inferir el método de pago a partir de los
 * `payment_method_types` del Checkout Session. Si el array tiene 1 elemento,
 * mapeamos directo. Si tiene varios, devolvemos 'card' como default.
 */
function detectMethodFromSession(
  session: CheckoutSession
): "card" | "oxxo" | "spei" {
  const methods = session.payment_method_types ?? [];
  if (methods.includes("card")) return "card";
  if (methods.includes("oxxo")) return "oxxo";
  if (methods.includes("customer_balance")) return "spei";
  return "card";
}
