/**
 * Utilidades puras de CSV (sin dependencias de Supabase u otros módulos).
 *
 * Por qué existe este archivo separado:
 *   - El módulo `leads-csv-export.ts` usa `@/lib/supabase/admin` que no se
 *     puede resolver con `node --experimental-strip-types` en tests.
 *   - `csvEscape` es función pura testeable sin DB ni mocks.
 *   - Separando la lógica pura, podemos testearla directo desde `.test.mjs`.
 *
 * Si en el futuro se necesita otra función CSV pura (parse, header builder),
 * agregarla acá.
 */

/**
 * Escapa una celda CSV: si contiene `,`, `"`, `\n` o `\r`, la envuelve
 * en comillas dobles y escapa las comillas internas duplicándolas.
 *
 * Sin escape, una celda `Martínez, Juan` rompe el CSV en Excel.
 *
 * Caracteres UTF-8 (tildes, eñes) NO requieren escape — Excel los lee
 * correctamente si el archivo tiene BOM UTF-8 al inicio.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Construye la línea de headers de un CSV. Toma un array de strings y los
 * une con coma, con terminador `\r\n` (estándar RFC 4180).
 */
export function csvHeaderLine(headers: readonly string[]): string {
  return headers.map(csvEscape).join(",") + "\r\n";
}

/**
 * Construye una línea CSV a partir de un array de celdas (en orden de
 * las columnas) y los headers. Aplica `csvEscape` a cada celda.
 */
export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvEscape).join(",") + "\r\n";
}