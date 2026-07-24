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
 * número válido con 2 decimales. Acepta SOLO el formato MX estándar:
 *
 *   - Enteros:            "1500"        → 1500
 *   - Decimales:          "1500.50"     → 1500.5
 *   - Miles:              "1,500"       → 1500
 *   - Miles + decimal:    "1,500.50"    → 1500.5
 *   - Decimales chicos:   "1.5"         → 1.5
 *
 * Reglas de rechazo (devuelve null):
 *
 *   - String vacío.
 *   - Negativos (incluye "-500").
 *   - Más de 2 decimales (ej. "1.999" → null; defensa contra que el
 *     banco redondee diferente a lo que el admin escribió).
 *   - Formato ambiguo: "10,50" sin punto → null. Esto lo dejó claro
 *     la auditoría de David el 2026-07-23: el formato "10,50" puede
 *     significar "10.50" (decimal) o "1050" (miles mal escritos), y
 *     NO queremos adivinar. Si el admin quiere 10.50 MXN, que escriba
 *     "10.50" explícito.
 *   - Formato europeo: "1.500,50" → null. Solo aceptamos MX: coma
 *     para miles, punto para decimal.
 *   - Miles mal formateados: "1,50" o "1,50,000" → null (los grupos
 *     después de la primera coma deben ser exactamente 3 dígitos).
 *   - Texto no numérico: "abc", "500abc", "--500" → null.
 *
 * Esto protege contra errores silenciosos: un admin que tipea "1,500"
 * esperando 1500 MXN lo obtiene; uno que tipea "10,50" recibe un error
 * de validación y debe corregir a "10.50".
 */
export function parseReservationAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;

  // FIX 2026-07-23 (auditoría David): distinguir explícitamente entre
  // formato MX con coma (miles) y formato ambiguo. Si el input tiene
  // coma, EXIGIMOS formato MX estricto: "1,500" o "1,500.50" o
  // "1,500,000.50" (grupos de a 3 después de la primera coma, con
  // opcional decimal al final con punto).
  let normalized: string;
  if (trimmed.includes(",")) {
    // -?\d{1,3}    parte entera de hasta 3 dígitos (puede empezar con -)
    // (,\d{3})+    uno o más grupos de miles
    // (\.\d+)?     opcional parte decimal con punto
    if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)) return null;
    normalized = trimmed.replace(/,/g, "");
  } else {
    // Sin coma: número simple con o sin decimal.
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
    normalized = trimmed;
  }

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
  /**
   * Tono del bot (input del form admin, ya trim).
   * FIX 2026-07-24 (auditoría David ronda 4): si es `undefined`, el
   * helper NO pisa el valor actual del JSONB — lo preserva del
   * `current`. Esto cubre updates parciales donde el caller (un
   * script externo, un endpoint de migración, un form futuro) no
   * incluye `personality` en el `eventRules`. Antes el server hacia
   * `?? ""` y el helper pisaba con `""`, borrando la personalidad
   * existente.
   */
  personality?: string;
  /**
   * Reglas del bot (una por línea, ya spliteadas y trimmed).
   * FIX 2026-07-24 (ronda 4): misma lógica que `personality` —
   * `undefined` significa "preservar del current".
   */
  rules?: string[];
  /**
   * Modo de Stripe. OPCIONAL: si el caller no lo está cambiando, debe
   * pasar `undefined` para preservar el valor actual del JSONB.
   *
   * FIX 2026-07-23 (auditoría David): antes, el server siempre pasaba
   * `?? "test"` al helper cuando el input no traía payment_mode, lo
   * que pisaba el valor "live" actual con "test" en cada update que
   * no tocaba explícitamente el modo de Stripe. Ahora el caller es
   * quien decide: si lo quiere cambiar, manda "test" | "live"; si no,
   * `undefined` y el helper lo respeta.
   */
  paymentMode?: "test" | "live";
  /**
   * FIX 2026-07-24 (auditoría David, ronda 3): si es `true`, el helper
   * NO toca los campos de apartado (`reservation_enabled`,
   * `reservation_amount_mxn`, `balance_amount_mxn`, `balance_due_note`):
   * los preserva del `current`. Esto cubre el caso de un update
   * PARCIAL donde el caller NO incluye `reservation_enabled` ni
   * `reservation_amount_mxn` en el input (ej. edita solo personalidad).
   * Antes mi código interpretaba `undefined` como `false` y borraba
   * la configuración de apartado existente, lo que rompía eventos
   * como CANACO.
   *
   * Reglas:
   *   - `preserveReservation: true` → no tocar campos de apartado,
   *     preservarlos del current.
   *   - `preserveReservation: false` o undefined → usar la lógica
   *     normal basada en `reservation.shouldClearReservationFields`
   *     y los montos provistos.
   */
  preserveReservation?: boolean;
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
  // Construimos el resultado con los campos que el form maneja.
  // El resto se mergea abajo desde `current`. Usamos un Partial
  // porque personality/rules son opcionales (ronda 4: updates
  // parciales que no los incluyen deben preservar los del current).
  const result: Partial<EventBotRules> = {};
  // FIX 2026-07-24 (auditoría David ronda 4): personality/rules
  // opcionales. Si el caller las provee (incluso vacías), pisamos.
  // Si NO las provee (undefined), NO las seteamos y el loop de
  // merge de abajo las trae del current. Antes siempre pisábamos
  // con `""` y `[]`, lo que borraba la personalidad y reglas
  // existentes en updates parciales.
  if (changes.personality !== undefined) {
    result.personality = changes.personality.trim();
  }
  if (changes.rules !== undefined) {
    result.rules = (changes.rules ?? [])
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
  }
  // FIX 2026-07-23 (auditoría David): payment_mode solo se setea si
  // el caller lo está cambiando explícitamente. Si es undefined,
  // NO pisamos el current — el merge de abajo lo va a traer.
  if (changes.paymentMode !== undefined) {
    result.payment_mode = changes.paymentMode;
  }

  if (changes.preserveReservation === true) {
    // FIX 2026-07-24 (auditoría David ronda 3): el caller no está
    // modificando el apartado (update parcial). NO tocamos los campos
    // de apartado en el resultado — el loop de merge de abajo los va
    // a preservar del current si existen.
  } else if (changes.reservation.shouldClearReservationFields) {
    // Apartado desactivado o free: marcar explícitamente enabled=false y
    // BORRAR los montos (no dejarlos con valores stale). Esto matchea
    // la regla del brief: "Si se desactiva el apartado, guardar
    // reservation_enabled: false y eliminar los montos obsoletos."
    result.reservation_enabled = false;
    // Para borrar, NO seteamos las keys. El JSONB persistido simplemente
    // no tendrá `reservation_amount_mxn`, `balance_amount_mxn`, etc.
    // El mapper los lee como undefined, lo que es la semántica correcta.
    // El loop de merge de abajo se encarga de no copiarlos del current.
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

  // Merge del current: preservar campos que el resultado NO setea
  // explícitamente. Esto cubre:
  //   - payment_mode cuando el caller pasó undefined (no se está cambiando)
  //   - personality/rules cuando el caller pasó undefined (ronda 4)
  //   - campos desconocidos futuros (defense in depth: si alguien agrega
  //     `cohort_id` a EventBotRules, no se pierde).
  //   - balance_due_note u otros campos que el form no maneja todavía
  //     pero que pueden estar en producción (preservamos en vez de borrar).
  const currentRecord = (current ?? {}) as unknown as Record<string, unknown>;
  for (const key of Object.keys(currentRecord)) {
    if (key === "personality" || key === "rules") {
      // FIX 2026-07-24 (ronda 4): el resultado solo trae estos campos
      // si el caller los proveyó. Si no, los traemos del current
      // (preservar en update parcial).
      if ((result as Record<string, unknown>)[key] !== undefined) {
        continue;
      }
    }
    if (key === "payment_mode") {
      // Solo preservar si el form no lo está pisando.
      if (changes.paymentMode !== undefined) continue;
    }
    if (
      key === "reservation_enabled" ||
      key === "reservation_amount_mxn" ||
      key === "balance_amount_mxn" ||
      key === "balance_due_note"
    ) {
      // FIX 2026-07-24: si el caller pidió preservar apartado, copiar
      // del current SI existe. Si no existe en current (ej. CANACO
      // pre-configuración), no se setea nada.
      if (changes.preserveReservation === true) {
        // Continuar el flujo normal al final: copiar del current si existe.
      } else if (changes.reservation.shouldClearReservationFields) {
        // El caller quiere limpiar explícitamente: NO copiar.
        continue;
      } else if ((result as Record<string, unknown>)[key] !== undefined) {
        // El resultado ya tiene este campo seteado por el form: NO copiar.
        continue;
      }
    }
    // Campo no manejado o no seteado: copiar del current.
    const v = currentRecord[key];
    if (v !== undefined) {
      (result as Record<string, unknown>)[key] = v;
    }
  }

  // Defaults finales: si el resultado no tiene personality/rules ni
  // del caller ni del current, aplicar strings/arrays vacíos. Esto
  // cumple con el tipo EventBotRules (que requiere personality y
  // rules como obligatorios) sin perder semántica.
  if (result.personality === undefined) {
    result.personality = "";
  }
  if (result.rules === undefined) {
    result.rules = [];
  }
  return result as EventBotRules;
}
