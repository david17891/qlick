/**
 * POST /api/payments/create-checkout
 *
 * Crea un checkout en el proveedor de pagos activo (mock, stripe, mercadopago,
 * conekta) para un curso. Devuelve el resultado con la URL a la que el cliente
 * debe redirigir (o instrucciones para flujos inline/manual).
 *
 * Body esperado:
 *   {
 *     slug: string,             // course slug
 *     method: "card" | "oxxo" | "spei",  // método preferido
 *   }
 *
 * Respuesta OK (200):
 *   {
 *     ok: true,
 *     flow: "redirect" | "embed" | "manual" | "inline",
 *     redirectUrl?: string,
 *     instructions?: string,
 *     paymentId: string,
 *     externalReference: string,
 *     status: "pending" | "approved" | ...,
 *     finalAmountMXN: number,
 *     discountMXN: number,
 *     method: "card" | ...,
 *     provider: "stripe" | "mock" | ...,
 *   }
 *
 * Errores:
 *   - 401: sin sesión
 *   - 400: body inválido / curso no pago
 *   - 404: curso no encontrado
 *   - 409: ya tiene access (ya pagó)
 *   - 500: error del provider o de DB
 *
 * AUTH: sesión OPCIONAL desde 2026-07-08 (guest checkout). Si hay sesión,
 * pasamos su userId al provider (queda en metadata y evita duplicados). Si
 * NO hay sesión, el webhook crea la cuenta con el email de Stripe al
 * confirmarse el pago. El grant del access lo hace el webhook, no este
 * endpoint — este solo inicia el checkout.
 *
 * SCOPE (2026-07-14): acepta `productKind: "course" | "event"`. Default
 * "course" para compat con callers que ya existían. Para eventos, el
 * caller manda `productKind: "event"` y el mismo `slug` (event slug).
 * La migration 20260714230000 agregó `price_mxn` y `currency` a `events`
 * para destrabar este flujo. Masterclass queda fuera de scope (sprint
 * futuro con su propia ruta `/pagar/masterclass/[slug]`).
 *
 * DEV/PROD: este endpoint NO está bajo /api/dev/ — el provider "mock" lo usa
 * también pero el endpoint es legítimo en prod (es solo que el provider
 * configurado será stripe, no mock).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { checkCourseAccess, grantAccess } from "@/lib/lms/entitlements";
import { getEventBySlug } from "@/lib/events/events-server";
import { checkEventAccess, grantEventAccess } from "@/lib/lms/event-entitlements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments";
import type { ProductRef } from "@/lib/payments/payment-provider";
import { resolveCheckoutUrl } from "@/lib/payments/checkout-url-resolver";
import { recordAndCheckRateLimit, getClientIp } from "@/lib/api/rate-limit";
import type { PaymentMethod } from "@/types";

// Forzar Node.js (Stripe SDK + Supabase necesitan Node APIs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateCheckoutBody {
  slug?: unknown;
  /**
   * Tipo de producto a cobrar. Default "course" (compat con callers
   * que ya existían antes del soporte de eventos, migration
   * 20260714230000). Para eventos: "event".
   */
  productKind?: unknown;
  method?: unknown;
  /**
   * FIX 2026-07-17 (sprint event-payments bug 12, David
   * "después de pagar con tarjeta, me sigue mandando a dashboard
   * como si me inscribiera al curso"): URLs explícitas de retorno
   * post-pago. El cliente (CheckoutButton) las manda ya con el
   * prefijo correcto (`/pagar/evento/[slug]/exito` o
   * `/pagar/[courseSlug]/exito`). Antes este endpoint las
   * IGNORABA y armaba sus propias URLs con
   * `${requestOrigin}/pagar/${productRef.slug}/exito` — que para
   * eventos matchea la página de éxito del CURSO
   * (`/pagar/[courseSlug]/exito`), y esa página redirige a
   * `/dashboard` cuando no encuentra el curso por slug.
   *
   * Si el cliente las manda, las usamos. Si NO las manda,
   * construimos las nuestras con el prefijo correcto según
   * `productKind` (`/pagar/evento/[slug]/exito` para eventos,
   * `/pagar/[slug]/exito` para cursos). Validamos que sean URLs
   * absolutas y del mismo origin del request (defense vs open
   * redirect).
   */
  successUrl?: unknown;
  cancelUrl?: unknown;
  pendingUrl?: unknown;
  /**
   * FIX 2026-07-18 (sprint atribución de pagos, David "el link de
   * pago es generico, como se relaciona con el cliente"): cuando el
   * caller conoce la `event_confirmation` (bot ya completó el flow),
   * lo pasa acá. La API lo serializa a `metadata.confirmation_id`
   * en el Checkout Session de Stripe, y el webhook lo lee PRIMERO
   * para atribuir el cargo a esa confirmation. Solo relevante para
   * productos tipo "event" (los cursos no tienen confirmation_id).
   */
  confirmationId?: unknown;
}

type SupportedProductKind = "course" | "event";

function parseProductKind(v: unknown): SupportedProductKind {
  if (v === "event") return "event";
  return "course";
}

const VALID_METHODS: PaymentMethod[] = ["card", "oxxo", "spei"];

function isValidMethod(m: unknown): m is PaymentMethod {
  return typeof m === "string" && VALID_METHODS.includes(m as PaymentMethod);
}

export async function POST(req: NextRequest) {
  // 0. Rate limit per-IP (5 req/min). FIX 2026-07-18 (reauditoria):
  // antes este endpoint era público sin rate limit. Un atacante podía
  // spammear checkout sessions para inflar métricas del dashboard admin
  // o tirar la quota de Stripe (cada checkout cuenta aunque no se pague).
  // Mismo helper que submit-survey. 5/min es suficiente para el flow
  // real de un humano (1 click → 1 checkout) y bloquea abuse.
  const clientIp = getClientIp(req);
  const rl = recordAndCheckRateLimit(`create_checkout:${clientIp}`, {
    maxCalls: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil((rl.resetMs ?? 60_000) / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: "Demasiadas solicitudes. Intentá de nuevo en un minuto.",
        retryAfterMs: rl.resetMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  // 1. Auth: sesión opcional (guest checkout).
  const session = await getCurrentStudent();

  // 2. Parse body.
  let body: CreateCheckoutBody;
  try {
    body = (await req.json()) as CreateCheckoutBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body inválido (JSON requerido)." },
      { status: 400 },
    );
  }

  if (typeof body.slug !== "string" || !body.slug) {
    return NextResponse.json(
      { ok: false, error: "Falta 'slug' en el body." },
      { status: 400 },
    );
  }

  const productKind = parseProductKind(body.productKind);
  const method: PaymentMethod = isValidMethod(body.method) ? body.method : "card";

  // 3. Resolver el producto por slug + kind. Cada branch construye su
  //    propio `productRef` con el shape correcto para que el provider
  //    (Stripe, mock, etc.) pueda procesarlo. El path común de
  //    provider.createCheckout + response va DESPUÉS de este bloque.
  let productRef: ProductRef;
  if (productKind === "event") {
    // 3a. EVENTO (migration 20260714230000 — price_mxn + currency).
    const event = await getEventBySlug(body.slug);
    if (!event) {
      return NextResponse.json(
        { ok: false, error: `Evento '${body.slug}' no existe.` },
        { status: 404 },
      );
    }
    if (event.status !== "published") {
      return NextResponse.json(
        {
          ok: false,
          error: `El evento '${body.slug}' no está publicado. Publicá primero el evento desde /admin/eventos.`,
        },
        { status: 400 },
      );
    }
    if (!event.priceMXN || event.priceMXN <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `El evento '${body.slug}' es gratuito. El asistente va directo a la confirmación (no requiere pago).`,
        },
        { status: 400 },
      );
    }
    // Idempotencia: si ya tiene access activo y hay sesión, no dejamos
    // pagar dos veces. Sin sesión (guest) no podemos chequear — dejamos
    // que el webhook detecte duplicados via metadata.user_id.
    if (session) {
      const access = await checkEventAccess(session.userId, event.id);
      if (access.hasAccess && access.source !== "free_rsvp") {
        return NextResponse.json(
          {
            ok: false,
            error: "Ya tienes acceso a este evento.",
            alreadyPaid: true,
          },
          { status: 409 },
        );
      }
    }
    productRef = {
      kind: "event",
      id: event.id,
      slug: event.slug,
      title: event.title,
      priceMXN: event.priceMXN,
      startsAt: event.startsAt,
    };
  } else {
    // 3b. CURSO (path original, intacto).
    const course = await getCourseBySlug(body.slug);
    if (!course) {
      return NextResponse.json(
        { ok: false, error: `Curso '${body.slug}' no existe o no está publicado.` },
        { status: 404 },
      );
    }
    if (course.accessType !== "paid") {
      return NextResponse.json(
        {
          ok: false,
          error: `El curso '${body.slug}' es gratuito. Usá /inscripcion/${body.slug} en su lugar.`,
        },
        { status: 400 },
      );
    }
    // Idempotencia: si ya tiene access activo y hay sesión, no dejamos
    // pagar dos veces. Sin sesión (guest) no podemos chequear.
    if (session) {
      const access = await checkCourseAccess(session.userId, course.id);
      if (access.hasAccess) {
        return NextResponse.json(
          {
            ok: false,
            error: "Ya tienes acceso a este curso.",
            alreadyPaid: true,
          },
          { status: 409 },
        );
      }
    }
    productRef = {
      kind: "course",
      id: course.id,
      slug: course.slug,
      title: course.title,
      priceMXN: course.priceMXN ?? 0,
    };
  }

  // La confirmation llega del bot/cliente, pero nunca se debe copiar a
  // Stripe sin comprobar ownership. Una confirmation de otro evento podría
  // desviar un pago y entregar acceso a la persona equivocada.
  let validatedConfirmationId: string | undefined;
  if (productKind === "event" && typeof body.confirmationId === "string" && body.confirmationId) {
    const supabase = createSupabaseAdminClient();
    const { data: confirmation, error: confirmationError } = await supabase
      .from("event_confirmations")
      .select("id, event_id")
      .eq("id", body.confirmationId)
      .eq("event_id", productRef.id)
      .maybeSingle();
    if (confirmationError || !confirmation) {
      return NextResponse.json(
        { ok: false, error: "La confirmación de evento no es válida para este evento." },
        { status: 400 },
      );
    }
    validatedConfirmationId = confirmation.id;
  }

  // 4. Crear el checkout en el provider activo.
  const provider = getPaymentProvider();

  // success/cancel/pending URLs:
  //   1) Si el cliente (CheckoutButton) las manda en el body, las usamos
  //      (validamos que sean absolutas y del mismo origin del request —
  //      defense vs open redirect).
  //   2) Si NO las manda, armamos el default usando el origin del request
  //      actual. Funciona en local (localhost:3000), preview (hash.vercel.app)
  //      y prod (qlick.digital) sin depender de NEXT_PUBLIC_APP_URL (que no
  //      está seteado en Preview). Stripe API rechaza URLs relativas con
  //      "Not a valid URL", por eso armamos el absoluto acá.
  //
  // FIX 2026-07-17 (sprint event-payments bug 12, David "después de
  // pagar con tarjeta, me sigue mandando a dashboard como si me
  // inscribiera al curso"): el default AHORA incluye el prefijo
  // `/evento/` cuando productKind === "event". Antes armaba
  // `/pagar/${slug}/exito` que matcheaba la página de éxito del CURSO
  // (`/pagar/[courseSlug]/exito`), y esa página redirigia a
  // `/dashboard` cuando no encontraba el curso por slug.
  const requestOrigin = new URL(req.url).origin;
  const baseExitoPath =
    productKind === "event"
      ? `/pagar/evento/${productRef.slug}/exito`
      : `/pagar/${productRef.slug}/exito`;
  const baseCancelPath =
    productKind === "event"
      ? `/pagar/evento/${productRef.slug}`
      : `/pagar/${productRef.slug}`;

  const defaultSuccessUrl = `${requestOrigin}${baseExitoPath}?session_id={CHECKOUT_SESSION_ID}`;
  const defaultCancelUrl = `${requestOrigin}${baseCancelPath}?cancelled=1`;
  const defaultPendingUrl = `${requestOrigin}${baseExitoPath}?status=pending`;

  const successUrl = resolveCheckoutUrl(
    body.successUrl,
    defaultSuccessUrl,
    requestOrigin,
    "successUrl"
  );
  const cancelUrl = resolveCheckoutUrl(
    body.cancelUrl,
    defaultCancelUrl,
    requestOrigin,
    "cancelUrl"
  );
  const pendingUrl = resolveCheckoutUrl(
    body.pendingUrl,
    defaultPendingUrl,
    requestOrigin,
    "pendingUrl"
  );

  // 4b. BECAS / CUPON 100% (FASE 2 V3): si course.priceMXN === 0, NO
  // creamos sesion de Stripe (que rechazaria amount=0 con 400 Invalid
  // amount). Otorgamos acceso inline con provider='scholarship_free',
  // auditable en DB, y redirigimos directo a /exito. Soporta cupones
  // futuros que lleven finalAmount a 0 tambien: si la aplicacion de
  // cupon resulta en 0, mismo flujo.
  if (productRef.priceMXN === 0) {
    try {
      const inlineResult = await grantScholarshipInline({
        supabase: createSupabaseAdminClient(),
        productRef,
        sessionUserId: session?.userId ?? null,
        sessionEmail: session?.email ?? null,
        method,
        successUrl,
      });
      return NextResponse.json({
        ok: true,
        provider: provider.name,
        flow: inlineResult.flow,
        redirectUrl: inlineResult.redirectUrl,
        paymentId: inlineResult.paymentId,
        externalReference: inlineResult.externalReference,
        status: inlineResult.status,
        finalAmountMXN: 0,
        discountMXN: 0,
        method,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[create-checkout] grantScholarshipInline error", {
        slug: body.slug,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "Error otorgando beca. Contactanos.",
          provider: provider.name,
        },
        { status: 500 },
      );
    }
  }

  try {
    // FIX 2026-07-18 (sprint Stripe Live prep): leer el modo de Stripe
    // del evento (event_rules.payment_mode). Default "test" si el
    // evento no tiene el flag o si no es un evento (cursos siempre
    // en test por ahora — solo eventos tienen el flujo dual).
    let stripeMode: "test" | "live" = "test";
    if (productKind === "event") {
      // Re-leemos el evento para obtener event_rules (el productRef
      // que tenemos ya tiene id, slug, title, priceMXN, pero NO
      // event_rules). Single query para no duplicar.
      const supabaseMode = createSupabaseAdminClient();
      const { data: ev } = await supabaseMode
        .from("events")
        .select("event_rules")
        .eq("id", productRef.id)
        .maybeSingle();
      const rules = (ev as { event_rules?: { payment_mode?: string } } | null)
        ?.event_rules;
      if (rules?.payment_mode === "live") {
        stripeMode = "live";
      }
    }

    const result = await provider.createCheckout({
      productRef,
      userId: session?.userId ?? null,
      userEmail: session?.email ?? "",
      method,
      successUrl,
      cancelUrl,
      pendingUrl,
      // FIX 2026-07-18: pasar confirmationId al provider para
      // serializarlo a `metadata.confirmation_id` en Stripe. El
      // webhook lo lee PRIMERO para atribuir el cargo a la
      // confirmation del bot (no al email del customer de Stripe).
      confirmationId: validatedConfirmationId,
      // FIX 2026-07-18: pasar el modo de Stripe (test o live) al
      // provider. Default "test" si no se setea (conservador).
      mode: stripeMode,
    });

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      flow: result.flow,
      redirectUrl: result.redirectUrl,
      instructions: result.instructions,
      paymentId: result.paymentId,
      externalReference: result.externalReference,
      status: result.status,
      finalAmountMXN: result.finalAmountMXN,
      discountMXN: result.discountMXN,
      method: result.method,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[create-checkout] provider error", {
      provider: provider.name,
      slug: body.slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Error iniciando el checkout. Probá de nuevo.",
        provider: provider.name,
      },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                   */
/* ------------------------------------------------------------------ */

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface GrantScholarshipArgs {
  supabase: AdminClient;
  productRef: ProductRef;
  sessionUserId: string | null;
  sessionEmail: string | null;
  method: PaymentMethod;
  successUrl: string;
}

interface GrantScholarshipResult {
  flow: "inline";
  redirectUrl: string;
  paymentId: string;
  externalReference: string;
  status: "approved";
}

/**
 * Beca 100% / cupon total: otorga acceso sin pasar por Stripe. Usado
 * cuando course.priceMXN === 0 o cuando un cupon futuro lleva a $0.
 * - Inserta payment con provider='scholarship_free' (auditable en DB).
 * - Otorga course_access con source='scholarship' + reason unique.
 * - Devuelve flow='inline' con redirectUrl a /exito (no a Stripe).
 *
 * IMPORTANTE: requiere userId. Si el guest no esta logueado y no
 * tenemos email para resolver via RPC, no podemos crear la cuenta
 * inline (eso lo hara el webhook tras un checkout normal). En ese caso
 * lanzamos un error que el caller traduce a 400 pidiendo que el usuario
 * se loguee o use el magic link. Workaround futuro: pedir email antes
 * de "pagar" cuando precio=0 y no hay sesion.
 */
async function grantScholarshipInline(
  args: GrantScholarshipArgs
): Promise<GrantScholarshipResult> {
  const { supabase, productRef, sessionUserId, sessionEmail, successUrl } = args;

  let userId = sessionUserId;
  if (!userId) {
    if (!sessionEmail) {
      throw new Error(
        "Beca sin email de usuario: no podemos crear la cuenta. Logueate o usá magic link antes de pagar."
      );
    }
    // Resolver user via RPC (FASE 2 V2). Si no existe, error explicito
    // pidiendo que el usuario se loguee primero. Las cuentas se crean
    // via signInWithOtp al recibir magic link — no las creamos nosotros
    // aca porque eso es responsabilidad de Supabase Auth.
    const { data: rpcId, error: rpcErr } = await supabase.rpc(
      "get_user_id_by_email",
      { p_email: sessionEmail }
    );
    if (rpcErr || !rpcId) {
      throw new Error(
        `No encontramos la cuenta para ${sessionEmail}. Logueate primero y volvé a intentar.`
      );
    }
    userId = rpcId as string;
  }

  // 1. Insert payment con provider=scholarship_free (auditable).
  //    Usamos idempotency_key unico por intento (no se reconcilia contra
  //    eventos externos). En casos reales, hash de (userId, courseId,
  //    timestamp_bucket_5min) previene doble click en UI.
  // FIX 2026-07-18 (audit): payments.metadata NO existe en DB.
  // Removemos el campo. La razon de scholarship queda en
  // external_reference (formato `scholarship_<userId>_<courseId>`).
  const paymentIdemKey = `scholarship:${userId}:${productRef.id}:${Date.now()}`;
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      course_id: productRef.id,
      amount_mxn: 0,
      currency: "MXN",
      provider: "scholarship_free",
      method: args.method,
      status: "approved",
      external_reference: `scholarship_${userId}_${productRef.id}`,
      idempotency_key: paymentIdemKey,
    })
    .select("id")
    .single();
  if (payErr || !payment) {
    throw new Error(
      `Error insertando payment scholarship: ${payErr?.message ?? "unknown"}`
    );
  }

  // 2. Grant course_access usando el helper canonico grantAccess().
  //    Esto evita reinventar el insert con field names incorrectos
  //    (access_source, granted_reason — el codigo previo usaba
  //    `source`/`reason` que no existen en el schema). El reason
  //    incluye timestamp truncado a minuto para que un doble-click
  //    no choque en el UNIQUE constraint.
  const grantedReason = `scholarship_free_${new Date()
    .toISOString()
    .slice(0, 16)}`;
  try {
    await grantAccess({
      userId,
      courseId: productRef.id,
      source: "scholarship",
      paymentId: payment.id,
      grantedReason,
    });
  } catch (grantErr) {
    // No fatal: el payment ya esta aprobado. Loggeamos y devolvemos OK
    // para que el user vea el dashboard. El grant puede llegar via
    // reconciliacion posterior si /dashboard muestra que no tiene access.
    // eslint-disable-next-line no-console
    console.error("[grantScholarshipInline] grantAccess fallo", {
      userId,
      courseId: productRef.id,
      error: grantErr instanceof Error ? grantErr.message : String(grantErr),
    });
  }

  // 3. successUrl viene con {CHECKOUT_SESSION_ID} que no aplica aca.
  //    Reemplazamos con session_id=scholarship para que /exito sepa que
  //    es un scholarship (no consulta Stripe, no llama getStatus).
  const redirectUrl = successUrl.replace("{CHECKOUT_SESSION_ID}", "scholarship");

  return {
    flow: "inline",
    redirectUrl,
    paymentId: payment.id,
    externalReference: `scholarship_${userId}_${productRef.id}`,
    status: "approved",
  };
}
