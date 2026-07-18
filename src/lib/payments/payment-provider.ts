/**
 * Contrato común para proveedores de pago.
 *
 * Todos los proveedores (mock, Mercado Pago, Stripe, Conekta) implementan
 * esta interfaz para que el resto del sistema no se acople a un SDK concreto.
 *
 * Ver docs/PAYMENTS_MEXICO_STRATEGY.md para el análisis comparativo.
 */

import type { Coupon, PaymentMethod, PaymentStatus } from "@/types";

/* ------------------------------------------------------------------ */
/* Polimorfismo: cursos / eventos / masterclass                       */
/* ------------------------------------------------------------------ */

/**
 * `productRef` describe QUÉ se está comprando. Es un discriminated union
 * por `kind` para que el compilador fuerce a los providers a manejar
 * cada tipo explícitamente.
 *
 * Forma intención (Fase 1 de Stripe real): todo cobro pasa por
 * `productRef`. Los campos legacy `courseId`/`courseSlug`/`amountMXN`
 * se dejaron opcionales en `CreateCheckoutInput` solo para compatibilidad
 * con el mock provider preexistente.
 */
export interface ProductRefBase {
  /** Identificador estable (UUID en DB). */
  id: string;
  /** Slug público (para construir success/cancel URLs). */
  slug: string;
  /** Título legible para mostrar en checkout y metadata. */
  title: string;
  /** Precio en MXN. En Fase 1 single-price; precios múltiples son Fase 2. */
  priceMXN: number;
}

export interface ProductRefCourse extends ProductRefBase {
  kind: "course";
}

export interface ProductRefEvent extends ProductRefBase {
  kind: "event";
  /** Fecha ISO del evento (informativa para el checkout). */
  startsAt?: string;
}

export interface ProductRefMasterclass extends ProductRefBase {
  kind: "masterclass";
  /** URL del video (informativa — el access real se entrega tras pago). */
  videoUrl?: string;
}

export type ProductRef =
  | ProductRefCourse
  | ProductRefEvent
  | ProductRefMasterclass;

export interface CreateCheckoutInput {
  /** Lo que se compra (polimórfico). OBLIGATORIO en providers nuevos. */
  productRef: ProductRef;
  /**
   * Identidad del comprador.
   * - Si hay sesión: el userId del estudiante logueado (se guarda en
   *   metadata del Checkout Session para que el webhook pueda resolverlo
   *   sin lookup por email).
   * - Si NO hay sesión (guest checkout desde 2026-07-08): null. El webhook
   *   resuelve el usuario desde `session.customer_email` (crea cuenta si
   *   no existe).
   */
  userId: string | null;
  /**
   * Email del comprador (opcional, puede venir del session de Supabase
   * o lo recolecta Stripe Checkout). Se usa como `customer_email` para
   * prellenar checkout y como hint en el webhook.
   */
  userEmail: string;
  /** Método preferido (afecta payment_method_types en providers redirect). */
  method: PaymentMethod;
  /** Cupón aplicado (opcional). Se procesa vía `applyCoupon()`. */
  coupon?: Coupon;
  /** URLs de retorno para flujos redirect (3DS, OXXO, SPEI). */
  successUrl?: string;
  cancelUrl?: string;
  pendingUrl?: string;
  /**
   * FIX 2026-07-18 (sprint atribución de pagos, David "el link de pago es
   * generico, como se relaciona con el cliente"): cuando un lead ya
   * completó el flow del bot y tiene una `event_confirmations` con id
   * conocido, el caller lo pasa acá. El provider lo serializa a
   * `metadata.confirmation_id` en el Checkout Session de Stripe, y
   * el webhook lo lee PRIMERO para atribuir el cargo a esa
   * confirmation (en vez de buscar por email del customer, que
   * puede no coincidir). Solo aplica a productos tipo "event" (los
   * cursos no tienen este concepto).
   */
  confirmationId?: string;

  /* ----------------- LEGACY (mock provider) ---------------------- *
   * Mantener como opcionales unicamente para que el mock provider
   * pueda seguir funcionando con callers que pasen shape viejo.
   * Eliminar cuando todos los callers se migren. */
  courseId?: string;
  courseSlug?: string;
  courseTitle?: string;
  amountMXN?: number;
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
  /**
   * Email del customer (cuando está disponible, ej. Stripe Checkout).
   * Usado por /pagar/[slug]/exito para el botón "Reenviar link de acceso"
   * del flujo guest. Opcional porque mock/legacy providers no lo exponen.
   */
  customerEmail?: string | null;
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
