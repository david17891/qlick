"use client";

import { useState } from "react";
import type { Course, LessonProgress } from "@/types";
import { cn } from "@/lib/utils";
import { LessonRow } from "./LessonRow";

/** Lista lateral de módulos y lecciones con estado de completado. */
export function ModuleList({
  course,
  activeLessonSlug,
  progress,
  defaultOpen
}: {
  course: Course;
  activeLessonSlug?: string;
  progress: LessonProgress[];
  defaultOpen?: boolean;
}) {
  const completedIds = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
  const [open, setOpen] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        course.modules.map((m, i) => [m.id, defaultOpen ?? i === 0])
      )
  );

  return (
    <div className="space-y-3">
      {course.modules.map((m, mi) => {
        const lessonsCompleted = m.lessons.filter((l) =>
          completedIds.has(l.id)
        ).length;
        const pct = Math.round((lessonsCompleted / m.lessons.length) * 100);
        return (
          <div
            key={m.id}
            className="rounded-2xl border border-brand-100 overflow-hidden bg-white"
          >
            <button
              onClick={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-50/50 transition"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
                  Módulo {mi + 1}
                </p>
                <h4 className="font-semibold text-ink text-sm leading-snug">
                  {m.title.replace(/^Módulo \d+ · /, "")}
                </h4>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-semibold text-ink-muted">
                  {lessonsCompleted}/{m.lessons.length}
                </span>
                <span
                  className={cn(
                    "transition-transform",
                    open[m.id] ? "rotate-180" : ""
                  )}
                >
                  ▾
                </span>
              </div>
            </button>
            <div className="h-1 bg-brand-100">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            {open[m.id] && (
              <div className="p-2 space-y-1">
                {m.lessons.map((l, li) => (
                  <LessonRow
                    key={l.id}
                    lesson={l}
                    courseSlug={course.slug}
                    completed={completedIds.has(l.id)}
                    active={l.slug === activeLessonSlug}
                    prefix={`${mi + 1}.${li + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
