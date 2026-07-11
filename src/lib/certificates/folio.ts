/**
 * Generador de folios para certificados de asistencia.
 *
 * Formato: QLK-YYYY-XXXXX
 * - YYYY = anio actual (4 digitos).
 * - XXXXX = 5 digitos random cryptographicamente seguros (0-9).
 *
 * El regex enforced es: ^QLK-[0-9]{4}-[0-9]{5}$
 *
 * El caller (issue-certificate.ts) debe validar uniqueness en la tabla
 * `event_certificates` antes de aceptar el folio. Si hay colision, vuelve
 * a llamar `generateFolio()` hasta encontrar uno libre.
 *
 * Nota: el numero random NO es enumerable ni predecible. Para eventos
 * pequenos (~50 attendees/evento) las colisiones son ~0 porque la DB
 * filtra antes de aceptar.
 */

import { randomInt } from "node:crypto";

export const FOLIO_REGEX = /^QLK-\d{4}-\d{5}$/;

export function isValidFolio(value: string): boolean {
  return FOLIO_REGEX.test(value);
}

export function generateFolio(now: Date = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const num = randomInt(0, 100_000).toString().padStart(5, "0");
  return `QLK-${year}-${num}`;
}

/**
 * Normaliza un folio a MAYUSCULAS sin espacios.
 * Usado al aceptar entradas del admin o de la URL.
 */
export function normalizeFolio(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
