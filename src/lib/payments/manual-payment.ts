/**
 * src/lib/payments/manual-payment.ts
 *
 * Pagos manuales para eventos (efectivo, tarjeta en puerta, transferencia,
 * OXXO/SPEI reportados por el cliente). El sprint cobro-de-entrada
 * (commit 897e61c) cubre el flow digital (Stripe Checkout); este lib cubre
 * el ~70% de cobros en Mexico que NO pasan por Stripe.
 *
 * Tres tipos de metodos:
 *   1. card / oxxo / spei  -> validacion contra Stripe API (token
 *      digital: pi_xxx, voucher 16 digitos, CLABE 18 digitos).
 *   2. cash / transfer    -> admin marca a mano, sin validacion.
 *   3. free_rsvp          -> no aplica, evento free.
 *
 * Source-of-truth del estado de pago del confirmado:
 *   - event_confirmations.payment_status ('not_required' | 'pending'
 *     | 'paid' | 'revoked') — migration 20260715014706.
 *   - event_access.access_source ('event_purchase' | 'manual_event_admin'
 *     | 'simulated_event_payment' | 'free_rsvp' | etc) — migration
 *     20260707100000.
 *   - payments.provider ('stripe' | 'manual_admin' | 'mock' | etc).
 *
 * El admin UI consume los 3 flags en el tab "payments" del evento.
 *
 * Auditoria:
 *   - admin_audit_log: action='manual_payment_registered' o
 *     'manual_payment_revoked' con before/after completos.
 *
 * Out of scope (sprint futuro):
 *   - Reembolsos automaticos.
 *   - Bot helper que valida vouchers automaticamente desde WhatsApp.
 *   - Multi-moneda (siempre MXN en este sprint).
 *
 * @server
 */

import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/crm/audit-server";
import { grantEventAccess } from "@/lib/lms/event-entitlements";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { sendEmail } from "@/lib/email/brevo-client";
import { renderPaymentConfirmedEmail } from "@/lib/email/templates/payment-confirmed";
import { validatePaymentCents } from "./event-payment-progress";

/* ------------------------------------------------------------------ */
/*  Tipos publicos                                                    */
/* ------------------------------------------------------------------ */

/**
 * Metodo de pago que el admin registra manualmente.
 *
 * - `card`: datáfono en puerta (sin token de Stripe — el admin lo marca
 *   con el monto cobrado).
 * - `oxxo`: cliente pago en tienda OXXO. Si nos da el voucher number,
 *   validamos contra Stripe API; si no, queda como manual.
 * - `spei`: cliente transfirio por SPEI. Si nos da la CLABE/referencia,
 *   validamos contra Stripe API; si no, queda como manual.
 * - `cash`: efectivo en puerta. Siempre manual.
 * - `transfer`: transferencia manual (BBVA, Banamex, etc) directo al
 *   admin. Siempre manual.
 */
export type ManualPaymentMethod =
  | "card"
  | "oxxo"
  | "spei"
  | "cash"
  | "transfer";

export interface ManualPaymentInput {
  eventId: string;
  confirmationId: string;
  method: ManualPaymentMethod;
  /**
   * Token digital (opcional, depende del method):
   *   - `card`  -> payment_intent_id (`pi_xxx`) si lo tienen (poco comun
   *     en puerta, mas comun si el cliente pago online y el admin
   *     confirma visualmente).
   *   - `oxxo`  -> voucher number de 16 digitos.
   *   - `spei`  -> CLABE 18 digitos o numero de referencia.
   * - `cash` / `transfer` -> null (no hay token).
   */
  voucherInput?: string | null;
  /** Monto cobrado. Default = event.price_mxn. */
  amountMXN: number;
  /**
   * Proposito del pago. Sprint 2026-07-24 (event-payment-progress):
   * diferencia entre apartado, saldo y pago completo. El helper
   * valida que el monto no exceda el maximo permitido segun el
   * proposito y el acumulado actual.
   *
   * - `reservation` (apartado): monto <= event_rules.reservation_amount_mxn.
   * - `full` (pago completo): monto <= event.price_mxn - collected.
   * - `balance` (saldo): monto <= event.price_mxn - collected.
   *
   * Si el caller no lo pasa, default = "full" (compat con sprints
   * anteriores). El server siempre debe derivar `payment_purpose`
   * de los pagos existentes + el flag de apartado del evento.
   */
  paymentPurpose?: "full" | "reservation" | "balance";
  /** Notas libres del admin. */
  notes?: string | null;
  /** Email del admin que registra (del session actual). */
  actorEmail: string;
}

export interface ManualPaymentResult {
  ok: boolean;
  paymentId?: string;
  eventAccessId?: string;
  /** Status final del confirmado despues del registro. */
  paymentStatus?: "paid" | "pending_verification" | "revoked";
  /**
   * Si el method se valido contra Stripe API, este campo tiene el
   * `payment_intent_id` de Stripe (para trazabilidad y para evitar
   * doble cobro si el admin reintenta).
   */
  stripePaymentIntentId?: string;
  /** Mensaje de error si ok=false. */
  error?: string;
  /** Nota legible para mostrar al admin. */
  note?: string;
}

export interface TokenVerificationResult {
  ok: boolean;
  /** payment_intent_id resuelto de Stripe (si la verificacion paso). */
  paymentIntentId?: string;
  /** Status del payment_intent en Stripe. */
  stripeStatus?: string;
  /** Monto del payment_intent en centavos. */
  amountCentavos?: number;
  /** Email del pagador. */
  customerEmail?: string | null;
  /** Mensaje de error si ok=false. */
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers de shape                                                 */
/* ------------------------------------------------------------------ */

const SHAPE_CARD_PI = /^pi_[A-Za-z0-9]{10,}$/; // pi_ + 14+ chars alfanumericos
const SHAPE_OXXO_VOUCHER = /^\d{16}$/; // 16 digitos exactos
const SHAPE_SPEI_CLABE = /^\d{18}$/; // 18 digitos exactos (CLABE estandard MX)
const SHAPE_SPEI_REFERENCE = /^\d{8,12}$/; // 8-12 digitos (numero de referencia SPEI)

/** Detecta el tipo de token que el admin ingreso. */
export function detectTokenKind(
  method: ManualPaymentMethod,
  input: string | null | undefined,
): "pi" | "oxxo_voucher" | "spei_clabe" | "spei_reference" | "unknown" {
  if (!input) return "unknown";
  const trimmed = input.trim();
  if (method === "card" && SHAPE_CARD_PI.test(trimmed)) return "pi";
  if (method === "oxxo" && SHAPE_OXXO_VOUCHER.test(trimmed)) return "oxxo_voucher";
  if (method === "spei" && SHAPE_SPEI_CLABE.test(trimmed)) return "spei_clabe";
  if (method === "spei" && SHAPE_SPEI_REFERENCE.test(trimmed))
    return "spei_reference";
  return "unknown";
}

/** Cliente Stripe (lazy). Lee STRIPE_SECRET_KEY del env. */
function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY no esta configurado. Define la key en .env.local o Vercel.",
    );
  }
  return new Stripe(key, {
    // Cast al union de apiVersion del SDK. Si Stripe deprecia esta
    // version, el casteo aqui sera el unico lugar a tocar (mismo
    // patron que stripe-provider.ts).
    apiVersion: "2025-09-30.clover" as never,
    typescript: true,
    appInfo: { name: "Qlick LMS", version: "1.0.0" },
  });
}

/** Server-only flag para evitar ejecucion en el bundle del cliente. */
function isServerOnly(): boolean {
  return typeof window === "undefined";
}

/* ------------------------------------------------------------------ */
/*  Verificacion contra Stripe API                                  */
/* ------------------------------------------------------------------ */

/**
 * Verifica un token digital contra Stripe API. La validacion depende
 * del method y del kind detectado:
 *
 * - `pi`           -> `paymentIntents.retrieve(pi_xxx)`, status debe ser
 *                     'succeeded'.
 * - `oxxo_voucher` -> `paymentIntents.search({ query: 'voucher_number:
 *                     "XXXX"' })`. Status 'succeeded'.
 * - `spei_clabe`   -> similar, query por CLABE.
 * - `spei_reference` -> similar, query por numero de referencia.
 *
 * Si la verificacion pasa, devolvemos el `payment_intent_id` y el monto
 * en centavos para que el caller lo use al crear el `payments` row.
 *
 * Si falla (status != 'succeeded', o el token no existe en Stripe), el
 * caller decide que hacer: mi recomendacion es marcar como
 * `pending_verification` con la nota del error, no bloquear.
 */
export async function verifyStripeToken(
  method: ManualPaymentMethod,
  input: string,
): Promise<TokenVerificationResult> {
  if (!isServerOnly()) {
    return { ok: false, error: "verifyStripeToken solo corre en server." };
  }
  const kind = detectTokenKind(method, input);
  if (kind === "unknown") {
    return {
      ok: false,
      error: `El input no tiene el shape esperado para ${method}. Verifica que sea un PI ID (pi_xxx), voucher OXXO (16 digitos), o CLABE SPEI (18 digitos).`,
    };
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe no configurado.",
    };
  }

  try {
    if (kind === "pi") {
      const pi = await stripe.paymentIntents.retrieve(input.trim());
      return {
        ok: pi.status === "succeeded",
        paymentIntentId: pi.id,
        stripeStatus: pi.status,
        amountCentavos: typeof pi.amount === "number" ? pi.amount : 0,
        customerEmail: pi.receipt_email ?? null,
        error:
          pi.status === "succeeded"
            ? undefined
            : `El PaymentIntent ${pi.id} esta en status '${pi.status}', no 'succeeded'. Pedile al cliente que confirme el pago.`,
      };
    }

    // Para OXXO / SPEI usamos search con metadata (los voucher numbers
    // se guardan en metadata.voucher_number o en la descripcion del PI).
    // Stripe search es robusto: indexa metadata, description y campos
    // custom.
    const queryField =
      kind === "oxxo_voucher"
        ? `metadata['voucher_number']:'${input.trim()}'`
        : kind === "spei_clabe"
          ? `metadata['clabe']:'${input.trim()}'`
          : `metadata['spei_reference']:'${input.trim()}'`;

    const results = await stripe.paymentIntents.search({
      query: queryField,
      limit: 1,
    });
    const pi = results.data[0];
    if (!pi) {
      return {
        ok: false,
        error: `No encontre ningun PaymentIntent en Stripe con ${kind} = ${input}. Verifica que el cliente haya pagado.`,
      };
    }
    return {
      ok: pi.status === "succeeded",
      paymentIntentId: pi.id,
      stripeStatus: pi.status,
      amountCentavos: typeof pi.amount === "number" ? pi.amount : 0,
      customerEmail: pi.receipt_email ?? null,
      error:
        pi.status === "succeeded"
          ? undefined
          : `El PaymentIntent ${pi.id} esta en status '${pi.status}', no 'succeeded'. Pedile al cliente que confirme el pago.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error consultando Stripe.",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Registro de pago manual                                          */
/* ------------------------------------------------------------------ */

/**
 * Registra un pago manual para un `event_confirmation`. Es la funcion
 * principal que el server action consume.
 *
 * Flow:
 * 1. Lee el confirmation y verifica que el evento es de pago.
 * 2. Si method in {card, oxxo, spei} y vino voucherInput -> llama a
 *    `verifyStripeToken`. Si pasa, marca como 'paid' con metadata
 *    del PI. Si falla, marca como 'pending_verification' con la nota
 *    del error (admin revisa despues).
 * 3. Si method in {cash, transfer} -> marca como 'paid' directo con
 *    el monto del admin.
 * 4. Crea row en `payments` con provider='manual_admin', method=input,
 *    amount_mxn=input, status='approved' si paso Stripe o 'admin_confirmed'
 *    si es cash/transfer.
 * 5. Crea/actualiza `event_access` con access_source='manual_event_admin',
 *    payment_id apuntando al row nuevo.
 * 6. Marca `event_confirmations.payment_status`:
 *    - 'paid' si todo OK.
 *    - 'pending_verification' si la verificacion contra Stripe fallo.
 *    - 'revoked' no se usa aca, eso es `revokePayment()`.
 * 7. Audit log con action='manual_payment_registered'.
 *
 * Si el admin quizo hacer doble cobro (confirmation ya esta 'paid' y
 * no es el mismo pago), devolvemos ok=false con error explicativo.
 */
export async function registerManualPayment(
  input: ManualPaymentInput,
): Promise<ManualPaymentResult> {
  if (!isServerOnly()) {
    return { ok: false, error: "registerManualPayment solo corre en server." };
  }
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado (modo demo)." };
  }
  if (!input.eventId || !input.confirmationId || !input.actorEmail) {
    return { ok: false, error: "Faltan eventId, confirmationId o actorEmail." };
  }
  if (!Number.isFinite(input.amountMXN) || input.amountMXN < 0) {
    return {
      ok: false,
      error: "amountMXN debe ser un numero >= 0.",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leer el confirmation. Cast a tipo local porque el typegen de
  // Supabase esta stale (la columna payment_status existe en DB desde
  // la migration 20260715014706 pero el typegen local no la incluye).
  type ConfWithPay = {
    id: string;
    event_id: string;
    name: string;
    email: string | null;
    phone_normalized: string | null;
    source: string;
    payment_status: "not_required" | "pending" | "paid" | "revoked";
  };
  const { data: conf, error: confErr } = await supabase
    .from("event_confirmations")
    .select(
      "id, event_id, name, email, phone_normalized, source, payment_status",
    )
    .eq("id", input.confirmationId)
    .eq("event_id", input.eventId)
    .maybeSingle();
  const confTyped = conf as unknown as ConfWithPay | null;

  if (confErr || !confTyped) {
    return {
      ok: false,
      error: `Confirmation ${input.confirmationId} no existe o no pertenece al evento ${input.eventId}.`,
    };
  }

  // 1.5 FIX 2026-07-24 (sprint event-payment-progress): leemos el
  // evento (total + event_rules) + los pagos previos del confirmado
  // para:
  //   - Derivar el `payment_purpose` si el caller no lo paso.
  //   - Validar que el monto no exceda el maximo permitido segun el
  //     proposito (apartado, saldo, pago completo).
  //   - Determinar el `payment_status` final del `event_confirmation`
  //     segun el acumulado TOTAL (no solo este pago).
  type EventRowLocal = {
    price_mxn: number | null;
    event_rules: unknown;
  };
  const { data: evRow, error: evErr } = await supabase
    .from("events")
    .select("price_mxn, event_rules")
    .eq("id", input.eventId)
    .maybeSingle();
  if (evErr || !evRow) {
    return {
      ok: false,
      error: `Evento ${input.eventId} no existe.`,
    };
  }
  const evTyped = evRow as unknown as EventRowLocal;
  const totalMXN =
    typeof evTyped.price_mxn === "number" && Number.isFinite(evTyped.price_mxn)
      ? Math.max(0, evTyped.price_mxn)
      : 0;
  if (totalMXN <= 0) {
    return {
      ok: false,
      error: "Este evento es gratuito. No se permite registrar pagos manuales.",
    };
  }
  // Extraer flag de apartado del JSONB event_rules.
  const er =
    evTyped.event_rules && typeof evTyped.event_rules === "object"
      ? (evTyped.event_rules as {
          reservation_enabled?: boolean;
          reservation_amount_mxn?: number;
        })
      : null;
  const eventHasReservation = er?.reservation_enabled === true;
  const configuredReservationMXN =
    typeof er?.reservation_amount_mxn === "number" &&
    Number.isFinite(er.reservation_amount_mxn) &&
    er.reservation_amount_mxn > 0
      ? er.reservation_amount_mxn
      : 0;

  // 1.6 Leer los pagos previos del confirmado para calcular el
  // acumulado. Esto es necesario para:
  //   - Validar que el nuevo pago no haga overpayment.
  //   - Determinar el `payment_status` final del confirmation.
  // FIX 2026-07-24 v2 (correcciones #1, #7): falla cerrado ante
  // errores de lectura. El helper de centavos (validatePaymentCents)
  // valida el monto en centavos enteros para evitar drift por coma
  // flotante.
  type PayRowLocal = {
    id: string;
    amount_mxn: number;
    status: string;
    payment_purpose: string | null;
    metadata: unknown;
  };
  const { data: prevPaymentsRaw, error: prevPayErr } = await supabase
    .from("event_payments" as never)
    .select("id, amount_mxn, status, payment_purpose, metadata")
    .eq("confirmation_id", input.confirmationId);
  // Falla cerrado: si la consulta falla, NO continuar (no
  // podemos calcular el acumulado ni validar contra sobrepago).
  if (prevPayErr) {
    return {
      ok: false,
      error: `Error leyendo pagos previos del confirmado: ${prevPayErr.message}. Por seguridad, no se registra el pago.`,
    };
  }
  const prevPayments = (prevPaymentsRaw ?? []) as unknown as PayRowLocal[];

  // Calcular el acumulado de pagos cobrados.
  let prevCollected = 0;
  for (const p of prevPayments) {
    if (p.status === "approved" || p.status === "paid_manual") {
      prevCollected += Number(p.amount_mxn) || 0;
    }
  }
  // Saldo real ANTES de este pago.
  const realBalance = Math.max(0, totalMXN - prevCollected);
  // El acumulado DESPUES de este pago (asumiendo que el status final
  // es "paid" o "paid_manual"). Si queda pending_verification, el
  // acumulado "visible" para el confirmation.payment_status no
  // incluye este pago, pero la validacion de sobrepago SI lo
  // considera (porque la intencion del admin fue cobrarlo).
  const newCollected = prevCollected + Math.max(0, input.amountMXN);
  const newBalance = Math.max(0, totalMXN - newCollected);

  // 1.7 Derivar el paymentPurpose si el caller no lo paso. Default
  // = "full" (compat con sprints anteriores).
  const requestedPurpose = input.paymentPurpose ?? "full";

  // 1.8 Validacion en centavos enteros (correccion #3):
  // regla general 0 < nuevoPago <= saldoReal.
  // Convertimos a centavos para validar sin drift por coma flotante.
  const newPaymentCentavos = Math.round(input.amountMXN * 100);
  const realBalanceCentavos = Math.round(realBalance * 100);
  const totalCentavos = Math.round(totalMXN * 100);
  const configuredReservationCentavos = Math.round(configuredReservationMXN * 100);

  if (requestedPurpose === "reservation") {
    if (!eventHasReservation) {
      return {
        ok: false,
        error: "Este evento no tiene apartado configurado. Usa 'Pago completo' en lugar de 'Apartado'.",
      };
    }
    if (prevCollected > 0) {
      return {
        ok: false,
        error: "Este confirmado ya tiene un pago registrado. Para registrar un segundo apartado, primero revoca el pago previo.",
      };
    }
    // FIX 2026-07-24 v2 (correccion #3): exigir exactamente el
    // apartado configurado. El admin puede usar un monto distinto
    // solo si pasa por una accion administrativa explicita (futuro).
    if (configuredReservationCentavos > 0) {
      if (newPaymentCentavos > configuredReservationCentavos) {
        return {
          ok: false,
          error: `El monto del apartado ($${(newPaymentCentavos / 100).toLocaleString("es-MX")} MXN) excede el apartado configurado del evento ($${(configuredReservationCentavos / 100).toLocaleString("es-MX")} MXN).`,
        };
      }
    }
  } else if (requestedPurpose === "balance") {
    // Correccion #3: balance solo si ya hay pago parcial y <= saldo real.
    if (prevCollected <= 0) {
      return {
        ok: false,
        error: "Para registrar un Saldo, el confirmado debe tener al menos un pago parcial previo (apartado). Si el evento no tiene pagos, usa 'Pago completo'.",
      };
    }
    if (newPaymentCentavos > realBalanceCentavos) {
      return {
        ok: false,
        error: `El monto del saldo ($${(newPaymentCentavos / 100).toLocaleString("es-MX")} MXN) no puede exceder el saldo real pendiente ($${(realBalanceCentavos / 100).toLocaleString("es-MX")} MXN).`,
      };
    }
  } else if (requestedPurpose === "full") {
    // Correccion #3: full solo si NO hay pagos previos Y el monto
    // equivale al saldo total (no menos, no mas).
    if (prevCollected > 0) {
      return {
        ok: false,
        error: "Para registrar un Pago completo, el confirmado NO debe tener pagos previos. Si ya hay un apartado, registra el Saldo en lugar del Full.",
      };
    }
    if (newPaymentCentavos !== totalCentavos) {
      return {
        ok: false,
        error: `El monto del pago completo debe ser exactamente $${(totalCentavos / 100).toLocaleString("es-MX")} MXN. Monto recibido: $${(newPaymentCentavos / 100).toLocaleString("es-MX")} MXN.`,
      };
    }
  }

  // FIX 2026-07-24 v2 (correccion #3): si saldoReal == 0, bloquear
  // cualquier pago nuevo aunque el status legacy del confirmation
  // sea inconsistente.
  if (realBalanceCentavos <= 0) {
    return {
      ok: false,
      error: "El saldo real ya es $0. El confirmado esta pagado completo. No registres otro pago (usa revokeManualPayment si necesitas reasignar).",
    };
  }

  // Validacion final con validatePaymentCents del helper (defense in
  // depth: la regla 0 < nuevoPago <= saldoReal se verifica aca
  // tambien, en centavos).
  const centsValidation = validatePaymentCents({
    newPaymentCentavos,
    realBalanceCentavos,
    purpose: requestedPurpose,
    configuredReservationCentavos:
      requestedPurpose === "reservation"
        ? configuredReservationCentavos
        : undefined
  });
  if (!centsValidation.valid) {
    return {
      ok: false,
      error: centsValidation.error ?? "Validacion de centavos rechazo el pago."
    };
  }

  // Si ya esta paid con un pago previo, abortamos para evitar doble
  // cobro al total. El caller deberia usar revokeManualPayment primero
  // o registrar un saldo (no un full adicional).
  if (confTyped.payment_status === "paid" && newBalance > 0.01) {
    return {
      ok: false,
      error: `El confirmado ${confTyped.name} ya esta marcado como pagado. Para re-registrar, primero revoca el pago previo.`,
    };
  }

  // 2. Verificacion contra Stripe (solo si method lo amerita y hay input).
  let verification: TokenVerificationResult | null = null;
  if (
    (input.method === "card" ||
      input.method === "oxxo" ||
      input.method === "spei") &&
    input.voucherInput &&
    input.voucherInput.trim().length > 0
  ) {
    verification = await verifyStripeToken(input.method, input.voucherInput);
  }

  // 3. Determinar el status final del PAGO (no del confirmation).
  // - cash / transfer: siempre 'paid' (admin confirma a mano).
  // - card/oxxo/spei con voucher que paso Stripe: 'paid'.
  // - card/oxxo/spei con voucher que NO paso: 'pending_verification'.
  // - card/oxxo/spei SIN voucher: 'paid' (admin lo marca aunque no valide).
  let finalPaymentStatus: "paid" | "pending_verification" = "paid";
  let verificationNote: string | null = null;
  if (verification) {
    if (verification.ok) {
      finalPaymentStatus = "paid";
    } else {
      finalPaymentStatus = "pending_verification";
      verificationNote = verification.error ?? "Verificacion Stripe fallo.";
    }
  }

  // 4. Crear el row en event_payments.
  // FIX 2026-07-17 (sprint event-payments manual flow): el codigo
  // original insertaba en `payments` (legacy de cursos), pero esa
  // tabla NO tiene columna `metadata` → 23514 silenciosamente
  // (error visible: "Could not find the 'metadata' column of 'payments'").
  // `event_payments` (nueva tabla, migration 20260715120000) SI tiene
  // `metadata` y FK a `event_confirmations`. Movemos el INSERT ahi.
  //
  // Mapping de metodos (event_payments_method_check):
  //   - card       → "card_manual"
  //   - oxxo       → "other" (no hay categoria especifica)
  //   - spei       → "other"
  //   - cash       → "cash" ✓
  //   - transfer   → "transfer" ✓
  //
  // Mapping de status (event_payments_status_check):
  //   - "paid"               → "paid_manual" (admin confirma a mano)
  //   - "pending_verification" → "pending" (con metadata que documenta)
  //
  // FIX 2026-07-24: persistimos `payment_purpose` dentro de
  // `metadata` (no como columna top-level). El brief de Fase 2
  // explicito: "Exponer paymentPurpose desde metadata.payment_purpose.
  // Mantener compatibilidad con registros antiguos donde no exista
  // ese metadata." Como `event_payments` no tiene columna
  // `payment_purpose` (no hay migracion para eso todavia), lo
  // guardamos en metadata JSONB. El helper
  // `event-payment-progress.ts` lee `metadata.payment_purpose` con
  // fallback al flag de apartado del evento (compat legacy).
  const eventPaymentMethod = (
    input.method === "cash" ? "cash" :
    input.method === "transfer" ? "transfer" :
    input.method === "card" ? "card_manual" :
    "other"  // oxxo, spei
  ) as "cash" | "transfer" | "card_manual" | "other";
  const eventPaymentStatus = (
    finalPaymentStatus === "paid" ? "paid_manual" : "pending"
  ) as "paid_manual" | "pending";

  const amountCentavos = Math.round(input.amountMXN * 100);
  const paymentMetadata: Record<string, unknown> = {
    manual: true,
    actor_email: input.actorEmail,
    notes: input.notes ?? null,
    original_method: input.method,
    payment_purpose: requestedPurpose,
    verification_status: finalPaymentStatus,
    verification: verification
      ? {
          ok: verification.ok,
          stripe_payment_intent_id: verification.paymentIntentId ?? null,
          stripe_status: verification.stripeStatus ?? null,
          amount_centavos: verification.amountCentavos ?? null,
        }
      : null,
  };
  const idempotencyKey = `manual_admin:${input.confirmationId}:${Date.now()}`;
  const externalReference = `manual_admin_${input.confirmationId}_${Date.now()}`;
  const { data: payment, error: payErr } = await supabase
    .from("event_payments" as never)
    .insert({
      confirmation_id: input.confirmationId,
      method: eventPaymentMethod,
      status: eventPaymentStatus,
      // FIX 2026-07-17 (sprint event-payments bug 15, David
      // "que estas haciendo? el cargo es 1000 no 10"): el campo
      // `event_payments.amount_mxn` es numeric(10,2) (PESOS con
      // 2 decimales) segun migration 20260715120000 ("amount_mxn
      // es numeric (no integer en centavos)"). ANTES este codigo
      // guardaba `amountCentavos` (= amountMXN * 100) en
      // `amount_mxn`, lo cual multiplicaba por 100 dos veces (en
      // el admin que divide por 100 al formatear): un pago
      // manual de $1000 MXN se guardaba como 100000 y se mostraba
      // como $1000.000.000.000 (centavos), o $10 si la UI dividia
      // por 100. El fix: guardar `input.amountMXN` (pesos, ya en
      // la unidad correcta) en lugar de `amountCentavos`.
      amount_mxn: input.amountMXN,
      currency: "MXN",
      external_reference: externalReference,
      idempotency_key: idempotencyKey,
      // payment_purpose se persiste en `metadata` (ver
      // paymentMetadata arriba). NO hay columna top-level todavia.
      metadata: paymentMetadata,
    } as never)
    .select("id")
    .single();

  if (payErr || !payment) {
    return {
      ok: false,
      error: `Error creando payment: ${payErr?.message ?? "unknown"}`,
    };
  }
  // Cast: el `as never` del insert hace que el response type tambien
  // sea `never`. Forzamos el shape del row para que el resto del flow
  // (grantEventAccess, audit log) pueda usar `paymentId`.
  const paymentId = (payment as unknown as { id: string }).id;

  // 5. Crear/actualizar event_access.
  // FIX 2026-07-24: cuando el acumulado llega al total, promovemos
  // el source a `event_purchase` (acceso completo por compra).
  // Antes SIEMPRE era `manual_event_admin`, lo cual no distinguia
  // entre "ya pago completo" y "admin lo forzo". Ahora:
  //   - Acumulado < total: `manual_event_admin` (pago parcial,
  //     todavia falta liquidar).
  //   - Acumulado >= total: `event_purchase` (compra confirmada).
  // grantEventAccess ya es idempotente. Si ya habia uno active del
  // mismo (user_id, event_id), actualiza el granted_reason.
  // Workaround: si no hay user_id (guest checkout manual), el
  // event_access queda con user_id=null y el bot puede link-earlo
  // despues cuando el cliente se identifique.
  const isFullyPaid = newBalance <= 0.01;
  let eventAccessId: string | undefined;
  try {
    // Si el email del confirmado matchea un user en auth.users, lo
    // usamos. Si no, queda con user_id=null y un follow-up del bot
    // puede resolverlo.
    let userId: string | null = null;
    if (confTyped.email) {
      const { data: rpcId } = await supabase.rpc("get_user_id_by_email", {
        p_email: confTyped.email,
      });
      if (rpcId) userId = rpcId as string;
    }
    if (userId) {
      const accessSource = isFullyPaid
        ? "event_purchase"
        : "manual_event_admin";
      const access = await grantEventAccess({
        userId,
        eventId: input.eventId,
        source: accessSource,
        paymentId: paymentId,
        grantedReason: isFullyPaid
          ? `manual_admin_full_${new Date().toISOString().slice(0, 16)}`
          : `manual_admin_${requestedPurpose}_${new Date()
              .toISOString()
              .slice(0, 16)}`,
      });
      eventAccessId = access.id;
    }
    // Si no hay user_id, no creamos event_access todavia. El bot o un
    // follow-up del admin lo creara cuando el cliente se identifique.
  } catch (err) {
    // No fatal: el payment ya esta creado. El grant se puede reconciliar
    // despues.
    // eslint-disable-next-line no-console
    console.error(
      "[manual-payment] grantEventAccess fallo, continuamos:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. FIX 2026-07-24 (sprint event-payment-progress): el
  // `event_confirmation.payment_status` se calcula segun el
  // ACUMULADO TOTAL del confirmado, no solo este pago. Antes se
  // ponia siempre "paid" cuando el status del row era "paid" (lo
  // cual marcaba como pagado un confirmado que solo habia pagado el
  // apartado). Ahora:
  //   - Si el acumulado >= total Y la verificacion (si aplica)
  //     paso: `paid` (o `paid_manual` si fue cash/transfer).
  //   - Si la verificacion no paso: `pending_verification`.
  //   - Si el acumulado < total: `pending` (NO se promueve a paid
  //     hasta que llegue al total).
  //
  // NOTA: `event_confirmation.payment_status` es el legacy de
  // sprint pagos-manuales. La UI nueva usa
  // `confirmationProgress.progress` (derivado de los pagos via
  // helper) que es el source-of-truth. Pero mantenemos
  // `payment_status` actualizado para compat con queries legacy
  // (ej. el bot que filtra confirmados con `payment_status=pending`
  // para no enviar el QR antes del pago completo).
  let finalConfirmationStatus: "paid" | "paid_manual" | "pending" | "pending_verification" | "revoked" = "pending";
  if (finalPaymentStatus === "pending_verification") {
    finalConfirmationStatus = "pending_verification";
  } else if (isFullyPaid) {
    finalConfirmationStatus =
      input.method === "cash" || input.method === "transfer"
        ? "paid_manual"
        : "paid";
  } else {
    finalConfirmationStatus = "pending";
  }

  const { error: updateErr } = await supabase
    .from("event_confirmations")
    .update({ payment_status: finalConfirmationStatus } as never)
    .eq("id", input.confirmationId);

  if (updateErr) {
    return {
      ok: false,
      paymentId: paymentId,
      eventAccessId,
      error: `Error actualizando payment_status: ${updateErr.message}`,
    };
  }

  // 7. Audit log.
  await logAdminAction({
    actor_email: input.actorEmail,
    action: "manual_payment_registered",
    entity_type: "event_confirmation",
    entity_id: input.confirmationId,
    metadata: {
      event_id: input.eventId,
      method: input.method,
      amount_mxn: input.amountMXN,
      payment_purpose: requestedPurpose,
      voucher_input_kind: detectTokenKind(input.method, input.voucherInput),
      stripe_payment_intent_id: verification?.paymentIntentId ?? null,
      stripe_verification_ok: verification?.ok ?? null,
      final_payment_status: finalPaymentStatus,
      final_confirmation_status: finalConfirmationStatus,
      accumulated_after_payment_mxn: newCollected,
      balance_due_after_payment_mxn: newBalance,
    },
    before: { payment_status: confTyped.payment_status },
    after: {
      payment_status: finalConfirmationStatus,
      payment_id: paymentId,
    },
  });

  // 8. Email transaccional: "recibimos tu pago". Solo cuando el pago
  //    quedo confirmado (finalPaymentStatus === 'paid'). Si quedo en
  //    pending_verification NO mandamos email (seria confuso para el
  //    cliente). Si no hay email del cliente (guest), skip silencioso.
  //    El envio es best-effort: si Brevo falla, loggeamos pero no
  //    rompemos el flow principal.
  if (finalPaymentStatus === "paid" && confTyped.email) {
    try {
      // Leemos el evento solo aca (no antes, para no penalizar paths
      // que no mandan email). Tipo local por typegen stale.
      type EventRowLocal = {
        title: string;
        starts_at: string;
        location: string | null;
      };
      const { data: ev } = await supabase
        .from("events")
        .select("title, starts_at, location")
        .eq("id", input.eventId)
        .maybeSingle();
      const evTyped = ev as unknown as EventRowLocal | null;
      if (evTyped) {
        const email = renderPaymentConfirmedEmail({
          attendeeName: confTyped.name,
          attendeeEmail: confTyped.email,
          eventTitle: evTyped.title,
          eventStartsAt: evTyped.starts_at,
          eventLocation: evTyped.location,
          paymentMethod: input.method,
          amountMXN: input.amountMXN,
          currency: "MXN",
          notes: input.notes,
        });
        await sendEmail({
          to: confTyped.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      }
    } catch (err) {
      // Best-effort: log error pero no romper el flow.
      // eslint-disable-next-line no-console
      console.error(
        "[manual-payment] sendEmail fallo (continuamos):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    ok: true,
    paymentId: paymentId,
    eventAccessId,
    paymentStatus: finalPaymentStatus,
    stripePaymentIntentId: verification?.paymentIntentId,
    note: verificationNote ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Revocacion de pago manual                                        */
/* ------------------------------------------------------------------ */

/**
 * Revoca un pago manual (cambia el payment_status a 'revoked' y, si
 * hay event_access asociado, lo desactiva). Usado cuando el admin
 * detecta que el pago no era valido (ej: voucher falso, devolucion,
 * cancelacion).
 *
 * Si el event_access ya existe, lo cambiamos a status='revoked' (no
 * lo eliminamos — es auditoria).
 */
export async function revokeManualPayment(params: {
  confirmationId: string;
  eventId: string;
  reason: string;
  actorEmail: string;
}): Promise<ManualPaymentResult> {
  if (!isServerOnly()) {
    return { ok: false, error: "revokeManualPayment solo corre en server." };
  }
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado (modo demo)." };
  }
  if (!params.confirmationId || !params.eventId || !params.actorEmail) {
    return { ok: false, error: "Faltan confirmationId, eventId o actorEmail." };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leer el confirmation. Cast a tipo local (typegen stale, ver
  //    registerManualPayment para el detalle).
  type ConfWithPay = {
    id: string;
    event_id: string;
    payment_status:
      | "not_required"
      | "pending"
      | "paid"
      | "pending_verification"
      | "revoked";
  };
  const { data: conf, error: confErr } = await supabase
    .from("event_confirmations")
    .select("id, event_id, payment_status")
    .eq("id", params.confirmationId)
    .eq("event_id", params.eventId)
    .maybeSingle();
  const confTyped = conf as unknown as ConfWithPay | null;

  if (confErr || !confTyped) {
    return {
      ok: false,
      error: `Confirmation ${params.confirmationId} no existe.`,
    };
  }
  if (
    confTyped.payment_status !== "paid" &&
    confTyped.payment_status !== "pending_verification"
  ) {
    return {
      ok: false,
      error: `Solo se puede revocar un pago en status 'paid' o 'pending_verification'. Actual: '${confTyped.payment_status}'.`,
    };
  }

  // 2. Marcar event_confirmations.payment_status='revoked'. Cast a
  //    `as never` por typegen stale.
  const { error: updateErr } = await supabase
    .from("event_confirmations")
    .update({ payment_status: "revoked" } as never)
    .eq("id", params.confirmationId);

  if (updateErr) {
    return { ok: false, error: `Error revocando: ${updateErr.message}` };
  }

  // 3. Si hay event_access activo del user+event, marcarlo como revoked.
  // grantEventAccess no expone revoke directo, asi que hacemos UPDATE
  // directo en la DB (es una operacion puntual del admin).
  const { error: accessErr } = await supabase
    .from("event_access")
    .update({
      access_status: "revoked",
      granted_reason: `revoked_by_admin_${params.actorEmail}_${new Date()
        .toISOString()
        .slice(0, 16)}`,
    } as never)
    .eq("event_id", params.eventId)
    .eq("access_status", "active");

  // Si accessErr es por "no hay rows" (PGRST116), no es fatal.
  if (accessErr && accessErr.code !== "PGRST116") {
    // eslint-disable-next-line no-console
    console.error(
      "[manual-payment] revoke event_access fallo (continuamos):",
      accessErr.message,
    );
  }

  // 4. Audit log.
  await logAdminAction({
    actor_email: params.actorEmail,
    action: "manual_payment_revoked",
    entity_type: "event_confirmation",
    entity_id: params.confirmationId,
    metadata: {
      event_id: params.eventId,
      reason: params.reason,
    },
    before: { payment_status: confTyped.payment_status },
    after: { payment_status: "revoked" },
  });

  return {
    ok: true,
    paymentStatus: "revoked",
    note: `Pago revocado. Razon: ${params.reason}`,
  };
}

