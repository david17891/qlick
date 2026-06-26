/**
 * Servicios server-side para inscripciones y progreso del LMS.
 *
 * Server-only. Bypass RLS vía service role para operaciones admin (inscribir,
 * marcar progreso, calcular %). Las policies RLS del schema están alineadas
 * para usuarios autenticados (`auth.uid() = user_id`) — los server actions
 * del alumno deberían usar `createSupabaseServerClient()` en su lugar.
 *
 * REGLA DE FALLBACK:
 * - Si Supabase NO está configurado → cae a mocks (`lib/data/enrollments.ts`).
 * - Si Supabase SÍ está configurado → tabla real.
 *
 * IMPORTANTE: este módulo es SERVER-ONLY. NO importar desde Client Components.
 *
 * @server
 */

import type {
  Enrollment,
  LessonProgress,
  CreateEnrollmentResult,
  MarkLessonCompleteResult,
  UpdateEnrollmentProgressResult,
} from "@/types/lms";
import type { Database } from "@/types/supabase";
import {
  mapEnrollmentRow,
  mapLessonProgressRow,
  type EnrollmentRow,
  type LessonProgressRow,
} from "./mappers";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Tipo de Update generado por supabase gen types — usado para tipar el patch. */
type EnrollmentUpdate = Database["public"]["Tables"]["enrollments"]["Update"];

/** ¿Está activa la persistencia real? Server-only (defensa contra browser). */
function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/**
 * Adapta un Enrollment legacy (de `@/types/index.ts`) a la forma plana del
 * LMS Enrollment. Se usa en demoMode y se exporta para que consumers externos
 * (ej. dashboard) puedan hacer el mismo mapeo en sus propios fallbacks.
 */
export function legacyEnrollmentToLms(legacy: {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: string;
  progressPercent: number;
  source?: string | null;
}): Enrollment {
  return {
    id: legacy.id,
    userId: legacy.userId,
    courseId: legacy.courseId,
    status: "active",
    progressPercent: legacy.progressPercent,
    enrolledAt: legacy.enrolledAt,
    completedAt: legacy.progressPercent >= 100 ? legacy.enrolledAt : null,
    source: legacy.source ?? null,
  };
}

/**
 * Adapta un LessonProgress legacy a la forma plana del LMS LessonProgress.
 * Se exporta para que consumers externos puedan hacer el mismo mapeo en sus
 * propios fallbacks.
 */
export function legacyLessonProgressToLms(legacy: {
  id: string;
  userId: string;
  lessonId: string;
  completed: boolean;
  completedAt?: string;
  lastSeenAt?: string;
}): LessonProgress {
  return {
    id: legacy.id,
    userId: legacy.userId,
    lessonId: legacy.lessonId,
    completed: legacy.completed,
    completedAt: legacy.completedAt ?? null,
    watchSeconds: 0,
    updatedAt: legacy.lastSeenAt ?? legacy.completedAt ?? new Date(0).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Lecturas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Devuelve todas las inscripciones activas de un usuario.
 */
export async function getUserEnrollments(
  userId: string,
): Promise<Enrollment[]> {
  if (!isRealMode()) {
    const { getEnrollmentsForUser } = await import("@/lib/data/enrollments");
    return getEnrollmentsForUser(userId).map(legacyEnrollmentToLms);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("enrolled_at", { ascending: false });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[enrollments-server] getUserEnrollments falló", {
      code: error?.code,
      userId,
    });
    const { getEnrollmentsForUser } = await import("@/lib/data/enrollments");
    return getEnrollmentsForUser(userId).map(legacyEnrollmentToLms);
  }
  return (data as EnrollmentRow[]).map(mapEnrollmentRow);
}

/**
 * Devuelve el progreso de lecciones del usuario en un curso.
 *
 * Estrategia: query a `lesson_progress` filtrando por `user_id` y resolviendo
 * el `lesson_id` contra `lessons.module_id IN (SELECT id FROM modules WHERE
 * course_id = ...)`. Como el cliente Supabase JS no soporta subqueries, se
 * hace en 2 pasos: traer los lesson_ids del curso y luego filtrar.
 */
export async function getLessonProgress(
  userId: string,
  courseId: string,
): Promise<LessonProgress[]> {
  if (!isRealMode()) {
    const { getLessonProgressForUser } = await import(
      "@/lib/data/enrollments"
    );
    return getLessonProgressForUser(userId, courseId).map(
      legacyLessonProgressToLms,
    );
  }

  const supabase = createSupabaseAdminClient();

  // 1) lesson_ids de los módulos del curso.
  const { data: moduleRows, error: moduleErr } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId);

  if (moduleErr || !moduleRows) {
    // eslint-disable-next-line no-console
    console.error(
      "[enrollments-server] getLessonProgress: modules lookup falló",
      { code: moduleErr?.code, courseId },
    );
    return [];
  }

  const moduleIds = (moduleRows as Array<{ id: string }>).map((m) => m.id);
  if (moduleIds.length === 0) return [];

  const { data: lessonRows, error: lessonErr } = await supabase
    .from("lessons")
    .select("id")
    .in("module_id", moduleIds);

  if (lessonErr || !lessonRows) {
    // eslint-disable-next-line no-console
    console.error(
      "[enrollments-server] getLessonProgress: lessons lookup falló",
      { code: lessonErr?.code, courseId },
    );
    return [];
  }

  const lessonIds = (lessonRows as Array<{ id: string }>).map((l) => l.id);
  if (lessonIds.length === 0) return [];

  const { data, error } = await supabase
    .from("lesson_progress")
    .select("*")
    .eq("user_id", userId)
    .in("lesson_id", lessonIds);

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[enrollments-server] getLessonProgress falló", {
      code: error?.code,
      userId,
      courseId,
    });
    return [];
  }
  return (data as LessonProgressRow[]).map(mapLessonProgressRow);
}

/* ------------------------------------------------------------------ */
/* Mutaciones                                                            */
/* ------------------------------------------------------------------ */

/**
 * Inscribe a un usuario en un curso. Si ya existe el enrollment, lo devuelve
 * (idempotente — depende del UNIQUE constraint de la tabla).
 *
 * @param source Origen del enrollment para atribución. Ej: "qr", "organic".
 *               Si el usuario ya estaba inscripto, el upsert NO sobreescribe
 *               el source original (la fila existente gana).
 */
export async function enrollUserInCourse(
  userId: string,
  courseId: string,
  source?: string | null,
): Promise<CreateEnrollmentResult> {
  if (!isRealMode()) {
    // eslint-disable-next-line no-console
    console.info(
      "[enrollments-server] enrollUserInCourse demoMode: no se persiste",
      { userId, courseId, source },
    );
    return {
      ok: true,
      enrollmentId: `demo_enr_${Date.now().toString(36)}`,
      persisted: false,
      demo: true,
      note: "Inscripción simulada en modo demo. En producción se guarda en Supabase.",
    };
  }

  const supabase = createSupabaseAdminClient();
  // Si source es null/undefined, lo omitimos del payload para no pisar
  // un source existente en un re-enrollment.
  const payload: Database["public"]["Tables"]["enrollments"]["Insert"] = {
    user_id: userId,
    course_id: courseId,
    status: "active",
    progress_percent: 0,
  };
  if (source) payload.source = source;

  const { data, error } = await supabase
    .from("enrollments")
    .upsert(payload, { onConflict: "user_id,course_id" })
    .select("id")
    .single();

  if (error || !data) {
    // FASE DE MIGRACIÓN DE CATÁLOGO (v0.9.0): si el courseId no existe en la
    // tabla `courses` real (FK violation), caemos a demo en vez de fallar.
    // Esto pasa porque los cursos demo siguen en `lib/data/courses.ts` con IDs
    // tipo "course_fundamentos" (no UUIDs reales). Cuando se cargue el
    // catálogo real, los IDs serán UUIDs y este fallback deja de activarse.
    if (
      error?.code === "23503" ||
      error?.message?.includes("foreign key") ||
      error?.message?.includes("violates foreign key")
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[enrollments-server] course no existe en DB, fallback a demo",
        { courseId, userId, source },
      );
      return {
        ok: true,
        enrollmentId: `demo_enr_${Date.now().toString(36)}`,
        persisted: false,
        demo: true,
        note:
          "Inscripción simulada (catálogo aún no migrado a DB). Se guardará en Supabase cuando el catálogo real esté cargado.",
      };
    }
    // eslint-disable-next-line no-console
    console.error("[enrollments-server] enrollUserInCourse falló", {
      code: error?.code,
      userId,
      courseId,
      source,
    });
    return {
      ok: false,
      enrollmentId: "",
      persisted: false,
      demo: true,
      note: "No se pudo crear la inscripción. Intenta de nuevo.",
    };
  }

  return {
    ok: true,
    enrollmentId: data.id,
    persisted: true,
    demo: false,
    note: "Inscripción guardada en Supabase.",
  };
}

/**
 * Marca una lección como completada para un usuario.
 * Crea o actualiza la fila en `lesson_progress` (upsert por user_id+lesson_id).
 */
export async function markLessonComplete(
  userId: string,
  lessonId: string,
): Promise<MarkLessonCompleteResult> {
  if (!isRealMode()) {
    // eslint-disable-next-line no-console
    console.info(
      "[enrollments-server] markLessonComplete demoMode: no se persiste",
      { userId, lessonId },
    );
    return {
      ok: true,
      persisted: false,
      demo: true,
      note: "Progreso simulado en modo demo.",
    };
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("lesson_progress")
    .upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        completed: true,
        completed_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,lesson_id" },
    );

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[enrollments-server] markLessonComplete falló", {
      code: error.code,
      userId,
      lessonId,
    });
    return {
      ok: false,
      persisted: false,
      demo: true,
      note: "No se pudo marcar la lección como vista.",
    };
  }

  return {
    ok: true,
    persisted: true,
    demo: false,
    note: "Progreso guardado en Supabase.",
  };
}

/**
 * Actualiza el porcentaje de progreso de un enrollment.
 * Si llega a 100, marca `status='completed'` y `completed_at=now`.
 *
 * Esto normalmente se calcula server-side a partir de `lesson_progress`, pero
 * dejamos la puerta abierta para que el admin pueda ajustarlo manualmente.
 */
export async function updateEnrollmentProgress(
  userId: string,
  courseId: string,
  percent: number,
): Promise<UpdateEnrollmentProgressResult> {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  if (!isRealMode()) {
    return {
      ok: true,
      persisted: false,
      demo: true,
      note: "Progreso simulado en modo demo.",
    };
  }

  const supabase = createSupabaseAdminClient();
  const completedAt = new Date().toISOString();
  const patch: EnrollmentUpdate = {
    progress_percent: clamped,
    ...(clamped >= 100
      ? { status: "completed" as const, completed_at: completedAt }
      : {}),
  };
  const { error } = await supabase
    .from("enrollments")
    .update(patch)
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[enrollments-server] updateEnrollmentProgress falló", {
      code: error.code,
      userId,
      courseId,
      percent: clamped,
    });
    return {
      ok: false,
      persisted: false,
      demo: true,
      note: "No se pudo actualizar el progreso.",
    };
  }

  return {
    ok: true,
    persisted: true,
    demo: false,
    note: "Progreso actualizado.",
  };
}