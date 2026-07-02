/**
 * Helpers de logging estructurados para server-side.
 *
 * Estos helpers evitan el problema clásico de "console.error de debug que
 * contamina logs de producción":
 * - debugLog: solo loggea en dev (NODE_ENV !== "production"). Útil para
 *   trace de flujo (start/end de funciones, valores intermedios).
 * - errorLog: siempre loggea. Para errores reales que merecen atención
 *   incluso en producción.
 * - infoLog: siempre loggea pero a nivel info (no error). Para eventos
 *   operacionales importantes (ej: webhook signature mismatch).
 *
 * Migración de console.error → errorLog y console.log → debugLog debería
 * hacerse de forma mecánica. Ver segunda pasada del auditor 2026-07-01.
 */

/** Debug logger — solo en dev. */
export function debugLog(msg: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(msg, data ?? "");
  }
}

/** Error logger — siempre loggea. */
export function errorLog(msg: string, data?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(msg, data ?? "");
}

/** Info logger — siempre loggea, nivel info. */
export function infoLog(msg: string, data?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(msg, data ?? "");
}