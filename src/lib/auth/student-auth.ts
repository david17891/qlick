/**
 * Autenticación para ALUMNOS (server-only).
 *
 * Modelo de acceso (D-018 + LMS v0.7.0):
 * - **Admin** y **student** son roles INDEPENDIENTES en el LMS.
 *   Admin usa allowlist (ADMIN_EMAIL_ALLOWLIST) y vive en su propia superficie
 *   (/admin/* con flujo de auth separado). Ver `admin-auth.ts`.
 * - **Student** no tiene allowlist: cualquier persona puede registrarse con
 *   magic link. La protección real es por RLS en Supabase (auth.uid() =
 *   user_id en enrollments / lesson_progress) y por la lógica de "solo
 *   enrolled users ven la lección" en /aprender/*.
 * - isStudentEmail() existe solo para DOCUMENTAR la diferencia con admin y
 *   bloquear el caso "este email es admin pero intenta entrar a /dashboard".
 *   Devuelve true para todos los emails no-admin.
 *
 * Defense in depth: este módulo solo debe usarse desde server context (route
 * handlers, server components, server actions). En el cliente, la sesión se
 * lee vía el cliente browser de Supabase (no se valida allowlist).
 */

import { isAdminEmail } from "./admin-auth";

/**
 * ¿El email puede ser tratado como alumno?
 *
 * - true → cualquier email que NO esté en el allowlist admin (default).
 * - false → email que es admin (bloqueamos para que admin no aparezca como
 *   alumno, ni use la UI de alumnos). Admin tiene su propio flujo.
 *
 * Si el email es null/empty → false.
 */
export function isStudentEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  // Si es admin, NO es alumno (no queremos mezclar identidades).
  if (isAdminEmail(normalized)) return false;
  return true;
}