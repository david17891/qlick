/**
 * Sesión admin vía Supabase Auth (server-only).
 *
 * Lee la sesión del usuario autenticado desde las cookies de la request usando
 * el cliente server de Supabase (respects RLS) y valida que el email esté en
 * el allowlist de admins.
 *
 * Flujo:
 *   request cookies → supabase.auth.getUser() → user.email → isAdminEmail()
 *
 * Defensa en profundidad: el middleware ya filtra, pero los route handlers y
 * server actions deben volver a llamar a requireAdmin() antes de servir datos.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail, isAuthEnabled } from "./admin-auth";

/** Identidad mínima del admin autenticado (sin datos sensibles). */
export interface AdminSession {
  email: string;
}

/**
 * Devuelve la sesión admin si el usuario está autenticado Y allowlisted.
 * Devuelve null si:
 *   - la auth no está habilitada (modo demo),
 *   - no hay sesión,
 *   - hay sesión pero el email no está autorizado.
 *
 * No lanza: captura errores de Supabase y los trata como "sin sesión".
 */
export async function getCurrentAdmin(): Promise<AdminSession | null> {
  // Modo demo: no hay auth real que validar.
  if (!isAuthEnabled()) return null;

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    // Supabase no configurado → sin sesión. (isAuthEnabled ya cubre esto, pero
    // defendemos por si la config quedó a medias.)
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;
  if (!isAdminEmail(user.email)) return null;

  return { email: user.email.trim().toLowerCase() };
}

/**
 * Igual que getCurrentAdmin, pero pensada para route handlers: devuelve la
 * sesión o null. El caller decide cómo responder (401 vs 403).
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  return getCurrentAdmin();
}
