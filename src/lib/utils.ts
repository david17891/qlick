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

/**
 * URL base pública de la app (sin trailing slash).
 *
 * Usada para construir links absolutos (QR check-in, email CTAs, etc.).
 * Prioridad: `NEXT_PUBLIC_APP_URL` env > fallback a qlick.digital.
 *
 * Server-only seguro: el fallback es prod-correcto. En dev local con
 * `npm run dev` la env se setea a `http://localhost:3000`.
 *
 * FIX 2026-07-17 (sprint event-payments, David "el qr de confirmacion
 * llego asi" — broken image en el email): el fallback era
 * "https://qlick.mx", dominio que NO existe. Como `NEXT_PUBLIC_APP_URL`
 * estaba vacio en Vercel production, el email del QR se generaba con
 * un `src` apuntando a `qlick.mx` que no resuelve, y los clientes de
 * email (Gmail, Apple Mail, etc) NO siguen redirects cross-domain por
 * defecto → la imagen del QR se rompe (broken image icon, alt text
 * visible). Cambio el fallback al dominio real `qlick.digital` como
 * defense-in-depth. Tambien se setea `NEXT_PUBLIC_APP_URL` en Vercel
 * para que el build lea el valor canonico.
 */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://qlick.digital";
}

/**
 * Formatea una fecha ISO a formato legible en español.
 *
 * **Importante:** se fuerza `timeZone: 'UTC'` para evitar mismatches
 * de hidratación entre server (Node en UTC por defecto en Vercel) y
 * client (timezone del browser). Sin esto, fechas cerca de medianoche
 * UTC se renderizan distinto en server vs client → React error #425.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

/**
 * Formatea una fecha ISO a fecha + hora legible en español MX.
 *
 * Mismo timezone fix que formatDate: fuerza `UTC` para evitar mismatches
 * de hidratación server/client. Usado en timelines, fechas de pedidos,
 * fechas de admin (creado/editado/agendado).
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
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

/**
 * Elimina caracteres Unicode invisibles de un string.
 *
 * Cubre los 5 chars que se usan típicamente para smuggling de texto
 * invisible en campos visibles (nombres, comentarios, etc.):
 *   - `\u200B` ZERO WIDTH SPACE (ZWSP)
 *   - `\u200C` ZERO WIDTH NON-JOINER (ZWNJ)
 *   - `\u200D` ZERO WIDTH JOINER (ZWJ)
 *   - `\uFEFF` BYTE ORDER MARK / ZERO WIDTH NO-BREAK SPACE (BOM)
 *   - `\u2060` WORD JOINER
 *
 * Caso de uso (Sprint v0.10 Bloque 1, audit PR #10 sección 7.2):
 * `createSyntheticLead({ name: "Robert\u200B\u200BSmith" })` persistía
 * el ZWSP literal en Supabase. Aunque React lo renderiza como no-op y
 * el LLM no se confunde, es data hygiene sucio y abre la puerta a
 * bypasses de validación (`"John Doe"` con ZWSP pasa check de "2+ words").
 *
 * Uso:
 *   - Limpiar `contactName` entrante antes de persistir o pasar al LLM.
 *   - Limpiar `name` en `createSyntheticLead` antes de INSERT.
 *
 * @param text String a sanitizar. Si es null/undefined, devuelve "".
 * @returns Mismo string sin los chars invisibles listados arriba.
 */
export function stripInvisibleChars(text: string | null | undefined): string {
  if (!text) return "";
  // Regex con character class que cubre los 5 invisibles.
  // Equivalente a /[\u200B\u200C\u200D\uFEFF\u2060]/g pero escrito con
  // \uXXXX escapes para que sea legible al hacer grep/audit.
  return text.replace(
    /[\u200B\u200C\u200D\uFEFF\u2060]/g,
    ""
  );
}
