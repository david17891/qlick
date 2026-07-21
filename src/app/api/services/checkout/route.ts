/**
 * POST /api/services/checkout
 *
 * Crea un service_order desde el lado del cliente (form público en
 * /servicios/[slug]). El cliente llena sus datos + elige variant, y este
 * endpoint:
 *   1. Valida service + variant activos.
 *   2. Crea el order en status 'pending_contact' con paymentMode
 *      (default 'pending' para que el admin confirme, o 'test'/'stripe'
 *      según lo que el caller haya elegido).
 *   3. Auto-loga evento 'customer_contact' en la timeline.
 *   4. Best-effort: manda email al admin con los datos del pedido
 *      (reusa el patrón de Brevo de submitEventRegistration).
 *   5. Devuelve el order creado.
 *
 * Body esperado:
 *   {
 *     serviceSlug: string,
 *     variantSlug: string,
 *     customerName: string,
 *     customerEmail: string,
 *     customerPhone?: string,
 *     customerNotes?: string,
 *     paymentMode?: 'pending' | 'test' | 'stripe' | 'manual' | 'free',
 *     scheduledAt?: string  // ISO datetime, si service.requires_scheduling
 *   }
 *
 * Response OK (200):
 *   { ok: true, order: ServiceOrder, orderNumber: 'QO-2026-0001' }
 *
 * Errores:
 *   - 400: body inválido / service o variant no encontrado / scheduling faltante
 *   - 429: rate limit per-IP excedido
 *   - 500: error de DB
 *   - 501: Supabase no configurado
 *
 * Rate limit: 5 req/min per IP. Mismo helper que create-checkout de
 * cursos/eventos (defense contra spam de orders).
 */

import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/services";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { recordAndCheckRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { sendOrderNotificationToAdmin } from "@/lib/email/service-order-notification";
import type { CreateCheckoutInput } from "@/types/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function asPaymentMode(v: unknown): CreateCheckoutInput["paymentMode"] {
  if (v === "test" || v === "stripe" || v === "manual" || v === "free") return v;
  return "pending";
}

export async function POST(req: NextRequest) {
  // 0. Rate limit per-IP (5 req/min).
  const clientIp = getClientIp(req);
  const rl = recordAndCheckRateLimit(`services_checkout:${clientIp}`, {
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
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }

  // 1. Parse body.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body inválido (JSON requerido)." },
      { status: 400 },
    );
  }

  if (
    !isString(body.serviceSlug) ||
    !isString(body.variantSlug) ||
    !isString(body.customerName) ||
    !isString(body.customerEmail)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Faltan datos requeridos: serviceSlug, variantSlug, customerName, customerEmail.",
      },
      { status: 400 },
    );
  }

  // Validación de email básica (no reemplazamos validación completa del server,
  // pero evitamos basura obvia).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail)) {
    return NextResponse.json(
      { ok: false, error: "Email del cliente no es válido." },
      { status: 400 },
    );
  }

  const input: CreateCheckoutInput = {
    serviceSlug: body.serviceSlug,
    variantSlug: body.variantSlug,
    customerName: body.customerName.trim(),
    customerEmail: body.customerEmail.trim().toLowerCase(),
    customerPhone: isString(body.customerPhone) ? body.customerPhone : undefined,
    customerNotes: isString(body.customerNotes) ? body.customerNotes : undefined,
    paymentMode: asPaymentMode(body.paymentMode),
    scheduledAt: isString(body.scheduledAt) ? body.scheduledAt : undefined,
  };

  // 2. Crear el order (validación de service/variant dentro).
  const result = await createOrder(input, null);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error.includes("no existe") ? 404 : 400 },
    );
  }

  // 3. Best-effort: notificar al admin por email.
  // No bloquea el flow principal; el admin también ve el order en el panel.
  // Fire-and-forget.
  void sendOrderNotificationToAdmin({
    order: result.data,
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[services/checkout] email notification error", {
      orderNumber: result.data.orderNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({
    ok: true,
    order: result.data,
    orderNumber: result.data.orderNumber,
  });
}
