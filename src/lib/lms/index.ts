/**
 * Fachada pública del módulo LMS (v0.7.0).
 *
 * Re-exporta los server libs para que el resto del código importe desde un
 * solo lugar (`@/lib/lms`) sin filtrar la estructura interna.
 *
 * Server-only. NO importar desde Client Components.
 *
 * Esta fachada sigue el mismo patrón que `src/lib/masterclasses/index.ts`.
 */

export {
  getPublishedCourses,
  getCourseBySlug,
  getAdminCourses,
  getCourseModules,
  getModuleLessons,
} from "./courses-server";

export {
  getUserEnrollments,
  enrollUserInCourse,
  getLessonProgress,
  markLessonComplete,
  updateEnrollmentProgress,
} from "./enrollments-server";

export type {
  CourseRow,
  ModuleRow,
  LessonRow,
  EnrollmentRow,
  LessonProgressRow,
  InsertEnrollmentPayload,
  InsertLessonProgressPayload,
} from "./mappers";