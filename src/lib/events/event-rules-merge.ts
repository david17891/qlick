/**
 * Helper puro para construir / validar la sección de `event_rules` del panel
 * admin de eventos (sprint apartado CANACO, 2026-07-23).
 *
 * Centraliza dos cosas:
 *
 * 1. `parseReservationAmount(raw)` — convierte el string del input admin
 *    (que puede ser vacío, decimal con comas, etc.) a un número válido con
 *    un máximo de 2 decimales (estándar MXN). Devuelve null si no parsea.
 *
 * 2. `buildEventRulesFromForm({ current, formChanges })` — toma el
 *    `event_rules` actual del evento y los cambios que vienen del form
 *    (personality, rules, payment_mode, reservation_*), y devuelve el
 *    JSONB final que se persiste. La idea: NO hacer whitelist destructivo
 *    que borre campos extra del JSONB (si en el futuro se agregan más
 *    flags, el form los preserva por construcción).
 *
 * 3. `validateReservation({ priceMXN, enabled, amount })` — valida la
 *    combinación precio / apartado contra las reglas de negocio (el
 *    precio debe ser > 0, el apartado > 0, apartado < total, no negativos,
 *    no NaN, máximo 2 decimales). Devuelve `{ valid, error?, balance? }`.
 *
 * Todo esto es PURO (sin imports de React, sin Supabase, sin fs) para que
 * se pueda testear con `node --test` sin bootstrap de Next. El admin UI
 * y el server lib consumen este helper; los tests lo cubren directamente.
 */

import type { EventBotRules } from "@/types/events";

/* ------------------------------------------------------------------ */
/* Parsing + helpers numéricos                                         */
/* ------------------------------------------------------------------ */

/**
 * Convierte un string de input admin ("", "500", "1,500.50", "  1.5  ") a
 * número válido con 2 decimales. Acepta coma o punto como separador
 * decimal (costumbre mexicana: "1,500.50"). Devuelve null si:
 *   - el string vacío,
 *   - no parsea,
 *   - es negativo,
 *   - tiene más de 2 decimales.
 *
 * Regla de "decimales excesivos": 1.234 → null. Esto protege contra que
 * un admin tipee "1.999" pensando que se trunca, y que el checkout
 * después cobre 1.999 (con redondeo del banco puede variar).
 */
export function parseReservationAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  // Aceptar coma como separador de miles y como decimal (costumbre MX).
  // Estrategia: si hay AMBOS, el último es el decimal; si no, asumimos
  // MX: "." es decimal y "," es miles. Simplificado: remover comas
  // (separador de miles) y dejar el punto.
  const normalized = trimmed.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  // Máximo 2 decimales: contar dígitos después del punto.
  const dotIdx = normalized.indexOf(".");
  if (dotIdx !== -1) {
    const decimals = normalized.length - dotIdx - 1;
    if (decimals > 2) return null;
  }
  return n;
}

/** Saldo pendiente = total - apartado. Devuelve null si alguno falta o es inválido. */
export function computeBalance(
  priceMXN: number | null | undefined,
  reservationAmount: number | null | undefined,
): number | null {
  if (typeof priceMXN !== "number" || !Number.isFinite(priceMXN)) return null;
  if (typeof reservationAmount !== "number" || !Number.isFinite(reservationAmount)) {
    return null;
  }
  if (priceMXN <= 0 || reservationAmount <= 0) return null;
  if (reservationAmount >= priceMXN) return null;
  // Redondeo a 2 decimales para evitar drift por coma flotante.
  return Math.round((priceMXN - reservationAmount) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Validación de la combinación precio / apartado                      */
/* ------------------------------------------------------------------ */

export interface ReservationValidationInput {
  /** Precio total del evento (MXN). 0 o negativo = evento free. */
  priceMXN: number | null | undefined;
  /** ¿Apartado habilitado? Viene del checkbox del form. */
  enabled: boolean | null | undefined;
  /** Monto del apartado (MXN) ya parseado. null si el input está vacío. */
  amount: number | null | undefined;
}

export interface ReservationValidationResult {
  /** true si la combinación es válida para guardar. */
  valid: boolean;
  /** Mensaje en español MX neutro (sin voseo). null si no hay error. */
  error: string | null;
  /** Saldo pendiente (válido solo si enabled=true y amount válido). null si no aplica. */
  balance: number | null;
  /** Si enabled=false: el monto y saldo quedan null (se limpian al persistir). */
  shouldClearReservationFields: boolean;
}

/**
 * Reglas de negocio (sprint apartado CANACO, brief 2026-07-23):
 *
 * - Si el evento es free (priceMXN <= 0):
 *     - Si enabled=true: error "no puedes activar apartado en un evento free".
 *       Forzamos shouldClearReservationFields=true para limpiar al persistir.
 *     - Si enabled=false: válido, shouldClear=true (limpiamos por defensa).
 *
 * - Si enabled=false: válido, shouldClear=true. No importan los montos.
 *
 * - Si enabled=true y el evento es de pago:
 *     - amount requerido (>0). Vacío, 0, negativo o NaN → error.
 *     - amount < priceMXN estricto. amount == priceMXN → error.
 *       amount > priceMXN → error.
 *     - Si todo OK → balance = priceMXN - amount, shouldClear=false.
 */
export function validateReservation(
  input: ReservationValidationInput,
): ReservationValidationResult {
  const priceMXN =
    typeof input.priceMXN === "number" && Number.isFinite(input.priceMXN)
      ? input.priceMXN
      : 0;
  const enabled = input.enabled === true;
  const amount = input.amount;

  // Free event: apartado no aplica, limpiar.
  if (priceMXN <= 0) {
    if (enabled) {
      return {
        valid: false,
        error:
          "No puedes activar apartado en un evento gratuito. Desmarca la casilla.",
        balance: null,
        shouldClearReservationFields: true,
      };
    }
    return {
      valid: true,
      error: null,
      balance: null,
      shouldClearReservationFields: true,
    };
  }

  // De pago pero apartado desactivado: limpiar campos.
  if (!enabled) {
    return {
      valid: true,
      error: null,
      balance: null,
      shouldClearReservationFields: true,
    };
  }

  // De pago + apartado activado: validar monto.
  if (amount === null || amount === undefined) {
    return {
      valid: false,
      error: "Indica el monto del apartado.",
      balance: null,
      shouldClearReservationFields: true,
    };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      valid: false,
      error: "El monto del apartado debe ser mayor que cero.",
      balance: null,
      shouldClearReservationFields: true,
    };
  }
  if (amount >= priceMXN) {
    return {
      valid: false,
      error:
        "El monto del apartado debe ser menor que el precio total. Si el evento se paga en una sola exhibici\u00f3n, desmarca la casilla de apartado.",
      balance: null,
      shouldClearReservationFields: true,
    };
  }
  return {
    valid: true,
    error: null,
    balance: computeBalance(priceMXN, amount),
    shouldClearReservationFields: false,
  };
}

/* ------------------------------------------------------------------ */
/* Merge del eventRules (preservar campos extra)                       */
/* ------------------------------------------------------------------ */

export interface FormEventRulesChanges {
  /** Tono del bot (input del form admin, ya trim). */
  personality: string;
  /** Reglas del bot (una por línea, ya spliteadas y trimmed). */
  rules: string[];
  /** Modo de Stripe. Default "test" si no viene. */
  paymentMode: "test" | "live";
  /**
   * Resultado de `validateReservation` aplicado al form actual.
   * El caller (EventDrawer) lo calcula y lo pasa. NO recalculamos acá
   * para evitar acoplar el form con la función de validación.
   */
  reservation: ReservationValidationResult;
  /**
   * Monto del apartado YA PARSEADO con `parseReservationAmount`.
   * Solo se persiste si la validación fue exitosa y enabled=true.
   */
  reservationAmountParsed: number | null;
}

export interface BuildEventRulesArgs {
  /** `event_rules` actual del evento (puede ser null/undefined en creación). */
  current: EventBotRules | null | undefined;
  /** Cambios que vienen del form. */
  changes: FormEventRulesChanges;
}

/**
 * Construye el `EventBotRules` final a persistir.
 *
 * Reglas:
 *
 * 1. PRESERVACIÓN: cualquier campo del `current` que NO esté manejado
 *    explícitamente por el form (futuro: tags, cohortes, etc.) se
 *    mantiene. Hoy el form solo conoce personality, rules, payment_mode,
 *    reservation_*. Si la DB tiene un campo extra, no lo tocamos.
 *
 * 2. CAMPOS MANEJADOS:
 *    - `personality` y `rules`: se pisan con los del form.
 *    - `payment_mode`: se pisa con `changes.paymentMode`.
 *    - `reservation_enabled` y `reservation_amount_mxn` /
 *      `balance_amount_mxn` / `balance_due_note`:
 *        - Si `changes.reservation.shouldClearReservationFields` es true:
 *          se setean a sus valores "limpio" (enabled=false, sin montos).
 *        - Si no, se setean con los datos del form.
 *
 * 3. BALANCE: se calcula como `priceMXN - reservationAmount`. NO se
 *    confía en lo que el form mande como balance (siempre recalculamos
 *    acá por seguridad). La nota de saldo usa un default razonable si
 *    no viene.
 */
export function buildEventRulesFromForm(args: BuildEventRulesArgs): EventBotRules {
  const { current, changes } = args;
  const result: EventBotRules = {
    personality: changes.personality.trim(),
    rules: (changes.rules ?? []).map((r) => r.trim()).filter((r) => r.length > 0),
    payment_mode: changes.paymentMode,
  };

  if (changes.reservation.shouldClearReservationFields) {
    // Apartado desactivado o free: marcar explícitamente enabled=false y
    // BORRAR los montos (no dejarlos con valores stale). Esto matchea
    // la regla del brief: "Si se desactiva el apartado, guardar
    // reservation_enabled: false y eliminar los montos obsoletos."
    result.reservation_enabled = false;
    // Para borrar, NO seteamos las keys. El JSONB persistido simplemente
    // no tendrá `reservation_amount_mxn`, `balance_amount_mxn`, etc.
    // El mapper los lee como undefined, lo que es la semántica correcta.
    // PERO: si el evento YA tenía esos campos seteados, queremos que se
    // borren. Eso lo hace el spread selectivo más abajo.
  } else {
    // Apartado activo: persistir enabled, monto, balance y nota.
    result.reservation_enabled = true;
    if (changes.reservationAmountParsed !== null) {
      result.reservation_amount_mxn = changes.reservationAmountParsed;
    }
    if (changes.reservation.balance !== null) {
      result.balance_amount_mxn = changes.reservation.balance;
    }
    // Nota de saldo: por default "el día del evento". El form podría
    // permitir editarla en el futuro; hoy se hardcodea.
    result.balance_due_note = "el día del evento";
  }

  // Preservar cualquier campo extra que exista en `current` y que NO
  // estamos pisando arriba. Defense in depth: si en el futuro alguien
  // agrega un campo a `current` (ej. `cohort_id`), no lo perdemos.
  const currentRecord = (current ?? {}) as unknown as Record<string, unknown>;
  for (const key of Object.keys(currentRecord)) {
    if (key === "personality" || key === "rules" || key === "payment_mode") {
      continue; // ya los manejamos arriba
    }
    if (key === "reservation_enabled" || key === "reservation_amount_mxn" ||
        key === "balance_amount_mxn" || key === "balance_due_note") {
      // Manejado arriba. Si "debe limpiarse", no copiamos del current.
      if (changes.reservation.shouldClearReservationFields) {
        continue;
      }
      // Si no, ya los seteamos arriba con los valores del form.
      // Pero si el form no los proveyó (caso raro), caemos al current
      // para no perderlos.
      if (result[key as keyof EventBotRules] === undefined) {
        const v = currentRecord[key];
        if (v !== undefined) {
          (result as unknown as Record<string, unknown>)[key] = v;
        }
      }
      continue;
    }
    // Campo desconocido: preservar tal cual.
    const v = currentRecord[key];
    if (v !== undefined) {
      (result as unknown as Record<string, unknown>)[key] = v;
    }
  }

  return result;
}
