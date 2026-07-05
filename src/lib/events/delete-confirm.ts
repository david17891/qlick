/**
 * Validación de la confirmación de borrado de evento con fricción alta.
 *
 * El admin debe escribir las **primeras 3 letras** del título del evento
 * (o el título completo si tiene menos de 3 caracteres) en un input. Esto
 * baja la probabilidad de borrado accidental sin tener que escribir el
 * título entero.
 *
 * Comparación case-insensitive y trim'eada — el admin puede tipear con
 * mayúsculas, espacios alrededor, etc. La idea es "demostrar atención",
 * no memorizar el slug exacto.
 *
 * Reglas:
 * - Título ≥ 3 letras: requiere que el input tenga ≥ 3 letras y sea prefijo.
 * - Título < 3 letras (caso edge): requiere el título completo.
 *
 * @example
 *   canDeleteEventWith("Hola Mundo", "hol")   // → true  (3 letras + prefijo)
 *   canDeleteEventWith("Hola Mundo", "ho")    // → false (solo 2 letras)
 *   canDeleteEventWith("AB", "ab")            // → true  (título corto → completo)
 *   canDeleteEventWith("AB", "a")             // → false (título corto, falta letra)
 *   canDeleteEventWith("  Hola  ", "hol")     // → true  (trim)
 *   canDeleteEventWith("Año Nuevo 2026", "año") // → true  (3 letras + prefijo)
 */
export function canDeleteEventWith(eventTitle: string, input: string): boolean {
  const title = eventTitle.trim().toLowerCase();
  const typed = input.trim().toLowerCase();
  if (!title || !typed) return false;
  // Título de menos de 3 letras (edge case): requiere el título completo.
  if (title.length < 3) {
    return typed === title;
  }
  // Título normal: requiere al menos 3 letras tipeadas y que sea prefijo.
  return typed.length >= 3 && title.startsWith(typed);
}

/**
 * Placeholder que se muestra en el input: las primeras 3 letras (o el
 * título completo si tiene menos) seguidas de "…". Sirve como pista
 * visual sin spoilear todo el título.
 *
 * @example
 *   deleteEventInputPlaceholder("Hola Mundo") // → "hol…"
 *   deleteEventInputPlaceholder("AB")          // → "AB…"
 *   deleteEventInputPlaceholder("")            // → ""  (sin pista)
 */
export function deleteEventInputPlaceholder(eventTitle: string): string {
  if (!eventTitle) return "";
  const trimmed = eventTitle.trim();
  if (!trimmed) return "";
  const slice = trimmed.slice(0, Math.min(3, trimmed.length)).toLowerCase();
  return slice + "…";
}
