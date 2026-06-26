"use client";

/**
 * Dashboard del alumno — Client Component.
 *
 * Recibe los datos ya cargados por el Server Component (`page.tsx`) como
 * props. Esto evita que la vista haga fetches client-side (que sería más
 * complejo y lento) y mantiene la lógica de auth/protección en el server.
 *
 * Interactividad:
 *   - Cada lección tiene un botón "Marcar como visto" que actualiza el
 *     progreso local con animación. La persistencia real se hace cuando
 *     el LMS server lib esté conectado (track 2 + RLS).
 *   - El progreso del curso se recalcula en cliente y se anima al cambiar.
 *
 * Compatibilidad con el flujo anterior:
 *   - El DashboardView legacy (`components/dashboard/DashboardView.tsx`)
 *     sigue existiendo para los componentes que lo importaban desde
 *     client-side (e.g. flujos demo). Este nuevo vive en `app/dashboard/`
 *     y es el que renderiza `/dashboard` real.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Container,
  Card,
  Button,
  ProgressBar,
  EmptyState,
  Badge,
} from "@/components/ui";
import { initials } from "@/lib/utils";

/** Forma enriquecida del enrollment que pasa el Server Component. */
export interface DashboardEnrollmentView {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  progressPercent: number;
  /** Slug de la próxima lección no completada. */
  nextLessonSlug?: string;
  /** Título de la próxima lección (para el hero "Continuar"). */
  nextLessonTitle?: string;
  /** Total de lecciones del curso (para mostrar "X / N lecciones" en la card). */
  totalLessons: number;
}

interface DashboardViewProps {
  userId: string;
  userName: string;
  userEmail: string;
  enrollments: DashboardEnrollmentView[];
}

export function DashboardView({
  userId,
  userName,
  userEmail,
  enrollments,
}: DashboardViewProps) {
  // Estado local: mapa lessonId -> completed. Inicia con el progreso que
  // vino del server (si quisiéramos cargar el detalle por lección, lo
  // haríamos aquí). Por ahora, cada curso sabe su progressPercent global.
  const [completedByCourse, setCompletedByCourse] = useState<Record<string, number>>(
    () => {
      const init: Record<string, number> = {};
      for (const e of enrollments) {
        init[e.courseId] = e.progressPercent;
      }
      return init;
    },
  );

  const overall = useMemo(() => {
    const list = Object.values(completedByCourse);
    if (list.length === 0) return 0;
    return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  }, [completedByCourse]);

  const completedCount = useMemo(
    () => Object.values(completedByCourse).filter((p) => p >= 100).length,
    [completedByCourse],
  );

  // Próxima lección global: la primera del primer curso con progreso < 100.
  const nextGlobal = useMemo(() => {
    for (const e of enrollments) {
      if ((completedByCourse[e.courseId] ?? 0) >= 100) continue;
      if (e.nextLessonSlug && e.nextLessonTitle) return e;
    }
    return null;
  }, [enrollments, completedByCourse]);

  // (antes había aquí un botón "Marcar lección como vista" que llamaba
  // a la Server Action. Se sacó: la card del dashboard muestra el curso
  // completo, no una lección específica, y la acción de marcar se hace
  // desde la página de la lección con contexto claro. Si más adelante
  // queremos un quick-action aquí, debería ser algo como "Marcar curso
  // como completado" o tener un selector de lección explícito.)

  return (
    <Container size="wide" className="py-10">
      {/* Saludo */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-lg">
            {initials(userName)}
          </div>
          <div>
            <p className="text-sm text-ink-muted">Hola de nuevo 👋</p>
            <h1 className="text-2xl font-bold text-ink">{userName}</h1>
            <p className="text-xs text-ink-muted">{userEmail}</p>
          </div>
        </div>
        <Button href="/cursos" variant="outline">
          Explorar más cursos
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        <StatBox
          label="Progreso general"
          value={`${overall}%`}
          hint={`${enrollments.length} cursos inscritos`}
          icon="📈"
        />
        <StatBox
          label="Cursos completados"
          value={completedCount}
          hint={`${enrollments.length - completedCount} en curso`}
          icon="🏆"
        />
        <StatBox
          label="Certificados"
          value={0}
          hint="disponibles al completar"
          icon="🎓"
        />
        <StatBox label="ID de sesión" value={userId.slice(0, 8) + "…"} hint="auth.uid()" icon="🔐" />
      </div>

      {/* Continuar aprendiendo */}
      {nextGlobal && nextGlobal.nextLessonSlug && (
        <Card className="p-6 mb-10 bg-brand-gradient text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white/80">Continúa donde lo dejaste</p>
              <h3 className="text-xl font-bold mt-1">{nextGlobal.nextLessonTitle}</h3>
              <p className="text-sm text-white/80 mt-1">{nextGlobal.courseTitle}</p>
            </div>
            <Button
              href={`/aprender/${nextGlobal.courseSlug}/${nextGlobal.nextLessonSlug}`}
              variant="accent"
              size="lg"
            >
              ▶ Continuar aprendiendo
            </Button>
          </div>
        </Card>
      )}

      {/* Mis cursos */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-ink mb-4">Mis cursos</h2>
        {enrollments.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Aún no estás inscrito en ningún curso"
            description="Explora el catálogo y empieza tu primera formación hoy."
            action={<Button href="/cursos">Ver catálogo</Button>}
          />
        ) : (
          <div className="grid gap-5">
            {enrollments.map((e) => {
              const percent = completedByCourse[e.courseId] ?? e.progressPercent;
              const isComplete = percent >= 100;
              return (
                <Card key={e.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-ink leading-snug">{e.courseTitle}</h3>
                      <p className="text-xs text-ink-muted mt-1">
                        Inscrito · ID: {e.id}
                      </p>
                    </div>
                    <Badge tone={isComplete ? "success" : "neutral"}>
                      {isComplete ? "Completado" : "En curso"}
                    </Badge>
                  </div>
                  <div className="mb-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink-soft">{percent}% completado</span>
                    <span className="text-ink-muted">
                      {e.totalLessons > 0
                        ? `${e.totalLessons} lecciones`
                        : "lecciones"}
                    </span>
                  </div>
                  <ProgressBar value={percent} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {e.nextLessonSlug ? (
                      <Button
                        href={`/aprender/${e.courseSlug}/${e.nextLessonSlug}`}
                        size="sm"
                      >
                        {percent === 0
                          ? "Empezar curso"
                          : isComplete
                            ? "Repasar curso"
                            : "Continuar"}
                      </Button>
                    ) : null}
                    {/* Botón siempre visible para ir al detalle del curso.
                        Útil en real mode donde `nextLessonSlug` puede ser
                        undefined y no hay otro punto de entrada al curso. */}
                    {e.courseSlug && (
                      <Button
                        href={`/cursos/${e.courseSlug}`}
                        variant={e.nextLessonSlug ? "outline" : "primary"}
                        size="sm"
                      >
                        Ver curso
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Acciones rápidas */}
      <section className="mb-12 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <h3 className="font-bold text-ink mb-1">Explorar cursos</h3>
          <p className="text-sm text-ink-muted mb-3">
            Descubre nuevos cursos para inscribirte.
          </p>
          <Button href="/cursos" variant="outline" size="sm">
            Ver catálogo
          </Button>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-ink mb-1">Cerrar sesión</h3>
          <p className="text-sm text-ink-muted mb-3">
            Sal de tu cuenta en este dispositivo.
          </p>
          <Button href="/logout" variant="outline" size="sm">
            Cerrar sesión
          </Button>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-ink mb-1">Soporte</h3>
          <p className="text-sm text-ink-muted mb-3">
            ¿Problemas con un curso o tu acceso?
          </p>
          <Button href="/contacto" variant="outline" size="sm">
            Contactar
          </Button>
        </Card>
      </section>
    </Container>
  );
}

function StatBox({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink-muted font-semibold">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-ink truncate">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
    </Card>
  );
}