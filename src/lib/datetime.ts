/**
 * Helpers de fecha/hora compartidos para la zona horaria del proyecto.
 *
 * FIX 2026-07-07 (sesión David, "bot pone 17:00 UTC cuando admin escribió 10:00"):
 * los renderers de fechas de eventos hardcodeaban `timeZone: "UTC"` y el sufijo
 * "(UTC)" en el copy. Como el admin escribe hora local en `datetime-local` y la
 * DB guarda timestamptz en UTC, formatear con UTC muestra la hora convertida a
 * UTC en vez de la hora que el admin escribió — confunde al lead.
 *
 * David decidió (2026-07-07) que por ahora todos los eventos son en zona
 * Pacífico (Tijuana / Phoenix / Mexicali), todas UTC-7 sin DST en la práctica.
 * Usamos `"America/Phoenix"` porque es la única zona IANA que NO observa DST
 * (las ciudades mexicanas usan reglas DST nacionales inconsistentes en años
 * recientes). Phoenix, AZ = UTC-7 todo el año = Mexicali todo el año. Tijuana
 * en horario de verano mexicano tiene 1h de desfase conocido — caso edge
 * aceptado.
 *
 * Si en el futuro hay eventos en CDMX, Tijuana con DST estricto, Madrid u
 * otras zonas: migrar a columna `timezone` en `events` (Opción C del plan
 * que discutimos 2026-07-07).
 *
 * @server Server-only helpers. Los usos cliente deben pasar strings ya
 * formateados desde server components o actions.
 */

/**
 * Zona horaria canónica del proyecto para fechas de eventos.
 *
 * - Phoenix, AZ (USA): UTC-7, SIN DST.
 * - Mexicali, BC (México): UTC-7, SIN DST (algunos años Mexicali siguió DST
 *   federal pero la convención operativa es fijo).
 * - Tijuana, BC (México): UTC-7/UTC-8 con DST federal — esta constante
 *   ignora DST por simplicidad. Aceptado por David 2026-07-07.
 */
export const EVENT_TIMEZONE = "America/Phoenix";

/** Etiqueta humana para mostrar al lado de la hora. */
export const EVENT_TIMEZONE_LABEL = "hora Pacífico";

/**
 * Formatea la fecha de un evento (sin hora) en la zona del proyecto.
 * Ej: "11 de julio de 2026".
 */
export function formatEventDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // toLocaleDateString devuelve "Invalid Date" sin throw cuando el input
  // no parsea. Chequeamos getTime() para fallback seguro.
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: EVENT_TIMEZONE,
    });
  } catch {
    return iso;
  }
}

/**
 * Formatea solo la hora de un evento en la zona del proyecto, formato 24h.
 * Ej: "10:00".
 *
 * FIX 2026-07-07: `hour12: false` explícito porque es-MX por defecto usa 12h
 * ("05:30 p.m."), confunde al lead. Queremos "17:30" como en el admin.
 */
export function formatEventTimeOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: EVENT_TIMEZONE,
    });
  } catch {
    return "";
  }
}

/**
 * Formatea fecha + hora de un evento en la zona del proyecto con sufijo
 * " (zona)". Ej: "11 de julio de 2026, 10:00 hrs (hora Pacífico)".
 *
 * Usado por el bot de WhatsApp en el bloque de contexto del evento.
 */
export function formatEventDateTimeWithZone(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso ?? "—";
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  // IMPORTANTE: usar Intl con timeZone fijo en vez de getDate/getHours
  // (que devuelven zona local del runtime). Esto garantiza que server
  // (Vercel UTC) y client (navegador del admin) rendericen igual.
  const parts = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: EVENT_TIMEZONE,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const monthName = months[Number(get("month")) - 1] ?? get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  return `${day} de ${monthName} de ${year}, ${hour}:${minute} hrs (${EVENT_TIMEZONE_LABEL})`;
}