/**
 * Cliente Supabase para el NAVEGADOR (Client Components).
 *
 * Usa `createBrowserClient` de `@supabase/ssr` con la **publishable key**
 * (respeta RLS). Jamás usa la secret/service-role key.
 *
 * - Si las variables no están configuradas, lanza un error claro al invocarse
 *   (no al importar), para que el build no se rompa en modo demo.
 * - Solo este cliente debe ser importado por Client Components.
 */

import { createBrowserClient } from "@supabase/ssr";
import { isValidSupabaseUrl } from "./config";

/**
 * Cliente browser. Crea una instancia nueva cada vez (sin cache singleton).
 *
 * El cache singleton puede causar problemas en dev (hot reload recrea el
 * módulo pero el cache queda stale, o un primer render SSR fallido
 * contamina las llamadas posteriores). createBrowserClient ya maneja su
 * propio cache interno, así que no necesitamos doble cache.
 *
 * IMPORTANTE (fix v0.8.0): aquí NO usamos `supabaseConfig.url` / `.publishableKey`
 * porque ese objeto se inicializa vía `readEnv(key)` (acceso dinámico a
 * process.env). Next.js SOLO inline `NEXT_PUBLIC_*` en el bundle del cliente
 * cuando se accede **literalmente** a `process.env.NEXT_PUBLIC_*`. El acceso
 * dinámico queda `undefined` en el browser aunque el server lo lea bien.
 * Ver `isSupabaseConfigured()` en config.ts para el patrón correcto.
 * Bug documentado en docs/ADMIN_AUTH_LEADS_OPERATIONS.md ("modo demo falso").
 */
export function createSupabaseBrowserClient() {
  // Acceso LITERAL a las NEXT_PUBLIC_* (requerido por Next.js para inlinear
  // en el bundle del cliente). Fallback al alias legacy para setups viejos.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";

  if (!isValidSupabaseUrl(url) || !publishableKey) {
    throw new Error(
      "Supabase no está configurado. La app está en modo demo. " +
        "Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "para activar el cliente browser. Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md.",
    );
  }

  return createBrowserClient(url, publishableKey);
}
