/**
 * Proveedor Mercado Pago (México) — STUB.
 *
 * Mercado Pago es una opción práctica para México: tarjeta, OXXO y transferencia
 * con menor fricción que otros proveedores.
 *
 * ESTE ARCHIVO ES UN STUB. La implementación real queda para la Fase 2.
 * Para activarla:
 *   1. npm i mercadopago
 *   2. Configurar MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_PUBLIC_KEY en .env
 *   3. Implementar createCheckout con PreferenceClient y parseWebhook con el IPN/wh.
 *   4. Cambiar NEXT_PUBLIC_PAYMENT_PROVIDER=mercadopago
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

export const mercadopagoProvider: PaymentProvider = {
  name: "mercadopago",
  displayName: "Mercado Pago (México)",
  supportedMethods: ["card", "oxxo", "spei", "wallet"],

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const { finalAmountMXN, discountMXN } = applyCoupon(
      input.amountMXN,
      input.coupon
    );

    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      throw new Error(
        "Mercado Pago no está configurado. Define MERCADOPAGO_ACCESS_TOKEN o usa NEXT_PUBLIC_PAYMENT_PROVIDER=mock."
      );
    }

    // TODO(Fase 2): crear Preference con SDK oficial.
    //   const preference = new Preference(client);
    //   const result = await preference.create({ items, payer, back_urls, ... });
    //   return { flow: "redirect", redirectUrl: result.init_point, ... };

    void input;
    return {
      paymentId: `mp_pending_${Date.now()}`,
      externalReference: `MP-STUB-${input.courseId}`,
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
      externalReference: "MP-STUB",
      status: "pending" as PaymentStatus
    };
  },

  async parseWebhook(payload): Promise<WebhookResult> {
    void payload;
    return {
      paymentId: "mp-stub",
      status: "pending",
      verified: false
    };
  }
};
