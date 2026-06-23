/**
 * Barrel de la capa Supabase.
 *
 * Exporta todo lo seguro de consumir. El cliente admin también se exporta (lo
 * usan Route Handlers / Server Actions), pero queda bajo responsabilidad del
 * caller garantizar que NO se importe desde un Client Component.
 *
 * Orden de preferencia para nuevos consumidores:
 *   1. Client Component       → createSupabaseBrowserClient (client.ts)
 *   2. Server Component/Action → createSupabaseServerClient (server.ts)
 *   3. Operación privilegiada  → createSupabaseAdminClient  (admin.ts)
 *
 * Para diagnóstico: checkSupabaseConfig() y realDataAdvisory() (health.ts).
 */

export { createSupabaseBrowserClient } from "./client";
export { createSupabaseServerClient } from "./server";
export {
  createSupabaseAdminClient,
  type SupabaseAdminClient,
} from "./admin";
export {
  supabaseConfig,
  isValidSupabaseUrl,
  looksLikeKey,
  SUPABASE_ENV_KEYS,
} from "./config";
export {
  checkSupabaseConfig,
  realDataAdvisory,
  type SupabaseHealthCheck,
} from "./health";
