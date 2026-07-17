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
  const expectedAmountCentavos = Math.round(productRef.priceMXN * 100);
  const actualAmountCentavos =
    typeof session.amount_total === "number" ? session.amount_total : 0;
  if (
    productRef.priceMXN > 0 &&
    actualAmountCentavos !== expectedAmountCentavos
  ) {
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] AMOUNT DISCREPANCY (anti-fraude)", {
      event_id: event.id,
      session_id: session.id,
      user_id: userId,
      product_kind: productRef.kind,
      product_id: productRef.id,
      expected_mxn: productRef.priceMXN,
      actual_mxn: actualAmountCentavos / 100,
      expected_centavos: expectedAmountCentavos,
      actual_centavos: actualAmountCentavos,
      delta_centavos: actualAmountCentavos - expectedAmountCentavos,
    });
    // Insertar payment como suspicious para auditoria. NO grant access.
    await supabase.from("payments").insert({
      user_id: userId,
      course_id: productRef.kind === "course" ? productRef.id : null,
      provider: "stripe",
      external_reference: session.id,
      amount_mxn: actualAmountCentavos / 100,
      discount_mxn: 0,
      currency: session.currency ?? "MXN",
      status: "suspicious_amount_discrepancy",
      method: detectMethodFromSession(session),
      idempotency_key: `suspicious:${idempotencyKey}`,
      metadata: {
        flagged: "amount_discrepancy",
        expected_mxn: productRef.priceMXN,
        actual_mxn: actualAmountCentavos / 100,
        flagged_at: new Date().toISOString(),
      },
    } as any);
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
  if (productRef.kind === "event" || productRef.kind === "masterclass") {
    // Evento: INSERT en event_payments. Vinculamos a la confirmation
    // del lead via `findConfirmationIdForEvent` (mismo lookup que
    // usamos para grantEventAccess). Si no hay confirmationId, lo
    // insertamos sin FK (legacy o guest sin confirmation).
    const confLookup = await findConfirmationIdForEvent({
      eventId: productRef.id,
      leadId: userId,
    }).catch(() => null);
    const { data: evPayment, error: evPayErr } = await supabase
      // @ts-ignore — event_payments no esta en el typegen (migration 20260715120000).
      .from("event_payments" as never)
      .insert({
        confirmation_id: confLookup ?? null,
        method: detectMethodFromSession(session),
        status: "approved",
        amount_mxn: amountTotalMXN,
        currency: "MXN",
        external_reference: session.id,
        idempotency_key: idempotencyKey,
        metadata: {
          source: "stripe-webhook",
          session_id: session.id,
          user_id: userId,
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
  } else {
    // Curso: INSERT en payments (legacy, no se mueve).
    const { data: coursePayment, error: payErr } = await supabase
      .from("payments")
      // @ts-ignore — payments.course_id es nullable en DB (migration 20260707110000)
      // pero el typegen local aún dice NOT NULL.
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
      } as any)
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
    // FIX 2026-07-15f (auditoria): fallback a findConfirmationIdForEvent
    // si el email lookup falla (caso raro de guest checkout sin email).
    const sessionEmail =
      (session.customer_email as string | undefined) ??
      (session.customer_details?.email as string | undefined) ??
      null;
    const supabaseForLookup = createSupabaseAdminClient();
    let confLookup: string | null = null;
    if (sessionEmail) {
      const { data: confByEmail } = await supabaseForLookup
        .from("event_confirmations")
        .select("id")
        .eq("event_id", productRef.id)
        .eq("email", sessionEmail)
        .order("confirmed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      confLookup = (confByEmail as { id: string } | null)?.id ?? null;
    }
    if (!confLookup) {
      // Fallback: intentar con el helper legacy (por userId del lead)
      confLookup = await findConfirmationIdForEvent({
        eventId: productRef.id,
        leadId: userId,
      }).catch(() => null);
    }
    await grantEventAccess({
      userId,
      confirmationId: confLookup,
      eventId: productRef.id,
      source: "event_purchase",
      paymentId: payment.id,
      grantedReason: reason,
    });

    // FIX sprint 2026-07-15d: notificar al lead por WhatsApp que su
    // pago se confirmo. Tambien re-enviar el email del QR con el
    // estado actualizado (badge "PAGADO"). El email se manda via
    // sendQrPassForConfirmation (helper que ya existe y que el form
    // publico usa). Fire-and-forget: no bloquea el response del
    // webhook de Stripe.
    void notifyLeadPaymentConfirmed({
      confirmationId: confLookup ?? "",
      eventId: productRef.id,
      amountTotalMXN,
    }).catch((notifyErr) => {
      errorLog("[stripe-webhook] notifyLeadPaymentConfirmed throw", {
        error:
          notifyErr instanceof Error
            ? notifyErr.message
            : String(notifyErr),
      });
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
  // FIX 2026-07-16 (sprint event-payments FK): buscar primero en
  // `payments` (cursos), si no encuentra, en `event_payments`
  // (eventos). Antes solo buscaba en `payments`, por lo que refunds
  // de eventos quedaban huérfanos.
  const externalRef =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? charge.id);

  let paymentKind: "course" | "event" | null = null;
  let paymentId: string | null = null;
  let paymentUserId: string | null = null;
  let courseId: string | null = null;

  // 1) Buscar en payments (cursos).
  const { data: coursePay } = await supabase
    .from("payments")
    .select("id, user_id, course_id")
    .eq("provider", "stripe")
    .eq("external_reference", externalRef)
    .maybeSingle();
  if (coursePay) {
    paymentKind = "course";
    paymentId = (coursePay as { id: string }).id;
    paymentUserId = (coursePay as { user_id: string | null }).user_id;
    courseId = (coursePay as { course_id: string | null }).course_id;
  } else {
    // 2) Buscar en event_payments (eventos).
    const { data: evPay } = await supabase
      // @ts-ignore — event_payments no esta en el typegen.
      .from("event_payments" as never)
      .select("id, confirmation_id, amount_mxn, status")
      .eq("external_reference", externalRef)
      .maybeSingle();
    if (evPay) {
      paymentKind = "event";
      paymentId = (evPay as { id: string }).id;
      // El user_id del event_payment se resuelve via el access
      // (event_access.user_id linkeado por payment_id).
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
      .update({ status: "refunded" as PaymentStatus })
      .eq("id", paymentId);
  } else {
    await supabase
      // @ts-ignore — event_payments no esta en el typegen.
      .from("event_payments" as never)
      .update({ status: "refunded" } as never)
      .eq("id", paymentId as never);
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
    const { data: eventAccess } = await (supabase
      // @ts-ignore — typegen aún sin event_access.
      .from("event_access") as any)
      .select("id, user_id, event_id")
      .eq("payment_id", paymentId)
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
      payment_id: paymentId,
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
