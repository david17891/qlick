/**
 * POST /api/admin/orders/[id]/payment-link
 *
 * FIX 2026-07-21 (sprint pago con tarjeta en servicios FASE 8 follow-up):
 * genera un Stripe Checkout Session para un `service_order` existente y
 * devuelve la URL. David (admin) pega esa URL en WhatsApp o email y el
 * cliente paga desde la página hosted de Stripe.
 *
 * Flujo end-to-end:
 *   1. Admin marca el order como "buen lead" en /admin/orders/[id].
 *   2. Admin hace click en "Generar link de pago" → POST a este endpoint.
 *   3. Backend resuelve order → service + variant. Llama a
 *      stripeProvider.createCheckout() con `kind: "service"`.
 *   4. Backend actualiza el order: `payment_mode='stripe'`,
 *      `payment_reference=<session_id>`.
 *   5. Auto-loga `customer_contact` o `email_sent` event con
 *      `payload.link_sent: true` (auditoría).
 *   6. Devuelve `{ redirectUrl, paymentId, orderNumber }`.
 *   7. Admin pega la URL en WhatsApp/email y la manda al cliente.
 *   8. Cliente paga en checkout.stripe.com.
 *   9. Stripe webhook actualiza order: `payment_mode='stripe'`,
 *      `status='contacted'`, `payment_reference=<session_id>`. Auto-log
 *      de evento `payment_received` en timeline.
 *
 * Si el order ya tiene un `payment_reference` activo (link sin pagar),
 * regeneramos: el admin decide si manda el nuevo o el viejo. El admin
 * puede ver el viejo en la timeline del order.
 *
 * AUTH: admin-only (ADMIN_EMAIL_ALLOWLIST).
 *
 * Body: ninguno.
 * Response 200: { ok: true, redirectUrl, paymentId, orderNumber }
 * Response 400: order no es de un service / status cancelled / etc.
 * Response 404: order no existe
 * Response 500: error de Stripe
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getOrderById, updateOrder } from "@/lib/services";
import { getServiceBySlug } from "@/lib/services";
import { getPaymentProvider } from "@/lib/payments";
import { addOrderEvent } from "@/lib/services/orders-server";
import type { ProductRefService } from "@/lib/payments/payment-provider";
import { recordAndCheckRateLimit, getClientIp } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 0. Auth admin
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autorizado. Se requiere sesión de admin." },
      { status: 401 }
    );
  }

  // 0b. Rate limit per admin (5/min). Defensa contra click-spam que
  //     genera sesiones de Stripe huérfanas (cada una cuenta para quota).
  const ip = getClientIp(req);
  const rl = recordAndCheckRateLimit(`payment_link:${admin.email}`, {
    maxCalls: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Demasiadas solicitudes. Intentá en un minuto." },
      { status: 429 }
    );
  }

  // 1. Resolver el order
  const order = await getOrderById(params.id);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: `Pedido ${params.id} no existe.` },
      { status: 404 }
    );
  }

  // 2. Validar que el order está en un estado donde tiene sentido generar link
  if (order.status === "cancelled" || order.status === "closed") {
    return NextResponse.json(
      {
        ok: false,
        error: `El pedido está en estado '${order.status}'. No se puede cobrar.`,
      },
      { status: 400 }
    );
  }
  if (order.status === "delivered") {
    return NextResponse.json(
      {
        ok: false,
        error: "El pedido ya fue entregado (pagado + completado). No regenerar link.",
      },
      { status: 400 }
    );
  }
  if (order.paymentStatus === "paid") {
    return NextResponse.json(
      {
        ok: false,
        error: "El pedido ya tiene un pago confirmado. No se debe generar otro link.",
      },
      { status: 409 },
    );
  }

  // 3. Resolver el service + variant por slug (que ya tenemos en order.service.slug
  //    y order.variant.slug).
  const service = await getServiceBySlug(order.service.slug);
  if (!service) {
    return NextResponse.json(
      {
        ok: false,
        error: `Servicio '${order.service.slug}' no existe.`,
      },
      { status: 404 }
    );
  }
  const variant = service.variants.find((v) => v.id === order.variantId);
  if (!variant) {
    return NextResponse.json(
      {
        ok: false,
        error: `Variante del pedido no existe en el servicio.`,
      },
      { status: 404 }
    );
  }

  // 4. Construir productRef
  const productRef: ProductRefService = {
    kind: "service",
    id: service.id,
    slug: service.slug,
    title: service.displayName,
    priceMXN: variant.priceMXN,
    orderId: order.id,
    customerEmail: order.customerEmail,
  };

  // 5. Llamar al provider de Stripe. Solo Stripe soporta este flow
  //    (mock/conekta/mercadopago no tienen equivalente de 'generar link
  //    para order existente' — su flujo es distinto).
  const provider = getPaymentProvider();
  if (provider.name !== "stripe") {
    return NextResponse.json(
      {
        ok: false,
        error: `Provider activo es '${provider.name}'. Este endpoint solo funciona con Stripe. Cambia NEXT_PUBLIC_PAYMENT_PROVIDER=stripe.`,
      },
      { status: 400 }
    );
  }

  let checkoutResult;
  try {
    checkoutResult = await provider.createCheckout({
      productRef,
      userId: null, // guest checkout — el webhook usa email
      userEmail: order.customerEmail,
      method: "card",
      // Retornos explícitos: el provider también tiene defaults, pero el
      // endpoint admin debe conservar el order_id para mostrar el resultado
      // del cobro y no depender del slug público.
      successUrl: `${new URL(req.url).origin}/servicios/${order.service.slug}?paid=1&order_id=${encodeURIComponent(order.id)}`,
      cancelUrl: `${new URL(req.url).origin}/servicios/${order.service.slug}?cancelled=1&order_id=${encodeURIComponent(order.id)}`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? `Error creando link de Stripe: ${err.message}`
            : "Error creando link de Stripe.",
      },
      { status: 500 }
    );
  }

  if (checkoutResult.flow !== "redirect" || !checkoutResult.redirectUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Stripe no devolvió una URL de redirect. Reintentá.",
      },
      { status: 500 }
    );
  }

  // 6. Actualizar el order con el session_id (para que el webhook lo
  //    encuentre cuando el cliente pague).
  const updateResult = await updateOrder(
    order.id,
    {
      paymentMode: "stripe",
      // Guardamos el session_id en payment_reference. El webhook lo lee
      // via metadata.product_ref y actualiza el order. NO tocamos status
      // aquí — sigue en "pending_contact" hasta que el webhook confirme
      // el pago y avance a "contacted".
    },
    admin.email
  );
  if (!updateResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Link creado en Stripe pero no se pudo actualizar el pedido: ${updateResult.error}`,
      },
      { status: 500 }
    );
  }

  // 7. Persistir el session_id como payment_reference via un PATCH
  //    dedicado. updateOrder() no acepta paymentReference en su input
  //    shape (FIX histórico: solo algunos campos). Hacemos un UPDATE
  //    crudo para no romper el contrato.
  //    NOTA: paymentReference sí está en UpdateOrderInput. Verifico
  //    que el patch lo aplicó... El set arriba solo seteó paymentMode.
  //    Necesito un segundo call para paymentReference.
  const updateRefResult = await updateOrder(
    order.id,
    {
      paymentReference: checkoutResult.paymentId, // session_id de Stripe
    },
    admin.email
  );
  if (!updateRefResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Link creado en Stripe pero no se pudo guardar payment_reference: ${updateRefResult.error}`,
      },
      { status: 500 }
    );
  }

  // 8. Auto-log: evento en la timeline del pedido
  await addOrderEvent(order.id, {
    type: "email_sent", // reusamos el tipo existente (el más cercano semánticamente)
    actorId: admin.email,
    actorType: "admin",
    payload: {
      kind: "payment_link_generated",
      paymentId: checkoutResult.paymentId,
      amountMXN: checkoutResult.finalAmountMXN,
      method: checkoutResult.method,
      provider: provider.name,
    },
  });

  return NextResponse.json({
    ok: true,
    redirectUrl: checkoutResult.redirectUrl,
    paymentId: checkoutResult.paymentId,
    orderNumber: order.orderNumber,
    finalAmountMXN: checkoutResult.finalAmountMXN,
    currency: "MXN",
  });
}
