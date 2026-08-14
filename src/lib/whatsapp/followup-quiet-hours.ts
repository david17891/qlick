/** Ventana local para mensajes proactivos del cron (no respuestas entrantes). */

export const FOLLOWUP_TIME_ZONE = "America/Phoenix";
export const FOLLOWUP_START_HOUR = 9;
export const FOLLOWUP_END_HOUR = 19;

export interface ProactiveContactWindowOptions {
  timeZone?: string;
  startHour?: number;
  endHour?: number;
}

function localHour(date: Date, timeZone: string): number | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isInteger(hour) ? hour : null;
}

/** Bloquea mensajes proactivos entre 19:00 y 09:00 hora Phoenix. */
export function isWithinProactiveContactWindow(
  date: Date,
  options: ProactiveContactWindowOptions = {},
): boolean {
  const timeZone = options.timeZone ?? FOLLOWUP_TIME_ZONE;
  const startHour = options.startHour ?? FOLLOWUP_START_HOUR;
  const endHour = options.endHour ?? FOLLOWUP_END_HOUR;
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 0 ||
    endHour > 24 ||
    startHour >= endHour
  ) {
    return false;
  }
  const hour = localHour(date, timeZone);
  return hour !== null && hour >= startHour && hour < endHour;
}
