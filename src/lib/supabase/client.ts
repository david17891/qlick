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

let cached: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente browser singleton. Lanza si no hay proyecto configurado (modo demo),
 * con un mensaje accionable.
 */
export function createSupabaseBrowserClient() {
  if (cached) return cached;

  const { url, publishableKey } = supabaseConfig;
  if (!isValidSupabaseUrl(url) || !publishableKey) {
    throw new Error(
      "Supabase no está configurado. La app está en modo demo. " +
        "Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "para activar el cliente browser. Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md.",
    );
  }

  cached = createBrowserClient(url, publishableKey);
  return cached;
}
