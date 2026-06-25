/**
 * Mappers entre filas de Postgres (snake_case) y tipos del dominio LMS
 * (camelCase).
 *
 * Los tipos Row están definidos manualmente siguiendo el schema de la
 * migración `20260625160000_lms_real_foundation.sql`. Cuando se regeneren los
 * types con `npx supabase gen types typescript --linked`, este archivo puede
 * actualizarse para apuntar a `Database["public"]["Tables"]["..."]["Row"]`
 * (mismo patrón que `masterclass-mapper.ts`).
 *
 * ¿Por qué manualmente y no desde el typegen?
 * - Track 1 (lms-migration) regenera `src/types/supabase.ts` con estas
 *   tablas en su commit.
 * - Track 2 (este archivo) corre en paralelo y aún no ve esas tablas en el
 *   typegen.
 * - Mantener tipos manuales desacopla la compilación de ambos tracks y
 *   garantiza que el patrón fallback (mocks) compile aunque Supabase no
 *   esté regenerado.
 * - El día que se regeneren los types, los nombres de columnas deben
 *   coincidir con la migración.
 */

import type {
  Course,
  Module,
  Lesson,
  Enrollment,
  LessonProgress,
  CourseStatus,
  CourseLevel,
  EnrollmentStatus,
  LessonVideoProvider,
} from "@/types/lms";

/* ------------------------------------------------------------------ */
/* Course row → dominio                                                  */
/* ------------------------------------------------------------------ */

export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  status: CourseStatus;
  level: CourseLevel;
  category: string | null;
  duration_minutes: number | null;
  instructor_name: string | null;
  price_mxn: number | string | null; // numeric(10,2) puede llegar como string
  is_featured: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function mapCourseRow(row: CourseRow): Course {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    level: row.level,
    category: row.category,
    durationMinutes: row.duration_minutes,
    instructorName: row.instructor_name,
    priceMXN:
      row.price_mxn === null || row.price_mxn === undefined
        ? null
        : typeof row.price_mxn === "string"
          ? Number(row.price_mxn)
          : row.price_mxn,
    isFeatured: row.is_featured,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* Module row → dominio                                                  */
/* ------------------------------------------------------------------ */

export interface ModuleRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export function mapModuleRow(row: ModuleRow): Module {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Lesson row → dominio                                                  */
/* ------------------------------------------------------------------ */

export interface LessonRow {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_provider: LessonVideoProvider | null;
  video_id: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  display_order: number;
  is_free_preview: boolean;
  created_at: string;
}

export function mapLessonRow(row: LessonRow): Lesson {
  return {
    id: row.id,
    moduleId: row.module_id,
    title: row.title,
    description: row.description,
    videoProvider: row.video_provider,
    videoId: row.video_id,
    videoUrl: row.video_url,
    durationMinutes: row.duration_minutes,
    displayOrder: row.display_order,
    isFreePreview: row.is_free_preview,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Enrollment row → dominio                                              */
/* ------------------------------------------------------------------ */

export interface EnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  progress_percent: number;
  enrolled_at: string;
  completed_at: string | null;
}

export function mapEnrollmentRow(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    status: row.status,
    progressPercent: row.progress_percent,
    enrolledAt: row.enrolled_at,
    completedAt: row.completed_at,
  };
}

/* ------------------------------------------------------------------ */
/* LessonProgress row → dominio                                          */
/* ------------------------------------------------------------------ */

export interface LessonProgressRow {
  id: string;
  user_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
  watch_seconds: number;
  updated_at: string;
}

export function mapLessonProgressRow(row: LessonProgressRow): LessonProgress {
  return {
    id: row.id,
    userId: row.user_id,
    lessonId: row.lesson_id,
    completed: row.completed,
    completedAt: row.completed_at,
    watchSeconds: row.watch_seconds,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* Insert payloads (snake_case, listo para .insert())                    */
/* ------------------------------------------------------------------ */

export interface InsertEnrollmentPayload {
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  progress_percent: number;
}

export interface InsertLessonProgressPayload {
  user_id: string;
  lesson_id: string;
  completed: boolean;
  watch_seconds: number;
}