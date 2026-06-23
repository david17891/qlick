"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Course, User } from "@/types";
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

export function LessonView({
  course,
  lessonSlug
}: {
  course: Course;
  lessonSlug: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
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

  // Si no hay sesión: invitamos a login pero permitimos ver previews.
  if (!user) {
    const isPreview = found?.lesson.isPreview;
    if (!isPreview) {
      return (
        <Container className="py-16 max-w-2xl">
          <EmptyState
            icon="🔒"
            title="Esta lección requiere acceso"
            description="Inicia sesión con tu cuenta de alumno o inscríbrite en el curso para ver el contenido completo."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Button href="/login">Iniciar sesión</Button>
                <Button href={`/cursos/${course.slug}`} variant="outline">
                  Ver detalles del curso
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
  }

  // Si hay sesión pero no está inscrito (y no es preview): acceso restringido.
  const enrolled = user ? isEnrolled(user.id, course.id) : false;
  if (user && !enrolled && !found?.lesson.isPreview) {
    return (
      <Container className="py-16 max-w-2xl">
        <EmptyState
          icon="🔒"
          title="Aún no estás inscrito en este curso"
          description="Inscríbete para desbloquear todas las lecciones, recursos y el certificado."
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Button href={`/cursos/${course.slug}`}>
                Inscribirme / Comprar
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

  const progress = user ? getLessonProgressForUser(user.id, course.id) : [];
  const alreadyCompleted =
    progress.find((p) => p.lessonId === lesson.id)?.completed ?? marked;

  return (
    <Container size="wide" className="py-8">
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
            {enrolled && (
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
          {enrolled && (
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
            defaultOpen={false}
          />
        </aside>
      </div>
    </Container>
  );
}
