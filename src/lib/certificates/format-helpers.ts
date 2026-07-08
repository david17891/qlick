/**
 * Helpers de formato compartidos entre `issue-certificate.ts` y `cert/[folio]/page.tsx`.
 *
 * Mantener estas funciones centralizadas evita drift entre la versión que se
 * escribe al cert en la DB (`metadata.issueAtLocal`, etc.) y la versión que se
 * renderiza al abrirlo en `/cert/[folio]` para imprimir.
 */

/**
 * Fecha larga es-MX, zona America/Phoenix (mismo timezone que el placeholder
 * HTML original FIX 2026-07-07).
 *
 *   formatDateLong("2026-07-11T18:00:00+00:00")
 *   -> "11 de julio de 2026"
 */
export function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Phoenix",
    });
  } catch {
    return iso;
  }
}

/**
 * Hora 24h es-MX, zona America/Phoenix.
 *
 *   formatTime("2026-07-11T18:00:00+00:00")
 *   -> "11:00"  // Phoenix es UTC-7, sin DST en Arizona
 */
export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Phoenix",
    });
  } catch {
    return "";
  }
}

/**
 * Duración human-readable en español. Si no hay `ends_at`, cae a "90 minutos".
 *
 *   formatDuration("2026-07-11T18:00:00+00:00", "2026-07-11T21:00:00+00:00")
 *   -> "3 horas"
 */
export function formatDuration(
  startsIso: string,
  endsIso: string | null,
): string {
  if (!endsIso) return "90 minutos";
  const ms = new Date(endsIso).getTime() - new Date(startsIso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
}

/**
 * HTML-escape básico. Uso server-side solo (vía dangerouslySetInnerHTML no lo
 * usamos — renderizamos via React JSX que ya escapa automaticamente).
 * Mantenemos esta función por consistencia con el placeholder anterior.
 */
export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
