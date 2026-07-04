/**
 * Per-key (phone) rate limiter — sliding window in-memory.
 *
 * Protege contra spammers y contra eventos donde un único lead hace
 * demasiadas preguntas al LLM, agotando el saldo de DeepSeek (~$0.001-0.005
 * por pregunta, saldo actual ~$0.28 USD).
 *
 * Modelo: ventana deslizante de WINDOW_MS con cap MAX_CALLS_PER_WINDOW por key.
 *
 * Almacenamiento in-memory (Map). Trade-offs aceptados:
 *  - En Vercel hobby cada función corre en un container aislado, así que el
 *    counter NO es compartido entre invocaciones paralelas. Esto significa
 *    que un spammer que logra concurrencia podría multiplicar su límite por
 *    N (donde N = concurrencia). En la práctica el webhook de Meta procesa
 *    1 mensaje a la vez por wamid, así que el riesgo es bajo.
 *  - Counter se reinicia con cada cold-start del container (~5-15 min idle).
 *    Buena higiene: cleanupRateLimitStore() para evitar memory growth en
 *    containers long-lived.
 *
 * Server-only.
 *
 * @server
 */

const DEFAULT_WINDOW_MS = 60_000; // 60 seconds
const DEFAULT_MAX_CALLS_PER_WINDOW = 5; // 5 LLM calls por minuto por phone

const recentByKey = new Map<string, number[]>();

interface RateLimitDecision {
  allowed: boolean;
  callCount: number;
  /** ms hasta que la entrada más vieja de la ventana salga (0 si allowed). */
  resetMs: number;
}

export function recordAndCheckRateLimit(
  key: string,
  options: {
    windowMs?: number;
    maxCalls?: number;
  } = {}
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
      resetMs: windowMs - (now - oldestInWindow)
    };
  }

  fresh.push(now);
  recentByKey.set(key, fresh);
  return {
    allowed: true,
    callCount: fresh.length,
    resetMs: windowMs
  };
}

/**
 * Higiene: limpia entradas con timestamps ya fuera de la ventana.
 * Llamar periódicamente en long-lived containers (ej. via setInterval).
 */
export function cleanupRateLimitStore(
  options: { windowMs?: number } = {}
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
