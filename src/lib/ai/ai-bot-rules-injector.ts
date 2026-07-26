/**
 * src/lib/ai/ai-bot-rules-injector.ts
 *
 * Capa de inyección de Reglas de Oro (ai_bot_rules) al prompt del bot.
 *
 * Responsabilidades (FIX 2026-07-25, sprint "activación controlada de
 * ai_bot_rules en el bot real"):
 *
 *   1. Resolver el feature flag `bot_global_rules_enabled` (FAIL-CLOSED).
 *   2. Cargar reglas activas de la DB vía `getActiveBotRules` (con caché
 *      30s del módulo subyacente).
 *   3. Aplicar precedencia GLOBAL → EVENTO y ordenar por `priority DESC`.
 *   4. Respetar `bot_max_active_rules` (system_settings, default 8).
 *   5. Rechazar reglas inactivas o expiradas (defensa en profundidad;
 *      `getActiveBotRules` ya filtra por `is_active` y `expires_at`).
 *   6. Truncar `instruction` a `MAX_INSTRUCTION_LENGTH` (defensa contra
 *      prompts excesivos).
 *   7. Formatear el bloque de texto que se inyecta al system prompt de
 *      los 3 modos LLM: Super Ejecutivo, Human First, Socrático.
 *   8. FAIL-OPEN: cualquier error (DB caída, jsonb corrupto, etc.)
 *      devuelve `[]` y el bot sigue funcionando como antes.
 *
 * NO escribe NUNCA en la DB. La inyección al prompt y la telemetría
 * `usage_count` se manejan en otras capas (ver
 * `src/lib/ai/agent-prompts.ts` y `src/lib/ai/deepseek-provider.ts`).
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions /
 * Server Components / Server libs.
 *
 * @server
 */

import {
  getActiveBotRules,
  type BotRule
} from "./ai-bot-rules-server";
import {
  readBotGlobalRulesEnabled,
  readSystemSetting,
  KEY_BOT_MAX_ACTIVE_RULES
} from "../admin/system-settings-server";
import { errorLog } from "../log";

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                       */
/* ------------------------------------------------------------------ */

/**
 * Subset de `BotRule` que viaja en el `AgentContext` y se renderea
 * en el prompt. Deliberadamente NO incluye `usage_count`, `metadata`,
 * `created_by`, `expires_at` ni `created_at` para mantener el contrato
 * del context pequeño y minimizar superficie de PII (aunque hoy
 * `BotRule` no guarda PII, el field set de telemetría es estricto).
 */
export interface InjectableRule {
  /** UUID estable para telemetría (usage_count). */
  id: string;
  /** Texto literal de la regla (ya validado y truncado). */
  instruction: string;
  /** Prioridad efectiva. Se usa para ordenar y desempatar. */
  priority: number;
  /** Scope original (`global` o `event:<id>`). */
  scope: string;
}

export interface LoadInjectableRulesOptions {
  /**
   * Permite al simulador probar reglas reales de Supabase cuando el flag
   * global sigue apagado. Solo funciona si `BOT_GLOBAL_RULES_SHADOW_ONLY`
   * está explícitamente habilitado en el entorno de preview/local.
   *
   * El bot real nunca pasa esta opción, por lo que este camino no puede
   * activar la inyección en conversaciones de leads por accidente.
   */
  shadowOnly?: boolean;
  /**
   * Si viene, también se cargan reglas con `scope === "event:<eventId>"`
   * o `scope === "event:<eventSlug>"` y se concatenan después de las
   * globales (ordenadas por priority desc). Si el evento no tiene reglas
   * específicas, el resultado es idéntico al de solo-globales.
   *
   * IMPORTANTE: el CRM (`AIBotFeedbackSection`) puede guardar el scope
   * con el slug O con el id del evento, dependiendo de cuál tenga
   * disponible en el momento. El loader acepta AMBOS formatos para
   * mantener compatibilidad retroactiva (no hay migración que normalice).
   */
  eventId?: string;
  /**
   * Slug del evento activo. Alternativa a `eventId` para matching de
   * reglas con scope `event:<slug>`. Si vienen ambos, se matchea por
   * los dos (union).
   */
  eventSlug?: string;
  /**
   * Override del límite máximo de reglas inyectadas. Si ausente, lee
   * `bot_max_active_rules` de system_settings; si la DB falla, default
   * `DEFAULT_MAX_ACTIVE_RULES`.
   *
   * IMPORTANTE: el top-N se aplica AL FINAL, después de separar y
   * concatenar. Si se pasara a `getActiveBotRules` antes del filtrado
   * por scope, una regla de evento podría quedar fuera del top-N aunque
   * sea más prioritaria que una global.
   */
  maxRules?: number;
}

/* ------------------------------------------------------------------ */
/* Constantes                                                            */
/* ------------------------------------------------------------------ */

/** Default duro si `bot_max_active_rules` no está sembrado o DB falla. */
const DEFAULT_MAX_ACTIVE_RULES = 8;

/**
 * Límite duro de longitud de cada `instruction` para evitar prompts
 * excesivos. 600 chars ~ 2-3 oraciones en español. Una regla legítima
 * nunca excede esto; si excede, se trunca con elipsis para que el LLM
 * siga viendo la regla (parcial pero útil) en vez de reventar el prompt.
 */
export const MAX_INSTRUCTION_LENGTH = 600;

/** Prefijo del scope para reglas específicas del evento. */
const EVENT_SCOPE_PREFIX = "event:";

/**
 * Override aislado para el simulador: permite validar reglas reales sin
 * activar el bot. El valor se mantiene opt-in y no se considera habilitado
 * para ninguna llamada que no pase `shadowOnly: true`.
 */
function isShadowOnlyEnabled(): boolean {
  const value = process.env.BOT_GLOBAL_RULES_SHADOW_ONLY?.trim().toLowerCase();
  return value === "true" || value === "1";
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                     */
/* ------------------------------------------------------------------ */

/** Trunca `text` a `maxLen` chars. Si lo recorta, agrega elipsis. */
function safeTrimInstruction(text: string, maxLen: number = MAX_INSTRUCTION_LENGTH): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/** Lee `bot_max_active_rules` de system_settings con fallback defensivo. */
async function readMaxActiveRules(override?: number): Promise<number> {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  try {
    const v = await readSystemSetting(KEY_BOT_MAX_ACTIVE_RULES);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      return Math.floor(v);
    }
    if (typeof v === "string") {
      const parsed = parseInt(v, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // fall through al default
  }
  return DEFAULT_MAX_ACTIVE_RULES;
}

/** Convierte un `BotRule` a `InjectableRule` con sanitización. */
function toInjectable(rule: BotRule): InjectableRule {
  return {
    id: rule.id,
    instruction: safeTrimInstruction(rule.instruction),
    priority: rule.priority,
    scope: rule.scope
  };
}

/* ------------------------------------------------------------------ */
/* API pública: carga + inyección                                        */
/* ------------------------------------------------------------------ */

/**
 * Carga las reglas que se deben inyectar al prompt del bot en este turno.
 *
 * Reglas de precedencia (FIX 2026-07-25, brief de David + correcciones
 * post-revisión):
 *   1. Si `bot_global_rules_enabled` está apagado o la fila no existe
 *      → devuelve `[]`. El bot sigue funcionando como antes.
 *   2. Si la DB falla o `getActiveBotRules` lanza → `[]` + log.
 *   3. Carga TODAS las reglas activas (is_active=true, no expiradas)
 *      SIN aplicar `limit` aquí. El top-N se aplica al final.
 *   4. Separa en 3 grupos:
 *        - globales: scope === "global" (estricto).
 *        - del evento: scope === "event:<eventId>" o "event:<eventSlug>".
 *        - resto: scopes como "course:<slug>", "mode:...", u otros
 *          que aún no tienen matching implementado → DESCARTADOS
 *          (no se vuelven globales por default; sería un bug).
 *   5. Ordena globales y evento por `priority DESC` (desempate por id).
 *   6. Concatena en ese orden: GLOBALES primero, después las DEL EVENTO.
 *   7. Aplica el top-N (default `bot_max_active_rules`) AL FINAL.
 *   8. Trunca cada `instruction` a `MAX_INSTRUCTION_LENGTH`.
 *
 * Por qué el top-N al final: si se aplicara antes a `getActiveBotRules`,
 * una regla de evento podría quedar fuera del set aunque fuera más
 * prioritaria que una global. El loader carga todo, separa, y recorta
 * al final para garantizar que el top-N refleja la mezcla final.
 *
 * Importante: la caché interna de `getActiveBotRules` (TTL 30s) hace
 * que un toggle en `bot_global_rules_enabled` tarde hasta 30s en verse
 * (sumado a la caché propia de 10s del feature flag). Esto es
 * intencional: el rollout es gradual, no se necesita efecto inmediato.
 */
export async function loadInjectableGlobalRules(
  options: LoadInjectableRulesOptions = {}
): Promise<InjectableRule[]> {
  try {
    // 1. Feature flag — FAIL-CLOSED. Si la DB está caída, ya devuelve false.
    //    El shadow path solo lo puede abrir explícitamente el simulador;
    //    el bot real no pasa `shadowOnly`, así que sigue dependiendo del
    //    flag global aunque exista la variable de preview.
    const enabled =
      options.shadowOnly === true && isShadowOnlyEnabled()
        ? true
        : await readBotGlobalRulesEnabled();
    if (!enabled) {
      return [];
    }

    // 2. Límite efectivo (se aplica al FINAL, después de separar).
    const maxRules = await readMaxActiveRules(options.maxRules);

    // 3. Traer TODAS las activas SIN `limit` (caché 30s del módulo).
    //    El `limit` se aplica después del filtrado por scope para
    //    garantizar que el top-N refleja la mezcla final.
    const allActive = await getActiveBotRules();
    if (allActive.length === 0) {
      return [];
    }

    // 4. Construir set de scopes de evento que matchean.
    //    Acepta AMBOS formatos: `event:<id>` y `event:<slug>`,
    //    porque el CRM (`AIBotFeedbackSection`) puede guardar el
    //    scope con el slug o con el id del evento, dependiendo de
    //    cuál esté disponible en el momento.
    const eventScopes = new Set<string>();
    if (options.eventId) {
      eventScopes.add(`${EVENT_SCOPE_PREFIX}${options.eventId}`);
    }
    if (options.eventSlug) {
      eventScopes.add(`${EVENT_SCOPE_PREFIX}${options.eventSlug}`);
    }

    // 5. Partir en 3 grupos: global, evento, resto.
    //    El "resto" (course:<slug>, mode:..., otros) se descarta —
    //    NO se vuelve global por default. Mejor perder una regla
    //    huérfana que aplicarla a conversaciones que no le tocan.
    const globalRules: BotRule[] = [];
    const eventRules: BotRule[] = [];
    const skippedScopes = new Set<string>();
    for (const r of allActive) {
      if (eventScopes.has(r.scope)) {
        eventRules.push(r);
      } else if (r.scope === "global") {
        globalRules.push(r);
      } else {
        // Scope desconocido o sin matching implementado todavía.
        // Lo loggeamos para que David lo vea si pasa seguido.
        skippedScopes.add(r.scope);
      }
    }
    if (skippedScopes.size > 0) {
      errorLog(
        "[ai-bot-rules-injector] descartando reglas con scope sin matching",
        {
          scopes: Array.from(skippedScopes),
          hint:
            "Si agregaste un nuevo tipo de scope (course, mode, etc.), " +
            "implementa el matching en este loader antes de activar el flag."
        }
      );
    }

    // 6. Ordenar cada grupo por priority DESC (desempate por id).
    const byPriorityDesc = (a: BotRule, b: BotRule): number => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    };
    globalRules.sort(byPriorityDesc);
    eventRules.sort(byPriorityDesc);

    // 7. Construir el top-N garantizando que las reglas de evento
    //    matching tengan un piso de slots.
    //
    //    Problema detectado (FIX 2026-07-25 post-revisión David): si
    //    hay muchas reglas globales con priority alta y solo 1 regla
    //    de evento con priority 100, el slice(0, maxRules) deja fuera
    //    la regla de evento aunque sea MÁS prioritaria que la mayoría
    //    de las globales. Esto es porque las globales (ordenadas desc)
    //    ocupan los primeros N slots.
    //
    //    Solución: reservar un piso de slots para evento. Si hay
    //    reglas de evento matching, garantizar que al menos
    //    `EVENT_MIN_SLOTS` (o todas las que haya, si son menos) entren.
    //    El resto de slots se llenan con globales. Si no hay evento
    //    matching, el comportamiento anterior (solo top-N globales) se
    //    mantiene.
    //
    //    Justificación: una regla de evento es ESPECÍFICA del contexto
    //    actual; perderla por una avalancha de globales genéricas es
    //    exactamente el bug que David señaló. El cap
    //    `EVENT_MAX_SHARE` evita que las reglas de evento dominen
    //    sobre las globales (mantenemos la jerarquía D-025: GLOBAL
    //    > EVENTUAL, pero la EVENTUAL debe estar presente).
    const EVENT_MIN_SLOTS = 1;
    const EVENT_MAX_SHARE = Math.ceil(maxRules / 2);
    let eventSlots = 0;
    if (eventRules.length > 0) {
      eventSlots = Math.min(
        Math.max(EVENT_MIN_SLOTS, eventRules.length),
        EVENT_MAX_SHARE
      );
    }
    const globalSlots = maxRules - eventSlots;
    const topEvent = eventRules.slice(0, eventSlots);
    const topGlobal = globalRules.slice(0, globalSlots);

    // 8. Concatenar GLOBAL → EVENTO (jerarquía D-025: globales primero).
    const merged = [...topGlobal, ...topEvent];

    // 8. Sanitizar (truncar instruction).
    return merged.map(toInjectable);
  } catch (err) {
    // FAIL-OPEN: cualquier excepción → [] y log. El bot sigue funcionando.
    errorLog("[ai-bot-rules-injector] loadInjectableGlobalRules failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Formateo del bloque de prompt                                        */
/* ------------------------------------------------------------------ */

/**
 * Formatea el bloque que se inyecta al system prompt de los modos LLM
 * (Super Ejecutivo, Human First, Socrático).
 *
 * Formato:
 * ```
 * === REGLAS DE ORO GLOBALES (cargadas por el orquestador) ===
 * Estas reglas son mandatorias. Si contradicen tu copy por defecto,
 * las reglas ganan.
 *
 * [1] (priority=N) <instrucción>
 * [2] (priority=N) <instrucción>
 * ...
 * ```
 *
 * Si `rules` es vacío, devuelve `""` (los prompts skipean el bloque
 * completo con un check de string vacío, así no queda un header
 * fantasma en el prompt).
 *
 * Decisión de diseño: el número [N] refleja el ORDEN FINAL después de
 * aplicar la precedencia GLOBAL → EVENTO. Así, si hay 2 globales y
 * 1 de evento, los IDs visuales son [1] global, [2] global, [3] evento.
 * El LLM los referencia por número si quiere citar la fuente.
 */
export function formatRulesBlock(rules: InjectableRule[]): string {
  if (!rules || rules.length === 0) return "";

  const lines: string[] = [
    "=== REGLAS DE ORO GLOBALES (cargadas por el orquestador) ===",
    "Estas reglas son mandatorias. Si contradicen tu copy por defecto,",
    "las reglas ganan (jerarquía D-025: global > local).",
    ""
  ];

  rules.forEach((r, i) => {
    const n = i + 1;
    const scopeTag =
      r.scope === "global"
        ? "global"
        : r.scope.startsWith(EVENT_SCOPE_PREFIX)
          ? "evento"
          : r.scope;
    lines.push(`[${n}] (priority=${r.priority}, ${scopeTag}) ${r.instruction}`);
  });

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Helpers de test                                                       */
/* ------------------------------------------------------------------ */

export const _INTERNAL_FOR_TEST = {
  DEFAULT_MAX_ACTIVE_RULES,
  EVENT_SCOPE_PREFIX
};
