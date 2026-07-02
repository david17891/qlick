"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
// Imports directos del client component (no del wrapper SSR) porque esta
// page es "use client". En /aprender el usuario ya está authed para ver
// sus cursos, pero el resolver SSR aquí no es crítico — el Navbar client
// hidratará con la sesión real al montarse.
import { Navbar as NavbarClient } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCurrentUser } from "@/lib/auth/mock-auth";
import { getEnrollmentsForUser } from "@/lib/data/enrollments";
import { getCourseById, flatLessons } from "@/lib/data/courses";
import { getLessonProgressForUser } from "@/lib/data/enrollments";
import {
  Container,
  Card,
  Button,
  EmptyState,
  ProgressBar,
  Badge
} from "@/components/ui";
import { LevelBadge } from "@/components/course";

export default function AprenderPage() {
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
      <>
        <NavbarClient />
        <Container className="py-20">
          <p className="text-ink-muted text-center">Cargando…</p>
        </Container>
        <Footer />
      </>
    );
  }

  const enrollments = getEnrollmentsForUser(user.id);

  return (
    <>
      <NavbarClient />
      <Container size="wide" className="py-10">
        <h1 className="text-3xl font-bold text-ink mb-2">Mis aprendizajes</h1>
        <p className="text-ink-muted mb-8">
          Todos los cursos en los que estás inscrito. Continúa desde donde lo dejaste.
        </p>

        {enrollments.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Aún no tienes cursos"
            description="Cuando te inscribas, aparecerán aquí."
            action={<Button href="/cursos">Explorar catálogo</Button>}
          />
        ) : (
          <div className="grid gap-5">
            {enrollments.map((e) => {
              const course = getCourseById(e.courseId);
              if (!course) return null;
              const progress = getLessonProgressForUser(user.id, course.id);
              const completedIds = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
              const flat = flatLessons(course);
              const next = flat.find((f) => !completedIds.has(f.lesson.id));
              const href = next
                ? `/aprender/${course.slug}/${next.lesson.slug}`
                : `/aprender/${course.slug}/${flat[0]?.lesson.slug ?? ""}`;

              return (
                <Card key={e.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <LevelBadge level={course.level} />
                        {e.progressPercent === 100 && (
                          <Badge tone="success">Completado</Badge>
                        )}
                      </div>
                      <h3 className="font-bold text-ink">{course.title}</h3>
                      <div className="mt-2 max-w-md">
                        <ProgressBar value={e.progressPercent} />
                        <p className="text-xs text-ink-muted mt-1">
                          {e.progressPercent}% completado
                        </p>
                      </div>
                    </div>
                    <Button href={href}>
                      {e.progressPercent === 0 ? "Empezar" : "Continuar"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Container>
      <Footer />
    </>
  );
}
