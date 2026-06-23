import Link from "next/link";
import Image from "next/image";
import type { Course } from "@/types";
import { Card, Badge } from "@/components/ui";
import { formatMXN } from "@/lib/utils";
import { LevelBadge } from "./LevelBadge";
import { getInstructorById } from "@/lib/data/instructors";
import { getCourseStats } from "@/lib/data/courses";

export function CourseCard({ course }: { course: Course }) {
  const instructor = getInstructorById(course.instructorId);
  const stats = getCourseStats(course.id);

  return (
    <Link href={`/cursos/${course.slug}`} className="group block h-full">
      <Card hover className="h-full overflow-hidden flex flex-col">
        <div className="relative aspect-video overflow-hidden">
          <Image
            src={course.thumbnailUrl}
            alt={course.title}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute top-3 left-3 flex gap-2">
            <LevelBadge level={course.level} />
            {course.status === "gratis" && (
              <Badge tone="success">Gratis</Badge>
            )}
            {course.status === "proximamente" && (
              <Badge tone="info">Próximamente</Badge>
            )}
          </div>
          {course.originalPriceMXN && course.originalPriceMXN > course.priceMXN && (
            <div className="absolute top-3 right-3">
              <Badge tone="accent">
                -{Math.round(
                  ((course.originalPriceMXN - course.priceMXN) /
                    course.originalPriceMXN) *
                    100
                )}%
              </Badge>
            </div>
          )}
        </div>
        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-center gap-2 text-xs text-ink-muted mb-2">
            <span>{stats.totalModules} módulos</span>
            <span>·</span>
            <span>{stats.totalLessons} lecciones</span>
          </div>
          <h3 className="font-bold text-lg text-ink leading-snug group-hover:text-brand-700 transition">
            {course.title}
          </h3>
          <p className="mt-2 text-sm text-ink-muted line-clamp-2">
            {course.shortDescription}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {course.tags.slice(0, 3).map((t) => (
              <Badge key={t.id} tone="neutral">
                {t.label}
              </Badge>
            ))}
          </div>

          {instructor && (
            <p className="mt-4 text-xs text-ink-muted">
              Por <span className="font-semibold text-ink-soft">{instructor.name}</span>
            </p>
          )}

          <div className="mt-auto pt-4 flex items-center justify-between">
            <div>
              {course.status === "gratis" || course.priceMXN === 0 ? (
                <span className="text-lg font-bold text-emerald-600">Gratis</span>
              ) : course.status === "proximamente" ? (
                <span className="text-sm text-ink-muted">Próximamente</span>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-ink">
                    {formatMXN(course.priceMXN)}
                  </span>
                  {course.originalPriceMXN &&
                    course.originalPriceMXN > course.priceMXN && (
                      <span className="text-xs text-ink-muted line-through">
                        {formatMXN(course.originalPriceMXN)}
                      </span>
                    )}
                </div>
              )}
            </div>
            {course.rating && (
              <span className="text-sm font-semibold text-amber-600">
                ★ {course.rating}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
