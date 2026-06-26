"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { Course, LessonProgress } from "@/types";
import { flatLessons, findLesson } from "@/lib/data/courses";
import {
  Container,
  Button,
  Badge,
  Card,
  EmptyState
} from "@/components/ui";
import { VideoPlayer } from "@/components/video";
import { ModuleList } from "@/components/course";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import { formatDuration } from "@/lib/utils";
import { markLessonCompleteAction } from "@/app/actions/lesson-progress";

/**
 * LessonView — vista de una lección (v1.0.0).
 *
 * Auth model:
 * - El server (la página `/aprender/[course]/[lesson]/page.tsx`) ya validó
 *   access contra el LMS real (Supabase). Si llegamos acá, el server
 *   considera que el user PUEDE ver esta lección.
 * - El cliente recibe `enrolled`, `isPreviewLesson`, `lmsCourseId`,
 *   `currentPercent`, `lessonIndex` y `totalLessons` como props y los usa
 *   como source-of-truth. NO consulta mock auth ni mock enrollments.
 *
 * Persistencia de progreso (v1.0.0):
 * - El botón "Marcar como completada" llama a la Server Action
 *   `markLessonCompleteAction`, que escribe a
 *   `enrollments.progress_percent` en Supabase.
 * - El percent se calcula como `ceil((lessonIndex + 1) / totalLessons * 100)`
 *   y solo sube (highest water mark).
 * - El sidebar de módulos muestra checkmarks en las primeras N lecciones
 *   según el percent, como aproximación hasta que la migración del
 *   catálogo a la DB habilite per-lesson tracking real
 *   (`lesson_progress` table).
 */
export function LessonView({
  course,
  lessonSlug,
  enrolled = false,
  isPreviewLesson = false,
  lmsCourseId = null,
  currentPercent = 0,
  lessonIndex = 0,
  totalLessons = 0,
}: {
  course: Course;
  lessonSlug: string;
  enrolled?: boolean;
  isPreviewLesson?: boolean;
  lmsCourseId?: string | null;
  currentPercent?: number;
  lessonIndex?: number;
  totalLessons?: number;
}) {
  const [marked, setMarked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setReady(true);
  }, [lessonSlug]);

  // Si el server re-renderiza (post-revalidatePath) y el currentPercent
  // ya cubre esta lección, sincronizamos `marked` para que el botón
  // muestre "✓ Completada" sin parpadeo.
  useEffect(() => {
    if (totalLessons > 0) {
      const lessonTarget = Math.ceil(((lessonIndex + 1) / totalLessons) * 100);
      if (currentPercent >= lessonTarget) {
        setMarked(true);
      }
    }
  }, [currentPercent, lessonIndex, totalLessons]);

  const found = findLesson(course, lessonSlug);

  if (!ready) {
    return (
      <Container className="py-20">
        <p className="text-ink-muted text-center">Cargando…</p>
      </Container>
    );
  }

  // Gate de acceso (client-side, defensivo). El server YA pasó, pero si
  // llegamos acá con !enrolled && !isPreviewLesson es porque algo se
  // rompió. Mostramos paywall en lugar de la lección vacía.
  if (!enrolled && !isPreviewLesson) {
    return (
      <Container className="py-16 max-w-2xl">
        <EmptyState
          icon="🔒"
          title="Esta lección requiere acceso"
          description={
            "Para acceder a esta lección necesitás estar inscripto en el curso."
          }
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Button href={`/cursos/${course.slug}`} size="lg">
                Ver detalles del curso
              </Button>
              <Button href="/cursos" variant="outline" size="lg">
                Ver catálogo
              </Button>
              <WhatsAppButton
                intent="enroll"
                courseName={course.title}
                variant="outline"
              />
            </div>
          }
        />
      </Container>
    );
  }

  if (!found) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Lección no encontrada"
          action={<Button href={`/cursos/${course.slug}`}>Volver al curso</Button>}
        />
      </Container>
    );
  }

  const { lesson, index } = found;
  const flat = flatLessons(course);
  const currentIndex = flat.findIndex((f) => f.lesson.id === lesson.id);
  const prev = currentIndex > 0 ? flat[currentIndex - 1] : null;
  const nextLesson = currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null;

  // Progreso: derivamos los "completed" para el sidebar a partir del
  // percent global. Esto es una aproximación — la versión "real" (per-
  // lesson) requiere mapear mock lesson → LMS lesson UUID, lo cual es
  // scope de Fase E+ (catálogo migrado a la DB).
  const sidebarProgress = buildApproxProgress(flat, currentPercent);

  // ¿Esta lección ya está marcada? Dos formas de saberlo:
  //  1. El user acaba de hacer click (state local `marked`).
  //  2. El currentPercent del server ya cubre esta lección.
  const lessonTarget = totalLessons > 0
    ? Math.ceil(((lessonIndex + 1) / totalLessons) * 100)
    : 100;
  const alreadyCompleted = marked || currentPercent >= lessonTarget;

  // El botón "marcar como completada" solo si el user está inscripto
  // (no en preview-only) y tenemos el LMS courseId (sin él no podemos
  // persistir).
  const canMarkComplete =
    enrolled && !isPreviewLesson && Boolean(lmsCourseId);

  const handleMarkComplete = () => {
    if (!lmsCourseId) return;
    setError(null);
    startTransition(async () => {
      const result = await markLessonCompleteAction({
        courseId: lmsCourseId,
        lessonIndex,
        totalLessons,
      });
      if (result.ok) {
        setMarked(true);
      } else {
        setError(result.note || "No se pudo guardar el progreso.");
      }
    });
  };

  return (
    <Container size="wide" className="py-8">
      {/* Banner de preview (si aplica) */}
      {isPreviewLesson && !enrolled && (
        <Card className="mb-6 p-4 bg-brand-50 border-brand-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge tone="info">Vista previa</Badge>
              <p className="text-sm text-ink-soft mt-2">
                Estás viendo una lección gratis. Inscríbete al curso para
                acceder a todo el contenido y tracking de progreso.
              </p>
            </div>
            <Button href={`/inscripcion/${course.slug}`} size="md">
              Inscribirme gratis
            </Button>
          </div>
        </Card>
      )}

      {/* Breadcrumb */}
      <nav className="text-sm text-ink-muted mb-4">
        <Link href="/dashboard" className="hover:text-brand-600">Mi panel</Link>
        {" / "}
        <Link href={`/cursos/${course.slug}`} className="hover:text-brand-600">
          {course.title}
        </Link>
      </nav>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Columna principal */}
        <div className="lg:col-span-2">
          {lesson.video ? (
            <VideoPlayer
              asset={lesson.video}
              title={lesson.title}
              posterFallback={course.thumbnailUrl}
            />
          ) : (
            <Card className="aspect-video flex items-center justify-center text-ink-muted">
              <div className="text-center">
                <p className="text-4xl mb-2">📄</p>
                <p>Lección de lectura</p>
              </div>
            </Card>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-brand-600">
                Lección {index.module + 1}.{index.lesson + 1} · {index.global + 1} de {flat.length}
              </p>
              <h1 className="text-2xl font-bold text-ink mt-1">{lesson.title}</h1>
              <p className="text-sm text-ink-muted mt-1">
                {formatDuration(lesson.durationMinutes)} · {lesson.type}
              </p>
            </div>
            {canMarkComplete && (
              <Button
                variant={alreadyCompleted ? "outline" : "primary"}
                onClick={handleMarkComplete}
                disabled={alreadyCompleted || isPending}
              >
                {isPending
                  ? "Guardando…"
                  : alreadyCompleted
                    ? "✓ Completada"
                    : "Marcar como completada"}
              </Button>
            )}
          </div>

          {error && (
            <Card className="mt-4 p-4 border-red-200 bg-red-50">
              <p className="text-sm text-red-700">
                ⚠ {error}
              </p>
            </Card>
          )}

          <div className="mt-6">
            <p className="text-ink-soft leading-relaxed">{lesson.description}</p>
            {lesson.content && (
              <Card className="mt-4 p-6 prose prose-sm max-w-none">
                <p className="text-ink-soft whitespace-pre-line">{lesson.content}</p>
              </Card>
            )}
          </div>

          {/* Recursos */}
          {lesson.resources.length > 0 && (
            <Card className="mt-6 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-ink">Recursos de la lección</h3>
                <Badge tone="neutral">demo</Badge>
              </div>
              <ul className="space-y-2">
                {lesson.resources.map((r) => {
                  const available = r.url && r.url !== "#";
                  return (
                    <li
                      key={r.id}
                      className={
                        "flex items-center justify-between rounded-lg border border-brand-50 px-4 py-3 transition " +
                        (available
                          ? "hover:bg-brand-50/40"
                          : "opacity-70")
                      }
                    >
                      <div>
                        <p className="font-semibold text-ink text-sm">{r.title}</p>
                        {r.description && (
                          <p className="text-xs text-ink-muted">{r.description}</p>
                        )}
                      </div>
                      {available ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                        >
                          <Badge tone="brand">{r.type} · descargar</Badge>
                        </a>
                      ) : (
                        <Badge tone="warning" title="Recurso demo — se habilitará cuando el curso se publique">
                          {r.type} · próximamente
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Notas del alumno */}
          {canMarkComplete && (
            <Card className="mt-6 p-6">
              <h3 className="font-bold text-ink mb-2">Mis notas</h3>
              <textarea
                placeholder="Escribe aquí tus apuntes de esta lección… (demo: no se guarda aún)"
                className="w-full min-h-24 rounded-xl border border-brand-100 px-4 py-3 text-sm focus:outline-none focus:border-brand-400"
              />
            </Card>
          )}

          {/* Anterior / siguiente */}
          <div className="mt-8 flex items-center justify-between gap-3">
            {prev ? (
              <Button
                variant="outline"
                href={`/aprender/${course.slug}/${prev.lesson.slug}`}
              >
                ← Anterior
              </Button>
            ) : (
              <span />
            )}
            {nextLesson ? (
              <Button href={`/aprender/${course.slug}/${nextLesson.lesson.slug}`}>
                Siguiente →
              </Button>
            ) : (
              <Badge tone="success">🏁 Última lección del curso</Badge>
            )}
          </div>
        </div>

        {/* Sidebar: módulos y lecciones */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-ink">Contenido del curso</h3>
            <Badge tone="neutral">
              {flat.length} lecciones
            </Badge>
          </div>
          <div className="mb-3 text-xs text-ink-muted">
            {currentPercent > 0
              ? `Llevás ${currentPercent}% del curso`
              : "Aún no marcaste ninguna lección"}
          </div>
          <ModuleList
            course={course}
            activeLessonSlug={lesson.slug}
            progress={sidebarProgress}
            defaultOpen={true}
          />
        </aside>
      </div>
    </Container>
  );
}

/**
 * Construye un array de `LessonProgress` (formato legacy de
 * `@/types/index.ts` que consume `ModuleList`) marcando como completadas
 * las primeras N lecciones del flat list, donde N = `percent * total / 100`.
 *
 * Es una aproximación: no sabemos cuáles lecciones marcó el user
 * exactamente — solo tenemos un percent global. La alternativa "real"
 * (per-lesson) requiere mapear mock lesson → LMS lesson UUID, lo cual
 * es scope de Fase E+ (cuando el catálogo demo se cargue en la DB).
 */
function buildApproxProgress(
  flat: ReturnType<typeof flatLessons>,
  percent: number,
): LessonProgress[] {
  if (percent <= 0 || flat.length === 0) return [];
  const completedCount = Math.min(
    flat.length,
    Math.max(0, Math.round((percent / 100) * flat.length)),
  );
  const now = new Date().toISOString();
  return flat.slice(0, completedCount).map((f) => ({
    id: `approx_${f.lesson.id}`,
    userId: "",
    lessonId: f.lesson.id,
    courseId: "",
    completed: true,
    percent: 100,
    completedAt: now,
    lastSeenAt: now,
  }));
}
