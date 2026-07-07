/**
 * Proveedor Conekta (México) — STUB.
 *
 * Conekta es una opción fuerte para métodos locales mexicanos: tarjeta, OXXO,
 * SPEI, wallets ysuscripción. Tiene buen soporte para facturación CFDI.
 *
 * ESTE ARCHIVO ES UN STUB. La implementación real queda para la Fase 2.
 * Para activarla:
 *   1. npm i conekta
 *   2. Configurar CONEKTA_API_KEY / CONEKTA_PRIVATE_KEY.
 *   3. Implementar createCheckout con Order/Charge API.
 *   4. Implementar parseWebhook validando la firma Conekta.
 *   5. Cambiar NEXT_PUBLIC_PAYMENT_PROVIDER=conekta
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

export const conektaProvider: PaymentProvider = {
  name: "conekta",
  displayName: "Conekta (México)",
  supportedMethods: ["card", "oxxo", "spei", "wallet"],

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const amount = input.productRef?.priceMXN ?? input.amountMXN ?? 0;
    const { finalAmountMXN, discountMXN } = applyCoupon(amount, input.coupon);

    if (!process.env.CONEKTA_API_KEY) {
      throw new Error(
        "Conekta no está configurado. Define CONEKTA_API_KEY o usa NEXT_PUBLIC_PAYMENT_PROVIDER=mock."
      );
    }

    // TODO(Fase 2): crear Order con Conekta.
    //   const conekta = new Conekta({ apiKey: process.env.CONEKTA_API_KEY });
    //   const order = await conekta.orders.create({ line_items, charges, ... });

    const productId = input.productRef?.id ?? input.courseId ?? "unknown";
    void input;
    return {
      paymentId: `conekta_pending_${Date.now()}`,
      externalReference: `CONEKTA-STUB-${productId}`,
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
      externalReference: "CONEKTA-STUB",
      status: "pending" as PaymentStatus
    };
  },

  async parseWebhook(payload, headers): Promise<WebhookResult> {
    void payload;
    void headers;
    return {
      paymentId: "conekta-stub",
      status: "pending",
      verified: false
    };
  }
};
