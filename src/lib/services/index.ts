/**
 * Barrel exports para el módulo de servicios.
 *
 * Los tipos viven en `@/types/services` (reutilizables client+server).
 * Los mappers y la lib server viven en `@/lib/services/*` (server-only).
 */

// Tipos (en `export type` para que no se incluya en el bundle del cliente).
export type {
  Service,
  ServiceVariant,
  ServiceWithVariants,
  ServiceOrder,
  ServiceOrderWithRelations,
  ServiceOrderEvent,
  ServiceOrderNote,
  ServiceOrderDocument,
  ServiceCategory,
  OrderStatus,
  OrderPaymentMode,
  OrderEventType,
  OrderEventActorType,
  OrderNoteType,
  OrderDocumentType,
  OrderDeliverableType,
  CreateCheckoutInput,
  UpdateOrderInput,
  CreateOrderNoteInput,
  CreateOrderDocumentInput,
  ListOrdersFilters,
} from "@/types/services";

// Labels (objetos runtime, NO types — van en export normal).
export {
  ORDER_STATUS_LABELS,
  ORDER_PAYMENT_MODE_LABELS,
  ORDER_NOTE_TYPE_LABELS,
  ORDER_DOCUMENT_TYPE_LABELS,
} from "@/types/services";

export {
  getActiveServices,
  getServiceBySlug,
  createOrder,
  listOrders,
  getOrderById,
  getOrdersByLeadId,
  updateOrder,
  addOrderNote,
  addOrderDocument,
  addOrderEvent,
  type OpResult,
  type AddEventInput,
  type ServiceOrderListItem,
} from "./orders-server";
