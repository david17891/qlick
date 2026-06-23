/**
 * Cliente Supabase para el SERVIDOR (Server Components, Route Handlers, Server
 * Actions). Usa `createServerClient` de `@supabase/ssr` con la publishable key
 * (respeta RLS) y manejo de cookies.
 *
 * Para operaciones privilegiadas (bypass de RLS, administración), usar
 * `admin.ts` en su lugar.
 *
 * Lanza si no hay proyecto configurado, pero solo al invocarse (no al importar).
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig, isValidSupabaseUrl } from "./config";

/**
 * Crea un cliente server vinculado al ciclo de cookies de la request.
 * Debe llamarse dentro del contexto de una request (Server Component, Route
 * Handler o Server Action).
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = supabaseConfig;
  if (!isValidSupabaseUrl(url) || !publishableKey) {
    throw new Error(
      "Supabase no está configurado. La app está en modo demo. " +
        "Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "para activar el cliente server. Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md.",
    );
  }

  const cookieStore = cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // El método set() fue llamado desde un Server Component. Esto se puede
          // ignorar si se tiene middleware refrescando la sesión de usuario.
          // Ver: https://supabase.com/docs/guides/auth/server-side/nextjs
        }
      },
    },
  });
}
