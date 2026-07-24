/**
 * src/lib/payments/event-payment-progress.ts
 *
 * Helper PURO (sin React, sin Supabase, sin fs) que deriva el estado
 * financiero de un confirmado a partir de:
 *   - el precio total del evento (price_mxn del row events),
 *   - la lista de event_payments del confirmado (con su status,
 *     amount_mxn, metadata.payment_purpose),
 *   - las flags de apartado (event_rules.reservation_* del evento).
 *
 * Sprint 2026-07-24 (sprint event-payment-progress): el sprint que
 * distingue correctamente registro / apartado / pago completo / saldo
 * pendiente / asistencia. Antes la UI calculaba el saldo como
 * `pendientes * precio_total`, lo cual era incorrecto para apartados:
 * un confirmado que ya habia pagado $500 de apartado quedaba con un
 * "saldo pendiente" de $1,000 (otro $1,000 encima de los $500 ya
 * cobrados). Este helper centraliza la logica correcta:
 *
 *   collected_mxn = suma de event_payments.amount_mxn
 *                   con status IN (approved, paid_manual)
 *   balance_due_mxn = max(total - collected, 0)
 *
 * Excluidos del cobrado (no cuentan como collected):
 *   - pending
 *   - pending_verification
 *   - failed
 *   - cancelled
 *   - refunded
 *   - revoked
 *   - disputed
 *
 * Clasificacion resultante:
 *   - collected === 0   -> unpaid
 *   - 0 < collected < total -> partial_paid
 *   - collected >= total -> paid_full
 *   - hay pagos en pending_verification -> pending_verification
 *   - todos los cobrados fueron refunded -> refunded
 *   - confirmation.payment_status = revoked -> revoked
 *   - evento free o sin pagos requeridos -> not_required
 *   - hay pagos con status desconocido/legacy -> needs_reconciliation
 *
 * NO consulta DB. NO muta nada. Es deterministico. Esto lo hace
 * facil de testear y de reusar tanto en el server (event-payments-server)
 * como en el cliente (UI del admin).
 *
 * Mantiene compatibilidad con registros historicos donde:
 *   - event_payments no tiene columna `payment_purpose` (no hay
 *     migracion todavia; la columna tampoco existe como top-level
 *     segun el contrato real de event_payments).
 *   - event_payments.metadata no tiene los campos nuevos.
 * Esos pagos se tratan como "full" (compat) si no hay flag de apartado,
 * y como "reservation" si el evento tiene apartado. Status desconocidos
 * (no en el enum del CHECK) se marcan para reconciliacion manual.
 *
 * **payment_purpose se lee EXCLUSIVAMENTE de metadata.payment_purpose.**
 * Cualquier columna top-level `payment_purpose` (si llegara a existir en
 * una migracion futura) sera ignorada para mantener un unico source of
 * truth (metadata JSONB) hasta que se documente formalmente la columna.
 *
 * **Dinero:** todo el helper trabaja en pesos (numeric(10,2) en DB).
 * Para validacion estricta de centavos, ver `validatePaymentCents` y
 * `isValidPaymentAmount` mas abajo. La regla "0 < nuevoPago <= saldoReal"
 * (correccion #3) se valida en estos helpers antes de cualquier operacion
 * de mutacion.
 */

import type { EventBotRules } from "@/types/events";

/* ------------------------------------------------------------------ */
/*  Tipos publicos                                                     */
/* ------------------------------------------------------------------ */

export type EventPaymentStatus =
  | "pending"
  | "approved"
  | "paid_manual"
  | "pending_verification"
  | "failed"
  | "cancelled"
  | "refunded"
  | "revoked"
  | "disputed";

export type PaymentPurpose = "full" | "reservation" | "balance" | "legacy_unclassified";

/**
 * Estado derivado de un confirmado segun su acumulado de pagos.
 *
 *  - `not_required`:       evento free, no se requiere pago.
 *  - `unpaid`:             evento de pago, no hay pagos cobrados.
 *  - `partial_paid`:       acumulado > 0 pero < total.
 *  - `paid_full`:          acumulado >= total.
 *  - `pending_verification`: hay pagos en pending_verification
 *                          (admin debe revisar). Puede coexistir con
 *                          pagos parciales ya cobrados.
 *  - `failed`:             todos los intentos del confirmado fallaron
 *                          (Stripe rechazo). Sin cobro exitoso.
 *  - `refunded`:           los cobrados fueron reembolsados (acumulado
 *                          post-refund == 0).
 *  - `revoked`:            el admin revoco el pago manualmente. Estado
 *                          terminal, no se promueve automaticamente.
 *  - `disputed`:           hay pagos en status `disputed` (chargeback).
 *                          Estado terminal, requiere atencion.
 *  - `needs_reconciliation`: hay pagos con status desconocido o el
 *                          ledger contradice confirmation.payment_status.
 *                          La UI NO asume pago completo en este caso.
 */
export type EventPaymentProgress =
  | "not_required"
  | "unpaid"
  | "partial_paid"
  | "paid_full"
  | "pending_verification"
  | "failed"
  | "refunded"
  | "revoked"
  | "disputed"
  | "needs_reconciliation";

export interface EventPaymentLike {
  /**
   * Pesos (numeric(10,2) en DB), no centavos. Helper de centavos:
   * `mxnToCentavos(amount_mxn) === Math.round(amount_mxn * 100)`.
   */
  amount_mxn: number;
  /**
   * Status del row. Aceptamos union estricto + string para tolerar
   * drift del typegen. Status fuera del CHECK (p.ej. "expired") se
   * cuentan en `needs_reconciliation` para que el admin los revise.
   */
  status: EventPaymentStatus | string;
  /**
   * Metadata JSONB del row. Aqui vive `payment_purpose` (unico source
   * of truth actual). Aceptamos null para rows legacy.
   */
  metadata?: Record<string, unknown> | null;
  /**
   * Campo top-level `payment_purpose` IGNORADO por este helper, aunque
   * lo aceptamos en el shape para no romper callers. Ver nota en el
   * header del archivo.
   * @deprecated leer de metadata.payment_purpose exclusivamente.
   */
  payment_purpose?: string | null;
  created_at?: string | null;
}

export interface EventPaymentProgressInput {
  /** Total del evento en MXN (events.price_mxn). 0 o negativo = free. */
  total_mxn: number;
  /** Pagos del confirmado (event_payments del row). */
  payments: EventPaymentLike[];
  /**
   * Opcional: estado del event_confirmations.payment_status.
   * Si el caller no lo pasa, usamos `null` y NO derivamos nada de el
   * (solo del ledger). Esto es importante para que el helper sea
   * testable sin Supabase.
   */
  confirmation_payment_status?:
    | "not_required"
    | "pending"
    | "paid"
    | "paid_manual"
    | "pending_verification"
    | "revoked"
    | string
    | null;
  /**
   * Opcional: event_rules del evento (para detectar apartado y derivar
   * payment_purpose de los pagos legacy).
   */
  event_rules?: Pick<EventBotRules, "reservation_enabled" | "reservation_amount_mxn"> | null;
}

export interface EventPaymentProgressResult {
  progress: EventPaymentProgress;
  total_mxn: number;
  collected_mxn: number;
  balance_due_mxn: number;
  payment_purpose: PaymentPurpose;
  payment_count: number;
  has_reservation: boolean;
  has_full_payment: boolean;
  /** Conteo por status (util para KPIs y para el tab Pagos). */
  by_status: Record<EventPaymentStatus, number>;
  /**
   * True si el ledger contradice confirmation.payment_status o si
   * hay pagos con status fuera del enum. La UI debe mostrar
   * "needs_reconciliation" en este caso, no asumir paid_full.
   */
  needs_reconciliation: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers de dinero (correccion #3: dinero en centavos)              */
/* ------------------------------------------------------------------ */

const MXN_CENTAVOS_PER_PESO = 100;
const TOLERANCE_CENTAVOS = 1; // 0.01 MXN tolerancia para comparacion de flotantes

/**
 * Convierte MXN a centavos (entero). Usa Math.round para evitar drift.
 */
export function mxnToCentavos(amountMxn: number): number {
  if (!Number.isFinite(amountMxn)) return 0;
  return Math.round(amountMxn * MXN_CENTAVOS_PER_PESO);
}

/**
 * Convierte centavos (entero) a MXN (number con 2 decimales).
 */
export function centavosToMxn(amountCentavos: number): number {
  if (!Number.isFinite(amountCentavos)) return 0;
  return Math.round(amountCentavos) / MXN_CENTAVOS_PER_PESO;
}

/**
 * Regla general de la correccion #3: 0 < nuevoPago <= saldoReal
 * (ambos en centavos, enteros). Devuelve { valid, error? }.
 */
export interface PaymentCentsValidation {
  valid: boolean;
  error: string | null;
  /** En centavos. */
  newPaymentCentavos: number;
  /** En centavos. */
  maxAllowedCentavos: number;
}

export function validatePaymentCents(args: {
  newPaymentCentavos: number;
  realBalanceCentavos: number;
  purpose: "reservation" | "balance" | "full";
  /** Apartado configurado del evento en centavos (solo para purpose=reservation). */
  configuredReservationCentavos?: number;
}): PaymentCentsValidation {
  const { newPaymentCentavos, realBalanceCentavos, purpose, configuredReservationCentavos } = args;

  if (!Number.isInteger(newPaymentCentavos)) {
    return {
      valid: false,
      error: "El monto del pago debe ser un numero entero de centavos.",
      newPaymentCentavos,
      maxAllowedCentavos: 0
    };
  }
  if (newPaymentCentavos <= 0) {
    return {
      valid: false,
      error: "El monto del pago debe ser mayor que cero.",
      newPaymentCentavos,
      maxAllowedCentavos: 0
    };
  }
  if (realBalanceCentavos <= 0) {
    return {
      valid: false,
      error: "El saldo real ya es 0. El confirmado esta pagado completo. No registres otro pago.",
      newPaymentCentavos,
      maxAllowedCentavos: 0
    };
  }

  if (purpose === "reservation") {
    if (configuredReservationCentavos !== undefined && configuredReservationCentavos > 0) {
      if (newPaymentCentavos > configuredReservationCentavos + TOLERANCE_CENTAVOS) {
        return {
          valid: false,
          error: `El monto del apartado ($${(newPaymentCentavos / 100).toLocaleString("es-MX")} MXN) no puede exceder el apartado configurado ($${(configuredReservationCentavos / 100).toLocaleString("es-MX")} MXN).`,
          newPaymentCentavos,
          maxAllowedCentavos: configuredReservationCentavos
        };
      }
    }
    return { valid: true, error: null, newPaymentCentavos, maxAllowedCentavos: configuredReservationCentavos ?? realBalanceCentavos };
  }

  if (newPaymentCentavos > realBalanceCentavos + TOLERANCE_CENTAVOS) {
    return {
      valid: false,
      error: `El monto del pago ($${(newPaymentCentavos / 100).toLocaleString("es-MX")} MXN) no puede exceder el saldo real pendiente ($${(realBalanceCentavos / 100).toLocaleString("es-MX")} MXN).`,
      newPaymentCentavos,
      maxAllowedCentavos: realBalanceCentavos
    };
  }

  return { valid: true, error: null, newPaymentCentavos, maxAllowedCentavos: realBalanceCentavos };
}

/* ------------------------------------------------------------------ */
/*  Helpers internos                                                   */
/* ------------------------------------------------------------------ */

const COLLECTED_STATUSES: ReadonlySet<string> = new Set([
  "approved",
  "paid_manual"
]);

/**
 * Determina si un pago cuenta como "cobrado" para el acumulado.
 * Excluidos: pending, pending_verification, failed, cancelled,
 * refunded, revoked, disputed.
 */
export function isCollectedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return COLLECTED_STATUSES.has(status);
}

/**
 * Status que NO cuentan como saldo cobrable (correccion #6: no sumar
 * revoked/refunded/cancelled al saldo cobrable).
 */
const NON_COLLECTABLE_STATUSES: ReadonlySet<string> = new Set([
  "revoked",
  "refunded",
  "cancelled"
]);

export function isNonCollectable(status: string | null | undefined): boolean {
  if (!status) return false;
  return NON_COLLECTABLE_STATUSES.has(status);
}

/**
 * Extrae el payment_purpose EXCLUSIVAMENTE de metadata.payment_purpose.
 * Si no esta, fallback al flag de apartado del evento (compat legacy).
 *
 * Pago "legacy_unclassified" si la metadata no tiene el campo y el
 * evento no tiene apartado: lo marcamos como "legacy_unclassified"
 * para que la UI lo muestre explicitamente (no inventar "Apartado"
 * por deduccion).
 */
function resolvePaymentPurpose(
  payment: EventPaymentLike,
  eventHasReservation: boolean
): PaymentPurpose {
  // Unica fuente: metadata.payment_purpose. NO leemos payment_purpose
  // top-level aunque el shape lo acepte (ver header del archivo).
  const meta = payment.metadata?.payment_purpose;
  if (meta === "full" || meta === "reservation" || meta === "balance") {
    return meta;
  }
  // Fallback legacy:
  //  - Evento con apartado habilitado: tratar como reservation
  //    (compat con pagos hechos antes del sprint 4 que no guardaban
  //    payment_purpose).
  //  - Evento sin apartado: NO inventar "Apartado". Marcar como
  //    "legacy_unclassified" para que la UI muestre "Legacy/sin clasificar"
  //    (correccion #9: no etiquetar como Apartado pagos ambiguos).
  if (eventHasReservation) {
    return "reservation";
  }
  return "legacy_unclassified";
}

/* ------------------------------------------------------------------ */
/*  Helper principal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Deriva el estado de pago de un confirmado a partir de sus pagos +
 * el total del evento + (opcional) las reglas del evento.
 *
 * Puro: no consulta DB, no muta nada, deterministico. Lo pueden
 * llamar tanto server (event-payments-server) como client (UI del
 * admin para mostrar badges en tiempo real).
 */
export function computeEventPaymentProgress(
  input: EventPaymentProgressInput
): EventPaymentProgressResult {
  const total = Math.max(0, input.total_mxn);
  const eventHasReservation = input.event_rules?.reservation_enabled === true;

  const byStatus: Record<EventPaymentStatus, number> = {
    pending: 0,
    approved: 0,
    paid_manual: 0,
    pending_verification: 0,
    failed: 0,
    cancelled: 0,
    refunded: 0,
    revoked: 0,
    disputed: 0
  };

  let collected = 0;
  let hasReservation = false;
  let hasFull = false;
  let hasBalance = false;
  let hasRefund = false;
  let hasDisputed = false;
  let allFailed = input.payments.length > 0;
  let hasPendingVerification = false;
  let paymentCount = 0;
  let hasUnknownStatus = false;

  for (const p of input.payments) {
    const status = (p.status ?? "pending") as EventPaymentStatus;
    if (byStatus[status] !== undefined) {
      byStatus[status]++;
    } else {
      // Status fuera del enum del CHECK (p.ej. "expired", "voided"
      // u otro drift). Lo contamos para needs_reconciliation pero
      // NO lo procesamos como collected.
      hasUnknownStatus = true;
    }
    paymentCount++;

    // payment_purpose derivado (exclusivamente de metadata).
    const purpose = resolvePaymentPurpose(p, eventHasReservation);
    if (purpose === "reservation") hasReservation = true;
    if (purpose === "full") hasFull = true;
    if (purpose === "balance") hasBalance = true;

    // Acumulado (solo status cobrados).
    if (isCollectedStatus(status)) {
      const amt = Number(p.amount_mxn) || 0;
      if (amt > 0) collected += amt;
    }

    // Flags de clasificacion.
    if (status === "pending_verification") hasPendingVerification = true;
    if (status === "refunded") hasRefund = true;
    if (status === "disputed") hasDisputed = true;
    if (status !== "failed" && status !== "refunded" && status !== "revoked" && status !== "cancelled") {
      allFailed = false;
    }
  }

  // Deteccion de contradiccion legacy (correccion #6): si el caller
  // pasa confirmation_payment_status, validamos que el ledger sea
  // consistente. Si NO lo pasa, no marcamos (puede ser test aislado).
  const confirmationStatus = input.confirmation_payment_status ?? null;
  const expectedFromConfirmation =
    confirmationStatus === "paid" || confirmationStatus === "paid_manual"
      ? "full"
      : confirmationStatus === "pending" || confirmationStatus === "pending_verification"
        ? "partial"
        : confirmationStatus === "revoked"
          ? "revoked"
          : null;
  const ledgerSuggestsFull = collected >= total && total > 0;
  const ledgerSuggestsPartial = collected > 0 && collected < total;
  const ledgerHasRevoked = byStatus.revoked > 0;
  const contradictsConfirmation =
    (expectedFromConfirmation === "full" && !ledgerSuggestsFull && !hasUnknownStatus) ||
    (expectedFromConfirmation === "partial" && (ledgerSuggestsFull || paymentCount === 0) && !hasUnknownStatus) ||
    (expectedFromConfirmation === "revoked" && !ledgerHasRevoked && !hasUnknownStatus);
  const needsReconciliation = hasUnknownStatus || contradictsConfirmation;

  // Clasificacion (correccion #7: usar SOLO el estado realmente
  // persistido del ledger; confirmation.status se usa solo para
  // deteccion de contradicciones, no para promover a paid_full).
  let progress: EventPaymentProgress;
  if (needsReconciliation) {
    // Prioridad maxima: cualquier inconsistencia requiere atencion
    // humana. NO asumimos pago completo automaticamente.
    progress = "needs_reconciliation";
  } else if (hasDisputed) {
    progress = "disputed";
  } else if (total <= 0) {
    // Evento free o sin total: no se requiere pago.
    progress = "not_required";
  } else if (byStatus.revoked > 0) {
    progress = "revoked";
  } else if (hasRefund && collected === 0) {
    // Todos los cobrados fueron reembolsados.
    progress = "refunded";
  } else if (allFailed && input.payments.length > 0) {
    progress = "failed";
  } else if (collected >= total) {
    progress = "paid_full";
  } else if (collected > 0) {
    // Hay acumulado parcial: priorizamos pending_verification si
    // hay pagos pendientes de verificar (admin debe actuar), si no,
    // es un partial_paid.
    progress = hasPendingVerification ? "pending_verification" : "partial_paid";
  } else if (hasPendingVerification) {
    progress = "pending_verification";
  } else {
    progress = "unpaid";
  }

  // payment_purpose "principal" del confirmado:
  //   - Si tiene full explicito (metadata.payment_purpose === "full"):
  //     es full.
  //   - Si solo tiene reservation(s): es reservation.
  //   - Si solo tiene balance: es balance (el cliente ya empezo a
  //     liquidar).
  //   - Si no tiene nada (estado unpaid), usamos el flag del evento
  //     para que la UI pueda anticipar "este evento acepta apartado"
  //     (purely informational).
  let paymentPurpose: PaymentPurpose = "full";
  if (hasFull) {
    paymentPurpose = "full";
  } else if (hasReservation && hasBalance) {
    // Tiene ambos: el principal es balance (estado mas reciente).
    paymentPurpose = "balance";
  } else if (hasReservation) {
    paymentPurpose = "reservation";
  } else if (hasBalance) {
    paymentPurpose = "balance";
  } else if (eventHasReservation) {
    paymentPurpose = "reservation";
  } else {
    paymentPurpose = "legacy_unclassified";
  }

  // balance_due_mxn: lo que falta para llegar al total.
  // Si collected >= total, balance es 0 (pagado completo).
  // Si collected < total, balance es (total - collected).
  // NUNCA negativo.
  const balanceDue = Math.max(0, total - collected);

  return {
    progress,
    total_mxn: total,
    collected_mxn: round2(collected),
    balance_due_mxn: round2(balanceDue),
    payment_purpose: paymentPurpose,
    payment_count: paymentCount,
    has_reservation: hasReservation,
    has_full_payment: hasFull,
    by_status: byStatus,
    needs_reconciliation: needsReconciliation
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers para la UI / KPIs                                         */
/* ------------------------------------------------------------------ */

/** Redondeo a 2 decimales (pesos). Evita drift por coma flotante. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Etiqueta humana del progress (es-MX, sin voseo). Para badges y
 * copy de UI.
 */
export function progressLabel(progress: EventPaymentProgress): string {
  switch (progress) {
    case "not_required":
      return "Sin pago requerido";
    case "unpaid":
      return "Sin pago";
    case "partial_paid":
      return "Apartado pagado";
    case "paid_full":
      return "Pagado completo";
    case "pending_verification":
      return "Pendiente de verificación";
    case "failed":
      return "Pago fallido";
    case "refunded":
      return "Reembolsado";
    case "revoked":
      return "Revocado";
    case "disputed":
      return "En disputa (needs review)";
    case "needs_reconciliation":
      return "Necesita reconciliación";
  }
}

/**
 * Tono de Badge sugerido para la UI segun el progress.
 * "neutral" | "warning" | "success" | "danger" | "info".
 */
export function progressTone(
  progress: EventPaymentProgress
): "neutral" | "warning" | "success" | "danger" | "info" {
  switch (progress) {
    case "not_required":
      return "neutral";
    case "unpaid":
      return "warning";
    case "partial_paid":
      return "info";
    case "paid_full":
      return "success";
    case "pending_verification":
      return "warning";
    case "failed":
      return "danger";
    case "refunded":
      return "info";
    case "revoked":
      return "danger";
    case "disputed":
      return "danger";
    case "needs_reconciliation":
      return "warning";
  }
}

/**
 * Etiqueta humana del payment_purpose (es-MX).
 */
export function paymentPurposeLabel(purpose: PaymentPurpose): string {
  switch (purpose) {
    case "full":
      return "Pago completo";
    case "reservation":
      return "Apartado";
    case "balance":
      return "Saldo";
    case "legacy_unclassified":
      return "Legacy/sin clasificar";
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers de agregacion (multiples confirmados)                    */
/* ------------------------------------------------------------------ */

export interface AggregateEventPaymentProgressInput {
  total_mxn_per_event: number;
  /**
   * Para cada confirmado, su lista de pagos. La firma acepta un map
   * confirmationId -> payments para que el caller no tenga que
   * re-armar el shape completo.
   */
  payments_by_confirmation: Record<string, EventPaymentLike[]>;
  /**
   * confirmation_payment_status por confirmado (opcional).
   */
  confirmation_payment_status_by_confirmation?: Record<
    string,
    EventPaymentProgressInput["confirmation_payment_status"]
  >;
  event_rules?: EventPaymentProgressInput["event_rules"];
}

export interface AggregateEventPaymentProgressResult {
  total_collected_mxn: number;
  total_balance_due_mxn: number;
  total_reservation_count: number;
  total_full_payment_count: number;
  total_pending_verification_count: number;
  total_revoked_count: number;
  total_disputed_count: number;
  total_unpaid_count: number;
  total_needs_reconciliation_count: number;
  total_confirmations: number;
}

/**
 * Agrega el estado de multiples confirmados de un mismo evento. Usado
 * por el tab "Pagos" del admin para mostrar KPIs (cobrado, saldo
 * pendiente, apartados, completos, etc).
 *
 * NOTA: el `total_mxn_per_event` se multiplica por el numero de
 * confirmados SOLO si el caller lo pasa por confirmado. Aqui asumimos
 * un unico evento, asi que `total_mxn` se aplica por confirmado.
 */
export function aggregateEventPaymentProgress(
  input: AggregateEventPaymentProgressInput
): AggregateEventPaymentProgressResult {
  const total = Math.max(0, input.total_mxn_per_event);
  const eventHasReservation = input.event_rules?.reservation_enabled === true;
  let totalCollected = 0;
  let totalBalanceDue = 0;
  let reservationCount = 0;
  let fullPaymentCount = 0;
  let pendingVerificationCount = 0;
  let revokedCount = 0;
  let disputedCount = 0;
  let unpaidCount = 0;
  let needsReconciliationCount = 0;
  let totalConfirmations = 0;

  for (const [confId, payments] of Object.entries(input.payments_by_confirmation)) {
    totalConfirmations++;
    const r = computeEventPaymentProgress({
      total_mxn: total,
      payments,
      confirmation_payment_status:
        input.confirmation_payment_status_by_confirmation?.[confId] ?? null,
      event_rules: input.event_rules
    });
    // KPI totalPaid se calcula una sola vez (correccion #6): sumamos
    // collected_mxn a totalCollected una sola vez por confirmado.
    totalCollected += r.collected_mxn;
    totalBalanceDue += r.balance_due_mxn;
    if (r.has_reservation) reservationCount++;
    if (r.has_full_payment) fullPaymentCount++;
    if (r.progress === "pending_verification") pendingVerificationCount++;
    if (r.progress === "revoked") revokedCount++;
    if (r.progress === "disputed") disputedCount++;
    if (r.progress === "unpaid") unpaidCount++;
    if (r.progress === "needs_reconciliation") needsReconciliationCount++;
    void eventHasReservation;
  }

  return {
    total_collected_mxn: round2(totalCollected),
    total_balance_due_mxn: round2(totalBalanceDue),
    total_reservation_count: reservationCount,
    total_full_payment_count: fullPaymentCount,
    total_pending_verification_count: pendingVerificationCount,
    total_revoked_count: revokedCount,
    total_disputed_count: disputedCount,
    total_unpaid_count: unpaidCount,
    total_needs_reconciliation_count: needsReconciliationCount,
    total_confirmations: totalConfirmations
  };
}
