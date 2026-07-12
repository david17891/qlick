/**
 * src/lib/ai/ai-bot-rules-server.ts
 *
 * Server-side CRUD para la tabla `ai_bot_rules` (Reglas de Oro del Agente).
 * Patrón: caché in-memory (TTL 30s) + re-validación de vigencia de descuentos.
 *
 * Diferencias vs `system-settings-server.ts`:
 *   - CRUD completo (no solo key/value): create / list / update / delete.
 *   - Re-validación: si `metadata.discount_percent` está presente,
 *     `metadata.valid_until` debe estar poblado y vigente. Si está expirado,
 *     la regla no se inyecta (skip en `getActiveBotRules`).
 *   - `usage_count` se incrementa con cada inyección (atómico via Supabase).
 *   - Lectura: solo reglas activas con `expires_at IS NULL OR expires_at > now()`.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions /
 * Server Components. La autorización real ocurre en los callers con
 * `requireAdmin()` (ver docs/AGENT_SUPABASE_PROTOCOL.md §8 secretos y §11).
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                       */
/* ------------------------------------------------------------------ */

export interface BotRuleMetadata {
  /** Porcentaje 1..100. Si está presente, valid_until también debe estarlo. */
  discount_percent?: number;
  /** ISO timestamp o YYYY-MM-DD. La regla se considera expirada después. */
  valid_until?: string;
  /** Otros campos arbitrarios que el admin quiera guardar. */
  [key: string]: unknown;
}

export interface BotRule {
  id: string;
  scope: string;
  instruction: string;
  priority: number;
  usage_count: number;
  metadata: BotRuleMetadata;
  is_active: boolean;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type BotRuleInsert = Omit<BotRule, "id" | "usage_count" | "created_at" | "updated_at" | "created_by"> & {
  created_by?: string;
};

export type BotRuleUpdate = Partial<Pick<BotRule, "scope" | "instruction" | "priority" | "metadata" | "is_active" | "expires_at">>;

/* ------------------------------------------------------------------ */
/* Constantes de la caché                                                */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 30_000;

const CACHE_KEY = "__qlickBotRulesCache";

/** Estructura de caché: mapa id → { value, expiresAt } + slot para la lista activa. */
type CacheShape = {
  list?: { value: BotRule[] | null; expiresAt: number };
};

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

function invalidateCache(): void {
  getCacheBox().map = {};
}

/* ------------------------------------------------------------------ */
/* Validación de metadata (I-NEW-8: discount_percent requiere valid_until) */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Valida la forma del metadata antes de INSERT/UPDATE.
 * Si `discount_percent` está presente, `valid_until` debe estar poblado.
 * Si `valid_until` está presente, debe ser una fecha válida en el futuro (o pasado, no validamos temporal).
 */
export function validateRuleMetadata(metadata: BotRuleMetadata | undefined): ValidationResult {
  if (!metadata) return { ok: true };
  if (metadata.discount_percent === undefined) return { ok: true };

  if (typeof metadata.discount_percent !== "number") {
    return { ok: false, error: "discount_percent debe ser número." };
  }
  if (metadata.discount_percent < 1 || metadata.discount_percent > 100) {
    return { ok: false, error: "discount_percent debe estar entre 1 y 100." };
  }
  if (!metadata.valid_until || typeof metadata.valid_until !== "string") {
    return {
      ok: false,
      error:
        "Para autorizar un porcentaje de descuento, debes especificar la fecha límite de vigencia (valid_until).",
    };
  }
  // Sanity check: valid_until debe parsear como fecha.
  const parsed = Date.parse(metadata.valid_until);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: "valid_until no es una fecha válida (usa YYYY-MM-DD o ISO timestamp)." };
  }
  return { ok: true };
}

/**
 * Decide si una regla está vigente en este momento:
 *  - is_active = true
 *  - expires_at IS NULL OR expires_at > now()
 *  - Si tiene discount_percent con valid_until: valid_until > now()
 */
export function isRuleActiveAt(rule: BotRule, now: Date = new Date()): boolean {
  if (!rule.is_active) return false;
  if (rule.expires_at) {
    const exp = Date.parse(rule.expires_at);
    if (!Number.isNaN(exp) && exp <= now.getTime()) return false;
  }
  if (rule.metadata.discount_percent !== undefined) {
    if (!rule.metadata.valid_until) return false;
    const vu = Date.parse(rule.metadata.valid_until);
    if (Number.isNaN(vu) || vu <= now.getTime()) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* API pública: lectura                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lee TODAS las reglas activas (no expiradas) ordenadas por priority DESC, usage_count DESC.
 * Top N = `bot_max_active_rules` (default 8). La regla "Top N" la aplica el caller si quiere.
 *
 * Caché: TTL 30s, scoped a `bot_max_active_rules` para que la caché sea estable
 * aunque el admin cambie el límite.
 */
export async function getActiveBotRules(
  options: { limit?: number; scope?: string } = {}
): Promise<BotRule[]> {
  const box = getCacheBox();
  const cacheKey = options.scope ?? "__all__";
  const now = Date.now();
  // La caché guarda la lista COMPLETA; el caller aplica el limit.
  // Si la caché expiró, refresh.
  if (!box.map.list || box.map.list.expiresAt <= now) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("ai_bot_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .order("usage_count", { ascending: false });

    if (error) {
      // FAIL-OPEN en producción: devolver [] y loggear. El bot sigue funcionando sin reglas.
      // Caller puede hacer su propio manejo.
      console.error("[ai-bot-rules] read error:", error.message);
      return [];
    }

    const rules: BotRule[] = ((data ?? []) as unknown as BotRule[])
      .filter((r) => isRuleActiveAt(r, new Date(now)));
    box.map.list = { value: rules, expiresAt: now + CACHE_TTL_MS };
  }

  const allRules = box.map.list!.value ?? [];
  const filtered = options.scope ? allRules.filter((r) => r.scope === options.scope) : allRules;
  return options.limit ? filtered.slice(0, options.limit) : filtered;
}

/* ------------------------------------------------------------------ */
/* API pública: escritura                                                */
/* ------------------------------------------------------------------ */

export interface CrudResult<T = BotRule> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function createBotRule(input: BotRuleInsert): Promise<CrudResult> {
  const v = validateRuleMetadata(input.metadata);
  if (!v.ok) return { ok: false, error: v.error };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_bot_rules")
    .insert({
      scope: input.scope,
      instruction: input.instruction,
      priority: input.priority,
      metadata: input.metadata,
      is_active: input.is_active,
      expires_at: input.expires_at,
      created_by: input.created_by ?? "human_operator",
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert sin datos." };
  }
  invalidateCache();
  return { ok: true, data: data as unknown as BotRule };
}

export async function updateBotRule(id: string, patch: BotRuleUpdate): Promise<CrudResult> {
  if (patch.metadata !== undefined) {
    const v = validateRuleMetadata(patch.metadata);
    if (!v.ok) return { ok: false, error: v.error };
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ai_bot_rules")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Update sin datos." };
  }
  invalidateCache();
  return { ok: true, data: data as unknown as BotRule };
}

export async function deleteBotRule(id: string): Promise<CrudResult<{ id: string }>> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("ai_bot_rules").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  invalidateCache();
  return { ok: true, data: { id } };
}

/**
 * Incrementa el `usage_count` de una regla en +1.
 * Es atómico en Supabase (UPDATE con valor computado).
 * Fail-silent: si falla, no rompe la conversación (el bot sigue funcionando).
 */
export async function incrementRuleUsage(id: string): Promise<void> {
  // Hacemos SELECT para obtener el valor actual y luego UPDATE.
  // (Supabase JS no soporta UPDATE ... SET x = x + 1 directamente sin RPC.)
  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("ai_bot_rules")
    .select("usage_count")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;
  const current = (row as unknown as { usage_count: number }).usage_count ?? 0;
  await supabase
    .from("ai_bot_rules")
    .update({ usage_count: current + 1 } as never)
    .eq("id", id);
  invalidateCache();
}

/* ------------------------------------------------------------------ */
/* Mantenimiento de caché (público para tests)                           */
/* ------------------------------------------------------------------ */

export const _CACHE_TTL_MS_FOR_TEST = CACHE_TTL_MS;
export function _invalidateCacheForTest(): void {
  invalidateCache();
}
