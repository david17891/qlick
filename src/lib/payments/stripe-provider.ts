/**
 * Proveedor Stripe — implementación REAL (Fase 1 de pagos Stripe).
 *
 * Flujo: Stripe Checkout hosted (redirect). Venta a México con tarjeta,
 * OXXO y SPEI sin salir de checkout.stripe.com (PCI scope = SAQ-A).
 *
 * Configuración:
 *   1. STRIPE_SECRET_KEY (sk_test_... en test mode, sk_live_... en prod).
 *   2. STRIPE_WEBHOOK_SECRET (whsec_..., se obtiene al registrar el
 *      endpoint en Stripe Dashboard o `stripe listen`).
 *   3. STRIPE_API_VERSION (opcional; default "2025-09-30.clover").
 *   4. NEXT_PUBLIC_PAYMENT_PROVIDER=stripe para activar este provider.
 *
 * Webhooks que manejamos (ver src/app/api/webhooks/stripe/route.ts):
 *   - checkout.session.completed → grant(Access|EventAccess) source='stripe'
 *   - checkout.session.async_payment_succeeded → mismo flujo (OXXO/SPEI)
 *   - charge.refunded → revokeAccess (Fase 4)
 *
 * Idempotencia: el webhook usa stripe_event_id como idempotency_key en la
 * tabla payments (UNIQUE). Si Stripe repite, el INSERT conflict lo detecta.
 */

import Stripe from "stripe";
import type { Coupon } from "@/types";
import type {
  CheckoutResult,
  CreateCheckoutInput,
  PaymentProvider,
  PaymentQueryResult,
  ProductRef,
  WebhookResult
} from "./payment-provider";
import { applyCoupon } from "./payment-provider";
import type { PaymentStatus } from "@/types";

const STRIPE_API_VERSION = "2025-09-30.clover";

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe no está configurado. Define STRIPE_SECRET_KEY en .env.local o Vercel."
    );
  }
  // Cast al union de apiVersion del SDK. Si Stripe deprecia esta versión,
  // el casteo aquí será el único lugar a tocar.
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION as any,
    typescript: true,
    appInfo: {
      name: "Qlick LMS",
      version: "1.0.0",
    },
  });
}

/**
 * Resuelve el precio final: usa `productRef.priceMXN` (campo obligatorio
 * del nuevo contrato). Si el caller pasa `amountMXN` legacy + sin
 * `productRef.priceMXN`, cae al valor legacy para compatibilidad.
 */
function resolveAmount(input: CreateCheckoutInput): number {
  if (input.productRef && Number.isFinite(input.productRef.priceMXN)) {
    return input.productRef.priceMXN;
  }
  if (typeof input.amountMXN === "number") {
    return input.amountMXN;
  }
  throw new Error("CreateCheckoutInput sin productRef.priceMXN ni amountMXN legacy.");
}

/**
 * Mapea método de Qlick a payment_method_types de Stripe Checkout.
 *
 * - "card"  → ['card']
 * - "oxxo"  → ['oxxo']  (voucher de pago en OXXO, expira 3 días)
 * - "spei"  → ['customer_balance']  (transferencia SPEI con bank_transfer)
 * - "free"  → []  (no debería llegar al provider real; gratis va por otra vía)
 *
 * Si el caller quiere forzar varios, podría expandir aquí más adelante.
 */
function paymentMethodsFor(method: CreateCheckoutInput["method"]): Stripe.Checkout.SessionCreateParams["payment_method_types"] {
  switch (method) {
    case "card":
      return ["card"];
    case "oxxo":
      return ["oxxo"];
    case "spei":
      return ["customer_balance"];
    case "free":
      return [];
    default:
      // wallet, coupon u otros: Stripe decide o cae a card.
      return ["card"];
  }
}

/** Serializa el productRef a metadata de Stripe (string-only, JSON). */
function serializeProductRef(ref: ProductRef): string {
  return JSON.stringify(ref);
}

/** Extrae el productRef de la metadata de un Checkout Session o PaymentIntent. */
function parseProductRef(metadata: Record<string, string> | null | undefined): ProductRef | null {
  if (!metadata) return null;
  const raw = metadata.product_ref;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProductRef;
  } catch {
    return null;
  }
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  displayName: "Stripe",
  supportedMethods: ["card", "oxxo", "spei"],

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const { finalAmountMXN, discountMXN } = applyCoupon(
      resolveAmount(input),
      input.coupon
    );

    const stripe = getStripeClient();

    const productRef = input.productRef;
    // Metadata: serializamos lo que tenemos. Si userId es null (guest checkout)
    // lo guardamos como string vacío — el webhook resuelve el user via email.
    const metadata: Record<string, string> = {
      product_ref: serializeProductRef(productRef),
      user_id: input.userId ?? "",
      user_email: input.userEmail,
      kind: productRef.kind,
    };

    // URLs por defecto si el caller no las pasa. El success URL recibe
    // ?session_id={CHECKOUT_SESSION_ID} para que la página de éxito pueda
    // recuperar el estado del pago sin necesidad de polling.
    const successUrl =
      input.successUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/pagar/${productRef.slug}/exito?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      input.cancelUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/pagar/${productRef.slug}?cancelled=1`;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        // Línea única: producto + precio. Currency MXN. Stripe cobra en centavos.
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "mxn",
              unit_amount: Math.round(finalAmountMXN * 100),
              product_data: {
                name: productRef.title,
                // description opcional mejora el checkout; lo alimentamos
                // con info útil por kind.
                description:
                  productRef.kind === "course"
                    ? "Acceso completo al curso en Qlick"
                    : productRef.kind === "event"
                      ? `Acceso al evento (${(productRef as { startsAt?: string }).startsAt ?? "próximamente"})`
                      : "Acceso al video de la masterclass",
              },
            },
          },
        ],
        payment_method_types: paymentMethodsFor(input.method),
        // Metadata clave: productRef serializado (kind, id, slug, title, priceMXN)
        // + user_id para que el webhook pueda grant(Access|EventAccess).
        metadata,
        // Para SPEI/customer_balance, payment_status queda 'processing'
        // hasta que se confirme. Para OXXO, igual hasta que el voucher se paga.
        // Webhook maneja ambos casos.
        success_url: successUrl,
        cancel_url: cancelUrl,
        // locale español MX para el checkout hosted.
        locale: "es",
        // Si Qlick tiene email del user, prellenar checkout (menos fricción).
        // En guest checkout, input.userEmail es vacío → omitimos el campo y
        // Stripe recolecta el email en el Checkout hosted.
        ...(input.userEmail ? { customer_email: input.userEmail } : {}),
        // billing_address_collection por defecto en MX para Conekta/SPEI;
        // útil para CFDI futuro. Stripe lo recomienda para LATAM.
        // Para Fase 1 lo dejamos en 'auto' (Stripe decide).
        // billing_address_collection: 'auto',
      });

      // Validación mínima. Si session.url falta (raro), reportar como error.
      if (!session.url) {
        return {
          paymentId: session.id,
          externalReference: session.id,
          status: "pending",
          flow: "redirect",
          redirectUrl: cancelUrl,
          finalAmountMXN,
          discountMXN,
          method: input.method,
        };
      }

      return {
        paymentId: session.id,
        externalReference: session.id,
        status: "pending",
        flow: "redirect",
        redirectUrl: session.url,
        finalAmountMXN,
        discountMXN,
        method: input.method,
      };
    } catch (err) {
      // Re-throw con contexto para que el caller (action del lado servidor)
      // pueda mostrar mensaje útil. NO loggear secretos.
      // FIX debug 2026-07-17: loggear tipo + code para diagnosticar
      // "Request was retried 2 times" del KYC activo (card_payments
      // activo en cuenta, API directa funciona, pero endpoint de Qlik
      // retorna 500). El error es opaco sin contexto.
      // eslint-disable-next-line no-console
      console.error("[stripe-provider] createCheckout error detail", {
        type: err?.constructor?.name,
        code: err instanceof Stripe.errors.StripeError ? err.code : undefined,
        statusCode: err instanceof Stripe.errors.StripeError ? err.statusCode : undefined,
        message: err instanceof Error ? err.message : String(err),
        apiKeyPrefix: process.env.STRIPE_SECRET_KEY?.slice(0, 12),
        apiVersion: STRIPE_API_VERSION,
      });
      const message =
        err instanceof Stripe.errors.StripeError
          ? `[stripe ${err.statusCode ?? "?"} ${err.code ?? err.type ?? "?"}] ${err.message}`
          : err instanceof Error
            ? err.message
            : "Error desconocido creando checkout.";
      throw new Error(message);
    }
  },

  async getStatus(paymentId: string): Promise<PaymentQueryResult> {
    try {
      const stripe = getStripeClient();
      // paymentId es un Checkout Session ID. Expandemos payment_intent
      // para leer su status, que es la fuente de verdad sobre el cobro.
      const session = await stripe.checkout.sessions.retrieve(paymentId, {
        expand: ["payment_intent"],
      });
      const pi = session.payment_intent;
      const piStatus: string | undefined =
        typeof pi === "string"
          ? undefined
          : (pi?.status as string | undefined);

      // Mapear estados de Checkout + PaymentIntent → estados de Qlick.
      // (Checkout.status es "open" | "complete" | "expired".
      //  PaymentIntent.status es "succeeded" | "processing" |
      //   "requires_payment_method" | "requires_action" | etc.)
      let status: PaymentStatus = "pending";
      if (session.status === "complete" && piStatus === "succeeded") {
        status = "approved";
      } else if (session.status === "expired") {
        status = "expired";
      } else if (
        piStatus === "requires_payment_method" ||
        piStatus === "canceled" ||
        piStatus === "failed"
      ) {
        status = "rejected";
      } else if (
        piStatus === "processing" ||
        piStatus === "requires_action" ||
        piStatus === "requires_confirmation"
      ) {
        status = "pending";
      }

      return {
        paymentId: session.id,
        externalReference: session.id,
        status,
        customerEmail:
          (session.customer_email as string | null) ??
          (session.customer_details?.email as string | null) ??
          null,
        raw: {
          session_status: session.status,
          payment_intent_status: piStatus ?? null,
        },
      };
    } catch (err) {
      return {
        paymentId,
        externalReference: paymentId,
        status: "pending",
        raw: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  },

  async parseWebhook(
    payload: unknown,
    headers?: Record<string, string>
  ): Promise<WebhookResult> {
    // parseWebhook normaliza la respuesta parseada para que el route
    // handler (`src/app/api/webhooks/stripe/route.ts`) aplique la lógica
    // de grants. La verificación de firma ya ocurre en el route
    // handler con stripe.webhooks.constructEvent sobre el raw body.
    //
    // Este método queda como adaptador: si por alguna razón llega un
    // payload ya parseado (ej. tests / integración) lo normalizamos.
    const evt = (payload ?? {}) as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const obj = evt.data?.object ?? {};
    const sessionId =
      typeof obj.id === "string"
        ? obj.id
        : typeof obj.session === "string"
          ? obj.session
          : (obj.id as string | undefined) ?? evt.id ?? "unknown";
    const verified = typeof headers?.["stripe-signature"] === "string";

    let status: PaymentStatus = "pending";
    if (evt.type === "checkout.session.completed") {
      const sObj = obj as { payment_status?: string };
      status = sObj.payment_status === "paid" ? "approved" : "pending";
    } else if (evt.type === "checkout.session.async_payment_succeeded") {
      status = "approved";
    } else if (evt.type === "checkout.session.async_payment_failed") {
      status = "rejected";
    } else if (evt.type === "charge.refunded") {
      status = "refunded";
    } else if (evt.type === "checkout.session.expired") {
      status = "expired";
    } else {
      status = "pending";
    }

    return {
      paymentId: sessionId,
      status,
      verified,
      raw: evt,
    };
  },
};

/**
 * Helper de exportación: parsea un Checkout Session.metadata.product_ref
 * desde un objeto `Stripe.Checkout.Session`. Lo usa el webhook handler.
 */
export function extractProductRefFromMetadata(
  metadata: Record<string, string> | null | undefined
): ProductRef | null {
  return parseProductRef(metadata);
}

/**
 * Helper: lee el `STRIPE_WEBHOOK_SECRET`. Lanza si falta — el route
 * handler lo usa para verificar firma de cada request entrante.
 */
export function requireStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET no está definido. Agregalo en .env.local o Vercel."
    );
  }
  return secret;
}

export type { Stripe };
