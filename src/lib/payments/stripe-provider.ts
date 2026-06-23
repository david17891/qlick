/**
 * Proveedor Stripe — STUB.
 *
 * Stripe ofrece tarjetas, OXXO y SPEI en México, además de un panel robusto,
 * webhooks y 3DS. Es una opción flexible cuando se quiere escalar a otros países.
 *
 * ESTE ARCHIVO ES UN STUB. La implementación real queda para la Fase 2.
 * Para activarla:
 *   1. npm i stripe @stripe/stripe-js
 *   2. Configurar STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET.
 *   3. Implementar createCheckout con stripe.checkout.sessions.create.
 *   4. Implementar parseWebhook con stripe.webhooks.constructEvent.
 *   5. Cambiar NEXT_PUBLIC_PAYMENT_PROVIDER=stripe
 *
 * Ver docs/PAYMENTS_MEXICO_STRATEGY.md.
 */

import type { PaymentStatus } from "@/types";
import type {
  CheckoutResult,
  CreateCheckoutInput,
  PaymentProvider,
  PaymentQueryResult,
  WebhookResult
} from "./payment-provider";
import { applyCoupon } from "./payment-provider";

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  displayName: "Stripe",
  supportedMethods: ["card", "oxxo", "spei"],

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const { finalAmountMXN, discountMXN } = applyCoupon(
      input.amountMXN,
      input.coupon
    );

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        "Stripe no está configurado. Define STRIPE_SECRET_KEY o usa NEXT_PUBLIC_PAYMENT_PROVIDER=mock."
      );
    }

    // TODO(Fase 2):
    //   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    //   const session = await stripe.checkout.sessions.create({
    //     mode: "payment",
    //     line_items: [{ price_data: { currency: "mxn", product_data: { name: courseTitle }, unit_amount: finalAmountMXN * 100 }, quantity: 1 }],
    //     payment_method_types: method === "oxxo" ? ["oxxo"] : method === "spei" ? ["customer_balance"] : ["card"],
    //     success_url, cancel_url,
    //     metadata: { courseId, userId }
    //   });

    void input;
    return {
      paymentId: `stripe_pending_${Date.now()}`,
      externalReference: `STRIPE-STUB-${input.courseId}`,
      status: "pending",
      flow: "redirect",
      redirectUrl: input.successUrl ?? "#",
      finalAmountMXN,
      discountMXN,
      method: input.method
    };
  },

  async getStatus(paymentId: string): Promise<PaymentQueryResult> {
    void paymentId;
    return {
      paymentId,
      externalReference: "STRIPE-STUB",
      status: "pending" as PaymentStatus
    };
  },

  async parseWebhook(payload, headers): Promise<WebhookResult> {
    void payload;
    void headers;
    return {
      paymentId: "stripe-stub",
      status: "pending",
      verified: false
    };
  }
};
