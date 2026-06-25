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
import { supabaseConfig, isValidSupabaseUrl } from "./config";

/**
 * Cliente browser. Crea una instancia nueva cada vez (sin cache singleton).
 *
 * El cache singleton puede causar problemas en dev (hot reload recrea el
 * módulo pero el cache queda stale, o un primer render SSR fallido
 * contamina las llamadas posteriores). createBrowserClient ya maneja su
 * propio cache interno, así que no necesitamos doble cache.
 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = supabaseConfig;
  if (!isValidSupabaseUrl(url) || !publishableKey) {
    throw new Error(
      "Supabase no está configurado. La app está en modo demo. " +
        "Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "para activar el cliente browser. Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md.",
    );
  }

  return createBrowserClient(url, publishableKey);
}
