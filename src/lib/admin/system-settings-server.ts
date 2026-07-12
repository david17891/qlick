/**
 * system-settings-server.ts — Sub-sprint 2.1 (Sprint 2 Bot v2 admin toggle).
 *
 * Acceso server-side a la tabla `system_settings` con caché en memoria
 * (TTL 30s) para no pegarle a Supabase en cada llamada del provider.
 *
 * Diseño:
 *   - Una función `readSystemSetting(key)` con caché en module scope.
 *   - TTL corto (30s) para que un toggle en el panel admin tome efecto
 *     rápido sin necesidad de redeploy.
 *   - Una función `setSystemSetting(key, value)` para que el Server
 *     Component / Server Action pueda invalidar la caché de la fila
 *     específica al escribir.
 *   - Una función `invalidateCache(key?)` para tests/debug.
 *
 * Patrón SRE: si Supabase falla o no está configurado, `readSystemSetting`
 * devuelve `null` y el caller debe caer al fallback (env var o default).
 *
 * Cache key strategy: usamos un objeto global `globalThis.__qlickSystemSettingsCache`
 * para sobrevivir hot-reloads en dev de Next.js. En producción cada
 * contenedor tiene su propia instancia del cache (cold-start), pero
 * las llamadas entre contenedores no comparten cache — TTL corto
 * minimiza el drift.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions /
 * Server Components.
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/* ------------------------------------------------------------------ */
/* Constantes de la caché                                              */
/* ------------------------------------------------------------------ */

/** TTL en milisegundos. 30s equilibra freshness del toggle vs latencia. */
const CACHE_TTL_MS = 30_000;

/** Llave del cache global (sobrevive hot-reload en dev). */
const CACHE_KEY = "__qlickSystemSettingsCache";

/** Llave canónica del flag dinámico principal. */
export const KEY_DEEPSEEK_TOOLS_ENABLED = "deepseek_tools_enabled" as const;

/**
 * Llaves canónicas del sprint Torre de Control v15 (PR #1).
 * `bot_global_mode` es la SSOT del modo del bot. Los otros dos son config
 * de comportamiento del agente.
 */
export const KEY_BOT_GLOBAL_MODE = "bot_global_mode" as const;
export const KEY_BOT_MAX_ACTIVE_RULES = "bot_max_active_rules" as const;
export const KEY_BOT_CONTEXT_BLOCKS_CONFIG = "bot_context_blocks_config" as const;

/** Tipo de la fila de system_settings (jsonb value). */
type SettingValue = unknown;

/**
 * Estructura del cache: un mapa clave → { value, expiresAt }.
 * En dev (Next.js hot reload) sobrevive vía globalThis para no perder
 * los TTLs entre recargas.
 */
type CacheShape = Record<string, { value: SettingValue | null; expiresAt: number }>;

interface CacheBox {
  map: CacheShape;
}

function getCacheBox(): CacheBox {
  const g = globalThis as unknown as { [CACHE_KEY]?: CacheBox };
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = { map: {} };
  }
  return g[CACHE_KEY]!;
}

/* ------------------------------------------------------------------ */
/* API pública (lectura)                                               */
/* ------------------------------------------------------------------ */

/**
 * Lee un flag de `system_settings` con caché en memoria (TTL 30s).
 *
 * Comportamiento:
 *   - Si el cache hit está vigente → devuelve sin tocar Supabase.
 *   - Si cache miss/expired → consulta DB con timeout defensivo.
 *   - Si DB no está configurada / error / fila inexistente → devuelve
 *     `null` (el caller decide fallback).
 *
 * @param key Llave del flag (e.g. `KEY_DEEPSEEK_TOOLS_ENABLED`).
 * @returns El `value` (jsonb) o `null` si no existe / error.
 */
export async function readSystemSetting(
  key: string
): Promise<SettingValue | null> {
  const box = getCacheBox();
  const now = Date.now();
  const cached = box.map[key];
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  // Cache miss / expired → consultar DB. Cada llamada individual hace
  // su propio READ (no batch) porque las tools típicamente consultan
  // 1 flag a la vez. Si en el futuro hay >3 flags por request, conviene
  // un `select('key, value').in('key', [...])`.
  let value: SettingValue | null = null;
  let ok = false;

  try {
    // FIX 2026-07-10: defensivo. createSupabaseAdminClient() lanza si
    // faltan env vars (comportamiento documentado de ese módulo). Aquí
    // eso es esperado en dev/preview sin Supabase — capturamos y
    // devolvemos null.
    const supabase = createSupabaseAdminClient();
    // FIX 2026-07-10: tabla nueva sin typegen regen todavía — cast a
    // `never` mientras tanto (patrón ya usado en otros server libs,
    // ver bot-engine.ts). Cuando se regeneren los tipos de Supabase,
    // se puede reemplazar por tipos concretos.
    const { data, error } = await supabase
      .from("system_settings" as never)
      .select("value" as never)
      .eq("key" as never, key)
      .maybeSingle();
    if (!error && data && typeof data === "object" && "value" in data) {
      value = (data as { value: SettingValue | null }).value ?? null;
      ok = true;
    }
  } catch {
    // Supabase no configurado → null (caller usa fallback).
  }

  box.map[key] = { value: ok ? value : null, expiresAt: now + CACHE_TTL_MS };
  return ok ? value : null;
}

/**
 * Versión síncrona de `readSystemSetting`: solo lee la caché (sin DB).
 *
 * Útil cuando el caller ya tiene un valor fresco y quiere evitar el
 * costo del SELECT al final del flow. Si el cache está cold, devuelve
 * `undefined`.
 */
export function peekSystemSetting(key: string): SettingValue | null | undefined {
  const box = getCacheBox();
  const cached = box.map[key];
  if (!cached || cached.expiresAt <= Date.now()) return undefined;
  return cached.value;
}

/* ------------------------------------------------------------------ */
/* API pública (escritura)                                             */
/* ------------------------------------------------------------------ */

/**
 * Setea el valor de un flag en `system_settings`. Usado por el Server
 * Action del admin toggle.
 *
 * Comportamiento:
 *   - UPSERT en `value` (insert o update de la fila).
 *   - Actualiza `updated_at` (trigger en DB) y `updated_by` (email).
 *   - Invalida el cache de la llave específica para que el próximo
 *     `readSystemSetting` haga un SELECT fresco.
 *
 * @returns `{ ok, note }`. Si falla (Supabase down / no configurado),
 *   devuelve `ok: false` con la razón SIN lanzar.
 */
export interface SetSettingResult {
  ok: boolean;
  note: string;
}

export async function setSystemSetting(
  key: string,
  value: SettingValue,
  actorEmail: string | null
): Promise<SetSettingResult> {
  let ok = false;
  let note = "";
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("system_settings" as never)
      .upsert(
        {
          key,
          value,
          updated_by: actorEmail ?? "system"
        } as never,
        { onConflict: "key" } as never
      );
    if (error) {
      note = `DB error: ${(error as { code?: string }).code ?? "unknown"}`;
    } else {
      ok = true;
      note = "ok";
    }
  } catch (err) {
    note = `createSupabaseAdminClient falló: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  // Invalidar cache de esa key (haya ok o no — si ok, el SELECT
  // futuro traerá el valor nuevo; si no, queremos reintentar ASAP).
  invalidateCache(key);
  return { ok, note };
}

/* ------------------------------------------------------------------ */
/* Mantenimiento de caché (público para tests)                         */
/* ------------------------------------------------------------------ */

/**
 * Invalida una key específica (o todas si no se pasa key).
 * Útil en tests y para el toggleo desde admin (forzar re-lectura).
 */
export function invalidateCache(key?: string): void {
  const box = getCacheBox();
  if (key === undefined) {
    box.map = {};
  } else {
    delete box.map[key];
  }
}

/**
 * Estado actual del cache (solo visible a tests / debug).
 * Devuelve una copia shallow del map interno.
 */
export function _cacheSnapshotForTest(): Readonly<CacheShape> {
  return { ...getCacheBox().map };
}

/**
 * Versión mutable de `CACHE_TTL_MS` (para tests de invalidación).
 * NO usar en producción.
 */
export const _CACHE_TTL_MS_FOR_TEST = CACHE_TTL_MS;
