/**
 * src/lib/payments/event-payments-server.ts
 *
 * Lecturas server-side de pagos del evento para el tab `payments` del
 * admin. Sprint pagos-manuales (2026-07-15).
 *
 * FIX 2026-07-17 (sprint event-payments manual flow): el codigo original
 * leia de `payments` (legacy de cursos) y filtraba en memoria por
 * metadata. PERO todos los pagos de eventos (mark-paid, stripe webhook
 * de eventos) se insertan en `event_payments` (nueva tabla, FK directa
 * a `event_confirmations`). Resultado: el dashboard mostraba TODO como
 * "pendiente" aunque el pago estuviera aprobado en `event_payments`.
 *
 * Fix: leer de `event_payments` directamente con join por
 * `confirmation_id`. La tabla legacy `payments` queda intacta para
 * pagos de cursos (no tocada).
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

  // 2. FIX 2026-07-17: leer de `event_payments` (NO de `payments`).
  //    `event_payments` es la nueva tabla con FK directa a
  //    `event_confirmations`. La tabla legacy `payments` es solo
  //    para cursos.
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
  };
  const confIds = new Set(confRows.map((c) => c.id));
  let eventPayments: EventPaymentDbRow[] = [];
  if (confIds.size > 0) {
    const { data: epRowsRaw } = await supabase
      .from("event_payments" as never)
      .select(
        "id, confirmation_id, method, status, amount_mxn, currency, external_reference, idempotency_key, metadata, created_at",
      )
      .in("confirmation_id", Array.from(confIds))
      .order("created_at", { ascending: false });
    eventPayments = (epRowsRaw ?? []) as unknown as EventPaymentDbRow[];
  }

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
    // FIX 2026-07-17: `paid_manual` (pago en puerta) cuenta como paid
    // tambien. Antes solo `paid` se contaba → David (paid_manual) no
    // aparecia en el contador `totalPaid` aunque SÍ estaba aprobado en
    // event_payments.
    if (s === "paid" || s === "paid_manual") stats.totalPaid++;
    else if (s === "pending") stats.totalPending++;
    else if (s === "pending_verification") stats.totalPendingVerification++;
    else if (s === "revoked") stats.totalRevoked++;
    else if (s === "not_required") stats.totalNotRequired++;
  }

  for (const p of eventPayments) {
    // FIX 2026-07-17 (sprint event-payments manual flow, feedback
    // David "Cobrado $0.00 MXN"): el codigo original solo contaba
    // `status === "approved"` para sumar al cobrado. PERO los pagos
    // manuales del staff (mark-paid, register-manual-payment) usan
    // `status = "paid_manual"` (CHECK enum de event_payments). Esos
    // NO se contaban en `totalCollectedCentavos` aunque fueran pagos
    // confirmados. Ahora contamos tanto `approved` (Stripe) como
    // `paid_manual` (cash/transfer) como cobrado.
    //
    // FIX 2026-07-17 (sprint event-payments bug 15, David "ahí
    // está poniendo 10 pesos"): el campo `event_payments.amount_mxn`
    // es numeric(10,2) (PESOS con 2 decimales), no centavos. La
    // migration 20260715120000_event_payments.sql confirma: "amount_mxn
    // es numeric (no integer en centavos)". PERO el helper retornaba
    // el valor en `centavos` sin multiplicar por 100, y el admin
    // dividía por 100 al formatear (`(centavos / 100).toFixed(2)`).
    // Resultado: un cargo de $1000 MXN se guardaba como amount_mxn=1000
    // (pesos), el helper lo pasaba como `centavos: 1000`, y el admin
    // mostraba `$10.00 MXN` (1000 / 100). Doble error de unidades.
    //
    // Fix: el helper multiplica por 100 al sumar, manteniendo la
    // API consistente (el campo `centavos` que retorna el helper
    // SI es centavos, como dice el nombre). El admin no cambia —
    // sigue dividiendo por 100 al formatear, ahora correctamente.
    const isCollected = p.status === "approved" || p.status === "paid_manual";
    if (isCollected) {
      // amount_mxn esta en pesos. Multiplicar por 100 para centavos
      // (Math.round para evitar floating point como 999.999999).
      stats.totalCollectedCentavos += Math.round(p.amount_mxn * 100);
    }
    const method = p.method ?? "unknown";
    if (!stats.byMethod[method]) stats.byMethod[method] = { count: 0, centavos: 0 };
    stats.byMethod[method].count++;
    if (isCollected) {
      stats.byMethod[method].centavos += Math.round(p.amount_mxn * 100);
    }
    // Para `event_payments` no hay columna `provider` separada —
    // `method` ya distingue online/stripe, cash, transfer, etc.
    if (!stats.byProvider[method]) stats.byProvider[method] = { count: 0, centavos: 0 };
    stats.byProvider[method].count++;
    if (isCollected) {
      stats.byProvider[method].centavos += Math.round(p.amount_mxn * 100);
    }
  }

  // Total pendiente (evento de pago) = confirmados en 'pending' o
  // 'pending_verification' * precio del evento. Default 0 si el evento
  // es free (defaultPriceMXN <= 0).
  //
  // FIX bug 15: defaultPriceMXN ya está en pesos (viene de
  // event.priceMXN). Multiplicar por 100 para centavos (la API del
  // helper retorna centavos).
  if (defaultPriceMXN > 0) {
    const pendingCount =
      stats.totalPending + stats.totalPendingVerification;
    stats.totalPendingCentavos = pendingCount * defaultPriceMXN * 100;
  }

  // 4. Construir la lista de payments para la tabla.
  // FIX 2026-07-17: join con confirmations por `confirmation_id` (FK
  // directa, no por `idempotency_key` regex). Mucho mas simple.
  const confById = new Map(confRows.map((c) => [c.id, c]));
  const payments: EventPaymentRow[] = eventPayments.map((p) => {
    const conf = confById.get(p.confirmation_id) ?? null;
    const md = (p.metadata ?? {}) as Record<string, unknown>;
    return {
      paymentId: p.id,
      confirmationId: p.confirmation_id,
      confirmationName: conf?.name ?? "(sin nombre)",
      confirmationEmail: conf?.email ?? null,
      method: p.method,
      // FIX bug 15: amount_mxn esta en PESOS (numeric(10,2) segun
      // migration 20260715120000). El campo `amountCentavos` del
      // EventPaymentRow es la API del helper (siempre centavos),
      // asi que multiplicamos por 100 para mantener consistencia
      // con `totalCollectedCentavos` y la UI del admin que divide
      // por 100 al formatear.
      amountCentavos: Math.round(p.amount_mxn * 100),
      currency: p.currency,
      status: p.status,
      // Para `event_payments`, `provider` no existe separado. Usamos
      // el metodo como proxy: stripe -> "stripe", cash -> "manual_admin",
      // etc. Esto preserva la UI del admin (que filtra por provider).
      provider: p.method === "cash" || p.method === "transfer" || p.method === "card_manual"
        ? "manual_admin"
        : p.method,
      externalReference: p.external_reference,
      notes: typeof md.notes === "string" ? md.notes : null,
      isManual: p.method === "cash" || p.method === "transfer" || p.method === "card_manual",
      stripeVerified:
        p.method === "stripe" && typeof md.session_id === "string",
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
