/**
 * Configuración central de Supabase.
 *
 * Único lugar que lee las variables de entorno de Supabase. El resto de los
 * clientes (`client.ts`, `server.ts`, `admin.ts`) y el health-check consumen
 * este módulo, nunca `process.env` directamente.
 *
 * Reglas (ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md):
 * - Solo `url` y `publishableKey` son públicas (NEXT_PUBLIC_*).
 * - `secretKey` es server-only y nunca se expone al navegador.
 * - Ninguna función aquí lanza si faltan variables: devuelve strings vacíos y
 *   deja que `health.ts` reporte el estado. Así el build no se rompe sin proyecto.
 * - No se imprime nunca el valor de ninguna clave (solo presencia/longitud).
 */

/** Nombre canónico de cada variable, centralizado para evitar typos. */
export const SUPABASE_ENV_KEYS = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  publishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  // Alias legacy (publishable). Se acepta como fallback si el nuevo no existe.
  publishableKeyLegacy: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  secretKey: "SUPABASE_SECRET_KEY",
  // Alias legacy (secret). Se acepta como fallback.
  secretKeyLegacy: "SUPABASE_SERVICE_ROLE_KEY",
  projectRef: "SUPABASE_PROJECT_REF",
  appUrl: "NEXT_PUBLIC_APP_URL",
} as const;

/** Lectura segura de una env var (siempre string, nunca undefined). */
function readEnv(key: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  const raw = process.env[key];
  return raw == null ? "" : String(raw).trim();
}

/**
 * `publishableKey` con fallback al alias legacy.
 * Resuelve el nuevo nombre estándar y, si está vacío, prueba el legacy.
 */
function resolvePublishableKey(): string {
  const modern = readEnv(SUPABASE_ENV_KEYS.publishableKey);
  if (modern) return modern;
  return readEnv(SUPABASE_ENV_KEYS.publishableKeyLegacy);
}

/**
 * `secretKey` con fallback al alias legacy.
 * Server-only: quien la consuma debe garantizar el contexto (admin.ts).
 */
function resolveSecretKey(): string {
  const modern = readEnv(SUPABASE_ENV_KEYS.secretKey);
  if (modern) return modern;
  return readEnv(SUPABASE_ENV_KEYS.secretKeyLegacy);
}

export const supabaseConfig = {
  url: readEnv(SUPABASE_ENV_KEYS.url),
  publishableKey: resolvePublishableKey(),
  secretKey: resolveSecretKey(),
  projectRef: readEnv(SUPABASE_ENV_KEYS.projectRef),
  appUrl: readEnv(SUPABASE_ENV_KEYS.appUrl) || "http://localhost:3000",
} as const;

/** true si la URL tiene pinta de URL Supabase válida (validación de formato). */
export function isValidSupabaseUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/**
 * true si una clave tiene un formato conocido de Supabase.
 * Acepta los dos formatos vigentes:
 *   - JWT clásico: tres segmentos separados por punto (proyectos pre-2025).
 *   - Nuevo formato (2025+): prefijo `sb_publishable_…` / `sb_secret_…`.
 * No valida la firma ni el contenido: solo evita claves obviamente truncadas.
 */
export function looksLikeKey(value: string): boolean {
  if (!value) return false;
  // Formato nuevo (Supabase 2025): sb_publishable_… / sb_secret_…
  // Longitud observada ~40-50 chars; exigimos un mínimo razonable.
  if (/^sb_(publishable|secret)_[A-Za-z0-9_-]{20,}$/.test(value)) {
    return true;
  }
  // Formato JWT clásico: tres segmentos separados por punto.
  const parts = value.split(".");
  return parts.length >= 3 && parts.every((p) => p.length > 0);
}

/**
 * true si Supabase está configurado para el cliente (modo "real").
 *
 * Client-safe: SOLO inspecciona `url` y `publishableKey`, que son variables
 * `NEXT_PUBLIC_*` (designed para exponerse al navegador). NUNCA lee
 * `secretKey`: el servidor no debe depender de ella para decidir el modo del
 * UI, y el cliente no puede verla de todos modos.
 *
 * Devuelve true únicamente si AMBAS claves públicas están presentes Y tienen
 * un formato válido. Si falta alguna → modo demo (false).
 *
 * Uso típico: elegir entre "Modo real" / "Modo demo" en la UI (badge del
 * ContactForm) sin necesidad de state ni peticiones.
 */
export function isSupabaseConfigured(): boolean {
  return isValidSupabaseUrl(supabaseConfig.url) && looksLikeKey(supabaseConfig.publishableKey);
}
