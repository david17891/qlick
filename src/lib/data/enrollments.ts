import type { Enrollment, LessonProgress } from "@/types";
import {
  getUserEnrollments as getUserEnrollmentsServer,
  getLessonProgress as getLessonProgressServer,
} from "@/lib/lms/enrollments-server";
import { checkSupabaseConfig } from "@/lib/supabase/health";

/**
 * Inscripciones demo. En fase 1 provienen de la base de datos.
 * El alumno principal (user_alumno) está inscrito a 2 cursos con progreso distinto.
 *
 * LMS Real Foundation (v0.7.0): el server lib `@/lib/lms/enrollments-server`
 * expone la fuente de verdad de Supabase (`enrollments`, `lesson_progress`)
 * con fallback demo. Los accesores públicos de este archivo siguen
 * devolviendo la forma legacy (Enrollment con `source`, `lastLessonId`, etc.)
 * porque las páginas del dashboard mockado dependen de esos campos.
 *
 * Para código nuevo que use la BD real directamente, importa desde
 * `@/lib/lms` — los tipos son distintos (`@/types/lms.Enrollment` es flat).
 */

export const enrollments: Enrollment[] = [
  {
    id: "enr_1",
    userId: "user_alumno",
    courseId: "course_fundamentos",
    enrolledAt: "2025-05-01T10:00:00Z",
    source: "free",
    progressPercent: 100,
    lastLessonId: "les_fund_3_3",
    active: true
  },
  {
    id: "enr_2",
    userId: "user_alumno",
    courseId: "course_ads",
    enrolledAt: "2025-05-20T11:00:00Z",
    source: "purchase",
    progressPercent: 44,
    lastLessonId: "les_ads_2_2",
    active: true
  },
  {
    id: "enr_3",
    userId: "user_alumno_2",
    courseId: "course_contenido",
    enrolledAt: "2025-05-30T09:30:00Z",
    source: "coupon",
    progressPercent: 22,
    lastLessonId: "les_con_1_2",
    active: true
  },
  {
    id: "enr_4",
    userId: "user_alumno_3",
    courseId: "course_automatizacion",
    enrolledAt: "2025-06-02T15:00:00Z",
    source: "purchase",
    progressPercent: 11,
    lastLessonId: "les_auto_1_1",
    active: true
  },
  {
    id: "enr_5",
    userId: "user_alumno_2",
    courseId: "course_fundamentos",
    enrolledAt: "2025-05-10T08:00:00Z",
    source: "free",
    progressPercent: 67,
    lastLessonId: "les_fund_2_2",
    active: true
  }
];

/* ---------------- Progreso de lecciones ---------------- */

export const lessonProgress: LessonProgress[] = [
  // alumno: Fundamentos 100%
  { id: "lp_1", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_1_1", completed: true, percent: 100, completedAt: "2025-05-02T10:00:00Z" },
  { id: "lp_2", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_1_2", completed: true, percent: 100, completedAt: "2025-05-03T10:00:00Z" },
  { id: "lp_3", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_1_3", completed: true, percent: 100, completedAt: "2025-05-04T10:00:00Z" },
  { id: "lp_4", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_2_1", completed: true, percent: 100, completedAt: "2025-05-06T10:00:00Z" },
  { id: "lp_5", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_2_2", completed: true, percent: 100, completedAt: "2025-05-07T10:00:00Z" },
  { id: "lp_6", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_2_3", completed: true, percent: 100, completedAt: "2025-05-08T10:00:00Z" },
  { id: "lp_7", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_3_1", completed: true, percent: 100, completedAt: "2025-05-10T10:00:00Z" },
  { id: "lp_8", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_3_2", completed: true, percent: 100, completedAt: "2025-05-11T10:00:00Z" },
  { id: "lp_9", userId: "user_alumno", courseId: "course_fundamentos", lessonId: "les_fund_3_3", completed: true, percent: 100, completedAt: "2025-05-12T10:00:00Z" },

  // alumno: Meta Ads 44%
  { id: "lp_10", userId: "user_alumno", courseId: "course_ads", lessonId: "les_ads_1_1", completed: true, percent: 100, completedAt: "2025-05-21T11:00:00Z" },
  { id: "lp_11", userId: "user_alumno", courseId: "course_ads", lessonId: "les_ads_1_2", completed: true, percent: 100, completedAt: "2025-05-22T11:00:00Z" },
  { id: "lp_12", userId: "user_alumno", courseId: "course_ads", lessonId: "les_ads_1_3", completed: true, percent: 100, completedAt: "2025-05-23T11:00:00Z" },
  { id: "lp_13", userId: "user_alumno", courseId: "course_ads", lessonId: "les_ads_2_1", completed: true, percent: 100, completedAt: "2025-05-25T11:00:00Z" },
  { id: "lp_14", userId: "user_alumno", courseId: "course_ads", lessonId: "les_ads_2_2", completed: false, percent: 40, lastSeenAt: "2025-06-10T11:00:00Z" }
];

/* ---------------- Accesores ---------------- */

export function getEnrollmentsForUser(userId: string): Enrollment[] {
  return enrollments.filter((e) => e.userId === userId && e.active);
}

export function getEnrollment(
  userId: string,
  courseId: string
): Enrollment | undefined {
  return enrollments.find(
    (e) => e.userId === userId && e.courseId === courseId && e.active
  );
}

export function isEnrolled(userId: string, courseId: string): boolean {
  return Boolean(getEnrollment(userId, courseId));
}

export function getLessonProgressForUser(
  userId: string,
  courseId: string
): LessonProgress[] {
  return lessonProgress.filter(
    (lp) => lp.userId === userId && lp.courseId === courseId
  );
}

export function getLessonProgress(
  userId: string,
  lessonId: string
): LessonProgress | undefined {
  return lessonProgress.find((lp) => lp.userId === userId && lp.lessonId === lessonId);
}

export function getAllEnrollments(): Enrollment[] {
  return enrollments;
}

export function countEnrollmentsByCourse(courseId: string): number {
  return enrollments.filter((e) => e.courseId === courseId && e.active).length;
}
