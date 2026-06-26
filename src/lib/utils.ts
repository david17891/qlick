/** Utilidades generales (formato, clases, etc.). */

/** Concatena clases condicionalmente (clsx minimalista). */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ");
}

/** Formatea un número como moneda mexicana. */
export function formatMXN(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/** Formatea minutos como "X h Y min" o "Y min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Convierte un título a slug URL-safe.
 *
 * - toLowerCase
 * - NFD + strip de diacríticos ("é" → "e", "ñ" → "n")
 * - Solo [a-z0-9] y guiones
 * - Trim de guiones al inicio/fin
 *
 * Usado para que los slugs de las lecciones del LMS coincidan con los
 * hardcodeados en `src/lib/data/courses.ts` (mock legacy), así
 * `findLesson()` puede matchear por slug.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Formatea una fecha ISO a formato legible en español. */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

/** Devuelve iniciales (para avatares). */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}
