/**
 * src/lib/payments/event-payments-server.ts
 *
 * Lecturas server-side de pagos del evento para el tab `payments` del
 * admin. Sprint pagos-manuales (2026-07-15).
 *
 * Combina datos de `payments` (provider='manual_admin' | 'stripe' | etc)
 * y `event_confirmations` (con payment_status) para que el admin vea
 * la foto completa de lo cobrado, lo pendiente, y lo revocado.
 *
 * Privacidad: server-only, usa admin client (service role, bypass RLS).
 *
 * @server
 */

import type { EventConfirmation } from "@/types/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";

/* ------------------------------------------------------------------ */
/*  Tipos publicos                                                    */
/* ------------------------------------------------------------------ */

export interface EventPaymentRow {
  paymentId: string;
  confirmationId: string;
  confirmationName: string;
  confirmationEmail: string | null;
  method: string;
  amountCentavos: number;
  currency: string;
  status: string;
  provider: string;
  externalReference: string | null;
  notes: string | null;
  /** True si el admin lo marco a mano (manual_admin provider). */
  isManual: boolean;
  /** True si pago con Stripe y tuvo verificacion por API exitosa. */
  stripeVerified: boolean;
  createdAt: string;
}

export interface EventPaymentStats {
  totalConfirmed: number;
  totalPaid: number;
  totalPending: number;
  totalPendingVerification: number;
  totalRevoked: number;
  totalNotRequired: number;
  /** Suma de cobrados en centavos (solo status=approved). */
  totalCollectedCentavos: number;
  /** Suma de pendientes en centavos (aun no cobradas, evento de pago). */
  totalPendingCentavos: number;
  /** Breakdown por metodo. Map<method, count>. */
  byMethod: Record<string, { count: number; centavos: number }>;
  /** Breakdown por provider. Map<provider, count>. */
  byProvider: Record<string, { count: number; centavos: number }>;
}

export interface EventPaymentsSnapshot {
  stats: EventPaymentStats;
  payments: EventPaymentRow[];
  /** Confirmados pendientes o pending_verification (los que el admin tiene que revisar). */
  pendingConfirmations: EventConfirmation[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/* ------------------------------------------------------------------ */
/*  Lectura principal                                                 */
/* ------------------------------------------------------------------ */

/**
 * Devuelve la foto completa de pagos de un evento: stats agregados +
 * lista de pagos confirmados + lista de confirmados pendientes.
 */
export async function getEventPaymentsSnapshot(
  eventId: string,
  defaultPriceMXN: number,
): Promise<EventPaymentsSnapshot> {
  const empty: EventPaymentsSnapshot = {
    stats: {
      totalConfirmed: 0,
      totalPaid: 0,
      totalPending: 0,
      totalPendingVerification: 0,
      totalRevoked: 0,
      totalNotRequired: 0,
      totalCollectedCentavos: 0,
      totalPendingCentavos: 0,
      byMethod: {},
      byProvider: {},
    },
    payments: [],
    pendingConfirmations: [],
  };

  if (!isRealMode() || !eventId) return empty;

  const supabase = createSupabaseAdminClient();

  // 1. Todos los confirmados del evento (con su payment_status).
  //    Usamos un cast generico al final porque el typegen no incluye
  //    payment_status todavia (migration 20260715014706 es muy nueva).
  type ConfRow = {
    id: string;
    event_id: string;
    name: string;
    email: string | null;
    phone_normalized: string | null;
    source: string;
    confirmed_at: string;
    import_batch_id: string | null;
    payment_status: string | null;
  };
  const { data: confRowsRaw } = await supabase
    .from("event_confirmations")
    .select(
      "id, event_id, name, email, phone_normalized, source, confirmed_at, import_batch_id, payment_status",
    )
    .eq("event_id", eventId);
  const confRows = (confRowsRaw ?? []) as unknown as ConfRow[];

  // 2. Todos los payments del evento (manual_admin + stripe que
  //    matcheen con confirmation_id o con metadata.product_id = eventId).
  //    Como payments NO tiene event_id directo (solo course_id o null),
  //    usamos un join manual: leemos payments que tengan
  //    metadata->>product_id = eventId o que el event_access asociado
  //    apunte al eventId.
  // Approach pragmatico: leer todos los payments recientes del sistema
  //    con provider in ('manual_admin', 'stripe') y filtrar en memoria
  //    por metadata.product_id. Para volumenes pequenos funciona; si
  //    crece, agregar un JOIN directo con event_access.
  type PayRow = {
    id: string;
    user_id: string | null;
    course_id: string | null;
    provider: string;
    external_reference: string | null;
    amount_mxn: number;
    discount_mxn: number;
    currency: string;
    status: string;
    method: string | null;
    idempotency_key: string | null;
    metadata: unknown;
    created_at: string;
  };
  const { data: payRowsRaw } = await supabase
    .from("payments")
    .select(
      "id, user_id, course_id, provider, external_reference, amount_mxn, discount_mxn, currency, status, method, idempotency_key, metadata, created_at",
    )
    .in("provider", ["manual_admin", "stripe"])
    .order("created_at", { ascending: false })
    .limit(500);
  const payRows = (payRowsRaw ?? []) as unknown as PayRow[];

  // Filtramos payments que correspondan a este evento:
  // - manual_admin: idempotency_key = "manual_admin:<confirmationId>:<ts>",
  //   donde confirmationId pertenece al evento.
  // - stripe: metadata.product_id = eventId AND metadata.product_kind = 'event'.
  const confIds = new Set(confRows.map((c) => c.id));
  const eventPayments = payRows.filter((p) => {
    if (p.provider === "manual_admin") {
      // El idem key tiene formato `manual_admin:<confirmationId>:<ts>`.
      const m = /^manual_admin:([0-9a-f-]+):/.exec(p.idempotency_key ?? "");
      if (m && confIds.has(m[1])) return true;
    } else if (p.provider === "stripe") {
      const md = (p.metadata ?? {}) as Record<string, unknown>;
      if (md.product_kind === "event" && md.product_id === eventId) return true;
    }
    return false;
  });

  // 3. Calcular stats.
  const stats: EventPaymentStats = {
    totalConfirmed: confRows.length,
    totalPaid: 0,
    totalPending: 0,
    totalPendingVerification: 0,
    totalRevoked: 0,
    totalNotRequired: 0,
    totalCollectedCentavos: 0,
    totalPendingCentavos: 0,
    byMethod: {},
    byProvider: {},
  };

  for (const c of confRows) {
    const s = c.payment_status ?? "not_required";
    if (s === "paid") stats.totalPaid++;
    else if (s === "pending") stats.totalPending++;
    else if (s === "pending_verification") stats.totalPendingVerification++;
    else if (s === "revoked") stats.totalRevoked++;
    else if (s === "not_required") stats.totalNotRequired++;
  }

  for (const p of eventPayments) {
    if (p.status === "approved") {
      stats.totalCollectedCentavos += p.amount_mxn;
    }
    const method = p.method ?? "unknown";
    if (!stats.byMethod[method]) stats.byMethod[method] = { count: 0, centavos: 0 };
    stats.byMethod[method].count++;
    if (p.status === "approved") stats.byMethod[method].centavos += p.amount_mxn;
    if (!stats.byProvider[p.provider]) stats.byProvider[p.provider] = { count: 0, centavos: 0 };
    stats.byProvider[p.provider].count++;
    if (p.status === "approved") stats.byProvider[p.provider].centavos += p.amount_mxn;
  }

  // Total pendiente (evento de pago) = confirmados en 'pending' o
  // 'pending_verification' * precio del evento. Default 0 si el evento
  // es free (defaultPriceMXN <= 0).
  if (defaultPriceMXN > 0) {
    const pendingCount =
      stats.totalPending + stats.totalPendingVerification;
    stats.totalPendingCentavos = pendingCount * defaultPriceMXN * 100;
  }

  // 4. Construir la lista de payments para la tabla.
  // Join con confirmations por idempotency_key.
  const confById = new Map(confRows.map((c) => [c.id, c]));
  const payments: EventPaymentRow[] = eventPayments.map((p) => {
    let confId: string | null = null;
    if (p.provider === "manual_admin") {
      const m = /^manual_admin:([0-9a-f-]+):/.exec(p.idempotency_key ?? "");
      if (m) confId = m[1];
    } else {
      // Para stripe, el metadata no necesariamente trae el confirmationId.
      // El event_access.payment_id nos da el camino, pero simplificamos:
      // si hay course_id=null y metadata.product_id = eventId, sacamos
      // confirmationId del external_reference que es el session id.
      // Por ahora, dejamos confirmationId=null en este caso (el admin
      // puede hacer JOIN manual si necesita).
      confId = null;
    }
    const conf = confId ? confById.get(confId) : null;
    const md = (p.metadata ?? {}) as Record<string, unknown>;
    return {
      paymentId: p.id,
      confirmationId: confId ?? "?",
      confirmationName: conf?.name ?? "(sin nombre)",
      confirmationEmail: conf?.email ?? null,
      method: p.method ?? "unknown",
      amountCentavos: p.amount_mxn,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      externalReference: p.external_reference,
      notes: typeof md.notes === "string" ? md.notes : null,
      isManual: p.provider === "manual_admin",
      stripeVerified:
        p.provider === "stripe" && md.verification === undefined
          ? true
          : typeof md.stripe_payment_intent_id === "string",
      createdAt: p.created_at,
    };
  });

  // 5. Lista de confirmados pendientes (los que el admin tiene que
  //    revisar). Solo eventos de pago tienen pendientes.
  const pendingConfirmations: EventConfirmation[] = confRows
    .filter((c) => {
      const s = c.payment_status ?? "not_required";
      return s === "pending" || s === "pending_verification";
    })
    .map((c) => ({
      id: c.id,
      eventId: c.event_id,
      name: c.name,
      email: c.email ?? undefined,
      phoneRaw: undefined,
      phoneNormalized: c.phone_normalized ?? undefined,
      source: c.source as EventConfirmation["source"],
      confirmedAt: c.confirmed_at,
      importBatchId: c.import_batch_id ?? undefined,
      paymentStatus: (c.payment_status ??
        "not_required") as EventConfirmation["paymentStatus"],
    }));

  return { stats, payments, pendingConfirmations };
}
