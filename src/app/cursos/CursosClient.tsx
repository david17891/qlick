"use client";

/**
 * CursosClient — Filtros + grilla de cursos (Client Component).
 *
 * Recibe la lista pre-procesada del Server Component y maneja el filtro
 * activo con useState. El filtro es client-side puro (no cambia la URL).
 *
 * Por qué Client Component:
 * - Los filtros necesitan useState para recordar el botón activo.
 * - No hace falta server roundtrip: la lista cabe en 1 payload chico.
 *
 * Filtros soportados:
 * - "all"       → todos
 * - "basico"    → level === "basico"
 * - "intermedio"→ level === "intermedio"
 * - "avanzado"  → level === "avanzado"
 * - "free"      → accessType === "free" || "freemium" (ambos arrancan gratis)
 * - "paid"      → accessType === "paid"
 *
 * Badge "Gratis + Premium":
 * - Solo para freemium (CourseCard internamente muestra "Gratis" por el
 *   status legacy, pero el modelo real es mixto y el badge lo aclara).
 */

import { useMemo, useState } from "react";
import { CourseCard } from "@/components/course";
import { Badge } from "@/components/ui";
import type { Course as LegacyCourse } from "@/types";

export type FilterableCourse = LegacyCourse & {
  accessType: "free" | "paid" | "freemium";
};

type FilterValue =
  | "all"
  | "basico"
  | "intermedio"
  | "avanzado"
  | "free"
  | "paid";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "Todos", value: "all" },
  { label: "Básico", value: "basico" },
  { label: "Intermedio", value: "intermedio" },
  { label: "Avanzado", value: "avanzado" },
  { label: "Gratis", value: "free" },
  { label: "Pago", value: "paid" },
];

function matchesFilter(c: FilterableCourse, filter: FilterValue): boolean {
  switch (filter) {
    case "all":
      return true;
    case "basico":
      return c.level === "basico";
    case "intermedio":
      return c.level === "intermedio";
    case "avanzado":
      return c.level === "avanzado";
    case "free":
      return c.accessType === "free" || c.accessType === "freemium";
    case "paid":
      return c.accessType === "paid";
    default:
      return true;
  }
}

export function CursosClient({ courses }: { courses: FilterableCourse[] }) {
  const [active, setActive] = useState<FilterValue>("all");

  const visible = useMemo(
    () => courses.filter((c) => matchesFilter(c, active)),
    [courses, active],
  );

  return (
    <div>
      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-8">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setActive(f.value)}
              className={
                "px-4 py-2 rounded-full text-sm font-semibold transition " +
                (isActive
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-white text-ink-soft border border-brand-100 hover:border-brand-300")
              }
              aria-pressed={isActive}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <p className="py-16 text-center text-ink-muted">
          No hay cursos que coincidan con este filtro.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <div key={c.id} className="relative">
              <CourseCard course={c} />
              {c.accessType === "freemium" ? (
                <div className="absolute top-3 right-3 z-10">
                  <Badge tone="info">Gratis + Premium</Badge>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
