/**
 * Generador de `events.short_code` — 4 chars base32 sin 0/1/O/I.
 *
 * REGLAS INVARIANTES (paridad estricta con `generate_event_short_code()`
 * del PL/pgSQL trigger — `supabase/migrations/20260705120000_events_short_code.sql`):
 *
 * - 4 caracteres exactos.
 * - Alfabeto: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (32 chars, sin 0/1/O/I).
 * - Match: regex `^[A-HJ-NP-Z2-9]{4}$`.
 *
 * Total de combinaciones: 32^4 = 1,048,576. Colisión natural (Birthday)
 * ~50% a ~37k eventos. En la escala de Qlick (decenas/año) es ~1 cada
 * ~700 eventos — el retry en loop lo absorbe silenciosamente.
 *
 * Usos:
 *
 * - `createEvent()` server lib: lo pasa al INSERT. La DB lo valida con
 *   UNIQUE; si choca, nuestro retry (acá en TS) genera otro. Si TS no
 *   retry-ea (server crash entre generar e insert), el PL/pgSQL trigger
 *   backapea.
 *
 * - Trigger PL/pgSQL: server-side para cualquier ruta que inserta
 *   eventos — UI admin, REST, SQL crudo. Defense in depth.
 *
 * - Tests: `tests/short-code.test.mjs` valida la unicidad bajo carga
 *   (10k generaciones sin colisión en la práctica) y el matching con
 *   el alfabeto del trigger PL/pgSQL.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars
const LENGTH = 4;
const REGEX = /^[A-HJ-NP-Z2-9]{4}$/;

/** Genera un short_code aleatorio (4 chars). NO garantiza unicidad. */
export function generateShortCode(): string {
  // crypto.getRandomValues para distribucion pareja (no Math.random).
  const buf = new Uint32Array(LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    // Fallback para runtime sin crypto (e.g. tests viejos con node < 19).
    for (let i = 0; i < LENGTH; i++) buf[i] = Math.floor(Math.random() * 2 ** 32);
  }
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    // 32^4 wraparound via modulo. Sesgo es < 1 bit en 4 chars — aceptable.
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

/** Valida que un string cumpla el formato del short_code. */
export function isValidShortCode(code: string | null | undefined): code is string {
  return typeof code === "string" && REGEX.test(code);
}

/**
 * Genera un short_code único contra el alfabeto `existing` provisto.
 * Retries hasta `maxTries` veces. Si no logra, devuelve null (caso
 * patológico — el caller debe loggear y abortar la operación).
 *
 * @param existing Set de short_codes YA usados en la DB (case-sensitive,
 *                 mayúsculas). Vacío si no hay nada que chequear.
 * @param maxTries Cap de intentos. Default 50.
 */
export function generateUniqueShortCode(
  existing: ReadonlySet<string>,
  maxTries = 50,
): string | null {
  for (let i = 0; i < maxTries; i++) {
    const candidate = generateShortCode();
    if (!existing.has(candidate)) return candidate;
  }
  return null;
}
