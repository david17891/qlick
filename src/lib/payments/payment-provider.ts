/**
 * Contrato común para proveedores de pago.
 *
 * Todos los proveedores (mock, Mercado Pago, Stripe, Conekta) implementan
 * esta interfaz para que el resto del sistema no se acople a un SDK concreto.
 *
 * Ver docs/PAYMENTS_MEXICO_STRATEGY.md para el análisis comparativo.
 */

import type { Coupon, PaymentMethod, PaymentStatus } from "@/types";

export interface CreateCheckoutInput {
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  userId: string;
  userEmail: string;
  amountMXN: number;
  method: PaymentMethod;
  coupon?: Coupon;
  /** URLs de retorno para flujos redirect (3DS, OXXO, SPEI). */
  successUrl?: string;
  cancelUrl?: string;
  pendingUrl?: string;
}

export interface CheckoutResult {
  /** Identificador interno del pago. */
  paymentId: string;
  /** Referencia externa del proveedor. */
  externalReference: string;
  /** Estado inicial: casi siempre "pending" salvo mock/free. */
  status: PaymentStatus;
  /**
   * - "redirect" → abrir `redirectUrl`.
   * - "embed"   → renderizar `embedHtml`.
   * - "manual"  → transferencia/efectivo, mostrar `instructions`.
   * - "inline"  → ya resuelto en cliente (mock/free).
   */
  flow: "redirect" | "embed" | "manual" | "inline";
  redirectUrl?: string;
  embedHtml?: string;
  instructions?: string;
  /** Monto final cobrado (con descuento). */
  finalAmountMXN: number;
  discountMXN: number;
  /** Método de pago elegido para la referencia generada. */
  method: PaymentMethod;
}

export interface PaymentQueryResult {
  paymentId: string;
  externalReference: string;
  status: PaymentStatus;
  raw?: unknown;
}

export interface WebhookResult {
  paymentId: string;
  status: PaymentStatus;
  verified: boolean;
  raw?: unknown;
}

export interface PaymentProvider {
  readonly name: "mock" | "mercadopago" | "stripe" | "conekta";
  readonly displayName: string;
  /** Crea una intención de pago / checkout. */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  /** Consulta el estado de un pago existente. */
  getStatus(paymentId: string): Promise<PaymentQueryResult>;
  /** Procesa un webhook entrante (fase 2). */
  parseWebhook(payload: unknown, headers?: Record<string, string>): Promise<WebhookResult>;
  /** Lista los métodos de pago que soporta este proveedor. */
  supportedMethods: PaymentMethod[];
}

/* --------------------- Utilidad: cálculo de precio --------------------- */

export function applyCoupon(amountMXN: number, coupon?: Coupon): {
  finalAmountMXN: number;
  discountMXN: number;
} {
  if (!coupon || !coupon.active) {
    return { finalAmountMXN: amountMXN, discountMXN: 0 };
  }
  let discount = 0;
  if (coupon.percentOff > 0) {
    discount = Math.round((amountMXN * coupon.percentOff) / 100);
  } else if (coupon.amountOffMXN) {
    discount = Math.min(coupon.amountOffMXN, amountMXN);
  }
  return {
    finalAmountMXN: Math.max(0, amountMXN - discount),
    discountMXN: discount
  };
}

/* --------------------- Factory de proveedor activo --------------------- */

export function getActivePaymentProviderName():
  | "mock"
  | "mercadopago"
  | "stripe"
  | "conekta" {
  const fromEnv = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
  if (
    fromEnv === "mercadopago" ||
    fromEnv === "stripe" ||
    fromEnv === "conekta"
  ) {
    return fromEnv;
  }
  // El MVP usa mock siempre que no se configure explícitamente.
  return "mock";
}
