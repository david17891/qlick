/**
 * Phone normalization utilities for the CRM.
 *
 * Los teléfonos en México vienen en formatos variados:
 *   - "33 1234 5678"
 *   - "+52 33 1234 5678"
 *   - "521551234567"     (52 + 1 + 10 dígitos, formato viejo de celular)
 *   - "(33) 1234-5678"
 *   - "+52 (33) 1234-5678"
 *
 * `normalizePhone()` reduce todos estos a `+52XXXXXXXXXX` (formato E.164
 * con código de país 52). Si el número es inválido o no se puede parsear,
 * devuelve `null` y el caller decide qué hacer (log, marcar como
 * pendiente de revisión manual, etc.).
 *
 * Pure functions, no I/O, fáciles de testear.
 */

/**
 * Normaliza un teléfono mexicano a formato E.164 (+52XXXXXXXXXX).
 *
 * Acepta:
 *   - 10 dígitos:          "3312345678"   → "+523312345678"
 *   - 11 dígitos con 1:    "13312345678"  → "+523312345678" (algunos carriers)
 *   - 12 dígitos con 52:   "523312345678" → "+523312345678"
 *   - 13 dígitos con 521:  "5213312345678"→ "+523312345678" (legacy mobile)
 *   - Con o sin prefijo +  explícito
 *   - Con separadores: espacios, guiones, paréntesis
 *
 * Devuelve `null` si el input es vacío o no matchea ningún formato válido.
 *
 * IMPORTANTE: solo normaliza números de México (+52). Números de otros
 * países quedan como `null` — el caller debe decidir si los acepta o no.
 */
export function normalizePhone(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  // Strip everything except digits and the leading +.
  // Manejamos el + solo si está al principio.
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  // Quitamos todo lo que no sea dígito. Si había + al inicio, lo agregamos después.
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let normalized: string | null = null;

  if (hasPlus) {
    // +52XXXXXXXXXX (12 dígitos) o +521XXXXXXXXXX (13, legacy 1-prefix)
    if (digits.length === 12 && digits.startsWith("52")) {
      normalized = `+${digits}`;
    } else if (digits.length === 13 && digits.startsWith("521")) {
      normalized = `+52${digits.slice(3)}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      // +1XXXXXXXXXX (formato US/Canada con 1) → NO es MX, devolvemos null
      normalized = null;
    }
  } else {
    // Sin +. Asumimos que es MX.
    if (digits.length === 10) {
      normalized = `+52${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      // 1XXXXXXXXXX (algunos carriers MX con 1-prefix)
      normalized = `+52${digits.slice(1)}`;
    } else if (digits.length === 12 && digits.startsWith("52")) {
      // 52XXXXXXXXXX (ya con código de país)
      normalized = `+52${digits.slice(2)}`;
    } else if (digits.length === 13 && digits.startsWith("521")) {
      // 521XXXXXXXXXX (legacy mobile con 1-prefix y country code)
      normalized = `+52${digits.slice(3)}`;
    }
  }

  return normalized;
}

/**
 * Compara dos teléfonos de forma fuzzy: los normaliza primero y luego
 * compara. Devuelve `true` si son el mismo número en distintos formatos.
 *
 * Si ambos son null/undefined, devuelve `true` (consistente con SQL NULL
 * semantics para columnas opcionales).
 * Si uno es null y el otro no, devuelve `false`.
 * Si alguno es inválido, devuelve `false`.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na === null || nb === null) return false;
  return na === nb;
}

/**
 * Helper de validación: ¿es un teléfono MX válido? `true` si se puede
 * normalizar, `false` si no.
 */
export function isValidMxPhone(
  raw: string | null | undefined,
): boolean {
  return normalizePhone(raw) !== null;
}
