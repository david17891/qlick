/**
 * Dashboard del alumno.
 *
 * Server Component protegido por `requireStudent()`:
 *   - Si Supabase Auth tiene una sesión válida y el email NO es admin,
 *     devolvemos { session, ... } y dejamos renderizar el DashboardView.
 *   - Si no hay sesión → redirect(307, "/login") para que el alumno entre
 *     con magic link.
 *   - Si está en modo demo (Supabase no configurado), también redirect a
 *     /login (es el comportamiento esperado: en demo el alumno usa el
 *     flujo demo en /dev/login; este /dashboard es solo para auth real).
 *
 * Datos que cargamos:
 *   - email + userId de la sesión Supabase
 *   - los cursos inscritos + progreso + última lección vista
 *   - la lista plana de lecciones de cada curso (para los botones
 *     "Marcar como visto")
 *
 * Persistencia:
 *   - Los datos vienen de `src/lib/data/*` (mock) en modo demo o de
 *     `src/lib/lms/enrollments-server` (track 2) en modo real. Usamos
 *     mock si Supabase no está configurado o si la importación falla —
 *     track 2 puede no estar aplicado todavía en este branch.
 *   - Los toggles "Marcar como visto" se manejan client-side vía
 *     `DashboardView` (state local + animación de progreso). La
 *     persistencia real es responsabilidad de una Server Action / RLS
 *     cuando el LMS real esté conectado.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { requireStudent } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardView } from "./DashboardView";
import type { Enrollment, LessonProgress } from "@/types/lms";
import {
  legacyEnrollmentToLms,
  legacyLessonProgressToLms,
} from "@/lib/lms/enrollments-server";
import { getCourseById as getCourseByIdLMS } from "@/lib/lms/courses-server";
import { getCourseById, getCourseBySlug, flatLessons } from "@/lib/data/courses";
import {
  getEnrollmentsForUser,
  getLessonProgressForUser,
} from "@/lib/data/enrollments";

/**
 * LessonProgress enriquecida con el courseId del enrollment al que pertenece.
 * Los tipos del LMS (`@/types/lms`) son planos por lección; aquí los proyectamos
 * a la forma enriched que espera el DashboardView (mismo shape que la versión
 * legacy en `@/types`).
 */
type DashboardLessonProgress = LessonProgress & { courseId: string };

export const metadata: Metadata = {
  title: "Mi panel",
  description: "Tu progreso, cursos inscritos y actividad.",
  alternates: { canonical: "/dashboard" },
};

/**
 * Loader de datos del dashboard. Intenta usar los server libs del LMS (track 2)
 * si están disponibles; en caso contrario cae a los mocks de lib/data/*.
 *
 * Devuelve un objeto con datos seguros para serializar al cliente.
 */
async function loadDashboardData(
  userId: string,
  userEmail: string,
): Promise<{
  enrollments: Array<
    Enrollment & {
      courseSlug: string;
      courseTitle: string;
      nextLessonSlug?: string;
      nextLessonTitle?: string;
      /**
       * Índice 0-based de la próxima lección a marcar (en el flat list del
       * mock). Se computa desde `progressPercent` y `totalLessons` porque
       * la tabla `lesson_progress` (per-lesson) aún no se persiste en real
       * mode — la persistencia es a nivel de enrollment, no de lección.
       * Cuando se migre a `lesson_progress`, este cálculo se reemplaza por
       * un lookup real de "primera lección no completada".
       */
      nextLessonIndex?: number;
      totalLessons: number;
    }
  >;
  certificates: number;
  paymentsCount: number;
}> {
  // 1) Intentar cargar vía server lib (track 2). Si falla o no existe el
  //    módulo (track 2 todavía no aplicado), caemos al mock.
  let enrollments: Enrollment[] = [];
  let lessonProgress: DashboardLessonProgress[] = [];

  try {
    const lms = await import("@/lib/lms/enrollments-server").catch(() => null);
    if (lms && typeof lms.getUserEnrollments === "function") {
      enrollments = await lms.getUserEnrollments(userId);
      // v1.0.0+: leemos también course_access activos. Esto cubre el caso
      // de un user que pagó un curso (course_access creado) pero cuyo
      // enrollment no se creó por alguna razón anterior. Unimos los
      // courseIds únicos de ambos sources.
      const supabase = createSupabaseAdminClient();
      const { data: accessRows } = await supabase
        .from("course_access")
        .select("course_id, expires_at")
        .eq("user_id", userId)
        .eq("access_status", "active");
      const now = new Date();
      const accessibleCourseIds = new Set(
        (accessRows ?? [])
          .filter(
            (r) => r.expires_at === null || new Date(r.expires_at) > now,
          )
          .map((r) => r.course_id),
      );
      // Para cada course_id con access pero sin enrollment, creamos un
      // enrollment retroactivo (idempotente, no duplica).
      for (const courseId of accessibleCourseIds) {
        const hasEnrollment = enrollments.some(
          (e) => e.courseId === courseId && e.status === "active",
        );
        if (!hasEnrollment) {
          try {
            // source=null: el origen real está en `course_access.access_source`
            // (puede ser `simulated_payment`, `manual_admin`, etc.). No
            // lo duplicamos en el enrollment — si hace falta atribución,
            // se cruza por `course_access`.
            await lms.enrollUserInCourse(userId, courseId, null);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[dashboard] enroll retroactivo falló", err);
          }
        }
      }
      // Recargar enrollments después del merge.
      enrollments = await lms.getUserEnrollments(userId);
      // Intentamos cargar progreso de cada curso inscrito.
      const allProgress: DashboardLessonProgress[] = [];
      for (const e of enrollments) {
        if (typeof lms.getLessonProgress === "function") {
          const progress = await lms.getLessonProgress(userId, e.courseId);
          // El LessonProgress del LMS es plano (lessonId, sin courseId).
          // Proyectamos a la forma enriched que usa el DashboardView.
          for (const p of progress) {
            allProgress.push({ ...p, courseId: e.courseId });
          }
        }
      }
      lessonProgress = allProgress;
    } else {
      throw new Error("enrollments-server not available");
    }
  } catch {
    // 2) Fallback: mocks de lib/data/* (siguen siendo el source-of-truth
    //    en este branch si track 2 aún no se aplicó). El "userId" del mock
    //    NO es el de Supabase Auth, así que filtramos por el email mock
    //    correspondiente. Para no romper la UX, mostramos TODAS las
    //    inscripciones activas del alumno demo (user_alumno) si el email
    //    del usuario Supabase coincide con uno de los emails demo.
    const demoUserIds = ["user_alumno", "user_alumno_2", "user_alumno_3"];
    // Filtramos: si el userId NO es uno de los mocks, mostramos vacío
    // (sin inscripciones en demo).
    const isDemoUser = demoUserIds.includes(userId);
    if (isDemoUser) {
      enrollments = getEnrollmentsForUser(userId).map(legacyEnrollmentToLms);
      lessonProgress = enrollments.flatMap((e) =>
        getLessonProgressForUser(userId, e.courseId).map((p) => ({
          ...legacyLessonProgressToLms(p),
          courseId: e.courseId,
        })),
      );
    } else {
      // Usuario Supabase real sin inscripciones demo: devolvemos vacío.
      // El DashboardView mostrará el EmptyState.
      enrollments = [];
      lessonProgress = [];
    }
  }

  // 2) Enriquece cada enrollment con datos del curso (título, slug, próxima
  //    lección no completada).
  //    - En realMode: usamos getCourseById del LMS (que consulta UUIDs reales).
  //    - En demoMode: usamos getCourseById del mock (que tiene strings tipo
  //      "course_fundamentos").
  //    Si no se encuentra el curso, la card del dashboard muestra "Curso sin nombre"
  //    con un warning, en vez de quedar vacía.
  const inRealMode = (await import("@/lib/supabase/health")).checkSupabaseConfig().configured;
  const enriched = await Promise.all(
    enrollments.map(async (e) => {
      const course = inRealMode
        ? await getCourseByIdLMS(e.courseId).catch(() => undefined)
        : getCourseById(e.courseId);
      if (!course) {
        return {
          ...e,
          courseSlug: "",
          courseTitle: "(curso no encontrado)",
          totalLessons: 0,
        };
      }
      // Para la próxima lección: en demoMode usamos el mock que tiene los
      // módulos/lecciones embebidos. En realMode el LMS aún no tiene
      // lecciones cargadas (Fase E+), así que también recurrimos al mock
      // por slug — es la única fuente de verdad para lesson content hoy.
      // Si el LMS tiene módulos/lecciones en el futuro, este lookup debería
      // ir a getCourseModules + getModuleLessons.
      //
      // IMPORTANTE: en real mode `e.courseId` es un UUID del LMS, no el
      // id de mock tipo "course_fundamentos". Por eso NO usamos
      // `getCourseById(e.courseId)` (mock by id) — usamos
      // `getCourseBySlug(course.slug)` (mock by slug), donde `course` es
      // el Course que ya cargamos arriba (LMS o mock según modo).
      let nextLesson: { slug: string; title: string } | undefined;
      let totalLessons = 0;
      const mockCourse = course?.slug
        ? getCourseBySlug(course.slug)
        : undefined;
      if (mockCourse) {
        const flat = flatLessons(
          mockCourse as unknown as Parameters<typeof flatLessons>[0],
        );
        totalLessons = flat.length;
        const completed = new Set(
          lessonProgress
            .filter((p) => p.courseId === e.courseId && p.completed)
            .map((p) => p.lessonId),
        );
        const found = flat.find((f) => !completed.has(f.lesson.id));
        if (found) {
          nextLesson = { slug: found.lesson.slug, title: found.lesson.title };
        }
      }
      // `nextLessonIndex` para la Server Action "marcar como vista" del
      // dashboard. Se computa desde progressPercent (en real mode, donde
      // lesson_progress está vacío) o desde la lección encontrada por slug
      // (más preciso en demo mode donde mock tiene completados per-lesson).
      // Highest-water-mark implícito: la action `markLessonCompleteAction`
      // no rebajará el percent si la lección ya está implícitamente cubierta.
      const nextLessonIndex =
        totalLessons === 0
          ? 0
          : e.progressPercent >= 100
            ? totalLessons - 1
            : Math.min(
                totalLessons - 1,
                Math.round((e.progressPercent / 100) * totalLessons),
              );
      return {
        ...e,
        courseSlug: course.slug,
        courseTitle: course.title,
        nextLessonSlug: nextLesson?.slug,
        nextLessonTitle: nextLesson?.title,
        nextLessonIndex,
        totalLessons,
      };
    }),
  );

  // Certificados y pagos demo (track 2 todavía no los migra; en real-mode
  // se obtendrán del server lib).
  const certificates = 0;
  const paymentsCount = 0;

  return {
    enrollments: enriched,
    certificates,
    paymentsCount,
  };
}

export default async function DashboardPage() {
  // Protección: solo alumnos autenticados pasan. Admin va a /admin.
  const session = await requireStudent();

  // Modo demo (Supabase no configurado): no podemos identificar al usuario,
  // redirigimos al login para que use el flujo demo /dev/login o el magic
  // link si ya está configurado.
  if (!session) {
    // Si el sistema está en modo demo (sin Supabase), permitimos fallback al
    // mock para que /siga funcionando el recorrido demo. Esto se hace
    // inyectando un userId demo si checkSupabaseConfig.mode === 'demo'.
    const health = checkSupabaseConfig();
    if (health.mode === "demo") {
      // Modo demo: mostramos el dashboard del alumno demo (user_alumno).
      const data = await loadDashboardData("user_alumno", "alumno@qlick.com");
      return (
        <>
          <Navbar />
          <DashboardView
            userId="user_alumno"
            userName="Alumno demo"
            userEmail="alumno@qlick.com"
            enrollments={data.enrollments}
          />
          <Footer />
        </>
      );
    }
    // Auth real pero sin sesión → al login.
    redirect("/login");
  }

  // Sesión real: cargamos datos del usuario autenticado.
  const data = await loadDashboardData(session.userId, session.email);

  return (
    <>
      <Navbar />
      <DashboardView
        userId={session.userId}
        // El name lo derivamos del email (parte local) por ahora; cuando
        // exista tabla `profiles` lo leeremos de ahí.
        userName={deriveDisplayName(session.email)}
        userEmail={session.email}
        enrollments={data.enrollments}
      />
      <Footer />
    </>
  );
}

/** Deriva un nombre legible a partir del email (parte antes de @). */
function deriveDisplayName(email: string): string {
  const local = email.split("@")[0] ?? "Alumno";
  // Reemplaza separadores comunes por espacios y capitaliza.
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Alumno";
  return cleaned
    .split(" ")
    .map((w) => (w[0] ?? "").toUpperCase() + w.slice(1))
    .join(" ");
}