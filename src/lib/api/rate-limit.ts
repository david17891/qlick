/**
 * Sliding-window rate limiter para endpoints HTTP.
 *
 * Uso típico: rate-limit por IP en endpoints públicos (sin auth de usuario)
 * que pueden recibir spam o abuso. La "key" es la IP del cliente (o
 * `unknown` si el request no expone IP).
 *
 * Modelo: ventana deslizante de WINDOW_MS con cap MAX_CALLS_PER_WINDOW por key.
 *
 * Almacenamiento in-memory (Map). Trade-offs aceptados:
 *  - En Vercel hobby cada función corre en un container aislado, así que el
 *    counter NO es compartido entre invocaciones paralelas. Esto significa
 *    que un atacante que logra concurrencia podría multiplicar su límite por
 *    N (donde N = concurrencia). Para el caso de uso de Qlick (1 mensaje
 *    por IP a la vez en formularios públicos) el riesgo es bajo.
 *  - Counter se reinicia con cada cold-start del container (~5-15 min idle).
 *    Para evitar memory growth en containers long-lived, llamá
 *    `cleanupRateLimitStore()` periódicamente.
 *
 * **NO usar para rate-limit de LLM (DeepSeek)** — ese vive en
 * `src/lib/ai/per-phone-rate-limit.ts` porque la key es semántica (phone del
 * lead), no IP.
 *
 * Server-only.
 *
 * @server
 */

/** Default: 5 calls / 60s por IP. */
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_CALLS_PER_WINDOW = 5;

const recentByKey = new Map<string, number[]>();

export interface RateLimitDecision {
  allowed: boolean;
  callCount: number;
  /** ms hasta que la entrada más vieja de la ventana salga (0 si allowed). */
  resetMs: number;
}

export interface RateLimitOptions {
  windowMs?: number;
  maxCalls?: number;
}

/**
 * Sliding window. Devuelve `{ allowed: false, callCount, resetMs }` cuando
 * el caller debe ser rechazado. El handler HTTP traduce eso a 429.
 */
export function recordAndCheckRateLimit(
  key: string,
  options: RateLimitOptions = {}
): RateLimitDecision {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxCalls = options.maxCalls ?? DEFAULT_MAX_CALLS_PER_WINDOW;
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = recentByKey.get(key) ?? [];
  const fresh = arr.filter((t) => t > cutoff);

  if (fresh.length >= maxCalls) {
    const oldestInWindow = fresh[0] ?? now;
    recentByKey.set(key, fresh);
    return {
      allowed: false,
      callCount: fresh.length,
      resetMs: windowMs - (now - oldestInWindow),
    };
  }

  fresh.push(now);
  recentByKey.set(key, fresh);
  return {
    allowed: true,
    callCount: fresh.length,
    resetMs: windowMs,
  };
}

/**
 * Higiene: limpia entradas con timestamps ya fuera de la ventana.
 * Llamar periódicamente en long-lived containers (ej. via setInterval).
 */
export function cleanupRateLimitStore(
  options: RateLimitOptions = {}
): number {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const cutoff = Date.now() - windowMs;
  let removed = 0;
  for (const [key, arr] of recentByKey.entries()) {
    const fresh = arr.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      recentByKey.delete(key);
      removed++;
    } else if (fresh.length !== arr.length) {
      recentByKey.set(key, fresh);
    }
  }
  return removed;
}

/**
 * Solo para tests: resetear el store entre pruebas.
 * NO llamar en producción.
 */
export function _resetRateLimitStoreForTest(): void {
  recentByKey.clear();
}

/**
 * Extrae la IP del request. Prioriza `x-forwarded-for` (primer valor si
 * hay lista comma-separated), luego `x-real-ip`. Si ninguno está, devuelve
 * `"unknown"` — el rate limit agrupará todos los requests sin IP bajo
 * una sola key, lo cual es conservador (más restrictivo de lo necesario
 * en dev pero seguro).
 *
 * Server-only.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}