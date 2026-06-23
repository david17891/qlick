"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@/types";
import { getCurrentUser } from "@/lib/auth/mock-auth";
import {
  getEnrollmentsForUser,
  getLessonProgressForUser
} from "@/lib/data/enrollments";
import { getCourseById, flatLessons } from "@/lib/data/courses";
import { getCertificatesForUser } from "@/lib/data/certificates";
import { getPaymentsForUser } from "@/lib/data/payments";
import { getActivityForUser } from "@/lib/data/content";
import { getAllCourses } from "@/lib/data/courses";
import {
  Container,
  Card,
  Button,
  ProgressBar,
  EmptyState,
  Badge
} from "@/components/ui";
import { EnrolledCourseCard, StatCard } from "@/components/dashboard";
import { CourseCard } from "@/components/course";
import { initials, formatMXN, formatDate } from "@/lib/utils";

export function DashboardView() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      router.push("/login");
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  if (!ready || !user) {
    return (
      <Container className="py-20">
        <p className="text-ink-muted text-center">Cargando tu panel…</p>
      </Container>
    );
  }

  const enrollments = getEnrollmentsForUser(user.id);
  const certificates = getCertificatesForUser(user.id);
  const payments = getPaymentsForUser(user.id);
  const activity = getActivityForUser(user.id);

  const overall = enrollments.length
    ? Math.round(
        enrollments.reduce((a, e) => a + e.progressPercent, 0) /
          enrollments.length
      )
    : 0;

  const completedCount = enrollments.filter(
    (e) => e.progressPercent === 100
  ).length;

  const lastEnrollment = enrollments[0];
  const lastCourse = lastEnrollment
    ? getCourseById(lastEnrollment.courseId)
    : null;

  // Próxima lección sugerida del curso más reciente con progreso < 100.
  const next = (() => {
    for (const e of enrollments) {
      if (e.progressPercent >= 100) continue;
      const course = getCourseById(e.courseId);
      if (!course) continue;
      const progress = getLessonProgressForUser(user.id, course.id);
      const completedIds = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
      const flat = flatLessons(course);
      const nextLesson = flat.find((f) => !completedIds.has(f.lesson.id));
      if (nextLesson) {
        return { course, lessonSlug: nextLesson.lesson.slug, lessonTitle: nextLesson.lesson.title };
      }
    }
    return null;
  })();

  // Recomendaciones: cursos no inscritos.
  const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));
  const recommendations = getAllCourses()
    .filter((c) => !enrolledCourseIds.has(c.id))
    .slice(0, 3);

  return (
    <Container size="wide" className="py-10">
      {/* Saludo */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-lg">
            {initials(user.name)}
          </div>
          <div>
            <p className="text-sm text-ink-muted">Hola de nuevo 👋</p>
            <h1 className="text-2xl font-bold text-ink">{user.name}</h1>
          </div>
        </div>
        <Button href="/cursos" variant="outline">
          Explorar más cursos
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        <StatCard
          label="Progreso general"
          value={`${overall}%`}
          hint={`${enrollments.length} cursos inscritos`}
          icon="📈"
        />
        <StatCard
          label="Cursos completados"
          value={completedCount}
          hint={`${enrollments.length - completedCount} en curso`}
          icon="🏆"
          tone="accent"
        />
        <StatCard
          label="Certificados"
          value={certificates.length}
          hint="descargables"
          icon="🎓"
        />
        <StatCard
          label="Inversión"
          value={formatMXN(
            payments
              .filter((p) => p.status === "approved")
              .reduce((a, p) => a + (p.amountMXN - p.discountMXN), 0)
          )}
          hint="total en cursos"
          icon="💳"
          tone="neutral"
        />
      </div>

      {/* Continuar viendo */}
      {next && (
        <Card className="p-6 mb-10 bg-brand-gradient text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white/80">Continúa donde lo dejaste</p>
              <h3 className="text-xl font-bold mt-1">{next.lessonTitle}</h3>
              <p className="text-sm text-white/80 mt-1">{next.course.title}</p>
            </div>
            <Button
              href={`/aprender/${next.course.slug}/${next.lessonSlug}`}
              variant="accent"
              size="lg"
            >
              ▶ Continuar
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
              const course = getCourseById(e.courseId);
              if (!course) return null;
              const progress = getLessonProgressForUser(user.id, course.id);
              const completedIds = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
              const flat = flatLessons(course);
              const nextLesson = flat.find((f) => !completedIds.has(f.lesson.id));
              return (
                <EnrolledCourseCard
                  key={e.id}
                  enrollment={e}
                  nextLessonSlug={nextLesson?.lesson.slug}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Layout 2 columnas: actividad / pagos */}
      <div className="grid lg:grid-cols-3 gap-8 mb-12">
        <section className="lg:col-span-2">
          <h2 className="text-xl font-bold text-ink mb-4">Actividad reciente</h2>
          <Card className="p-6">
            {activity.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin actividad aún.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 pb-3 border-b border-brand-50 last:border-0 last:pb-0"
                  >
                    <span className="mt-0.5 h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs">
                      {a.type === "lesson_completed" ? "✓" :
                       a.type === "course_completed" ? "🏆" :
                       a.type === "purchase" ? "💳" : "→"}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-ink-soft">{a.message}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{formatDate(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-4">Certificados</h2>
          <Card className="p-6">
            {certificates.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Completa un curso para generar tu primer certificado.
              </p>
            ) : (
              <ul className="space-y-3">
                {certificates.map((c) => {
                  const course = getCourseById(c.courseId);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {course?.title ?? "Curso"}
                        </p>
                        <p className="text-xs text-ink-muted">Código: {c.code}</p>
                      </div>
                      <Badge tone="success">Verificado</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <h2 className="text-xl font-bold text-ink mt-8 mb-4">Historial de pagos</h2>
          <Card className="p-6">
            {payments.length === 0 ? (
              <p className="text-sm text-ink-muted">Aún no tienes pagos registrados.</p>
            ) : (
              <ul className="space-y-3">
                {payments.map((p) => {
                  const course = getCourseById(p.courseId);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-ink">
                          {course?.title ?? "Curso"}
                        </p>
                        <p className="text-xs text-ink-muted">{formatDate(p.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-ink">
                          {formatMXN(p.amountMXN - p.discountMXN)}
                        </p>
                        <Badge
                          tone={
                            p.status === "approved" ? "success" :
                            p.status === "pending" ? "warning" :
                            p.status === "rejected" ? "danger" : "neutral"
                          }
                        >
                          {p.status === "approved" ? "Aprobado" :
                           p.status === "pending" ? "Pendiente" :
                           p.status === "rejected" ? "Rechazado" : p.status}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {/* Recomendaciones */}
      {recommendations.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-ink mb-4">Recomendado para ti</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
