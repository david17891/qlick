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

/**
 * FIX 2026-07-18 (sprint Stripe Live prep): modo de Stripe.
 *
 * - "test"  → usa STRIPE_SECRET_KEY (test mode). Default. Sin cargo real.
 * - "live"  → usa STRIPE_SECRET_KEY_LIVE (live mode). Cargo real a tarjeta.
 *
 * El caller elige el modo en funcion del evento:
 *   - eventos sin flag o con event_rules.payment_mode = "test" -> test
 *   - eventos con event_rules.payment_mode = "live"        -> live
 *
 * Default conservador: "test". Si la env var de live no esta seteada
 * pero el caller pide live, el provider tira error explicito.
 */
export type StripeMode = "test" | "live";

/**
 * FIX 2026-07-18 (sprint Stripe Live prep): 2 clientes Stripe.
 *
 * Stripe permite tener test y live activos en paralelo: cada uno usa
 * su propio par de keys. Documentacion oficial:
 *   https://docs.stripe.com/keys#sandbox-versus-live-mode
 *
 * - `getStripeClientTest()` lee `STRIPE_SECRET_KEY` (sk_test_*).
 * - `getStripeClientLive()` lee `STRIPE_SECRET_KEY_LIVE` (sk_live_*).
 *
 * El wrapper `getStripeClient(mode?)` mantiene backward compat: si
 * no se pasa mode, retorna el cliente de test (default seguro).
 */
function makeClient(key: string): Stripe {
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

function getStripeClientTest(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe test no está configurado. Define STRIPE_SECRET_KEY en .env.local o Vercel."
    );
  }
  return makeClient(key);
}

function getStripeClientLive(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY_LIVE;
  if (!key) {
    throw new Error(
      "Stripe live no está configurado. Define STRIPE_SECRET_KEY_LIVE en Vercel (sk_live_*) para usar este modo."
    );
  }
  return makeClient(key);
}

export function getStripeClient(mode: StripeMode = "test"): Stripe {
  return mode === "live" ? getStripeClientLive() : getStripeClientTest();
}

/**
 * Backward compat: callers viejos que importan `getStripeClient()` sin
 * argumento siguen funcionando. Devuelve el cliente de test (default).
 */
function _legacyGetStripeClient(): Stripe {
  return getStripeClientTest();
}

/**
 * Resuelve el precio final: usa `productRef.priceMXN` (campo obligatorio
 * del nuevo contrato). Si el caller pasa `amountMXN` legacy + sin
 * `productRef.priceMXN`, cae al valor legacy para compatibilidad.
 */
function resolveAmount(input: CreateCheckoutInput): number {
  if (
    input.productRef &&
    typeof input.productRef.chargeAmountMXN === "number" &&
    Number.isFinite(input.productRef.chargeAmountMXN)
  ) {
    return input.productRef.chargeAmountMXN;
  }
  if (input.productRef && Number.isFinite(input.productRef.priceMXN)) {
    return input.productRef.priceMXN;
  }
  if (typeof input.amountMXN === "number") {
    return input.amountMXN;
  }
  throw new Error("CreateCheckoutInput sin productRef.priceMXN ni amountMXN legacy.");
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

    // FIX 2026-07-18 (sprint Stripe Live prep): elegir el cliente
    // (test o live) segun el modo del input. Default: "test".
    // El caller (create-checkout route) decide el modo leyendo
    // event.event_rules.payment_mode del evento.
    const mode: StripeMode = input.mode === "live" ? "live" : "test";
    const stripe = getStripeClient(mode);

    const productRef = input.productRef;
    // Metadata: serializamos lo que tenemos. Si userId es null (guest checkout)
    // lo guardamos como string vacío — el webhook resuelve el user via email.
    const metadata: Record<string, string> = {
      product_ref: serializeProductRef(productRef),
      user_id: input.userId ?? "",
      user_email: input.userEmail,
      kind: productRef.kind,
      // Stripe recomienda Dynamic Payment Methods: la disponibilidad real
      // (tarjeta/OXXO/SPEI) se configura en Dashboard y no se congela en
      // `payment_method_types`. Conservamos la preferencia para auditoría.
      requested_payment_method: input.method,
      payment_purpose: productRef.paymentPurpose ?? "full",
      // FIX 2026-07-18: persistir el modo en metadata del session
      // para que el webhook sepa con qué Stripe client (test o live)
      // tiene que verificar la firma + leer el payment.
      payment_mode: mode,
    };
    // FIX 2026-07-18 (sprint atribución de pagos, David "el link de pago
    // es generico"): si el caller pasa confirmationId, lo serializamos
    // a `metadata.confirmation_id` para que el webhook pueda atribuir
    // el cargo a una confirmation específica del bot (en vez de buscar
    // por email del customer, que puede no coincidir). Solo relevante
    // para eventos; cursos lo ignoran.
    if (input.confirmationId) {
      metadata.confirmation_id = input.confirmationId;
    }

    // URLs por defecto si el caller no las pasa. El success URL recibe
    // ?session_id={CHECKOUT_SESSION_ID} para que la página de éxito pueda
    // recuperar el estado del pago sin necesidad de polling.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const successPath =
      productRef.kind === "event"
        ? `/pagar/evento/${productRef.slug}/exito`
        : productRef.kind === "service"
          ? `/servicios/${productRef.slug}`
          : `/pagar/${productRef.slug}/exito`;
    const cancelPath =
      productRef.kind === "event"
        ? `/pagar/evento/${productRef.slug}`
        : productRef.kind === "service"
          ? `/servicios/${productRef.slug}`
          : `/pagar/${productRef.slug}`;
    const successUrl =
      input.successUrl ??
      `${appUrl}${successPath}?${productRef.kind === "service" ? "paid=1&order_id=" + productRef.orderId : "session_id={CHECKOUT_SESSION_ID}"}`;
    const cancelUrl =
      input.cancelUrl ?? `${appUrl}${cancelPath}?cancelled=1`;

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
                      ? productRef.paymentPurpose === "reservation"
                        ? `Apartado de $${(productRef.chargeAmountMXN ?? productRef.priceMXN).toLocaleString("es-MX")} MXN. Precio total del evento: $${productRef.priceMXN.toLocaleString("es-MX")} MXN.`
                        : `Acceso al evento (${(productRef as { startsAt?: string }).startsAt ?? "próximamente"})`
                      : productRef.kind === "service"
                        ? "Servicio contratado con Qlick Marketing Digital"
                        : "Acceso al video de la masterclass",
              },
            },
          },
        ],
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

  async getStatus(
    paymentId: string,
    requestedMode?: StripeMode
  ): Promise<PaymentQueryResult> {
    try {
      // Los IDs de Checkout contienen el modo (`cs_live_`/`cs_test_`).
      // Nunca consultar una sesión live con el cliente test por defecto.
      const mode: StripeMode =
        requestedMode ?? (paymentId.startsWith("cs_live_") ? "live" : "test");
      const stripe = getStripeClient(mode);
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
 * Helper: lee el `STRIPE_WEBHOOK_SECRET` (test). Lanza si falta.
 *
 * Backward compat: callers viejos que importan este helper siguen
 * funcionando. Para el nuevo flujo dual (test + live simultaneos),
 * ver `verifyStripeWebhookSignature()` abajo.
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

/**
 * FIX 2026-07-18 (sprint Stripe Live prep): el webhook endpoint puede
 * recibir requests firmadas con CUALQUIERA de los 2 secrets:
 *   - `STRIPE_WEBHOOK_SECRET` (test mode, del webhook configurado en
 *     Stripe dashboard en test mode).
 *   - `STRIPE_WEBHOOK_SECRET_LIVE` (live mode, del webhook en live).
 *
 * Stripe permite tener 2 webhooks apuntando al mismo endpoint con
 * diferentes secrets. El codigo intenta con cada uno y retorna el
 * evento + el modo correspondiente. Si ninguno verifica, rechaza.
 *
 * Documentacion oficial: https://docs.stripe.com/webhooks#verify-official-libraries
 */
export type WebhookVerifyOutcome = {
  event: import("stripe").default.Event;
  mode: StripeMode;
};

/**
 * Verifica la firma del webhook probando ambos secrets.
 *
 * @param rawBody - body crudo del request (debe ser exactamente lo
 *                  que Stripe envio, NO JSON.parseado, porque la
 *                  firma se calcula sobre el body literal).
 * @param signature - valor del header `stripe-signature`.
 * @param tolerance - ventana de tolerancia de timestamp en segundos
 *                    (default 300 = 5 min, default de Stripe SDK).
 * @returns evento verificado + el modo (test | live) que verifico.
 * @throws si la firma no verifica con ninguno de los 2 secrets.
 */
export async function verifyStripeWebhookSignature(
  rawBody: string,
  signature: string,
  tolerance: number = 300
): Promise<WebhookVerifyOutcome> {
  const candidates: { mode: StripeMode; secret: string | undefined }[] = [
    { mode: "test", secret: process.env.STRIPE_WEBHOOK_SECRET },
    { mode: "live", secret: process.env.STRIPE_WEBHOOK_SECRET_LIVE },
  ];

  const Stripe = (await import("stripe")).default;
  const lastErrs: unknown[] = [];
  for (const { mode, secret } of candidates) {
    if (!secret) continue;
    try {
      // Crea un cliente de Stripe con apiVersion solo para verificar firma.
      // No importa el key aqui, lo importante es el secret.
      const stripe = new Stripe(
        process.env.STRIPE_SECRET_KEY ??
        process.env.STRIPE_SECRET_KEY_LIVE ??
          "sk_test_placeholder",
        {
          apiVersion: STRIPE_API_VERSION as never,
        },
      );
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        secret,
        tolerance
      );
      return { event, mode };
    } catch (err) {
      lastErrs.push({ mode, err: err instanceof Error ? err.message : String(err) });
    }
  }

  // Si llegamos aqui, ninguno verifico.
  const errsSummary = lastErrs
    .map((e) => (e as { mode: string; err: string }).mode + ": " + (e as { mode: string; err: string }).err)
    .join(" | ");
  throw new Error(
    `Webhook signature did not verify. Tried: ${errsSummary || "no secrets configured"}`
  );
}

export type { Stripe };
