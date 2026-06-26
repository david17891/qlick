"use server";

/**
 * Server Action: marca una lección como completada (v1.0.0).
 *
 * Por qué NO usamos `lesson_progress` per-lesson para el demo MVP:
 * - La tabla `lesson_progress` ya existe y `markLessonComplete` ya está
 *   implementado en `lib/lms/enrollments-server.ts`.
 * - PERO requiere mapear mock lesson slug → LMS lesson UUID, y el LMS
 *   todavía no tiene las lecciones cargadas (la migración del catálogo
 *   demo a la DB es scope de Fase E+, ver docs/ROADMAP.md).
 * - Para el demo, escribimos a `enrollments.progress_percent`: 1 columna,
 *   no necesita mapping, y el dashboard ya la lee.
 *
 * Comportamiento:
 * - "Highest water mark": si el percent nuevo es MENOR al actual, no
 *   rebajamos. Esto evita que un usuario pueda "perder" progreso
 *   marcando una lección anterior.
 * - Si el user no tiene enrollment activo pero está en la lección (caso
 *   edge: pagó pero el enrollment retroactivo del dashboard aún no se
 *   creó), lo creamos idempotentemente antes de actualizar el percent.
 * - `revalidatePath` para que el dashboard y la página actual vean el
 *   nuevo percent en el siguiente render.
 *
 * @server
 */

import { revalidatePath } from "next/cache";
import { getCurrentStudent } from "@/lib/auth/session";
import {
  enrollUserInCourse,
  getUserEnrollments,
  updateEnrollmentProgress,
} from "@/lib/lms";

export type MarkLessonCompleteActionResult = {
  ok: boolean;
  /** true si persistió en Supabase; false si fue demo/fallback. */
  persisted: boolean;
  /** true si fue demo/fallback (no hubo escritura real). */
  demo: boolean;
  /** Porcentaje nuevo del enrollment (0–100) tras la operación. */
  percent: number;
  note: string;
};

export async function markLessonCompleteAction(input: {
  /** UUID del curso en la tabla `courses` del LMS. */
  courseId: string;
  /** Índice 0-based de la lección dentro del curso (flat list). */
  lessonIndex: number;
  /** Total de lecciones del curso (para calcular el percent). */
  totalLessons: number;
}): Promise<MarkLessonCompleteActionResult> {
  const { courseId, lessonIndex, totalLessons } = input;

  // Validación de input — defensiva, no debería fallar nunca si la
  // llama LessonView con sus props.
  if (!courseId || typeof courseId !== "string") {
    return {
      ok: false,
      persisted: false,
      demo: true,
      percent: 0,
      note: "courseId inválido.",
    };
  }
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
    return {
      ok: false,
      persisted: false,
      demo: true,
      percent: 0,
      note: "lessonIndex inválido.",
    };
  }
  if (!Number.isInteger(totalLessons) || totalLessons <= 0) {
    return {
      ok: false,
      persisted: false,
      demo: true,
      percent: 0,
      note: "totalLessons inválido.",
    };
  }

  // 1) Auth: solo alumnos autenticados.
  const session = await getCurrentStudent();
  if (!session) {
    return {
      ok: false,
      persisted: false,
      demo: true,
      percent: 0,
      note: "Necesitás iniciar sesión para registrar progreso.",
    };
  }

  // 2) Encontrar (o crear) el enrollment activo.
  let enrollments = await getUserEnrollments(session.userId);
  let enrollment = enrollments.find(
    (e) => e.courseId === courseId && e.status === "active",
  );

  if (!enrollment) {
    // Edge case: user tiene `course_access` (pagó) pero el enrollment
    // retroactivo no se creó todavía (p.ej. si entró directo a la lección
    // sin pasar por /dashboard). Lo creamos idempotentemente.
    const created = await enrollUserInCourse(session.userId, courseId, null);
    if (!created.ok) {
      return {
        ok: false,
        persisted: false,
        demo: created.demo,
        percent: 0,
        note: "No estás inscripto en este curso.",
      };
    }
    enrollments = await getUserEnrollments(session.userId);
    enrollment = enrollments.find(
      (e) => e.courseId === courseId && e.status === "active",
    );
    if (!enrollment) {
      return {
        ok: false,
        persisted: false,
        demo: true,
        percent: 0,
        note: "No se pudo crear la inscripción para registrar progreso.",
      };
    }
  }

  // 3) Calcular nuevo percent. lessonIndex es 0-based; la lección
  //    actual es (lessonIndex + 1) en 1-based. Redondeamos hacia arriba
  //    para que la última lección dé exactamente 100%.
  const targetPercent = Math.ceil(((lessonIndex + 1) / totalLessons) * 100);
  const newPercent = Math.max(enrollment.progressPercent, targetPercent);

  if (newPercent === enrollment.progressPercent) {
    // No-op: el percent actual ya cubre esta lección. Devolvemos ok
    // para que la UI confirme visualmente.
    return {
      ok: true,
      persisted: true,
      demo: false,
      percent: enrollment.progressPercent,
      note: "Esta lección ya estaba marcada como completada.",
    };
  }

  // 4) Persistir.
  const result = await updateEnrollmentProgress(
    session.userId,
    courseId,
    newPercent,
  );

  if (!result.ok) {
    return {
      ok: false,
      persisted: false,
      demo: result.demo,
      percent: 0,
      note: result.note,
    };
  }

  // 5) Refrescar páginas que muestran el percent. Layout-level para
  //    que cualquier URL bajo /aprender/* se refresque.
  revalidatePath("/dashboard");
  revalidatePath("/aprender", "layout");

  return {
    ok: true,
    persisted: result.persisted,
    demo: result.demo,
    percent: newPercent,
    note: result.note,
  };
}
