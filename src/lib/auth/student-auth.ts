/**
 * Autenticación para ALUMNOS (server-only).
 *
 * Modelo de acceso (D-018 + LMS v0.7.0, **actualizado 2026-06-29**):
 * - **Admin** y **student** son roles INDEPENDIENTES en el LMS, pero un mismo
 *   email puede actuar en ambos roles simultáneamente (decidido por la ruta).
 *   Admin usa allowlist (`ADMIN_EMAIL_ALLOWLIST`) y vive en su propia superficie
 *   (`/admin/*` con flujo de auth separado). Ver `admin-auth.ts`.
 * - **Student** no tiene allowlist: cualquier persona puede registrarse con
 *   magic link. La protección real es por RLS en Supabase (`auth.uid()` =
 *   `user_id` en `enrollments` / `lesson_progress`) y por la lógica de "solo
 *   enrolled users ven la lección" en `/aprender/*`.
 * - **Dualidad (2026-06-29)**: si un email es admin Y entra a `/dashboard`
 *   o se inscribe a un curso, actúa como alumno normal. RLS previene que
 *   vea datos de OTROS alumnos — solo los suyos propios si está inscripto.
 *
 * Defense in depth: este módulo solo debe usarse desde server context (route
 * handlers, server components, server actions). En el cliente, la sesión se
 * lee vía el cliente browser de Supabase (no se valida allowlist).
 */

// import isAdminEmail ya no se usa desde 2026-06-29 (permitimos dualidad
// admin+student — el routing decide qué requiere cada ruta).

/**
 * ¿El email puede ser tratado como alumno?
 *
 * - true → cualquier email autenticado en Supabase (incluyendo admins).
 * - false → email vacío.
 *
 * Decisión 2026-06-29 (sesión nocturna): permitimos **dualidad**. Un mismo
 * email puede actuar como admin Y como alumno en distintos momentos,
 * decidido por la ruta a la que navega:
 *   - `/admin/*` → requiere `requireAdmin()` (allowlist)
 *   - `/dashboard`, `/aprender/*`, `/pagar/*` → requiere `requireStudent()`
 *   - Si el email es admin pero navega a `/dashboard`, igual entra como
 *     alumno — usa su propio `auth.uid()` para RLS.
 *
 * Esto es seguro porque RLS en Supabase previene que un admin (autenticado
 * como david17891@gmail.com) vea datos de OTROS alumnos. Solo ve los suyos
 * propios si se inscribe en un curso.
 *
 * Si el email es null/empty → false.
 */
export function isStudentEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return true;
}