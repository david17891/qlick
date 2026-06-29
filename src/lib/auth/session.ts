/**
 * Sesión admin y alumno vía Supabase Auth (server-only).
 *
 * Lee la sesión del usuario autenticado desde las cookies de la request usando
 * el cliente server de Supabase (respects RLS).
 *
 * Flujo:
 *   request cookies → supabase.auth.getUser() → user.email → role check
 *
 * Defensa en profundidad: el middleware ya filtra, pero los route handlers y
 * server actions deben volver a llamar a requireAdmin() / requireStudent()
 * antes de servir datos.
 *
 * Roles:
 * - **admin**:  email debe estar en ADMIN_EMAIL_ALLOWLIST.
 * - **student**: cualquier email NO-admin (ver `student-auth.ts`). La
 *   autorización fina (qué cursos / lecciones puede ver) la aplica RLS.
 * - Las dos funciones son INDEPENDIENTES: una persona NO puede ser admin
 *   y student a la vez en el modelo actual.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { isAdminEmail } from "./admin-auth";
import { isStudentEmail } from "./student-auth";

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

/* ------------------------------------------------------------------ */
/* Sesión alumno (student)                                              */
/* ------------------------------------------------------------------ */

/** Identidad mínima del alumno autenticado. */
export interface StudentSession {
  /** Email normalizado en minúsculas. */
  email: string;
  /** ID de Supabase Auth (auth.uid()). */
  userId: string;
}

/**
 * Devuelve la sesión de un alumno si:
 *   - la auth real está habilitada (Supabase configurado + allowlist admin
 *     con al menos 1 email, reutilizamos el mismo `isAuthEnabled` por
 *     consistencia con admin),
 *   - hay un usuario autenticado en Supabase,
 *   - y el email NO es admin (un admin no es alumno).
 *
 * Devuelve null si cualquiera de esas condiciones falla. No lanza.
 *
 * Importante: NO usamos ADMIN_EMAIL_ALLOWLIST para aceptar alumnos — ese
 * allowlist es SOLO para admin. Alumno = "está autenticado y no es admin".
 * El control fino de qué cursos/lecciones puede ver cada alumno está en RLS
 * (auth.uid() = user_id en enrollments / lesson_progress).
 */
export async function getCurrentStudent(): Promise<StudentSession | null> {
  // Auth real solo si Supabase está configurado. NO dependemos del
  // ADMIN_EMAIL_ALLOWLIST (ese gate es solo para admin auth — student
  // y admin son roles independientes, ver D-018 / student-auth.ts).
  if (!checkSupabaseConfig().configured) return null;

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  const normalizedEmail = user.email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  // Bloqueo: si es admin, no entra como alumno (flujos separados).
  if (!isStudentEmail(normalizedEmail)) return null;

  return {
    email: normalizedEmail,
    userId: user.id,
  };
}

/**
 * Variante "require" para uso en Server Components / Route Handlers que
 * necesitan la sesión o redirigir. Devuelve la sesión o null (el caller
 * decide el comportamiento: redirect(307, "/login") o NextResponse.redirect).
 */
export async function requireStudent(): Promise<StudentSession | null> {
  return getCurrentStudent();
}