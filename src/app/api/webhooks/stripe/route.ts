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
 * @see docs/PAYMENTS_STRIPE_SETUP.md para la guía de setup.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { grantAccess } from "@/lib/lms/entitlements";
import { grantEventAccess, revokeEventAccess } from "@/lib/lms/event-entitlements";
import {
  extractProductRefFromMetadata,
  requireStripeWebhookSecret,
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

  let secret: string;
  try {
    secret = requireStripeWebhookSecret();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "STRIPE_WEBHOOK_SECRET no configurado.",
      },
      { status: 500 }
    );
  }

  // 2. Leer raw body (Stripe necesita el buffer literal para verificar firma).
  const rawBody = await req.text();
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2025-09-30.clover" as never,
  });

  let event: Stripe.Event;
  try {
    // Tolerance = 300s (default de Stripe SDK). Previene replay attacks con
    // webhooks viejos firmados pero fuera de la ventana. Si querés más
    // estricto, bajalo a 60-120s.
    event = stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
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
    const outcome = await processStripeEvent(event);
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
  event: Stripe.Event
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

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return await handleCheckoutCompleted(event, idempotencyKey);

    case "checkout.session.async_payment_failed":
      return await handleCheckoutFailed(event, idempotencyKey);

    case "checkout.session.expired":
      return await handleCheckoutExpired(event, idempotencyKey);

    case "charge.refunded":
      // Fase 4: refund real → revoke. Implementación básica ya incluida
      // para no acumular deuda técnica.
      return await handleChargeRefunded(event, idempotencyKey);

    default:
      // Otros eventos: ignorar pero devolver 200 para no reintentar.
      return {
        status: 200,
        body: {
          ok: true,
          event_id: event.id,
          type: event.type,
          note: "Tipo de evento ignorado.",
        },
      };
  }
}

/* ------------------------------------------------------------------ */
/* Handlers por evento                                                 */
/* ------------------------------------------------------------------ */

type CheckoutSession = Stripe.Checkout.Session;
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

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
      email: sessionEmail,
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
    email: sessionEmail,
    error: createError?.message ?? "unknown",
  });
  return null;
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
  idempotencyKey: string
): Promise<ProcessOutcome> {
  const session = event.data.object as CheckoutSession;
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
      session_email: sessionEmail,
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

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    // @ts-ignore — payments.course_id es nullable en DB (migration 20260707110000)
    // pero el typegen local aún dice NOT NULL.
    .insert({
      user_id: userId,
      // Para eventos/masterclass, course_id queda NULL (pago vinculado via
      // event_access.payment_id). Para cursos, el id del curso.
      course_id: productRef.kind === "course" ? productRef.id : null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn: amountTotalMXN,
      discount_mxn: 0,
      currency: "MXN",
      status: "approved" as PaymentStatus,
      method: detectMethodFromSession(session),
      idempotency_key: idempotencyKey,
    } as any)
    .select("id")
    .single();

  if (payErr || !payment) {
    // 23505 = unique violation: ya existe (corredor concurrente). OK.
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

  // 2. Grant access según kind.
  const reason = `stripe_${event.type}_${new Date().toISOString().slice(0, 16)}`;

  if (productRef.kind === "course") {
    await grantAccess({
      userId,
      courseId: productRef.id,
      source: "stripe",
      paymentId: payment.id,
      grantedReason: reason,
    });
  } else {
    // event | masterclass → grantEventAccess.
    await grantEventAccess({
      userId,
      eventId: productRef.id,
      source: "event_purchase",
      paymentId: payment.id,
      grantedReason: reason,
    });
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

async function handleCheckoutFailed(
  event: Stripe.Event,
  idempotencyKey: string
): Promise<ProcessOutcome> {
  const session = event.data.object as CheckoutSession;
  const supabase = createSupabaseAdminClient();
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
    // @ts-ignore — payments.course_id es nullable en DB (migration 20260707110000).
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
    } as any)
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
  idempotencyKey: string
): Promise<ProcessOutcome> {
  // Sesión expirada (ej. OXXO voucher no pagado en 3 días).
  const session = event.data.object as CheckoutSession;
  const supabase = createSupabaseAdminClient();
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
    // @ts-ignore — payments.course_id nullable (migration 20260707110000).
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
    } as any);

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
  const externalRef =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? charge.id);

  const { data: payment } = await supabase
    .from("payments")
    .select("id, user_id, course_id")
    .eq("provider", "stripe")
    .eq("external_reference", externalRef)
    .maybeSingle();

  if (!payment) {
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
  await supabase
    .from("payments")
    .update({ status: "refunded" as PaymentStatus })
    .eq("id", payment.id);

  // Revocar access. Como el schema actual de course_access es polimórfico
  // en payment pero no en productRef, hacemos best-effort:
  // si payment.course_id existe, revocamos course; si no, intentamos event.
  const revokeReason = `refunded_via_stripe_${event.id}`;
  if (payment.course_id) {
    // Para revocación de course importamos revokeAccess desde entitlements.
    const { revokeAccess } = await import("@/lib/lms/entitlements");
    await revokeAccess({
      userId: payment.user_id,
      courseId: payment.course_id,
      reason: revokeReason,
    });
  } else {
    // Sin course_id, intentamos evento.
    // Buscamos event_access por payment_id.
    const { data: eventAccess } = await (supabase
      // @ts-ignore — typegen aún sin event_access.
      .from("event_access") as any)
      .select("id, user_id, event_id")
      .eq("payment_id", payment.id)
      .eq("access_status", "active")
      .maybeSingle();

    const ea = eventAccess as
      | { id: string; user_id: string; event_id: string }
      | null;
    if (ea && ea.user_id && ea.event_id) {
      await revokeEventAccess({
        userId: ea.user_id,
        eventId: ea.event_id,
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
      payment_id: payment.id,
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
