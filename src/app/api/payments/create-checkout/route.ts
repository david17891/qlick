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
 * SCOPE: solo cursos en esta versión. Eventos/masterclass requieren agregar
 * `price_mxn` a la tabla `events` (migration pendiente) antes de poder usar
 * este endpoint.
 *
 * DEV/PROD: este endpoint NO está bajo /api/dev/ — el provider "mock" lo usa
 * también pero el endpoint es legítimo en prod (es solo que el provider
 * configurado será stripe, no mock).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { checkCourseAccess } from "@/lib/lms/entitlements";
import { getPaymentProvider } from "@/lib/payments";
import type { ProductRef } from "@/lib/payments/payment-provider";
import type { PaymentMethod } from "@/types";

// Forzar Node.js (Stripe SDK + Supabase necesitan Node APIs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateCheckoutBody {
  slug?: unknown;
  method?: unknown;
}

const VALID_METHODS: PaymentMethod[] = ["card", "oxxo", "spei"];

function isValidMethod(m: unknown): m is PaymentMethod {
  return typeof m === "string" && VALID_METHODS.includes(m as PaymentMethod);
}

export async function POST(req: NextRequest) {
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

  const method: PaymentMethod = isValidMethod(body.method) ? body.method : "card";

  // 3. Resolver el curso por slug.
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

// Idempotencia: si ya tiene access activo y hay sesión, no dejamos pagar
  // dos veces. Sin sesión (guest) no podemos chequear, así que dejamos que
  // el webhook detecte duplicados via metadata.user_id cuando se resuelva.
  if (session) {
    const access = await checkCourseAccess(session.userId, course.id);
    if (access.hasAccess) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ya tenés acceso a este curso.",
          alreadyPaid: true,
        },
        { status: 409 }
      );
    }
  }

  const productRef: ProductRef = {
    kind: "course",
    id: course.id,
    slug: course.slug,
    title: course.title,
    priceMXN: course.priceMXN ?? 0,
  };

  // 4. Crear el checkout en el provider activo.
  const provider = getPaymentProvider();

  // success/cancel URLs: armamos URLs absolutas usando el origin del request
  // actual. Funciona en local (localhost:3000), preview (hash.vercel.app) y
  // prod (qlick.digital) sin depender de NEXT_PUBLIC_APP_URL (que no está
  // seteado en Preview). Stripe API rechaza URLs relativas con "Not a valid
  // URL", por eso armamos el absoluto acá.
  const requestOrigin = new URL(req.url).origin;
  const successUrl = `${requestOrigin}/pagar/${productRef.slug}/exito?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${requestOrigin}/pagar/${productRef.slug}?cancelled=1`;
  const pendingUrl = `${requestOrigin}/pagar/${productRef.slug}/exito?status=pending`;

  try {
    const result = await provider.createCheckout({
      productRef,
      userId: session?.userId ?? null,
      userEmail: session?.email ?? "",
      method,
      successUrl,
      cancelUrl,
      pendingUrl,
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