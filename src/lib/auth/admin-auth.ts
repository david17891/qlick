/**
 * Allowlist de administradores (server-only).
 *
 * Control de acceso autoritativo para el panel admin. La decisión de "¿quién
 * es admin?" se toma aquí, leyendo una variable de entorno server-only:
 * `ADMIN_EMAIL_ALLOWLIST` (CSV de emails).
 *
 * Reglas de seguridad:
 * - Esta variable NO lleva prefijo `NEXT_PUBLIC_` → nunca llega al navegador.
 * - Si la variable falta o está vacía, NADIE es admin (default-deny).
 * - No se imprime el contenido del allowlist en ningún log.
 *
 * Modelos de acceso (D-018):
 * - El allowlist decide autorización (¿es admin?).
 * - Las operaciones CRM usan el cliente admin (service role, bypass de RLS),
 *   igual que el INSERT de leads hoy. No dependemos del `app_role` del JWT.
 */

import { checkSupabaseConfig } from "@/lib/supabase/health";

/** Nombre de la variable de entorno (centralizado para evitar typos). */
export const ADMIN_ALLOWLIST_ENV_KEY = "ADMIN_EMAIL_ALLOWLIST";

/**
 * Lee y normaliza el allowlist desde la env var.
 * Devuelve un array de emails en minúsculas, sin duplicados ni vacíos.
 *
 * Formato esperado: CSV separado por comas.
 *   ADMIN_EMAIL_ALLOWLIST=admin1@example.com,admin2@example.com
 *
 * Nunca lanza; si falta la variable devuelve [] (nadie es admin).
 */
export function getAdminAllowlist(): string[] {
  if (typeof process === "undefined" || !process.env) return [];
  const raw = process.env[ADMIN_ALLOWLIST_ENV_KEY];
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * ¿El email está autorizado como admin?
 * Comparación case-insensitive (el email llega ya normalizado o no).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getAdminAllowlist().includes(normalized);
}

/**
 * ¿El gate de auth admin está activo?
 *
 * true solo cuando Supabase está configurado (URL + publishable) Y hay al menos
 * un email en el allowlist. Si esto es false, el middleware NO bloquea /admin:
 * la app opera en modo demo/fallback y el panel sigue accesible como hoy.
 *
 * Esto preserva la regla del repo: el build y el demo no dependen de que la
 * auth real esté lista.
 */
export function isAuthEnabled(): boolean {
  return checkSupabaseConfig().configured && getAdminAllowlist().length > 0;
}
