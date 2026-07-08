/**
 * Helper de bypass DEV para el funnel de WhatsApp/registro.
 *
 * Permite que contactos específicos (típicamente David durante pruebas
 * E2E del bot) salten los checks de "ya estás registrado" y puedan
 * re-correr el funnel completo desde el primer mensaje, sin contaminar
 * la protección anti-duplicados para el resto de los leads.
 *
 * Configuración vía env vars (CSV, case-insensitive, normalizado):
 *
 *   DEV_BYPASS_PHONES="+5216532935492,+5215555555555"
 *   DEV_BYPASS_EMAILS="david17891@gmail.com,qa@qlick.app"
 *
 * - Si las env vars NO están seteadas, el helper retorna `false` para
 *   todos los casos. Default seguro: cero bypass.
 * - Solo aplica a producción si las env vars están pobladas allí.
 *   Recomendación: setear solo en local + Vercel preview.
 *
 * Para que David pueda probar el flujo completo del bot desde su
 * teléfono real, sin necesidad de borrar el lead cada vez.
 *
 * Uso:
 *
 *   import { isInDevBypass } from "@/lib/dev/bypass-list";
 *
 *   if (existing && !isInDevBypass({ phone: phoneNormalized, email: lead.email })) {
 *     // manda "ya estás registrado"
 *   } else if (existing) {
 *     console.log("[dev/bypass] salto 'ya registrado' para contacto de QA");
 *     // sigue el flow de provide_email → genera QR nuevo
 *   }
 */

import { normalizePhone } from "@/lib/crm/phone-utils";

function parseCsv(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

let _phonesCache: Set<string> | null = null;
let _emailsCache: Set<string> | null = null;

function getPhoneSet(): Set<string> {
  if (_phonesCache) return _phonesCache;
  _phonesCache = parseCsv(process.env.DEV_BYPASS_PHONES);
  return _phonesCache;
}

function getEmailSet(): Set<string> {
  if (_emailsCache) return _emailsCache;
  _emailsCache = parseCsv(process.env.DEV_BYPASS_EMAILS);
  return _emailsCache;
}

/**
 * Invalida el cache (útil para tests que setean env vars en runtime).
 */
export function clearDevBypassCache(): void {
  _phonesCache = null;
  _emailsCache = null;
}

export interface DevBypassInput {
  phone?: string | null;
  email?: string | null;
}

/**
 * `true` si el contacto está en DEV_BYPASS_PHONES o DEV_BYPASS_EMAILS.
 * Comparación case-insensitive; phone se normaliza con `normalizePhone`
 * (mismo formato que el bot usa para buscar leads).
 */
export function isInDevBypass(input: DevBypassInput): boolean {
  const phoneSet = getPhoneSet();
  const emailSet = getEmailSet();
  if (phoneSet.size === 0 && emailSet.size === 0) return false;

  if (input.phone) {
    let normalized: string | null = null;
    try {
      normalized = normalizePhone(input.phone);
    } catch {
      normalized = null;
    }
    if (normalized && phoneSet.has(normalized.toLowerCase())) return true;
    // Match "raw" como fallback (ej. "5216532935492" sin +) por si el
    // seteo de la env var viene en otro formato.
    if (phoneSet.has(input.phone.trim().toLowerCase())) return true;
  }

  if (input.email) {
    if (emailSet.has(input.email.trim().toLowerCase())) return true;
  }

  return false;
}