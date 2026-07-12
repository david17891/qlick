/**
 * Agent Tools Registry — Sub-sprint 2A (Sprint 2 Bot v2) + Sprint v0.9.8.
 *
 * Define el schema de las tools que el LLM puede invocar durante
 * `suggest_reply` (DeepSeek es OpenAI-compatible y soporta function-calling
 * con `tools` en el payload).
 *
 * **Sprint 2 (David, mejora #2):** UNA sola tool consolidada para
 * captura de contacto del titular:
 *   - `extract_and_save_contact_info(name?, email?)`
 *
 * **Sprint v0.9.8:** Se agrega una segunda tool para acompañantes:
 *   - `add_event_guest(parent_lead_id, guest_name, guest_email?)`
 *
 * Esta segunda tool persiste un acompañante del titular en
 * `event_attendees.guests` (JSONB). Es atómica y complementaria a la
 * primera: la tool de captura registra al titular; esta registra a
 * quien el titular quiera sumar (socio, hermano, amigo).
 *
 * Decisión de diseño: ambas tools son atómicas y minimalistas. NO se
 * exponen tools "validate_*" o "save_*" separadas porque:
 *   - el LLM se confunde con multi-tool chains en un solo turno,
 *   - gastamos tokens decidiendo el orden de invocación,
 *   - 4 round-trips al backend se comen el budget de latencia (<2.5s E2E).
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
/* Tool #2 (Sprint v0.9.8) — add_event_guest                         */
/* ------------------------------------------------------------------ */

/**
 * Tool para registrar un ACOMPAÑANTE del titular (socio, hermano, amigo)
 * en `event_attendees.guests` (JSONB).
 *
 * El LLM llama esta tool cuando el titular dice algo como "quiero
 * registrar también a mi socio Carlos". La tool agrega un objeto al
 * array JSONB de guests de la fila del titular en event_attendees.
 *
 * Sprint v0.9.7 hotfix ya advertía al LLM que NO podía confirmar
 * acompañantes (porque no existía persistencia). Sprint v0.9.8 cierra
 * ese gap: la tool SÍ existe y el LLM SÍ puede registrar al
 * acompañante, devolviendo un ack honesto al titular.
 *
 * Reglas declaradas en la description (el LLM las lee):
 *   - `parent_lead_id` es el UUID del TITULAR (no del guest). El
 *     executor lo vincula al evento activo del lead.
 *   - `guest_name` es OBLIGATORIO (mín. 2 palabras).
 *   - `guest_email` es OPCIONAL.
 *   - Idempotente: si el LLM llama 2 veces con el mismo (lead, name),
 *     el executor hace upsert (no duplica el guest en el array).
 */
const ADD_EVENT_GUEST_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: "add_event_guest",
    description:
      "Registra un ACOMPAÑANTE del titular (socio, hermano, amigo) en el " +
      "mismo evento. Úsala SOLO cuando el titular te pida explícitamente " +
      "registrar a otra persona en el mismo chat (ej. 'quiero inscribir a " +
      "mi socio Carlos también'). Llama una vez por acompañante. " +
      "`parent_lead_id` es el UUID del TITULAR (no del guest). " +
      "`guest_name` es obligatorio (mínimo 2 palabras). `guest_email` " +
      "es opcional pero recomendado para mandarle el acceso al acompañante. " +
      "NO llames esta tool si el titular solo está hablando de su propio " +
      "registro — para eso está extract_and_save_contact_info. " +
      "Tras la confirmación cálida, NO inventes datos: el ack del " +
      "executor indica si se guardó OK o si hubo error.",
    parameters: {
      type: "object",
      properties: {
        parent_lead_id: {
          type: "string",
          description:
            "UUID del lead TITULAR del chat (no del guest). " +
            "El executor vincula al acompañante al mismo evento que el titular."
        },
        guest_name: {
          type: "string",
          description:
            "Nombre completo del acompañante. Mínimo 2 palabras con letras. " +
            "Sin emojis, sin placeholders."
        },
        guest_email: {
          type: "string",
          description:
            "Email del acompañante (opcional). Si no lo tienes, " +
            "pasa null o un string vacío. El ejecutor validará formato."
        }
      },
      required: ["parent_lead_id", "guest_name"],
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
 * Sprint 2: retornaba 1 sola tool. Sprint v0.9.8: retorna 2 tools
 * (captura del titular + acompañantes).
 *
 * Si en sprints futuros se agregan más, este es el ÚNICO punto a
 * modificar — los callers (deepseek-provider, tests) siguen
 * funcionando porque iteran sobre el array.
 *
 * IMPORTANTE — invariante del Sprint v0.9.8:
 *   - `getAgentTools().length === 2`
 *   - las tools son `extract_and_save_contact_info` + `add_event_guest`
 *
 * Si alguien rompe la invariante, el test correspondiente lo cacha.
 */
export function getAgentTools(): AgentToolDefinition[] {
  return [EXTRACT_AND_SAVE_CONTACT_INFO_TOOL, ADD_EVENT_GUEST_TOOL];
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
 * Nombre canonical de la tool de captura. Exportado para que el deepseek
 * provider pueda referenciarlo sin hardcodear strings en varias partes.
 */
export const TOOL_EXTRACT_AND_SAVE_CONTACT_INFO =
  "extract_and_save_contact_info" as const;

/**
 * Sprint v0.9.8: nombre canonical de la tool de acompañantes.
 */
export const TOOL_ADD_EVENT_GUEST = "add_event_guest" as const;
