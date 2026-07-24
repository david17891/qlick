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
 * FIX 2026-07-24 (sprint event-payment-progress): el calculo del
 * "saldo pendiente" estaba mal. Antes era
 * `pendientes_count * defaultPriceMXN * 100` (FIJO). Eso significaba
 * que un confirmado que ya habia pagado un apartado de $500 quedaba
 * con un saldo pendiente de $1,000 MAS los $500 (ya cobrados).
 *
 * Ahora se calcula el progress POR confirmado via
 * `computeEventPaymentProgress` (helper puro). Cada confirmado
 * tiene su propio `balance_due_mxn` que es la diferencia entre el
 * total del evento y la suma de sus pagos cobrados. Para CANACO:
 * confirmado que pago apartado $500 -> balance $500. Confirmado
 * que liquido saldo + apartado = $1,000 -> balance $0. Confirmado
 * que no pago nada -> balance $1,000. El agregado del evento
 * suma los balances individuales.
 *
 * Tambien exponemos `payment_purpose` (reservation / balance / full)
 * leido de `metadata.payment_purpose` o del top-level del row, con
 * fallback al flag `reservation_enabled` del evento (compat con
 * pagos legacy del sprint 4 que no tenian payment_purpose).
 *
 * Privacidad: server-only, usa admin client (service role, bypass RLS).
 *
 * @server
 */

import type { EventConfirmation } from "@/types/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  computeEventPaymentProgress,
  type EventPaymentLike,
  type EventPaymentProgress,
  type PaymentPurpose,
} from "./event-payment-progress";

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
   * "reservation" | "balance" | "full" — para que la UI distinga
   * apartados de pagos completos de liquidaciones de saldo, sin
   * parsear `metadata` en cada render. Sprint 2026-07-24.
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
  /** Suma de cobrados en centavos (status=approved o paid_manual). */
  totalCollectedCentavos: number;
  /**
   * Saldo pendiente real en centavos = total_evento * confirmados_pago
   * - suma_de_cobrados_por_confirmado. Antes era
   * `pendientes_count * defaultPriceMXN` (incorrecto: cobraba el
   * precio completo encima de los apartados ya pagados).
   * Sprint 2026-07-24: este campo se calcula por confirmado via
   * `computeEventPaymentProgress` y se suma.
   */
  totalBalanceDueCentavos: number;
  /** Count de confirmados que tienen al menos un pago con payment_purpose=reservation. */
  totalReservationCount: number;
  /** Count de confirmados que tienen al menos un pago con payment_purpose=full. */
  totalFullPaymentCount: number;
  /** Breakdown por metodo. Map<method, count>. */
  byMethod: Record<string, { count: number; centavos: number }>;
  /** Breakdown por provider. Map<provider, count>. */
  byProvider: Record<string, { count: number; centavos: number }>;
}

export interface EventConfirmationPaymentProgress {
  confirmationId: string;
  confirmationName: string;
  confirmationEmail: string | null;
  /**
   * Estado derivado de los pagos. Ver `computeEventPaymentProgress`
   * para los casos validos.
   */
  progress: EventPaymentProgress;
  /** Cobrado por este confirmado (centavos, redondeado). */
  collectedCentavos: number;
  /** Saldo pendiente por este confirmado (centavos, redondeado). */
  balanceDueCentavos: number;
  /** True si el evento tiene apartado configurado. */
  hasReservation: boolean;
  /** True si este confirmado tiene un pago con payment_purpose=full. */
  hasFullPayment: boolean;
  /** Payment purpose principal del confirmado. */
  paymentPurpose: PaymentPurpose;
  /** Cantidad de pagos del confirmado. */
  paymentCount: number;
}

export interface EventPaymentsSnapshot {
  stats: EventPaymentStats;
  payments: EventPaymentRow[];
  /**
   * Progress POR confirmado. La UI del admin lo usa para mostrar
   * badges y KPIs sin recalcular. Sprint 2026-07-24.
   */
  confirmationProgress: EventConfirmationPaymentProgress[];
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
 * lista de pagos confirmados + lista de confirmados pendientes +
 * progress POR confirmado.
 *
 * FIX 2026-07-24 (sprint event-payment-progress): el calculo del
 * `totalBalanceDueCentavos` ahora se hace por confirmado via
 * `computeEventPaymentProgress` (helper puro). Antes era
 * `pendientes_count * defaultPriceMXN`, lo cual era incorrecto
 * para apartados (sumaba el total completo encima de lo ya
 * cobrado). Ver doc del helper para los detalles.
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
      totalBalanceDueCentavos: 0,
      totalReservationCount: 0,
      totalFullPaymentCount: 0,
      byMethod: {},
      byProvider: {},
    },
    payments: [],
    confirmationProgress: [],
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
    /**
     * FIX 2026-07-24: NO seleccionamos `payment_purpose` como columna
     * top-level. `event_payments` no tiene esa columna (no hay
     * migracion todavia; el brief de Fase 2 explicito: persistirlo en
     * `metadata.payment_purpose`). El helper
     * `event-payment-progress.ts` lee de `metadata.payment_purpose` con
     * fallback al flag de apartado del evento (compat legacy). Si
     * alguien agrega la columna top-level en una migracion futura,
     * incluimos este campo en el SELECT.
     */
    payment_purpose?: string | null;
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

  // 2.5 FIX 2026-07-24: leer event_rules del evento para detectar
  // apartado. Lo necesitamos para derivar payment_purpose de los pagos
  // legacy (sprint 4) que no tienen `payment_purpose` en metadata.
  let eventRulesForProgress: { reservation_enabled?: boolean; reservation_amount_mxn?: number } | null = null;
  try {
    const { data: evRow } = await supabase
      .from("events")
      .select("event_rules")
      .eq("id", eventId)
      .maybeSingle();
    if (evRow) {
      const er = (evRow as Record<string, unknown>).event_rules;
      if (er && typeof er === "object") {
        eventRulesForProgress = er as { reservation_enabled?: boolean; reservation_amount_mxn?: number };
      }
    }
  } catch {
    // best-effort: si falla, el helper usa el fallback sin evento.
  }

  // 3. Agrupar pagos por confirmation para calcular progress por
  //    confirmado.
  const paymentsByConfId = new Map<string, EventPaymentLike[]>();
  for (const p of eventPayments) {
    if (!paymentsByConfId.has(p.confirmation_id)) {
      paymentsByConfId.set(p.confirmation_id, []);
    }
    paymentsByConfId.get(p.confirmation_id)!.push({
      amount_mxn: p.amount_mxn,
      status: p.status,
      // payment_purpose se lee de metadata (no columna top-level).
      // El helper hace fallback al flag de apartado del evento.
      payment_purpose: p.payment_purpose ?? null,
      metadata: (p.metadata ?? null) as Record<string, unknown> | null,
    });
  }

  // 4. Calcular stats agregados.
  const stats: EventPaymentStats = {
    totalConfirmed: confRows.length,
    totalPaid: 0,
    totalPending: 0,
    totalPendingVerification: 0,
    totalRevoked: 0,
    totalNotRequired: 0,
    totalCollectedCentavos: 0,
    totalBalanceDueCentavos: 0,
    totalReservationCount: 0,
    totalFullPaymentCount: 0,
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

  // 5. Construir el progress por confirmado y agregarlo a stats.
  const confirmationProgress: EventConfirmationPaymentProgress[] = [];
  for (const c of confRows) {
    const payments = paymentsByConfId.get(c.id) ?? [];
    const r = computeEventPaymentProgress({
      total_mxn: defaultPriceMXN,
      payments,
      confirmation_payment_status: c.payment_status,
      event_rules: eventRulesForProgress,
    });
    // Sumar al agregado.
    stats.totalCollectedCentavos += Math.round(r.collected_mxn * 100);
    stats.totalBalanceDueCentavos += Math.round(r.balance_due_mxn * 100);
    if (r.has_reservation) stats.totalReservationCount++;
    if (r.has_full_payment) stats.totalFullPaymentCount++;
    // Fallback: si el helper dice "paid_full" pero el confirmation
    // todavia esta pending (caso del webhook de Stripe que ya cobró
    // pero el caller no promovio), igual contar como paid para
    // consistencia con el progress.
    if (r.progress === "paid_full") stats.totalPaid++;
    confirmationProgress.push({
      confirmationId: c.id,
      confirmationName: c.name,
      confirmationEmail: c.email,
      progress: r.progress,
      collectedCentavos: Math.round(r.collected_mxn * 100),
      balanceDueCentavos: Math.round(r.balance_due_mxn * 100),
      hasReservation: r.has_reservation,
      hasFullPayment: r.has_full_payment,
      paymentPurpose: r.payment_purpose,
      paymentCount: r.payment_count,
    });
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
    // FIX 2026-07-17 (sprint event-payments bug 15, David
    // "que estas haciendo? el cargo es 1000 no 10"): el campo
    // `event_payments.amount_mxn` es numeric(10,2) (PESOS con 2
    // decimales) segun migration 20260715120000 ("amount_mxn es
    // numeric (no integer en centavos)"). PERO el helper retornaba
    // el valor en `centavos` sin multiplicar por 100, y el admin
    // dividia por 100 al formatear. Resultado: cargo real \$1000
    // MXN (Stripe amount=100000 centavos) -> BD amount_mxn=1000
    // (pesos) -> helper retorna centavos:1000 -> admin: 1000/100
    // = "\$10.00 MXN". Doble error: DB guarda pesos, helper
    // retorna centavos, admin formatea centavos.
    //
    // Fix: el helper multiplica por 100 al sumar, manteniendo
    // la API consistente (el campo `centavos` que retorna el
    // helper SI es centavos, como dice el nombre). El admin no
    // cambia — sigue dividiendo por 100 al formatear, ahora
    // correctamente.
    const isCollected = p.status === "approved" || p.status === "paid_manual";
    if (isCollected) {
      // amount_mxn esta en pesos. Multiplicar por 100 para centavos
      // (Math.round para evitar floating point como 999.999999).
      // NOTA: la suma aqui es para desglose por metodo/provider.
      // La suma total del collected ya esta en
      // `stats.totalCollectedCentavos` (calculada arriba por
      // confirmacion). Aqui solo aseguramos que byMethod/byProvider
      // cuadren.
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

  // 6. Construir la lista de payments para la tabla.
  // FIX 2026-07-17: join con confirmations por `confirmation_id` (FK
  // directa, no por `idempotency_key` regex). Mucho mas simple.
  // FIX 2026-07-24: agregamos `paymentPurpose` leido del top-level
  // (con fallback a metadata y al flag del evento via el helper).
  const confById = new Map(confRows.map((c) => [c.id, c]));
  const payments: EventPaymentRow[] = eventPayments.map((p) => {
    const conf = confById.get(p.confirmation_id) ?? null;
    const md = (p.metadata ?? {}) as Record<string, unknown>;
    // Resolver el paymentPurpose del row individual (no del agregado).
    // Usamos el helper para consistencia con el progress agregado.
    const singleProgress = computeEventPaymentProgress({
      total_mxn: 0, // no importa para este calculo puntual.
      payments: [
        {
          amount_mxn: p.amount_mxn,
          status: p.status,
          payment_purpose: p.payment_purpose,
          metadata: (p.metadata ?? null) as Record<string, unknown> | null,
        },
      ],
      event_rules: eventRulesForProgress,
    });
    return {
      paymentId: p.id,
      confirmationId: p.confirmation_id,
      confirmationName: conf?.name ?? "(sin nombre)",
      confirmationEmail: conf?.email ?? null,
      method: p.method,
      // FIX bug 15: amount_mxn esta en PESOS (numeric(10,2)). El
      // campo `amountCentavos` del EventPaymentRow es la API del
      // helper (siempre centavos), asi que multiplicamos por 100.
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
      paymentPurpose: singleProgress.payment_purpose,
      createdAt: p.created_at,
    };
  });

  // 7. Lista de confirmados pendientes (los que el admin tiene que
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

  return { stats, payments, confirmationProgress, pendingConfirmations };
}
