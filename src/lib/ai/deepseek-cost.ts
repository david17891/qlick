/**
 * Sprint v16 — Helpers puros de cálculo de costos y matriz de pausa.
 *
 * Funciones puras exportadas para que `tests/conversations-v16.test.mjs`
 * las pueda cubrir sin tocar la DB ni el provider de DeepSeek.
 *
 * - `calculateDeepseekCostUsdCents`: costo en centavos de USD por
 *   inferencia según modelo (Flash vs Pro) y tokens consumidos.
 * - `projectMonthlyUsdCents`: proyección mensual a N días (default 30).
 * - `resolveEffectivePause`: matriz M4 de pausa (global + per-lead).
 *
 * Constantes:
 *   DEEPSEEK_FLASH_USD_PER_M_TOKENS  = 0.14 (deepseek-chat, V4-Flash)
 *   DEEPSEEK_PRO_USD_PER_M_TOKENS    = 0.55 (deepseek-reasoner, V4-Pro)
 *
 * Las tarifas se hardcodean en USD/M tokens. Documentadas en
 * https://platform.deepseek.com/api-docs/pricing (al 2026-07-11).
 * Si Meta/DeepSeek cambian tarifas, actualizar aquí.
 */

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

export const DEEPSEEK_FLASH_USD_PER_M_TOKENS = 0.14;
export const DEEPSEEK_PRO_USD_PER_M_TOKENS = 0.55;
export const PROJECTION_DAYS_DEFAULT = 30;
export const USD_CENTS_PER_USD = 100;

/* ------------------------------------------------------------------ */
/*  Cálculo de costo                                                   */
/* ------------------------------------------------------------------ */

/**
 * Calcula el costo de una inferencia DeepSeek en CENTAVOS de dólar.
 *
 * @param model       Identificador del modelo (`deepseek-chat` o
 *                    `deepseek-reasoner`). Modelo desconocido → default
 *                    a Flash (regla defensiva: la métrica no debe
 *                    romperse por un modelo nuevo).
 * @param promptTokens    Tokens de prompt (input). Entero ≥ 0.
 * @param completionTokens Tokens de completion (output). Entero ≥ 0.
 * @returns            Costo en centavos de USD (número decimal, no entero).
 *
 * @example
 *   calculateDeepseekCostUsdCents("deepseek-chat", 1_000_000, 0)
 *   // → 1.4 (1.4¢ USD = 1M tokens Flash = $0.014)
 */
export function calculateDeepseekCostUsdCents(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const safePrompt = Math.max(0, Math.floor(promptTokens));
  const safeCompletion = Math.max(0, Math.floor(completionTokens));
  const total = safePrompt + safeCompletion;
  const pricePerMTokens = resolveModelPricePerMTokens(model);
  // USD = (tokens / 1_000_000) * pricePerMTokens
  // Cents = USD * 100
  // FIX 2026-07-12: redondeo a 6 decimales para evitar floating-point
  // weirdness (1_000_000 * 0.14 * 100 = 14.000000000000002). Con 6
  // decimales, la cifra es estable para tests y para la UI.
  const cents = (total / 1_000_000) * pricePerMTokens * USD_CENTS_PER_USD;
  return Math.round(cents * 1_000_000) / 1_000_000;
}

/**
 * Proyecta el costo diario a N días (default 30). Útil para mostrar
 * la cifra "Proyección mensual" junto al costo real de hoy.
 */
export function projectMonthlyUsdCents(
  dailyCents: number,
  days: number = PROJECTION_DAYS_DEFAULT
): number {
  if (!Number.isFinite(dailyCents) || dailyCents <= 0) return 0;
  if (!Number.isFinite(days) || days <= 0) return 0;
  // FIX 2026-07-11: redondeo a 2 decimales para que la UI no muestre
  // cifras con cola de coma flotante (`42.00000001¢`).
  return Math.round(dailyCents * days * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Helper interno: precio por modelo                                 */
/* ------------------------------------------------------------------ */

function resolveModelPricePerMTokens(model: string): number {
  if (model === "deepseek-reasoner") return DEEPSEEK_PRO_USD_PER_M_TOKENS;
  // Default a Flash para modelos nuevos o no reconocidos. La métrica
  // no debe romperse si DeepSeek anuncia un modelo nuevo.
  return DEEPSEEK_FLASH_USD_PER_M_TOKENS;
}

/* ------------------------------------------------------------------ */
/*  Matriz M4 de pausa                                                 */
/* ------------------------------------------------------------------ */

/**
 * Razones válidas del enum `bot_pause_reason` (Sprint v15 + v16).
 * Mantenemos este type aquí para que `resolveEffectivePause` no tenga
 * que importar el typegen de Supabase (acoplamiento).
 */
export type BotPauseReason =
  | "keyword_escalation"
  | "ai_semantic_escalation"
  | "manual"
  | "manual_global";

export interface EffectivePauseInput {
  globalPaused: boolean;
  leadPaused: boolean;
  leadReason: string | null;
}

export interface EffectivePauseResult {
  paused: boolean;
  reason: BotPauseReason | null;
}

/**
 * Resuelve la pausa efectiva del bot combinando el switch maestro
 * global (`system_settings.bot_paused_global`) con el switch per-lead
 * (`leads.bot_paused` + `leads.bot_paused_reason`).
 *
 * Matriz (Sprint v16, M4):
 *
 *   global  | per-lead | reason       | ¿pausado?
 *   --------|----------|--------------|----------
 *   false   | false    | null         | no
 *   false   | true     | manual       | sí
 *   true    | false    | manual_global| sí
 *   true    | true     | manual       | sí  (per-lead pre-empata)
 *
 * Decisión: cuando ambos están activos, el per-lead `manual` pre-empata
 * (es más específico y ya estaba en uso antes del sprint v16). El
 * global sirve como safety net: si llega un lead nuevo sin pausa
 * per-lead y el admin olvidó configurarla, el master switch lo cubre.
 */
export function resolveEffectivePause(
  input: EffectivePauseInput
): EffectivePauseResult {
  // Precedencia 1: per-lead manual gana si está activo.
  if (input.leadPaused) {
    const reason = isValidPauseReason(input.leadReason) ? input.leadReason : "manual";
    return { paused: true, reason };
  }
  // Precedencia 2: master switch global.
  if (input.globalPaused) {
    return { paused: true, reason: "manual_global" };
  }
  // Sin pausa.
  return { paused: false, reason: null };
}

function isValidPauseReason(r: string | null): r is BotPauseReason {
  return (
    r === "keyword_escalation" ||
    r === "ai_semantic_escalation" ||
    r === "manual" ||
    r === "manual_global"
  );
}

/* ------------------------------------------------------------------ */
/*  Persistencia en bot_usage_daily (M5)                              */
/* ------------------------------------------------------------------ */

/**
 * Sprint v16 (PR #2.1, M5): acumula tokens y costo de una inferencia
 * en `public.bot_usage_daily` mediante UPSERT idempotente.
 *
 * La función es fire-and-forget: si el UPSERT falla (DB caída, RLS,
 * timeout), la excepción se silencia. El bot sigue funcionando; solo
 * la métrica del día queda incompleta.
 *
 * @param supabase Cliente de Supabase admin (pre-instanciado). Si es
 *                  null/undefined, no se hace nada (modo demo o sin DB).
 * @param model     Identificador del modelo (`deepseek-chat` / `deepseek-reasoner`).
 * @param prompt    Tokens de prompt. Entero ≥ 0. Si null/undefined → 0.
 * @param completion Tokens de completion. Entero ≥ 0. Si null/undefined → 0.
 * @returns         Promise<void>. No lanza.
 */
export async function recordDeepseekUsage(
  supabase: unknown,
  model: string,
  prompt: number | null | undefined,
  completion: number | null | undefined
): Promise<void> {
  if (!supabase || typeof supabase !== "object") return;
  const sb = supabase as { from?: (table: string) => unknown };
  if (typeof sb.from !== "function") return;
  const safePrompt = Math.max(0, Math.floor(prompt ?? 0));
  const safeCompletion = Math.max(0, Math.floor(completion ?? 0));
  if (safePrompt === 0 && safeCompletion === 0) return;
  // Solo aceptamos los 2 modelos conocidos; cualquier otro cae a Flash
  // (defensa: el CHECK constraint de bot_usage_daily rechaza valores
  // fuera de ('deepseek-chat', 'deepseek-reasoner')).
  const safeModel: "deepseek-chat" | "deepseek-reasoner" =
    model === "deepseek-reasoner" ? "deepseek-reasoner" : "deepseek-chat";
  const costCents = calculateDeepseekCostUsdCents(safeModel, safePrompt, safeCompletion);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const table = sb.from("bot_usage_daily") as {
      upsert?: (data: unknown, opts?: unknown) => Promise<unknown>;
    };
    if (typeof table.upsert !== "function") return;
    await table.upsert(
      {
        date: today,
        model: safeModel,
        prompt_tokens: safePrompt,
        completion_tokens: safeCompletion,
        call_count: 1,
        estimated_cost_cents: costCents,
        updated_at: new Date().toISOString()
      },
      { onConflict: "date,model" }
    );
  } catch {
    // fire-and-forget: la métrica es best-effort.
  }
}
