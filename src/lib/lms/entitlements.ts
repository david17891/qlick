/**
 * Entitlements — capa de acceso comercial del LMS (v1.0.0).
 *
 * Server-only. Esta es la **fuente única de verdad** para "¿este usuario tiene
 * derecho a ver este curso/lesson?". Toda la UI que muestre contenido de pago
 * DEBE llamar a `checkCourseAccess` o `checkLessonAccess` antes de renderizar.
 *
 * Regla de oro: NUNCA decidir acceso desde el frontend. El cliente (browser)
 * puede inferir que tiene acceso si ve el contenido, pero la decisión se toma
 * en server-side con service role.
 *
 * ARQUITECTURA:
 * - courses.access_type: 'free' | 'paid' | 'freemium'
 * - course_access: tabla de derechos (independiente de enrollments)
 * - payments: tabla de pagos (provider='simulated' en dev)
 *
 * Por qué separar enrollments de course_access:
 * - enrollments = "¿está apuntado?" (puede estar pending_payment)
 * - course_access = "¿tiene derecho a ver el contenido?"
 * - Un alumno puede estar inscrito sin pagar (pending_payment). Un admin puede
 *   dar acceso sin enrollment (manual_admin). Mezclarlo obliga a migraciones
 *   cuando se agreguen pagos reales.
 *
 * MODOS:
 * - realMode: Supabase configurado → query real a `course_access`.
 * - demoMode: Supabase NO configurado → comportamiento permisivo (todos los
 *   cursos se tratan como free). Útil para dev local sin DB. Si necesitás
 *   probar el flujo paid, configurá Supabase.
 *
 * REGLAS DE FALLBACK:
 * - checkCourseAccess en demoMode: devuelve hasAccess=true (trata todo como free).
 * - grantAccess en demoMode: lanza error (no podemos persistir sin DB).
 *
 * @server
 */

import type {
  CourseAccess,
  CourseAccessSource,
  CourseAccessStatus,
  AccessResult,
} from "@/types/lms";
import type { Database } from "@/types/supabase";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/* ------------------------------------------------------------------ */
/* Tipos internos                                                      */
/* ------------------------------------------------------------------ */

type CourseAccessRow = Database["public"]["Tables"]["course_access"]["Row"];
type CourseRow = Database["public"]["Tables"]["courses"]["Row"];

/** ¿Estamos en modo real (Supabase configurado)? Server-only check. */
function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/**
 * Mapea una fila de `course_access` (snake_case) al dominio `CourseAccess`
 * (camelCase). La transformación es trivial porque las tablas son chiquitas
 * y no hay enums que decodificar.
 */
function mapCourseAccessRow(row: CourseAccessRow): CourseAccess {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    accessStatus: row.access_status as CourseAccessStatus,
    accessSource: row.access_source as CourseAccessSource,
    paymentId: row.payment_id,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    grantedReason: row.granted_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Verifica si un access está vigente (active y no expirado).
 * Helper interno — NO usar desde fuera (usar checkCourseAccess).
 */
function isAccessActive(access: CourseAccess, now: Date = new Date()): boolean {
  if (access.accessStatus !== "active") return false;
  if (access.expiresAt === null) return true;
  return new Date(access.expiresAt) > now;
}

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

/**
 * Devuelve el `course_access` activo del user para un curso, si existe.
 * Si hay varios registros (ej: uno revoked y uno nuevo active), devuelve el
 * que esté `active` y vigente. `null` si no hay ninguno.
 *
 * Útil para admin/debug. La mayoría del código debería usar `checkCourseAccess`.
 */
export async function getCourseAccess(
  userId: string,
  courseId: string,
): Promise<CourseAccess | null> {
  if (!isRealMode()) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("course_access")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("access_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[entitlements] getCourseAccess falló", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data) return null;
  const access = mapCourseAccessRow(data);
  if (!isAccessActive(access)) return null;
  return access;
}

/**
 * API de alto nivel: ¿este user puede ver este curso?
 *
 * Reglas:
 * - userId === null → { hasAccess: false, reason: 'not_authenticated' }
 * - Curso 'free' → { hasAccess: true, source: 'free_course' } (asume userId no null)
 * - Curso 'paid' → busca course_access. Si active+vigente → ok. Si expiró →
 *   reason: 'expired'. Si no existe → reason: 'no_access'.
 * - Curso 'freemium' → por ahora == free (Fase futura: filtrar por lección).
 * - demoMode (sin Supabase) → trata todo como free (permisivo para dev local).
 */
export async function checkCourseAccess(
  userId: string | null,
  courseId: string,
): Promise<AccessResult> {
  // 1. No autenticado → siempre no.
  if (!userId) {
    return { hasAccess: false, reason: "not_authenticated" };
  }

  // 2. demoMode → permisivo (todo es free para dev local sin DB).
  if (!isRealMode()) {
    return { hasAccess: true, source: "free_course", expiresAt: null };
  }

  const supabase = createSupabaseAdminClient();

  // 3. Buscar el curso para conocer su access_type.
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, access_type, status")
    .eq("id", courseId)
    .maybeSingle();

  if (courseError) {
    // eslint-disable-next-line no-console
    console.error("[entitlements] checkCourseAccess: error leyendo curso", {
      code: courseError.code,
      courseId,
    });
    return { hasAccess: false, reason: "no_access" };
  }

  if (!course || course.status !== "published") {
    return { hasAccess: false, reason: "no_access" };
  }

  // 4. Curso free o freemium → cualquier user logueado entra.
  if (course.access_type === "free" || course.access_type === "freemium") {
    return { hasAccess: true, source: "free_course", expiresAt: null };
  }

  // 5. Curso paid → buscar course_access active.
  const access = await getCourseAccess(userId, courseId);
  if (access) {
    return {
      hasAccess: true,
      source: access.accessSource,
      expiresAt: access.expiresAt,
    };
  }

  // 6. No hay access. ¿Quizá hubo uno que expiró?
  // Chequeamos si existe un access con status='expired' para distinguir
  // 'no_access' de 'expired' en el mensaje al usuario.
  const { data: expiredAccess } = await supabase
    .from("course_access")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("access_status", "expired")
    .limit(1)
    .maybeSingle();

  if (expiredAccess) {
    return { hasAccess: false, reason: "expired" };
  }

  return { hasAccess: false, reason: "no_access" };
}

/**
 * API de alto nivel: ¿este user puede ver esta lección específica?
 *
 * Por ahora (v1.0.0) == checkCourseAccess. Cuando implementemos access_level
 * por lección (fase futura para cursos freemium), esta función consultará
 * `lessons.access_level` y aplicará reglas más finas.
 */
export async function checkLessonAccess(
  userId: string | null,
  courseId: string,
  _lessonId: string,
): Promise<AccessResult> {
  return checkCourseAccess(userId, courseId);
}

/**
 * Otorga acceso. Usado por:
 * - Enrollment de curso gratis (source='free_course')
 * - Simulador de pago (source='simulated_payment')
 * - Admin manual (source='manual_admin')
 * - Webhook de Stripe/MercadoPago/Conekta (futuro, source='stripe'/'mercadopago'/'conekta')
 * - Cupón (source='coupon')
 *
 * Idempotencia: si ya existe un access active para (user, course), NO crea
 * otro. Solo actualiza el `granted_reason` y `starts_at` (best-effort).
 *
 * Si existe un access revoked/expired, crea uno nuevo active.
 *
 * Retorna el CourseAccess resultante.
 */
export async function grantAccess(params: {
  userId: string;
  courseId: string;
  source: CourseAccessSource;
  paymentId?: string | null;
  expiresAt?: Date | null;
  grantedReason: string;
}): Promise<CourseAccess> {
  if (!isRealMode()) {
    throw new Error(
      "[entitlements] grantAccess requiere Supabase configurado. " +
        "En demoMode no se puede persistir acceso.",
    );
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // 1. Buscar si ya hay access active para (user, course).
  const { data: existing } = await supabase
    .from("course_access")
    .select("id")
    .eq("user_id", params.userId)
    .eq("course_id", params.courseId)
    .eq("access_status", "active")
    .maybeSingle();

  if (existing) {
    // Idempotencia: no duplicar. Devolver el existente (refresh reason).
    const { data: refreshed, error: updError } = await supabase
      .from("course_access")
      .update({
        granted_reason: params.grantedReason,
        // No tocamos starts_at ni expires_at: respetamos el original.
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updError) {
      throw new Error(
        `[entitlements] grantAccess: error refrescando access existente: ${updError.message}`,
      );
    }
    return mapCourseAccessRow(refreshed as CourseAccessRow);
  }

  // 2. No hay active. Crear uno nuevo.
  const insertPayload: Database["public"]["Tables"]["course_access"]["Insert"] =
    {
      user_id: params.userId,
      course_id: params.courseId,
      access_status: "active",
      access_source: params.source,
      payment_id: params.paymentId ?? null,
      starts_at: now,
      expires_at: params.expiresAt ? params.expiresAt.toISOString() : null,
      granted_reason: params.grantedReason,
    };

  const { data: created, error: insError } = await supabase
    .from("course_access")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insError) {
    throw new Error(
      `[entitlements] grantAccess: error creando access: ${insError.message}`,
    );
  }
  return mapCourseAccessRow(created as CourseAccessRow);
}

/**
 * Revoca acceso. Usado por:
 * - Refund de pago (caller debe pasar el paymentId que se está reembolsando)
 * - Admin manual
 * - Expiración automática (futuro, vía cron)
 *
 * Idempotencia: si no hay access active, no hace nada (no error).
 *
 * Audit trail: actualiza `granted_reason` con la razón del revoke.
 */
export async function revokeAccess(params: {
  userId: string;
  courseId: string;
  reason: string;
}): Promise<void> {
  if (!isRealMode()) {
    throw new Error(
      "[entitlements] revokeAccess requiere Supabase configurado.",
    );
  }

  const supabase = createSupabaseAdminClient();

  // Marcar como revoked todos los access active para (user, course).
  // (En general solo debería haber 1 active a la vez, pero defendemos contra
  // race conditions o estados inconsistentes.)
  const { error } = await supabase
    .from("course_access")
    .update({
      access_status: "revoked",
      granted_reason: params.reason,
    })
    .eq("user_id", params.userId)
    .eq("course_id", params.courseId)
    .eq("access_status", "active");

  if (error) {
    throw new Error(
      `[entitlements] revokeAccess: error revocando access: ${error.message}`,
    );
  }
}
