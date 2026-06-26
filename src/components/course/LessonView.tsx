"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Course } from "@/types";
import { getCurrentUser } from "@/lib/auth/mock-auth";
import {
  isEnrolled,
  getLessonProgressForUser
} from "@/lib/data/enrollments";
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

/**
 * LessonView — vista de una lección.
 *
 * Auth model (v0.9.0+):
 * - El server (la página `/aprender/[course]/[lesson]/page.tsx`) ya validó
 *   access contra el LMS real (Supabase). Si llegamos acá, el server
 *   considera que el user PUEDE ver esta lección.
 * - El cliente recibe `enrolled` y `isPreviewLesson` como props y los usa
 *   como source-of-truth para la UI. NO consulta mock auth ni mock
 *   enrollments (esos sistemas no conocen al user de Supabase).
 *
 * Por qué seguimos importando `getCurrentUser` / `isEnrolled` / etc.:
 * - El `progress` (lesson_progress) del usuario AÚN vive en el mock
 *   (`lib/data/enrollments`). El bridge completo de progreso a Supabase
 *   es scope de Fase E+. Mientras tanto, los botones y la sidebar usan
 *   los datos del mock si están disponibles; si no, caen a defaults.
 *
 * Trade-off conocido: si el user_id del mock no coincide con el user_id
 * de Supabase (lo cual es el caso en producción), el progreso no se
 * muestra correctamente. Aceptable para MVP.
 */
export function LessonView({
  course,
  lessonSlug,
  enrolled = false,
  isPreviewLesson = false,
}: {
  course: Course;
  lessonSlug: string;
  enrolled?: boolean;
  isPreviewLesson?: boolean;
}) {
  const router = useRouter();
  const [marked, setMarked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, [lessonSlug]);

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

  // Progreso: por ahora, el mock. Si el user está logueado en el mock
  // (caso demo) lo usamos; si no, vacíos.
  const mockUser = getCurrentUser();
  const progress = mockUser
    ? getLessonProgressForUser(mockUser.id, course.id)
    : [];
  const alreadyCompleted =
    progress.find((p) => p.lessonId === lesson.id)?.completed ?? marked;

  // El botón "marcar como completada" solo si el user está inscripto
  // (no en preview-only).
  const canMarkComplete = enrolled && !isPreviewLesson;

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
                onClick={() => setMarked(true)}
                disabled={alreadyCompleted}
              >
                {alreadyCompleted ? "✓ Completada" : "Marcar como completada"}
              </Button>
            )}
          </div>

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
            <Badge tone="neutral">{flat.length} lecciones</Badge>
          </div>
          <ModuleList
            course={course}
            activeLessonSlug={lesson.slug}
            progress={progress}
            defaultOpen={true}
          />
        </aside>
      </div>
    </Container>
  );
}
