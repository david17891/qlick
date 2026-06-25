/**
 * Servicios server-side para el catálogo de cursos del LMS.
 *
 * Server-only. Usa el cliente admin (service role, bypass RLS) para lecturas
 * admin (drafts + archivados). El cliente público (anon + RLS) cubriría el
 * mismo scope para "published", pero centralizamos aquí para tener fallback
 * demo consistente y un único punto de auditoría.
 *
 * REGLA DE FALLBACK:
 * - Si Supabase NO está configurado → cae a mocks (derivados de
 *   `lib/data/courses.ts`) y devuelve datos sin persistencia.
 * - Si Supabase SÍ está configurado → consulta la tabla real.
 *
 * IMPORTANTE: este módulo es SERVER-ONLY. NO importar desde Client Components.
 * Tampoco usar `createSupabaseAdminClient()` directamente fuera del guard
 * `isRealMode()`.
 *
 * NOTA SOBRE IMPORTACIÓN CIRCULAR:
 * - `lib/data/courses.ts` importa este módulo (server lib) para usar las
 *   funciones en realMode.
 * - Este módulo importa `lib/data/courses.ts` para derivar mocks en demoMode.
 * - Para evitar problemas de orden de evaluación, los valores importados se
 *   usan SOLO dentro de cuerpos de funciones (no a nivel de módulo).
 *
 * @server
 */

import type { Course, Module, Lesson } from "@/types/lms";
import {
  mapCourseRow,
  mapModuleRow,
  mapLessonRow,
  type CourseRow,
  type ModuleRow,
  type LessonRow,
} from "./mappers";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCourseById as getLegacyCourseById } from "@/lib/data/courses";

/** ¿Está activa la persistencia real? Server-only (defensa contra browser). */
function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/* ------------------------------------------------------------------ */
/* Demo fallback: deriva del catálogo legacy                            */
/* ------------------------------------------------------------------ */

/**
 * Convierte un `Course` legacy (con módulos+lecciones embebidas) a un
 * `Course` del dominio LMS (flat). Solo se usa en demoMode cuando Supabase
 * no está configurado.
 */
function legacyCourseToLms(legacy: {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  level: "basico" | "intermedio" | "avanzado";
  estimatedHours: number;
  priceMXN: number;
  featured?: boolean;
  thumbnailUrl: string;
  createdAt: string;
}): Course {
  return {
    id: legacy.id,
    slug: legacy.slug,
    title: legacy.title,
    subtitle: null,
    description: legacy.shortDescription,
    coverImageUrl: legacy.thumbnailUrl,
    status: "published",
    level:
      legacy.level === "basico"
        ? "beginner"
        : legacy.level === "intermedio"
          ? "intermediate"
          : "advanced",
    category: null,
    durationMinutes: legacy.estimatedHours ? legacy.estimatedHours * 60 : null,
    instructorName: null,
    priceMXN: legacy.priceMXN,
    isFeatured: Boolean(legacy.featured),
    displayOrder: 0,
    createdAt: legacy.createdAt,
    updatedAt: legacy.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Lecturas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Devuelve los cursos publicados del LMS (catálogo público).
 *
 * Si Supabase está configurado: query a `courses WHERE status='published'`.
 * Si no: devuelve derivación de `lib/data/courses.ts` para mantener el
 *        home y `/cursos` funcionando en modo demo.
 */
export async function getPublishedCourses(): Promise<Course[]> {
  if (!isRealMode()) {
    const { courses } = await import("@/lib/data/courses");
    return (courses as Array<Parameters<typeof legacyCourseToLms>[0]>)
      .map(legacyCourseToLms)
      .filter((c) => c.status === "published");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("is_featured", { ascending: false })
    .order("display_order", { ascending: true });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[courses-server] getPublishedCourses falló", {
      code: error?.code,
    });
    const { courses } = await import("@/lib/data/courses");
    return (courses as Array<Parameters<typeof legacyCourseToLms>[0]>)
      .map(legacyCourseToLms)
      .filter((c) => c.status === "published");
  }
  return (data as CourseRow[]).map(mapCourseRow);
}

/**
 * Devuelve un curso por slug (público).
 * Solo devuelve si el curso está en status='published'.
 */
export async function getCourseBySlug(
  slug: string,
): Promise<Course | undefined> {
  if (!isRealMode()) {
    const { courses } = await import("@/lib/data/courses");
    const match = (
      courses as Array<Parameters<typeof legacyCourseToLms>[0] & { slug: string }>
    ).find((c) => c.slug === slug);
    return match ? legacyCourseToLms(match) : undefined;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[courses-server] getCourseBySlug falló", {
      code: error.code,
      slug,
    });
    return undefined;
  }
  if (!data) return undefined;
  return mapCourseRow(data as CourseRow);
}

/**
 * Lista TODOS los cursos para el admin (incluye drafts y archivados).
 * Bypass RLS vía service role.
 */
export async function getAdminCourses(): Promise<Course[]> {
  if (!isRealMode()) {
    const { courses } = await import("@/lib/data/courses");
    // En demo, todos los del catálogo son visibles para el admin.
    return (courses as Array<Parameters<typeof legacyCourseToLms>[0]>).map(
      legacyCourseToLms,
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("display_order", { ascending: true });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[courses-server] getAdminCourses falló", {
      code: error?.code,
    });
    const { courses } = await import("@/lib/data/courses");
    return (courses as Array<Parameters<typeof legacyCourseToLms>[0]>).map(
      legacyCourseToLms,
    );
  }
  return (data as CourseRow[]).map(mapCourseRow);
}

/**
 * Devuelve los módulos de un curso, ordenados por `display_order`.
 *
 * Si Supabase está configurado: query a `modules WHERE course_id=...`.
 * Si no: deriva los módulos del catálogo demo (`lib/data/courses.ts`).
 */
export async function getCourseModules(courseId: string): Promise<Module[]> {
  if (!isRealMode()) {
    const legacy = getLegacyCourseById(courseId);
    if (!legacy) return [];
    return legacy.modules.map((m) => ({
      id: m.id,
      courseId,
      title: m.title,
      description: m.description ?? null,
      displayOrder: m.order,
      createdAt: new Date(0).toISOString(),
    }));
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("modules")
    .select("*")
    .eq("course_id", courseId)
    .order("display_order", { ascending: true });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[courses-server] getCourseModules falló", {
      code: error?.code,
      courseId,
    });
    return [];
  }
  return (data as ModuleRow[]).map(mapModuleRow);
}

/**
 * Devuelve las lecciones de un módulo, ordenadas por `display_order`.
 *
 * Si Supabase está configurado: query a `lessons WHERE module_id=...`.
 * Si no: deriva las lecciones del catálogo demo.
 */
export async function getModuleLessons(moduleId: string): Promise<Lesson[]> {
  if (!isRealMode()) {
    const { courses } = await import("@/lib/data/courses");
    type LegacyLesson = {
      id: string;
      title: string;
      description?: string;
      durationMinutes: number;
      video?: { provider: string; source: string };
      isPreview?: boolean;
      order: number;
    };
    type LegacyCourse = {
      modules: Array<{ id: string; lessons: LegacyLesson[] }>;
    };
    const allCourses = courses as LegacyCourse[];
    for (const course of allCourses) {
      for (const mod of course.modules) {
        if (mod.id === moduleId) {
          return mod.lessons.map((l) => {
            const provider = l.video?.provider;
            const isYouTube = provider === "youtube";
            return {
              id: l.id,
              moduleId,
              title: l.title,
              description: l.description ?? null,
              videoProvider: isYouTube
                ? ("youtube" as const)
                : provider === "cloudflare_stream"
                  ? ("cloudflare_stream" as const)
                  : provider === "mux"
                    ? ("mux" as const)
                    : provider === "vimeo" || provider === "custom"
                      ? ("external" as const)
                      : null,
              videoId: isYouTube ? (l.video?.source ?? null) : null,
              videoUrl:
                l.video && !isYouTube ? l.video.source : null,
              durationMinutes: l.durationMinutes,
              displayOrder: l.order,
              isFreePreview: Boolean(l.isPreview),
              createdAt: new Date(0).toISOString(),
            };
          });
        }
      }
    }
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("module_id", moduleId)
    .order("display_order", { ascending: true });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[courses-server] getModuleLessons falló", {
      code: error?.code,
      moduleId,
    });
    return [];
  }
  return (data as LessonRow[]).map(mapLessonRow);
}