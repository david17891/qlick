/**
 * Filtrado client-side (en el server component) de confirmaciones de
 * un evento para el panel admin `/admin/eventos/[id]`.
 *
 * Función pura — sin I/O, sin Supabase, sin React. Se importa desde
 * `src/app/admin/eventos/[id]/page.tsx` y se testea desde
 * `tests/confirmation-filter.test.mjs`.
 *
 * Filtros soportados (ambos via query string `?q=...&source=...`):
 * - `q`: case-insensitive, busca como substring en name/email/phoneRaw/phoneNormalized.
 *   Trim de whitespace antes de comparar. Vacío o solo-whitespace = no filtra.
 * - `source`: debe ser uno de `EventConfirmationSource`. Valores inválidos
 *   se tratan como "todas" (no rompen la query, no exponen empty state raro).
 *
 * @server
 */

import type { EventConfirmation, EventConfirmationSource } from "@/types/events";

/** Fuentes válidas de confirmación (espejo del tipo del dominio). */
export const CONFIRMATION_SOURCES: readonly EventConfirmationSource[] = [
  "imported_excel",
  "public_form",
  "manual",
] as const;

export interface FilterConfirmationsInput {
  confirmations: EventConfirmation[];
  /** Texto de búsqueda (`?q=`). Raw, sin trim. */
  query?: string;
  /** Fuente a filtrar (`?source=`). Valores inválidos se ignoran. */
  source?: string;
}

export interface FilterConfirmationsResult {
  filtered: EventConfirmation[];
  /** True si hay algún filtro activo (query no-vacía o source válido). */
  isFiltered: boolean;
}

/**
 * Resuelve un valor de source string a `EventConfirmationSource` o `""`.
 * Si llega un valor fuera del enum (ej. "xyz"), devuelve "" (= sin filtro).
 */
export function resolveConfirmationSource(
  raw: string | undefined,
): EventConfirmationSource | "" {
  if (!raw) return "";
  return (CONFIRMATION_SOURCES as readonly string[]).includes(raw)
    ? (raw as EventConfirmationSource)
    : "";
}

export function filterConfirmations({
  confirmations,
  query,
  source,
}: FilterConfirmationsInput): FilterConfirmationsResult {
  const normalizedSource = resolveConfirmationSource(source);
  const normalizedQ = (query ?? "").trim().toLowerCase();
  const isFiltered = normalizedQ.length > 0 || normalizedSource !== "";

  if (!isFiltered) {
    return { filtered: confirmations, isFiltered: false };
  }

  const filtered = confirmations.filter((c) => {
    if (normalizedSource && c.source !== normalizedSource) return false;
    if (normalizedQ) {
      const haystack = [c.name, c.email, c.phoneRaw, c.phoneNormalized]
        .filter((v): v is string => Boolean(v))
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(normalizedQ)) return false;
    }
    return true;
  });

  return { filtered, isFiltered: true };
}