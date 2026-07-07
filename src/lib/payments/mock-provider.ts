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
 *
 * NUEVO (Fase 1+): usa `input.productRef.priceMXN` cuando está presente.
 * Mantiene compat con shape legacy (courseId/amountMXN) para SimulatorForm.
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

/** Resuelve precio con fallback a campos legacy. */
function resolveAmount(input: CreateCheckoutInput): number {
  if (input.productRef && Number.isFinite(input.productRef.priceMXN)) {
    return input.productRef.priceMXN;
  }
  return typeof input.amountMXN === "number" ? input.amountMXN : 0;
}

/** Resuelve título del producto (para mostrar en CheckoutResult). */
function resolveTitle(input: CreateCheckoutInput): string {
  if (input.productRef) return input.productRef.title;
  return input.courseTitle ?? "Producto sin título";
}

/** Resuelve external reference (metadata útil para auditoría). */
function resolveRef(input: CreateCheckoutInput): string {
  if (input.productRef) {
    return `MOCK-${input.productRef.kind.toUpperCase()}-${input.productRef.id}`;
  }
  return `MOCK-COURSE-${input.courseId ?? "unknown"}`;
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  displayName: "Pago simulado (demo)",
  supportedMethods: ["card", "oxxo", "spei", "wallet", "coupon", "free"],

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const { finalAmountMXN, discountMXN } = applyCoupon(
      resolveAmount(input),
      input.coupon
    );

    const paymentId = randomId("pay");
    const externalReference = resolveRef(input);

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
      const refForInstructions = externalReference;
      return {
        paymentId,
        externalReference,
        status: "pending",
        flow: "manual",
        instructions:
          input.method === "oxxo"
            ? `Acude a cualquier establecimiento OXXO y proporciona la referencia ${refForInstructions} por $${finalAmountMXN} MXN. (Demo simulada.)`
            : `Realiza la transferencia SPEI por $${finalAmountMXN} MXN a la cuenta simulada 0123 4567 8901 2345, referencia ${refForInstructions}. (Demo simulada.)`,
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

/* eslint-disable no-unused-vars */
// Usado por otros stubs (conekta/mercadopago) si los activan:
// const _ = resolveTitle; const __ = resolveAmount;
