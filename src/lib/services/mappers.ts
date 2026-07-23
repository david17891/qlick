/**
 * Mappers entre filas de Postgres (snake_case) y tipos del dominio de
 * servicios (camelCase).
 *
 * Los tipos Row están definidos manualmente siguiendo el schema de la
 * migrations `20260721045701_service_orders.sql` y
 * `20260722120000_payments_events_live_hardening.sql`. Cuando se regeneren los
 * types con `npm run typegen`, este archivo puede actualizarse para apuntar
 * a `Database["public"]["Tables"]["..."]["Row"]`.
 *
 * Patrón idéntico a `src/lib/lms/mappers.ts` y `src/lib/events/mappers.ts`:
 * - Mantener tipos manuales desacopla la compilación del typegen stale.
 * - snake_case en Row, camelCase en dominio.
 * - Conversión de numeric(10,2) que llega como string desde PostgREST.
 */

import type {
  Service,
  ServiceVariant,
  ServiceOrder,
  ServiceOrderEvent,
  ServiceOrderNote,
  ServiceOrderDocument,
  ServiceCategory,
  OrderStatus,
  OrderPaymentMode,
  OrderPaymentStatus,
  OrderEventType,
  OrderEventActorType,
  OrderNoteType,
  OrderDocumentType,
  OrderDeliverableType,
} from "@/types/services";

/* ------------------------------------------------------------------ */
/* Numeric helpers                                                     */
/* ------------------------------------------------------------------ */

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Service row → dominio                                               */
/* ------------------------------------------------------------------ */

export interface ServiceRow {
  id: string;
  slug: string;
  category: string;
  display_name: string;
  short_description: string | null;
  long_description: string | null;
  bullets: string[] | null;
  icon: string | null;
  default_price_mxn: number | string | null;
  default_currency: string;
  requires_scheduling: boolean;
  requires_documents: boolean;
  deliverable_type: string | null;
  is_active: boolean;
  is_popular: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function mapServiceRow(row: ServiceRow): Service {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category as ServiceCategory,
    displayName: row.display_name,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    bullets: Array.isArray(row.bullets) ? row.bullets.filter((b) => typeof b === "string") : [],
    icon: row.icon,
    defaultPriceMXN: num(row.default_price_mxn),
    defaultCurrency: row.default_currency,
    requiresScheduling: row.requires_scheduling,
    requiresDocuments: row.requires_documents,
    deliverableType: (row.deliverable_type ?? null) as OrderDeliverableType,
    isActive: row.is_active,
    isPopular: Boolean(row.is_popular),
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* ServiceVariant row → dominio                                        */
/* ------------------------------------------------------------------ */

export interface ServiceVariantRow {
  id: string;
  service_id: string;
  slug: string;
  label: string;
  description: string | null;
  includes: string[] | null;
  price_mxn: number | string;
  delivery_days_min: number | null;
  delivery_days_max: number | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function mapServiceVariantRow(row: ServiceVariantRow): ServiceVariant {
  return {
    id: row.id,
    serviceId: row.service_id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    includes: Array.isArray(row.includes) ? row.includes.filter((b) => typeof b === "string") : [],
    priceMXN: num(row.price_mxn) ?? 0,
    deliveryDaysMin: row.delivery_days_min,
    deliveryDaysMax: row.delivery_days_max,
    isActive: row.is_active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* ServiceOrder row → dominio                                          */
/* ------------------------------------------------------------------ */

export interface ServiceOrderRow {
  id: string;
  order_number: string;
  lead_id: string | null;
  service_id: string;
  variant_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_notes: string | null;
  amount_mxn: number | string;
  currency: string;
  status: string;
  payment_mode: string;
  payment_reference: string | null;
  payment_status?: string;
  paid_at?: string | null;
  stripe_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  scheduled_at: string | null;
  assigned_to: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function mapServiceOrderRow(row: ServiceOrderRow): ServiceOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    leadId: row.lead_id,
    serviceId: row.service_id,
    variantId: row.variant_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerNotes: row.customer_notes,
    amountMXN: num(row.amount_mxn) ?? 0,
    currency: row.currency,
    status: row.status as OrderStatus,
    paymentMode: row.payment_mode as OrderPaymentMode,
    paymentStatus: (row.payment_status ?? "pending") as OrderPaymentStatus,
    paymentReference: row.payment_reference,
    paidAt: row.paid_at ?? null,
    stripeSessionId: row.stripe_session_id ?? null,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? null,
    stripeChargeId: row.stripe_charge_id ?? null,
    scheduledAt: row.scheduled_at,
    assignedTo: row.assigned_to,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* ServiceOrderEvent row → dominio                                     */
/* ------------------------------------------------------------------ */

export interface ServiceOrderEventRow {
  id: string;
  order_id: string;
  type: string;
  actor_id: string | null;
  actor_type: string;
  payload: unknown;
  created_at: string;
}

export function mapServiceOrderEventRow(
  row: ServiceOrderEventRow,
): ServiceOrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type as OrderEventType,
    actorId: row.actor_id,
    actorType: row.actor_type as OrderEventActorType,
    payload: isPlainObject(row.payload) ? row.payload : {},
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* ServiceOrderNote row → dominio                                      */
/* ------------------------------------------------------------------ */

export interface ServiceOrderNoteRow {
  id: string;
  order_id: string;
  author_id: string | null;
  body: string;
  note_type: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export function mapServiceOrderNoteRow(
  row: ServiceOrderNoteRow,
): ServiceOrderNote {
  return {
    id: row.id,
    orderId: row.order_id,
    authorId: row.author_id,
    body: row.body,
    noteType: row.note_type as OrderNoteType,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* ServiceOrderDocument row → dominio                                  */
/* ------------------------------------------------------------------ */

export interface ServiceOrderDocumentRow {
  id: string;
  order_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size_bytes: number | string | null;
  mime_type: string | null;
  description: string | null;
  created_at: string;
}

export function mapServiceOrderDocumentRow(
  row: ServiceOrderDocumentRow,
): ServiceOrderDocument {
  return {
    id: row.id,
    orderId: row.order_id,
    uploadedBy: row.uploaded_by,
    fileName: row.file_name,
    fileUrl: row.file_url,
    fileType: row.file_type as OrderDocumentType,
    fileSizeBytes: num(row.file_size_bytes),
    mimeType: row.mime_type,
    description: row.description,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
