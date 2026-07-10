/**
 * Agent Tools Registry — Sub-sprint 2A (Sprint 2 Bot v2).
 *
 * Define el schema de las tools que el LLM puede invocar durante
 * `suggest_reply` (DeepSeek es OpenAI-compatible y soporta function-calling
 * con `tools` en el payload). Por decisión arquitectónica de David
 * (mejora #2 del Sprint 2), hay UNA sola tool consolidada para
 * captura de contacto:
 *
 *   - extract_and_save_contact_info(name?, email?)
 *
 * Esa tool es atómica: valida, persiste, y devuelve ack en una sola
 * operación. NO se exponen tools separadas (validate_name, validate_email,
 * save_lead_name, etc.) porque:
 *
 *   - el LLM se confunde con multi-tool chains en un solo turno,
 *   - gastamos tokens decidiendo el orden de invocación,
 *   - 4 round-trips al backend se comen el budget de latencia (<2.5s E2E).
 *
 * Si en el futuro se necesitan más tools (ej. `escalate_to_human`,
 * `opt_out_lead`), se exponen en OTROS sprints con decisión explicita;
 * acá solo vive la capture tool hasta que el Sprint 2C la conecte al
 * deepseek-provider.
 *
 * Ver:
 *   - docs/SPRINT_2_BOT_V2_DESIGN.md §2 (mejora #2)
 *   - docs/AI_AGENT_GUARDRAILS.md (regla "NO confirmar pagos, accesos,
 *     descuentos").
 *
 * @server
 */

/* ------------------------------------------------------------------ */
/* Tipos (alineados con OpenAI function-calling spec / DeepSeek v1 API) */
/* ------------------------------------------------------------------ */

/**
 * JSON Schema simplificado para los `parameters` de una tool. Soporta lo
 * que usamos hoy: object root, properties string/null, enum, required.
 * NO soporta $ref, oneOf, anyOf, additionalProperties (más allá del flag
 * booleano). Si se necesitan, se agrega acá sin romper callers.
 */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<
    string,
    | { type: "string"; description?: string; enum?: readonly string[] }
    | { type: "number" | "integer"; description?: string }
    | { type: "boolean"; description?: string }
    | { type: "null"; description?: string }
  >;
  required?: readonly string[];
  additionalProperties?: boolean;
}

/** Definición de una tool (formato OpenAI/DeepSeek). */
export interface AgentToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

/* ------------------------------------------------------------------ */
/* Tool consolidada — extract_and_save_contact_info                   */
/* ------------------------------------------------------------------ */

/**
 * La única tool expuesta al LLM en Sprint 2. Cuando el lead comparte
 * explícitamente su nombre O email (o ambos en el mismo mensaje), el
 * LLM debe llamar esta tool con los valores.
 *
 * Reglas declaradas en la description (el LLM las lee):
 *   - name Y email son opcionales (puede llegar solo uno).
 *   - NO llamar la tool con datos incompletos o inferidos (no inventar).
 *   - El backend valida con `isValidHumanName` y regex de email; si
 *     falla, devuelve `error_name` o `error_email` en el ack.
 */
const EXTRACT_AND_SAVE_CONTACT_INFO_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: "extract_and_save_contact_info",
    description:
      "Guarda el nombre completo y/o el correo electrónico del lead en la base de datos. " +
      "Llama SOLO cuando el lead haya mencionado su nombre (e.g. 'me llamo X', 'soy X') " +
      "o su email (e.g. 'es X@Y.com', literal dentro del mensaje). " +
      "Ambos parámetros son opcionales: si solo tienes uno, pasa solo ese. " +
      "NO llames con datos inferidos, incompletos o inventados — solo con lo que el lead " +
      "dijo literalmente en su último mensaje. Si el mensaje NO contiene nombre ni email, " +
      "NO llames la tool: simplemente responde con tu copy de seguimiento.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Nombre completo del lead. Solo si el lead dijo literalmente su nombre completo " +
            "(mínimo 2 palabras con letras). Sin emojis, sin placeholders tipo 'Por confirmar'."
        },
        email: {
          type: "string",
          description:
            "Email del lead. Solo si el lead lo dijo literalmente con formato xx@yy.zz. " +
            "Si tienes duda del formato, NO lo mandes: pide confirmación natural al lead."
        }
      },
      additionalProperties: false
    }
  }
};

/* ------------------------------------------------------------------ */
/* API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Devuelve la lista COMPLETA de tools expuestas al LLM.
 *
 * Por decisión arquitectónica (Sprint 2 mejora #2), retorna UNA sola
 * tool consolidada. Si en sprints futuros se agregan más, este es el
 * ÚNICO punto a modificar — los callers (deepseek-provider, tests)
 * siguen funcionando porque iteran sobre el array.
 *
 * IMPORTANTE — invariante del Sprint 2:
 *   - `getAgentTools().length === 1`
 *   - la única tool debe llamarse `extract_and_save_contact_info`
 *
 * Si alguien rompe la invariante, el test
 * `tests/whatsapp-bot-v2-tool-atomic.test.mjs` lo cacha.
 */
export function getAgentTools(): AgentToolDefinition[] {
  return [EXTRACT_AND_SAVE_CONTACT_INFO_TOOL];
}

/**
 * Helper para que callers (y tests) puedan buscar una tool por nombre
 * sin iterar manualmente. Devuelve `null` si no existe (vs. undefined
 * por consistencia con find-first API).
 */
export function getAgentToolByName(name: string): AgentToolDefinition | null {
  return getAgentTools().find((t) => t.function.name === name) ?? null;
}

/**
 * Nombre canonical de la tool consolidada. Exportado para que el deepseek
 * provider pueda referenciarlo sin hardcodear strings en varias partes.
 */
export const TOOL_EXTRACT_AND_SAVE_CONTACT_INFO =
  "extract_and_save_contact_info" as const;
