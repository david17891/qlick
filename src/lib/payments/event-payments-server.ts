/**
 * src/lib/payments/event-payments-server.ts
 *
 * Lecturas server-side de pagos del evento para el tab `payments` del
 * admin. Sprint pagos-manuales (2026-07-15) + sprint event-payment-progress
 * (2026-07-24).
 *
 * FIX 2026-07-17 (sprint event-payments manual flow): el codigo original
 * leia de `payments` (legacy de cursos) y filtraba en memoria por
 * metadata. PERO todos los pagos de eventos (mark-paid, stripe webhook
 * de eventos) se insertan en `event_payments` (nueva tabla, FK directa
 * a `event_confirmations`). Resultado: el dashboard mostraba TODO como
 * "pendiente" aunque el pago estuviera aprobado en `event_payments`.
 *
 * FIX 2026-07-24 (sprint event-payment-progress, re-auditoria Codex v3):
 *   - SELECT estricto compatible con el esquema real de `event_payments`
 *     (sin columna `payment_purpose` top-level; se lee de
 *     `metadata.payment_purpose` unicamente).
 *   - Falla cerrado si la query falla (no enmascarar con `?? []`).
 *   - Cálculo de KPIs delegado a `aggregateEventPaymentProgress` para
 *     evitar el bug original del doble conteo de `totalPaid`.
 *   - Cada confirmado expone su `confirmationProgress` derivado del
 *     ledger via `computeEventPaymentProgress` (NO de
 *     `confirmation.payment_status` solamente).
 *   - Cada row de `event_payments` expone `paymentPurpose` derivado de
 *     `metadata.payment_purpose` (fallback legacy_unclassified si no
 *     hay metadata y el evento no tiene apartado).
 *
 * Privacidad: server-only, usa admin client (service role, bypass RLS).
 *
 * @server
 */

import type { EventConfirmation } from "@/types/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  aggregateEventPaymentProgress,
  computeEventPaymentProgress,
  type EventPaymentLike,
  type EventPaymentProgressResult,
  type PaymentPurpose,
} from "@/lib/payments/event-payment-progress";

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
  /**
   * payment_purpose derivado EXCLUSIVAMENTE de metadata.payment_purpose.
   * Si la metadata no lo trae y el evento no tiene apartado, sera
   * "legacy_unclassified" (no inventamos "Apartado" por deduccion).
   * La columna top-level `payment_purpose` NO existe en `event_payments`
   * y se ignora aunque el caller la pase.
   */
  paymentPurpose: PaymentPurpose;
  createdAt: string;
}

export interface EventPaymentStats {
  totalConfirmed: number;
  totalPaid: number;
  totalPending: number;
  totalPendingVerification: number;
  totalRevoked: number;
  totalNotRequired: number;
  /** Suma de cobrados en centavos (solo status=approved o paid_manual). */
  totalCollectedCentavos: number;
  /**
   * Suma de saldos pendientes cobrables en centavos. Por confirmado:
   * balance_due = max(total - collected, 0). Excluye revoked/refunded/
   * cancelled del saldo cobrable (correccion #6).
   */
  totalBalanceDueCentavos: number;
  /** Conteo de confirmados con al menos un payment_purpose=reservation cobrado. */
  totalReservationCount: number;
  /** Conteo de confirmados con al menos un payment_purpose=full cobrado. */
  totalFullPaymentCount: number;
  /** Conteo de confirmados con algun pago en pending_verification. */
  totalPendingVerificationCount: number;
  /** Conteo de confirmados con algun pago en status=disputed. */
  totalDisputedCount: number;
  /** Conteo de confirmados que requieren reconciliacion manual. */
  totalNeedsReconciliationCount: number;
  /** Conteo de confirmados sin pagos cobrados. */
  totalUnpaidCount: number;
  /** Breakdown por metodo. Map<method, count>. */
  byMethod: Record<string, { count: number; centavos: number }>;
  /** Breakdown por provider. Map<provider, count>. */
  byProvider: Record<string, { count: number; centavos: number }>;
}

export interface ConfirmationProgressView {
  confirmationId: string;
  /** progress del confirmado (string), para switch sobre EventPaymentProgress. */
  progress: EventPaymentProgressResult["progress"];
  /** MXN. */
  totalMxn: number;
  /** MXN (cobrado real: suma de status=approved|paid_manual). */
  collectedMxn: number;
  /** Centavos (mismo valor que collectedMxn * 100). */
  collectedCentavos: number;
  /** Centavos. */
  balanceDueCentavos: number;
  /** payment_purpose principal (helper `resolvePaymentPurpose`). */
  paymentPurpose: PaymentPurpose;
  /** Conteo de pagos del confirmado. */
  paymentCount: number;
  /** True si tiene al menos un pago con payment_purpose=reservation cobrado. */
  hasReservation: boolean;
  /** True si tiene al menos un pago con payment_purpose=full cobrado. */
  hasFullPayment: boolean;
  /** True si el ledger contradice confirmation o tiene status fuera del enum. */
  needsReconciliation: boolean;
}

export interface EventPaymentsSnapshot {
  stats: EventPaymentStats;
  payments: EventPaymentRow[];
  /** Confirmados pendientes o pending_verification (los que el admin tiene que revisar). */
  pendingConfirmations: EventConfirmation[];
  /**
   * progress derivado por confirmado. Usado por la UI del admin para
   * mostrar badges correctos y para el tab de attendees.
   */
  confirmationProgress: ConfirmationProgressView[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/* ------------------------------------------------------------------ */
/*  Columnas del SELECT (contrato real de event_payments)             */
/* ------------------------------------------------------------------ */

/**
 * FIX 2026-07-24 (correccion #1 v3): columnas EXACTAS que existen en
 * `event_payments`. NO incluir `payment_purpose` top-level (no existe
 * como columna). El proposito de pago se lee de `metadata.payment_purpose`
 * unicamente.
 */
const EVENT_PAYMENTS_SELECT =
  "id, confirmation_id, method, status, amount_mxn, currency, external_reference, idempotency_key, metadata, created_at, stripe_payment_intent_id";

const EVENT_CONFIRMATIONS_SELECT =
  "id, event_id, name, email, phone_normalized, source, confirmed_at, import_batch_id, payment_status";

/* ------------------------------------------------------------------ */
/*  Lectura principal                                                 */
/* ------------------------------------------------------------------ */

/**
 * Devuelve la foto completa de pagos de un evento: stats agregados +
 * lista de pagos confirmados + lista de confirmados pendientes +
 * progress derivado por confirmado.
 *
 * Falla cerrado: si la query de `event_payments` falla (red, RLS, etc.),
 * lanza el error al caller. La UI decidira si mostrar "Sin pagos" o
 * un error explicito (no asume "0 pagos cobrados" silenciosamente).
 */
export async function getEventPaymentsSnapshot(
  eventId: string,
  defaultPriceMXN: number,
  eventRules?: { reservation_enabled?: boolean; reservation_amount_mxn?: number } | null,
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
      totalBalanceDueCentavos: 0,
      totalReservationCount: 0,
      totalFullPaymentCount: 0,
      totalPendingVerificationCount: 0,
      totalDisputedCount: 0,
      totalNeedsReconciliationCount: 0,
      totalUnpaidCount: 0,
      byMethod: {},
      byProvider: {},
    },
    payments: [],
    pendingConfirmations: [],
    confirmationProgress: [],
  };

  if (!isRealMode() || !eventId) return empty;

  const supabase = createSupabaseAdminClient();

  // 1. Todos los confirmados del evento (con su payment_status).
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
  const { data: confRowsRaw, error: confErr } = await supabase
    .from("event_confirmations")
    .select(EVENT_CONFIRMATIONS_SELECT)
    .eq("event_id", eventId);
  if (confErr) {
    // Falla cerrado: NO enmascarar con `?? []`. El caller decidira.
    throw new Error(
      `No se pudieron leer los confirmados del evento: ${confErr.message}`,
    );
  }
  const confRows = (confRowsRaw ?? []) as unknown as ConfRow[];

  // 2. event_payments para los confirmados del evento.
  type EventPaymentDbRow = {
    id: string;
    confirmation_id: string;
    method: string;
    status: string;
    amount_mxn: number;
    currency: string;
    external_reference: string | null;
    idempotency_key: string | null;
    metadata: unknown;
    created_at: string;
    stripe_payment_intent_id: string | null;
  };
  const confIds = new Set(confRows.map((c) => c.id));
  let eventPayments: EventPaymentDbRow[] = [];
  if (confIds.size > 0) {
    const { data: epRowsRaw, error: epErr } = await supabase
      .from("event_payments" as never)
      .select(EVENT_PAYMENTS_SELECT)
      .in("confirmation_id", Array.from(confIds))
      .order("created_at", { ascending: false });
    if (epErr) {
      // Falla cerrado (correccion #1 v3): NO asumir 0 silenciosamente.
      throw new Error(
        `No se pudo leer el ledger de pagos: ${epErr.message}`,
      );
    }
    eventPayments = (epRowsRaw ?? []) as unknown as EventPaymentDbRow[];
  }

  // 3. Calcular progress por confirmado via helper puro.
  //    Agrupamos event_payments por confirmation_id.
  const paymentsByConfirmation: Record<string, EventPaymentDbRow[]> = {};
  for (const p of eventPayments) {
    if (!paymentsByConfirmation[p.confirmation_id]) {
      paymentsByConfirmation[p.confirmation_id] = [];
    }
    paymentsByConfirmation[p.confirmation_id].push(p);
  }

  // confirmation_payment_status por confirmado (opcional, para detectar
  // contradicciones legacy en computeEventPaymentProgress).
  const statusByConfirmation: Record<string, string | null> = {};
  for (const c of confRows) {
    statusByConfirmation[c.id] = c.payment_status ?? null;
  }

  // Construir payments_like por confirmado (correccion #1 v3: NO leer
  // payment_purpose top-level aunque el row lo traiga; metadata gana).
  const paymentsLikeByConfirmation: Record<string, EventPaymentLike[]> = {};
  for (const [confId, rows] of Object.entries(paymentsByConfirmation)) {
    paymentsLikeByConfirmation[confId] = rows.map((p) => ({
      amount_mxn: p.amount_mxn,
      status: p.status,
      metadata: (p.metadata ?? null) as Record<string, unknown> | null,
      // Ignoramos payment_purpose top-level aunque el shape lo acepte.
      // Si una migracion futura lo agrega, queda IGNORADO por contrato.
      created_at: p.created_at,
    }));
  }

  // Helper rules para legacy_unclassified.
  const eventHasReservation = eventRules?.reservation_enabled === true;
  const helperEventRules = eventHasReservation
    ? {
        reservation_enabled: true,
        reservation_amount_mxn: eventRules?.reservation_amount_mxn,
      }
    : null;

  // 4. Calcular progress por confirmado (helper puro).
  const confirmationProgress: ConfirmationProgressView[] = confRows.map(
    (c) => {
      const r = computeEventPaymentProgress({
        total_mxn: defaultPriceMXN,
        payments: paymentsLikeByConfirmation[c.id] ?? [],
        confirmation_payment_status:
          (c.payment_status ?? null) as
            | "not_required"
            | "pending"
            | "paid"
            | "paid_manual"
            | "pending_verification"
            | "revoked"
            | string
            | null,
        event_rules: helperEventRules,
      });
      return {
        confirmationId: c.id,
        progress: r.progress,
        totalMxn: r.total_mxn,
        collectedMxn: r.collected_mxn,
        collectedCentavos: Math.round(r.collected_mxn * 100),
        balanceDueCentavos: Math.round(r.balance_due_mxn * 100),
        paymentPurpose: r.payment_purpose,
        paymentCount: r.payment_count,
        hasReservation: r.has_reservation,
        hasFullPayment: r.has_full_payment,
        needsReconciliation: r.needs_reconciliation,
      };
    },
  );

  // 5. Calcular KPIs agregados con el helper (correccion #6 v3: una
  //    unica fuente para KPIs; totalPaid se calcula exactamente una vez).
  const aggregate = aggregateEventPaymentProgress({
    total_mxn_per_event: defaultPriceMXN,
    payments_by_confirmation: paymentsLikeByConfirmation,
    confirmation_payment_status_by_confirmation: statusByConfirmation,
    event_rules: helperEventRules,
  });

  // 6. Contadores simples derivados de confirmation.payment_status
  //    (compat con UI existente; estos NO se usan para decidir si
  //    alguien esta pagado — eso es progress.progress).
  let totalPaid = 0;
  let totalPending = 0;
  let totalPendingVerification = 0;
  let totalRevoked = 0;
  let totalNotRequired = 0;
  for (const c of confRows) {
    const s = c.payment_status ?? "not_required";
    if (s === "paid" || s === "paid_manual") totalPaid++;
    else if (s === "pending") totalPending++;
    else if (s === "pending_verification") totalPendingVerification++;
    else if (s === "revoked") totalRevoked++;
    else if (s === "not_required") totalNotRequired++;
  }

  // 7. Construir la lista de payments para la tabla.
  //    Cada row expone `paymentPurpose` derivado de metadata (helper
  //    interno resolvePaymentPurpose).
  const confById = new Map(confRows.map((c) => [c.id, c]));
  const payments: EventPaymentRow[] = eventPayments.map((p) => {
    const conf = confById.get(p.confirmation_id) ?? null;
    const md = (p.metadata ?? {}) as Record<string, unknown>;
    // Resolver payment_purpose manualmente para la fila (mismo criterio
    // que el helper interno; lo replicamos para no cambiar la shape).
    const metaPurpose = md.payment_purpose;
    let paymentPurpose: PaymentPurpose;
    if (metaPurpose === "full" || metaPurpose === "reservation" || metaPurpose === "balance") {
      paymentPurpose = metaPurpose;
    } else if (eventHasReservation) {
      paymentPurpose = "reservation";
    } else {
      paymentPurpose = "legacy_unclassified";
    }
    return {
      paymentId: p.id,
      confirmationId: p.confirmation_id,
      confirmationName: conf?.name ?? "(sin nombre)",
      confirmationEmail: conf?.email ?? null,
      method: p.method,
      // amount_mxn esta en PESOS (numeric(10,2)). El campo
      // `amountCentavos` del EventPaymentRow es la API del helper
      // (siempre centavos), asi que multiplicamos por 100.
      amountCentavos: Math.round(p.amount_mxn * 100),
      currency: p.currency,
      status: p.status,
      provider:
        p.method === "cash" || p.method === "transfer" || p.method === "card_manual"
          ? "manual_admin"
          : p.method,
      externalReference: p.external_reference,
      notes: typeof md.notes === "string" ? md.notes : null,
      isManual:
        p.method === "cash" || p.method === "transfer" || p.method === "card_manual",
      stripeVerified: p.method === "stripe" && typeof md.session_id === "string",
      paymentPurpose,
      createdAt: p.created_at,
    };
  });

  // 8. ByMethod / ByProvider (counts para UI legacy).
  const byMethod: Record<string, { count: number; centavos: number }> = {};
  const byProvider: Record<string, { count: number; centavos: number }> = {};
  for (const p of eventPayments) {
    const isCollected = p.status === "approved" || p.status === "paid_manual";
    const centavos = Math.round(p.amount_mxn * 100);
    const method = p.method ?? "unknown";
    if (!byMethod[method]) byMethod[method] = { count: 0, centavos: 0 };
    byMethod[method].count++;
    if (isCollected) byMethod[method].centavos += centavos;
    const provider = method === "cash" || method === "transfer" || method === "card_manual"
      ? "manual_admin"
      : method;
    if (!byProvider[provider]) byProvider[provider] = { count: 0, centavos: 0 };
    byProvider[provider].count++;
    if (isCollected) byProvider[provider].centavos += centavos;
  }

  // 9. Lista de confirmados pendientes (los que el admin tiene que
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

  const stats: EventPaymentStats = {
    totalConfirmed: confRows.length,
    totalPaid,
    totalPending,
    totalPendingVerification,
    totalRevoked,
    totalNotRequired,
    totalCollectedCentavos: Math.round(aggregate.total_collected_mxn * 100),
    totalBalanceDueCentavos: Math.round(aggregate.total_balance_due_mxn * 100),
    totalReservationCount: aggregate.total_reservation_count,
    totalFullPaymentCount: aggregate.total_full_payment_count,
    totalPendingVerificationCount: aggregate.total_pending_verification_count,
    totalDisputedCount: aggregate.total_disputed_count,
    totalNeedsReconciliationCount: aggregate.total_needs_reconciliation_count,
    totalUnpaidCount: aggregate.total_unpaid_count,
    byMethod,
    byProvider,
  };

  return { stats, payments, pendingConfirmations, confirmationProgress };
}
