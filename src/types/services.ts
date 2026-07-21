/**
 * Tipos del dominio — Sistema de pedidos de servicios (FASE 8).
 *
 * Esta capa representa el modelo de negocio (camelCase, formas estables).
 * La capa física (snake_case, enums de Postgres) se mapea en
 * `src/lib/services/mappers.ts`.
 *
 * Modelo:
 * - `Service`         → producto del catálogo (ej. "Sitio Web Express").
 * - `ServiceVariant`  → package/precio dentro del producto (Esencial/Pro).
 * - `ServiceOrder`    → pedido. Snapshot del cliente. Status: pending_contact
 *                       → contacted → confirmed → in_progress → delivered →
 *                       closed. Más cancelled (terminal).
 * - `ServiceOrderEvent`     → timeline append-only del pedido.
 * - `ServiceOrderNote`      → notas internas (admin only).
 * - `ServiceOrderDocument`  → archivos (comprobantes, certificados, etc.).
 *
 * Refleja las CHECK constraints y enums de la migration
 * `20260721045701_service_orders.sql`.
 */

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export type ServiceCategory = "digital" | "recurrent" | "event" | "course";

export type OrderStatus =
  | "pending_contact"
  | "contacted"
  | "confirmed"
  | "in_progress"
  | "delivered"
  | "closed"
  | "cancelled";

export type OrderPaymentMode = "pending" | "test" | "stripe" | "manual" | "free";

export type OrderEventType =
  | "status_change"
  | "note"
  | "email_sent"
  | "whatsapp_sent"
  | "payment_received"
  | "document_uploaded"
  | "customer_contact";

export type OrderEventActorType = "admin" | "system" | "customer";

export type OrderNoteType =
  | "general"
  | "client_request"
  | "blocker"
  | "follow_up";

export type OrderDocumentType =
  | "receipt"
  | "certificate"
  | "brief"
  | "deliverable"
  | "contract"
  | "other";

export type OrderDeliverableType =
  | "web_link"
  | "pdf"
  | "video"
  | "in_person"
  | "live_session"
  | null;

/* ------------------------------------------------------------------ */
/* Service (catálogo)                                                  */
/* ------------------------------------------------------------------ */

export interface Service {
  id: string;
  slug: string;
  category: ServiceCategory;
  displayName: string;
  shortDescription: string | null;
  longDescription: string | null;
  /** Features comunes del servicio (lo que el cliente obtiene al contratar
   *  CUALQUIER paquete). Se renderiza como bullets en la card del catálogo
   *  público. Array vacío = no mostrar bullets. */
  bullets: string[];
  icon: string | null;
  defaultPriceMXN: number | null;
  defaultCurrency: string;
  requiresScheduling: boolean;
  requiresDocuments: boolean;
  deliverableType: OrderDeliverableType;
  isActive: boolean;
  /** Badge "MÁS POPULAR" en la card. Sirve para destacar el servicio
   *  estratégico del momento (ej. Google Business Profile al lanzar). */
  isPopular: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceVariant {
  id: string;
  serviceId: string;
  slug: string;
  label: string;
  description: string | null;
  /** Qué incluye este paquete específico. Se renderiza como bullets en
   *  el variant card del detalle. Array vacío = no mostrar bullets
   *  (cae al `description` legacy). */
  includes: string[];
  priceMXN: number;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Vista combinada: service + sus variants. Útil para /servicios/[slug]. */
export interface ServiceWithVariants extends Service {
  variants: ServiceVariant[];
}

/* ------------------------------------------------------------------ */
/* ServiceOrder (pedido)                                               */
/* ------------------------------------------------------------------ */

export interface ServiceOrder {
  id: string;
  orderNumber: string;
  leadId: string | null;
  serviceId: string;
  variantId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNotes: string | null;
  amountMXN: number;
  currency: string;
  status: OrderStatus;
  paymentMode: OrderPaymentMode;
  paymentReference: string | null;
  scheduledAt: string | null;
  assignedTo: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Order con datos relacionados hidratados. Útil para el admin drawer. */
export interface ServiceOrderWithRelations extends ServiceOrder {
  service: Pick<Service, "id" | "slug" | "displayName" | "icon">;
  variant: Pick<ServiceVariant, "id" | "slug" | "label" | "priceMXN">;
  events: ServiceOrderEvent[];
  notes: ServiceOrderNote[];
  documents: ServiceOrderDocument[];
}

/* ------------------------------------------------------------------ */
/* ServiceOrderEvent (timeline)                                        */
/* ------------------------------------------------------------------ */

export interface ServiceOrderEvent {
  id: string;
  orderId: string;
  type: OrderEventType;
  actorId: string | null;
  actorType: OrderEventActorType;
  payload: Record<string, unknown>;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* ServiceOrderNote                                                    */
/* ------------------------------------------------------------------ */

export interface ServiceOrderNote {
  id: string;
  orderId: string;
  authorId: string | null;
  body: string;
  noteType: OrderNoteType;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* ServiceOrderDocument                                                */
/* ------------------------------------------------------------------ */

export interface ServiceOrderDocument {
  id: string;
  orderId: string;
  uploadedBy: string | null;
  fileName: string;
  fileUrl: string;
  fileType: OrderDocumentType;
  fileSizeBytes: number | null;
  mimeType: string | null;
  description: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Labels legibles para UI                                             */
/* ------------------------------------------------------------------ */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_contact: "Pendiente de contacto",
  contacted: "Contactado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  delivered: "Entregado",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export const ORDER_PAYMENT_MODE_LABELS: Record<OrderPaymentMode, string> = {
  pending: "Pago pendiente",
  test: "Test (Stripe test mode)",
  stripe: "Stripe",
  manual: "Manual",
  free: "Gratis",
};

export const ORDER_NOTE_TYPE_LABELS: Record<OrderNoteType, string> = {
  general: "General",
  client_request: "Petición del cliente",
  blocker: "Bloqueador",
  follow_up: "Seguimiento",
};

export const ORDER_DOCUMENT_TYPE_LABELS: Record<OrderDocumentType, string> = {
  receipt: "Comprobante de pago",
  certificate: "Certificado",
  brief: "Brief",
  deliverable: "Entregable",
  contract: "Contrato",
  other: "Otro",
};

/* ------------------------------------------------------------------ */
/* Input shapes (POST/PATCH payloads)                                  */
/* ------------------------------------------------------------------ */

/** Body de POST /api/services/checkout (cliente final). */
export interface CreateCheckoutInput {
  serviceSlug: string;
  variantSlug: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerNotes?: string;
  /** Modo de pago. "test" = order en pending_contact (admin valida).
   *  "stripe" = redirige a Stripe. "manual" = el admin lo confirma. */
  paymentMode?: OrderPaymentMode;
  /** ISO datetime, solo para servicios con requires_scheduling. */
  scheduledAt?: string;
}

/** Body de PATCH /api/admin/orders/[id]. */
export interface UpdateOrderInput {
  status?: OrderStatus;
  paymentMode?: OrderPaymentMode;
  paymentReference?: string | null;
  scheduledAt?: string | null;
  assignedTo?: string | null;
  customerNotes?: string | null;
  cancellationReason?: string | null;
}

/** Body de POST /api/admin/orders/[id]/notes. */
export interface CreateOrderNoteInput {
  body: string;
  noteType?: OrderNoteType;
  isPinned?: boolean;
}

/** Body de POST /api/admin/orders/[id]/documents. */
export interface CreateOrderDocumentInput {
  fileName: string;
  fileUrl: string;
  fileType?: OrderDocumentType;
  fileSizeBytes?: number;
  mimeType?: string;
  description?: string;
}

/** Filtros para GET /api/admin/orders. */
export interface ListOrdersFilters {
  status?: OrderStatus | OrderStatus[];
  serviceId?: string;
  leadId?: string;
  /** Búsqueda libre por nombre/email/phone del customer. */
  q?: string;
  limit?: number;
  offset?: number;
}
