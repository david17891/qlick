/**
 * Cliente Supabase ADMIN (service role / secret key).
 *
 * ⚠️ BYPASSA RLS. Solo para operaciones server-side que genuinamente lo
 * necesiten (migraciones, scripts de mantenimiento, webhooks que escriben en
 * nombre del sistema). Nunca para exponer datos a usuarios.
 *
 * REGLAS:
 * - Prohibido importar este archivo desde cualquier Client Component.
 * - Prohibido exponer la secret key bajo un nombre NEXT_PUBLIC_*.
 * - Este módulo valida en runtime que se ejecute fuera del navegador.
 */

import { createClient } from "@supabase/supabase-js";
import { supabaseConfig, isValidSupabaseUrl } from "./config";

/**
 * Marker de tipo para que los revisores humanos y los linters futuros puedan
 * identificar rápidamente usos del cliente admin.
 */
export type SupabaseAdminClient = ReturnType<typeof createClient>;

/**
 * true si estamos ejecutando en el navegador. Si esto es true, NUNCA debemos
 * instanciar el cliente admin (la secret key llegaría al bundle).
 */
function isBrowser(): boolean {
  return (
    typeof window !== "undefined" ||
    (typeof process !== "undefined" &&
      process.env.NEXT_RUNTIME === "edge" &&
      // En edge runtime de Vercel, `window` puede no estar definido pero seguimos
      // sin querer usar service role ahí. Lo dejamos como server-side seguro.
      false)
  );
}

/**
 * Crea el cliente admin (service role). Lanza si:
 * - se invoca en el navegador (defensa en runtime),
 * - falta la URL o la secret key.
 *
 * No cachea: cada caller obtiene su instancia para evitar fugas entre requests.
 */
export function createSupabaseAdminClient(): SupabaseAdminClient {
  if (isBrowser()) {
    throw new Error(
      "createSupabaseAdminClient() fue invocada en el navegador. " +
        "La secret key NUNCA debe llegar al cliente. Usa createSupabaseBrowserClient() " +
        "desde Client Components. Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md §6.",
    );
  }

  const { url, secretKey } = supabaseConfig;
  if (!isValidSupabaseUrl(url) || !secretKey) {
    throw new Error(
      "Supabase admin no está configurado. Configura NEXT_PUBLIC_SUPABASE_URL y " +
        "SUPABASE_SECRET_KEY para operaciones server-side. " +
        "Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      // El cliente admin no debe persistir sesión de usuario.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
