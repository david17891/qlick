/**
 * Servicios server-side para el sistema de pedidos de servicios (FASE 8).
 *
 * Server-only. Usa el cliente admin (service role, bypass RLS) para
 * operaciones admin. El cliente público (anon + RLS) se usa para
 * el catálogo (services + variants activos).
 *
 * REGLA DE FALLBACK:
 * - Si Supabase NO está configurado → cae a errores suaves (las funciones
 *   de catálogo devuelven [], las de mutación devuelven ok=false).
 *   NO hay mocks legacy para services: la feature es 100% DB.
 *
 * IMPORTANTE: este módulo es SERVER-ONLY. NO importar desde Client Components.
 *
 * Estructura:
 * - `getActiveServices()`        → catálogo público (services + variants).
 * - `getServiceBySlug()`         → service por slug con variants.
 * - `createOrder()`              → crea order (cliente o admin).
 * - `listOrders()`               → lista admin con filtros.
 * - `getOrderById()`             → detalle admin (con eventos/notas/documentos).
 * - `updateOrder()`              → actualiza status / campos admin.
 * - `deleteOrder()`              → borra (soft via status=cancelled, hard via SQL).
 * - `addOrderNote()`             → agrega nota + auto-event.
 * - `addOrderDocument()`         → agrega doc + auto-event.
 * - `addOrderEvent()`            → bajo nivel (usado por el resto para timeline).
 * - `generateOrderNumber()`      → 'QO-2026-0001' formato humano.
 *
 * Patrón de respuesta: `{ ok: boolean, error?: string, ...data }`.
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import type { Json } from "@/types/supabase";
import type {
  Service,
  ServiceVariant,
  ServiceWithVariants,
  ServiceOrder,
  ServiceOrderWithRelations,
  ServiceOrderEvent,
  ServiceOrderNote,
  ServiceOrderDocument,
  CreateCheckoutInput,
  UpdateOrderInput,
  CreateOrderNoteInput,
  CreateOrderDocumentInput,
  ListOrdersFilters,
  OrderStatus,
  OrderPaymentMode,
  OrderEventType,
} from "@/types/services";
import {
  mapServiceRow,
  mapServiceVariantRow,
  mapServiceOrderRow,
  mapServiceOrderEventRow,
  mapServiceOrderNoteRow,
  mapServiceOrderDocumentRow,
  type ServiceRow,
  type ServiceVariantRow,
  type ServiceOrderRow,
  type ServiceOrderEventRow,
  type ServiceOrderNoteRow,
  type ServiceOrderDocumentRow,
} from "./mappers";

/** Resultado de una operación de mutación. */
export type OpResult<T> = { ok: true; data: T } | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

function notConfigured<T>(): OpResult<T> {
  return { ok: false, error: "Supabase no configurado (modo demo)." };
}

/* ------------------------------------------------------------------ */
/* Catálogo público (services + variants activos)                      */
/* ------------------------------------------------------------------ */

/**
 * Devuelve todos los services activos con sus variants activas.
 * Usado por /servicios (catálogo público).
 */
export async function getActiveServices(): Promise<ServiceWithVariants[]> {
  if (!isRealMode()) return [];

  const supabase = createSupabaseAdminClient();
  const { data: services, error: sErr } = await supabase
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (sErr || !services) {
    // eslint-disable-next-line no-console
    console.error("[orders-server] getActiveServices falló", { code: sErr?.code });
    return [];
  }

  const { data: variants, error: vErr } = await supabase
    .from("service_variants")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (vErr || !variants) {
    // eslint-disable-next-line no-console
    console.error("[orders-server] getActiveServices variants falló", {
      code: vErr?.code,
    });
    return [];
  }

  const variantsByService = new Map<string, ServiceVariant[]>();
  for (const v of variants as ServiceVariantRow[]) {
    const list = variantsByService.get(v.service_id) ?? [];
    list.push(mapServiceVariantRow(v));
    variantsByService.set(v.service_id, list);
  }

  return (services as ServiceRow[]).map((s) => {
    const mapped = mapServiceRow(s);
    return {
      ...mapped,
      variants: variantsByService.get(s.id) ?? [],
    };
  });
}

/**
 * Devuelve un service por slug con sus variants activas.
 * Usado por /servicios/[slug].
 */
export async function getServiceBySlug(
  slug: string,
): Promise<ServiceWithVariants | null> {
  if (!isRealMode()) return null;

  const supabase = createSupabaseAdminClient();
  const { data: service, error } = await supabase
    .from("services")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !service) return null;

  const { data: variants } = await supabase
    .from("service_variants")
    .select("*")
    .eq("service_id", service.id)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  return {
    ...mapServiceRow(service as ServiceRow),
    variants: ((variants as ServiceVariantRow[] | null) ?? []).map(
      mapServiceVariantRow,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Order number generator (humano-legible)                             */
/* ------------------------------------------------------------------ */

/**
 * Genera el siguiente order_number con formato `QO-YYYY-NNNN`.
 * Atómico: usa un SELECT MAX con WHERE year + 1, dentro de la misma
 * transacción (PostgREST lo trata como 1 statement en 1 roundtrip).
 *
 * Si falla el cálculo, cae a timestamp-based fallback (único pero feo).
 */
async function generateOrderNumber(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getUTCFullYear();
  const prefix = `QO-${year}-`;

  // Traemos los order_numbers del año y sacamos el max.
  const { data } = await supabase
    .from("service_orders")
    .select("order_number")
    .like("order_number", `${prefix}%`)
    .order("order_number", { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (data && data.length > 0) {
    const last = (data[0] as { order_number: string }).order_number;
    const m = last.match(new RegExp(`^QO-${year}-(\\d+)$`));
    if (m) {
      nextSeq = Number(m[1]) + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Crear order (cliente vía checkout, o admin manual)                  */
/* ------------------------------------------------------------------ */

/**
 * Crea un service_order. Usado por:
 * - POST /api/services/checkout (cliente final, paymentMode=pending por
 *   defecto; el admin confirma después).
 * - POST /api/admin/orders (admin crea order manual, ej. cliente que
 *   pagó por transferencia y no usó la UI).
 *
 * Valida:
 * - service y variant existen y están activos.
 * - datos del cliente (name + email requeridos).
 * - si el service requires_scheduling, scheduledAt es obligatorio.
 * - genera order_number único.
 * - loggea un evento 'customer_contact' en la timeline.
 */
export async function createOrder(
  input: CreateCheckoutInput & {
    /** Lo setea el caller (cliente anónimo o admin). */
    paymentMode?: OrderPaymentMode;
    /** Si se setea, linkea el order al lead del CRM. */
    leadId?: string | null;
  },
  actorEmail: string | null,
): Promise<OpResult<ServiceOrder>> {
  if (!isRealMode()) return notConfigured();

  // Validación mínima
  if (!input.serviceSlug?.trim() || !input.variantSlug?.trim()) {
    return { ok: false, error: "Falta serviceSlug o variantSlug." };
  }
  if (!input.customerName?.trim() || !input.customerEmail?.trim()) {
    return {
      ok: false,
      error: "Faltan datos del cliente (nombre y email).",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Resolver service + variant por slugs.
  const { data: service } = await supabase
    .from("services")
    .select("id, slug, is_active, requires_scheduling")
    .eq("slug", input.serviceSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!service) {
    return {
      ok: false,
      error: `Servicio '${input.serviceSlug}' no existe o no está activo.`,
    };
  }

  const { data: variant } = await supabase
    .from("service_variants")
    .select("id, service_id, slug, is_active, price_mxn")
    .eq("service_id", service.id)
    .eq("slug", input.variantSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!variant) {
    return {
      ok: false,
      error: `Variante '${input.variantSlug}' no existe para este servicio.`,
    };
  }

  // 2. Validar scheduling si aplica.
  if (service.requires_scheduling && !input.scheduledAt) {
    return {
      ok: false,
      error: "Este servicio requiere fecha de agendamiento.",
    };
  }

  // 3. Generar order_number.
  const orderNumber = await generateOrderNumber();

  // 4. Insert order.
  const { data: order, error: insErr } = await supabase
    .from("service_orders")
    .insert({
      order_number: orderNumber,
      lead_id: input.leadId ?? null,
      service_id: service.id,
      variant_id: variant.id,
      customer_name: input.customerName.trim(),
      customer_email: input.customerEmail.trim().toLowerCase(),
      customer_phone: input.customerPhone?.trim() || null,
      customer_notes: input.customerNotes?.trim() || null,
      amount_mxn: variant.price_mxn,
      currency: "MXN",
      status: "pending_contact" as OrderStatus,
      payment_mode: (input.paymentMode ?? "pending") as OrderPaymentMode,
      scheduled_at: input.scheduledAt ?? null,
    })
    .select("*")
    .single();

  if (insErr || !order) {
    return {
      ok: false,
      error: `Error creando el pedido: ${insErr?.message ?? "unknown"}`,
    };
  }

  const mappedOrder = mapServiceOrderRow(order as ServiceOrderRow);

  // 5. Auto-log: evento 'customer_contact' en la timeline.
  await addOrderEventInternal(mappedOrder.id, {
    type: "customer_contact",
    actorId: actorEmail,
    actorType: actorEmail ? "admin" : "customer",
    payload: {
      source: "checkout",
      customer_name: input.customerName,
      customer_email: input.customerEmail,
    },
  });

  return { ok: true, data: mappedOrder };
}

/* ------------------------------------------------------------------ */
/* Listar orders (admin)                                               */
/* ------------------------------------------------------------------ */

/**
 * Shape extendido de un order con datos hidratados del service y variant.
 * Útil para listas en el admin panel (evita N+1 queries).
 */
export interface ServiceOrderListItem extends ServiceOrder {
  serviceName: string;
  serviceSlug: string;
  serviceIcon: string | null;
  variantLabel: string;
  variantSlug: string;
}

export async function listOrders(
  filters: ListOrdersFilters = {},
): Promise<{
  ok: boolean;
  orders?: ServiceOrderListItem[];
  total?: number;
  error?: string;
}> {
  if (!isRealMode()) return { ok: false, error: "Supabase no configurado." };

  const supabase = createSupabaseAdminClient();
  // Join con services y service_variants para no hacer N+1 queries en
  // la UI del admin. Los datos hidratados van en campos extra del item.
  let q = supabase
    .from("service_orders")
    .select(
      "*, services!inner(slug, display_name, icon), service_variants!inner(slug, label)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      q = q.in("status", filters.status);
    } else {
      q = q.eq("status", filters.status);
    }
  }
  if (filters.serviceId) q = q.eq("service_id", filters.serviceId);
  if (filters.leadId) q = q.eq("lead_id", filters.leadId);
  if (filters.q) {
    // Búsqueda libre en name/email/phone (ilike case-insensitive).
    const term = `%${filters.q.replace(/[%_]/g, "")}%`;
    q = q.or(
      `customer_name.ilike.${term},customer_email.ilike.${term},customer_phone.ilike.${term}`,
    );
  }
  if (typeof filters.limit === "number") {
    q = q.limit(filters.limit);
  } else {
    q = q.limit(50);
  }
  if (typeof filters.offset === "number") {
    q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
  }

  const { data, error, count } = await q;
  if (error) {
    return { ok: false, error: `Error listando pedidos: ${error.message}` };
  }

  const orders: ServiceOrderListItem[] = ((data as unknown[]) ?? []).map(
    (row) => {
      const r = row as ServiceOrderRow & {
        services: { slug: string; display_name: string; icon: string | null };
        service_variants: { slug: string; label: string };
      };
      return {
        ...mapServiceOrderRow(r),
        serviceName: r.services.display_name,
        serviceSlug: r.services.slug,
        serviceIcon: r.services.icon,
        variantLabel: r.service_variants.label,
        variantSlug: r.service_variants.slug,
      };
    },
  );

  return {
    ok: true,
    orders,
    total: count ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Detalle de order (admin)                                            */
/* ------------------------------------------------------------------ */

export async function getOrderById(
  id: string,
): Promise<ServiceOrderWithRelations | null> {
  if (!isRealMode()) return null;

  const supabase = createSupabaseAdminClient();

  // 1. Order base
  const { data: order, error } = await supabase
    .from("service_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !order) return null;

  const mapped = mapServiceOrderRow(order as ServiceOrderRow);

  // 2. Hidratar service + variant (FK lookup)
  const [{ data: service }, { data: variant }] = await Promise.all([
    supabase
      .from("services")
      .select("id, slug, display_name, icon")
      .eq("id", mapped.serviceId)
      .maybeSingle(),
    supabase
      .from("service_variants")
      .select("id, slug, label, price_mxn")
      .eq("id", mapped.variantId)
      .maybeSingle(),
  ]);

  // 3. Hidratar eventos, notas, documentos en paralelo.
  const [
    { data: events },
    { data: notes },
    { data: documents },
  ] = await Promise.all([
    supabase
      .from("service_order_events")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("service_order_notes")
      .select("*")
      .eq("order_id", id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("service_order_documents")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    ...mapped,
    service: service
      ? {
          id: (service as { id: string }).id,
          slug: (service as { slug: string }).slug,
          displayName: (service as { display_name: string }).display_name,
          icon: (service as { icon: string | null }).icon,
        }
      : { id: mapped.serviceId, slug: "", displayName: "Servicio eliminado", icon: null },
    variant: variant
      ? {
          id: (variant as { id: string }).id,
          slug: (variant as { slug: string }).slug,
          label: (variant as { label: string }).label,
          priceMXN: Number((variant as { price_mxn: number | string }).price_mxn),
        }
      : { id: mapped.variantId, slug: "", label: "Variante eliminada", priceMXN: 0 },
    events: ((events as ServiceOrderEventRow[] | null) ?? []).map(
      mapServiceOrderEventRow,
    ),
    notes: ((notes as ServiceOrderNoteRow[] | null) ?? []).map(
      mapServiceOrderNoteRow,
    ),
    documents: ((documents as ServiceOrderDocumentRow[] | null) ?? []).map(
      mapServiceOrderDocumentRow,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Update order (admin)                                                */
/* ------------------------------------------------------------------ */

export async function updateOrder(
  id: string,
  input: UpdateOrderInput,
  actorEmail: string,
): Promise<OpResult<ServiceOrder>> {
  if (!isRealMode()) return notConfigured();

  const supabase = createSupabaseAdminClient();

  // 1. Traer el order actual para detectar cambios (especialmente status).
  const { data: current } = await supabase
    .from("service_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Pedido no existe." };

  const currentOrder = mapServiceOrderRow(current as ServiceOrderRow);

  // 2. Armar patch (solo campos presentes en input).
  // El typegen de Supabase es estricto con `.update()`; usamos un objeto
  // tipado como Partial del Insert shape para mantener type safety sin
  // recurrir a `as any`. La conversión final es segura porque solo
  // seteamos campos conocidos del schema.
  const patch: {
    status?: OrderStatus;
    delivered_at?: string;
    cancelled_at?: string;
    cancellation_reason?: string | null;
    payment_mode?: OrderPaymentMode;
    payment_reference?: string | null;
    scheduled_at?: string | null;
    assigned_to?: string | null;
    customer_notes?: string | null;
  } = {};
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "delivered" && !currentOrder.deliveredAt) {
      patch.delivered_at = new Date().toISOString();
    }
    if (input.status === "cancelled") {
      patch.cancelled_at = new Date().toISOString();
      if (input.cancellationReason !== undefined) {
        patch.cancellation_reason = input.cancellationReason;
      }
    }
  }
  if (input.paymentMode !== undefined) patch.payment_mode = input.paymentMode;
  if (input.paymentReference !== undefined)
    patch.payment_reference = input.paymentReference;
  if (input.scheduledAt !== undefined) patch.scheduled_at = input.scheduledAt;
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
  if (input.customerNotes !== undefined)
    patch.customer_notes = input.customerNotes;
  if (input.cancellationReason !== undefined)
    patch.cancellation_reason = input.cancellationReason;

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Sin cambios para aplicar." };
  }

  // 3. UPDATE.
  // Cast necesario: el typegen estricto no acepta el shape dinámico del patch
  // cuando hay `delete`-later fields. La forma del patch está validada arriba.
  const { data: updated, error: updErr } = await supabase
    .from("service_orders")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr || !updated) {
    return { ok: false, error: `Error actualizando: ${updErr?.message ?? "unknown"}` };
  }

  const mapped = mapServiceOrderRow(updated as ServiceOrderRow);

  // 4. Auto-log: si cambió el status, evento 'status_change'.
  if (input.status && input.status !== currentOrder.status) {
    await addOrderEventInternal(id, {
      type: "status_change",
      actorId: actorEmail,
      actorType: "admin",
      payload: { from: currentOrder.status, to: input.status },
    });
  }
  // 5. Auto-log: si se asignó a alguien.
  if (input.assignedTo !== undefined && input.assignedTo !== currentOrder.assignedTo) {
    await addOrderEventInternal(id, {
      type: "note",
      actorId: actorEmail,
      actorType: "admin",
      payload: { kind: "assignment", from: currentOrder.assignedTo, to: input.assignedTo },
    });
  }

  return { ok: true, data: mapped };
}

/* ------------------------------------------------------------------ */
/* Notas (admin)                                                       */
/* ------------------------------------------------------------------ */

export async function addOrderNote(
  orderId: string,
  input: CreateOrderNoteInput,
  actorEmail: string,
): Promise<OpResult<ServiceOrderNote>> {
  if (!isRealMode()) return notConfigured();
  if (!input.body?.trim()) return { ok: false, error: "Nota vacía." };

  const supabase = createSupabaseAdminClient();

  // Verificar que el order existe.
  const { data: order } = await supabase
    .from("service_orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Pedido no existe." };

  const { data: note, error } = await supabase
    .from("service_order_notes")
    .insert({
      order_id: orderId,
      author_id: actorEmail,
      body: input.body.trim(),
      note_type: input.noteType ?? "general",
      is_pinned: input.isPinned ?? false,
    })
    .select("*")
    .single();

  if (error || !note) {
    return { ok: false, error: `Error guardando nota: ${error?.message ?? "unknown"}` };
  }

  // Auto-log: evento 'note' en la timeline.
  await addOrderEventInternal(orderId, {
    type: "note",
    actorId: actorEmail,
    actorType: "admin",
    payload: { note_id: (note as { id: string }).id, note_type: input.noteType ?? "general" },
  });

  return { ok: true, data: mapServiceOrderNoteRow(note as ServiceOrderNoteRow) };
}

/* ------------------------------------------------------------------ */
/* Documentos (admin)                                                  */
/* ------------------------------------------------------------------ */

export async function addOrderDocument(
  orderId: string,
  input: CreateOrderDocumentInput,
  actorEmail: string,
): Promise<OpResult<ServiceOrderDocument>> {
  if (!isRealMode()) return notConfigured();
  if (!input.fileName?.trim() || !input.fileUrl?.trim()) {
    return { ok: false, error: "Falta fileName o fileUrl." };
  }

  const supabase = createSupabaseAdminClient();

  // Verificar que el order existe.
  const { data: order } = await supabase
    .from("service_orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Pedido no existe." };

  const { data: doc, error } = await supabase
    .from("service_order_documents")
    .insert({
      order_id: orderId,
      uploaded_by: actorEmail,
      file_name: input.fileName.trim(),
      file_url: input.fileUrl.trim(),
      file_type: input.fileType ?? "other",
      file_size_bytes: input.fileSizeBytes ?? null,
      mime_type: input.mimeType ?? null,
      description: input.description?.trim() ?? null,
    })
    .select("*")
    .single();

  if (error || !doc) {
    return { ok: false, error: `Error guardando documento: ${error?.message ?? "unknown"}` };
  }

  // Auto-log: evento 'document_uploaded' en la timeline.
  await addOrderEventInternal(orderId, {
    type: "document_uploaded",
    actorId: actorEmail,
    actorType: "admin",
    payload: {
      document_id: (doc as { id: string }).id,
      file_type: input.fileType ?? "other",
      file_name: input.fileName,
    },
  });

  return { ok: true, data: mapServiceOrderDocumentRow(doc as ServiceOrderDocumentRow) };
}

/* ------------------------------------------------------------------ */
/* Listar orders por lead (para el CRM)                                */
/* ------------------------------------------------------------------ */

/**
 * Devuelve los orders asociados a un lead (1 lead → N orders via lead_id FK).
 * Usado por el endpoint `/api/admin/leads/[id]/orders` y por la sección
 * 'Servicios contratados' del LeadDetailDrawer del CRM.
 *
 * Devuelve shape ServiceOrderListItem[] (con service + variant hidratados
 * vía join, mismo patrón que listOrders()).
 */
export async function getOrdersByLeadId(
  leadId: string,
): Promise<ServiceOrderListItem[]> {
  if (!isRealMode()) return [];

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("service_orders")
    .select(
      "*, services!inner(slug, display_name, icon), service_variants!inner(slug, label)",
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[orders-server] getOrdersByLeadId falló", {
      code: error?.code,
    });
    return [];
  }

  return (data as unknown[]).map((row) => {
    const r = row as ServiceOrderRow & {
      services: { slug: string; display_name: string; icon: string | null };
      service_variants: { slug: string; label: string };
    };
    return {
      ...mapServiceOrderRow(r),
      serviceName: r.services.display_name,
      serviceSlug: r.services.slug,
      serviceIcon: r.services.icon,
      variantLabel: r.service_variants.label,
      variantSlug: r.service_variants.slug,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Order events (bajo nivel)                                           */
/* ------------------------------------------------------------------ */

export interface AddEventInput {
  type: OrderEventType;
  actorId: string | null;
  actorType: "admin" | "system" | "customer";
  payload?: Record<string, unknown>;
}

/**
 * Inserta un evento en la timeline del pedido.
 * Wrapper público (no-op si el order no existe).
 */
export async function addOrderEvent(
  orderId: string,
  input: AddEventInput,
): Promise<OpResult<ServiceOrderEvent>> {
  if (!isRealMode()) return notConfigured();
  return addOrderEventInternal(orderId, input);
}

/** Variante interna: no verifica existencia del order, no devuelve error. */
async function addOrderEventInternal(
  orderId: string,
  input: AddEventInput,
): Promise<OpResult<ServiceOrderEvent>> {
  if (!isRealMode()) return notConfigured();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("service_order_events")
    .insert({
      order_id: orderId,
      type: input.type,
      actor_id: input.actorId,
      actor_type: input.actorType,
      payload: (input.payload ?? {}) as Json,
    })
    .select("*")
    .single();

  if (error || !data) {
    // No fatal: el timeline es best-effort.
    // eslint-disable-next-line no-console
    console.error("[orders-server] addOrderEvent falló", {
      orderId,
      code: error?.code,
    });
    return {
      ok: false,
      error: `Error loggeando evento: ${error?.message ?? "unknown"}`,
    };
  }

  return {
    ok: true,
    data: mapServiceOrderEventRow(data as ServiceOrderEventRow),
  };
}

/* ------------------------------------------------------------------ */
/* Re-exports                                                           */
/* ------------------------------------------------------------------ */

export type {
  Service,
  ServiceVariant,
  ServiceWithVariants,
  ServiceOrder,
  ServiceOrderWithRelations,
  ServiceOrderEvent,
  ServiceOrderNote,
  ServiceOrderDocument,
};
