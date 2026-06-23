/**
 * Proveedor de pago MOCK.
 *
 * Es el proveedor por defecto del MVP. Simula el flujo completo sin tocar
 * ninguna API externa. Útil para desarrollo, demos y QA.
 *
 * Reglas de simulación:
 *  - method "free" o amount 0       → aprobado inmediato (inline).
 *  - method "card"                   → aprobado inmediato (inline, demo).
 *  - method "oxxo" | "spei"          → pendiente con instrucciones simuladas.
 *  - cualquier error conocido        → rechazado (para probar UI de error).
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

const paymentStore = new Map<
  string,
  { status: PaymentStatus; externalReference: string; method: string }
>();

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  displayName: "Pago simulado (demo)",
  supportedMethods: ["card", "oxxo", "spei", "wallet", "coupon", "free"],

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const { finalAmountMXN, discountMXN } = applyCoupon(
      input.amountMXN,
      input.coupon
    );

    const paymentId = randomId("pay");
    const externalReference = `MOCK-${paymentId}`;

    // Caso gratuito o con cupón 100%.
    if (input.method === "free" || finalAmountMXN === 0) {
      paymentStore.set(paymentId, {
        status: "approved",
        externalReference,
        method: input.method
      });
      return {
        paymentId,
        externalReference,
        status: "approved",
        flow: "inline",
        finalAmountMXN: 0,
        discountMXN,
        method: input.method
      };
    }

    // Tarjeta: simulamos aprobación inmediata (solo demo).
    if (input.method === "card") {
      paymentStore.set(paymentId, {
        status: "approved",
        externalReference,
        method: input.method
      });
      return {
        paymentId,
        externalReference,
        status: "approved",
        flow: "inline",
        finalAmountMXN,
        discountMXN,
        method: input.method
      };
    }

    // Efectivo / transferencia: queda pendiente hasta "pagar".
    if (input.method === "oxxo" || input.method === "spei") {
      paymentStore.set(paymentId, {
        status: "pending",
        externalReference,
        method: input.method
      });
      return {
        paymentId,
        externalReference,
        status: "pending",
        flow: "manual",
        instructions:
          input.method === "oxxo"
            ? `Acude a cualquier establecimiento OXXO y proporciona la referencia ${externalReference} por $${finalAmountMXN} MXN. (Demo simulada.)`
            : `Realiza la transferencia SPEI por $${finalAmountMXN} MXN a la cuenta simulada 0123 4567 8901 2345, referencia ${externalReference}. (Demo simulada.)`,
        finalAmountMXN,
        discountMXN,
        method: input.method
      };
    }

    // Por defecto: pendiente.
    paymentStore.set(paymentId, {
      status: "pending",
      externalReference,
      method: input.method
    });
    return {
      paymentId,
      externalReference,
      status: "pending",
      flow: "inline",
      finalAmountMXN,
      discountMXN,
      method: input.method
    };
  },

  async getStatus(paymentId: string): Promise<PaymentQueryResult> {
    const entry = paymentStore.get(paymentId);
    return {
      paymentId,
      externalReference: entry?.externalReference ?? "unknown",
      status: entry?.status ?? "pending"
    };
  },

  async parseWebhook(payload): Promise<WebhookResult> {
    // El mock no recibe webhooks reales; simulamos verificación.
    const data = (payload ?? {}) as { paymentId?: string; status?: PaymentStatus };
    return {
      paymentId: data.paymentId ?? "unknown",
      status: data.status ?? "pending",
      verified: true
    };
  }
};
