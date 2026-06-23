import Link from "next/link";
import Image from "next/image";
import type { Enrollment } from "@/types";
import { getCourseById, getCourseStats } from "@/lib/data/courses";
import { Card, ProgressBar, Button } from "@/components/ui";
import { LevelBadge } from "@/components/course";
import { formatDuration } from "@/lib/utils";

/** Tarjeta resumen de curso inscrito para el dashboard del alumno. */
export function EnrolledCourseCard({
  enrollment,
  nextLessonSlug
}: {
  enrollment: Enrollment;
  nextLessonSlug?: string;
}) {
  const course = getCourseById(enrollment.courseId);
  if (!course) return null;
  const stats = getCourseStats(course.id);
  const continueHref = nextLessonSlug
    ? `/aprender/${course.slug}/${nextLessonSlug}`
    : `/cursos/${course.slug}`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="relative sm:w-48 aspect-video sm:aspect-auto shrink-0">
          <Image
            src={course.thumbnailUrl}
            alt={course.title}
            fill
            sizes="200px"
            className="object-cover"
          />
        </div>
        <div className="p-5 flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <LevelBadge level={course.level} />
            <span className="text-xs text-ink-muted">
              {formatDuration(stats.totalMinutes)} de contenido
            </span>
          </div>
          <h3 className="font-bold text-ink leading-snug">{course.title}</h3>
          <div className="mt-3 mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-soft">
              {enrollment.progressPercent}% completado
            </span>
            <span className="text-ink-muted">
              {stats.totalLessons} lecciones
            </span>
          </div>
          <ProgressBar value={enrollment.progressPercent} />
          <div className="mt-4">
            <Button href={continueHref} size="sm">
              {enrollment.progressPercent === 0
                ? "Empezar curso"
                : enrollment.progressPercent === 100
                  ? "Repasar curso"
                  : "Continuar"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
