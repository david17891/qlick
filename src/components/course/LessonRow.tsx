import Link from "next/link";
import type { Lesson } from "@/types";
import { cn, formatDuration } from "@/lib/utils";

const typeIcon: Record<string, string> = {
  video: "▶",
  reading: "📄",
  exercise: "✍",
  quiz: "?"
};

export function LessonRow({
  lesson,
  courseSlug,
  completed,
  active,
  locked,
  prefix
}: {
  lesson: Lesson;
  courseSlug: string;
  completed?: boolean;
  active?: boolean;
  locked?: boolean;
  prefix?: string;
}) {
  return (
    <Link
      href={`/aprender/${courseSlug}/${lesson.slug}`}
      className={cn(
        "flex items-start gap-3 rounded-xl px-3 py-2.5 transition group",
        active ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-brand-50/60",
        locked && "opacity-60 pointer-events-none"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          completed
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-brand-500 text-white"
              : "bg-brand-100 text-brand-700"
        )}
      >
        {completed ? "✓" : typeIcon[lesson.type] ?? "•"}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            active ? "text-brand-700" : "text-ink-soft group-hover:text-brand-700"
          )}
        >
          {prefix && <span className="text-ink-muted">{prefix} · </span>}
          {lesson.title}
        </p>
        <p className="text-xs text-ink-muted mt-0.5">
          {formatDuration(lesson.durationMinutes)}
          {lesson.isPreview && " · Vista previa"}
        </p>
      </div>
    </Link>
  );
}
