/**
 * Sprint v0.9.6 — Validación de payload del Simulador.
 *
 * `parseSimulateRequest` parsea y valida un payload arbitrario como
 * `SimulateRequest`. Vive en un módulo aparte (no dentro del route) para
 * que los tests unitarios lo importen directamente sin tener que
 * mockear el sistema de módulos de Node.
 *
 * Validaciones:
 *   - `message` obligatorio, string, 1-4,000 chars.
 *   - `history` opcional, array de ≤ 50 mensajes, cada uno con
 *     `direction ∈ {inbound, outbound}` y `body` 1-4,000 chars.
 *   - `modeOverride` opcional, debe ser uno de los 3 valores válidos.
 *   - `leadContext.leadId` opcional, debe ser UUID si está presente.
 *   - Flags booleanos opcionales.
 *
 * Devuelve `{ ok: true, value }` o `{ ok: false, error }` con un
 * mensaje legible. El route mapea esto a HTTP 400.
 */

import type {
  SimulateRequest,
  SimulateHistoryMessage,
  BotMode
} from "./simulator";

const VALID_MODES: ReadonlySet<BotMode> = new Set<BotMode>([
  "socratic_autopilot_v2",
  "socratic_no_tools_v1",
  "super_executive",
  // Sprint v0.9.x (PR #1 modo `human_first`): 4to modo opt-in para
  // experimentar con LLM-first total. Aceptado por el simulador y por
  // el endpoint POST /api/admin/bot/mode.
  "human_first"
]);

const MAX_MESSAGE_LEN = 4_000;
const MAX_HISTORY_LEN = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

function isValidIso(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

/** Parsea el body como SimulateRequest. */
export function parseSimulateRequest(raw: unknown):
  | { ok: true; value: SimulateRequest }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "El body debe ser un objeto JSON." };
  }
  const body = raw as Record<string, unknown>;

  // message
  const message = body.message;
  if (typeof message !== "string" || message.trim() === "") {
    return { ok: false, error: "'message' es obligatorio y debe ser un string no vacío." };
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return { ok: false, error: `'message' excede el límite de ${MAX_MESSAGE_LEN.toLocaleString("es-MX")} caracteres.` };
  }

  // history
  let history: SimulateHistoryMessage[] = [];
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      return { ok: false, error: "'history' debe ser un array." };
    }
    if (body.history.length > MAX_HISTORY_LEN) {
      return { ok: false, error: `'history' excede el límite de ${MAX_HISTORY_LEN} mensajes.` };
    }
    for (let i = 0; i < body.history.length; i++) {
      const h = body.history[i] as Record<string, unknown> | null;
      if (!h || typeof h !== "object") {
        return { ok: false, error: `history[${i}] debe ser un objeto.` };
      }
      if (h.direction !== "inbound" && h.direction !== "outbound") {
        return {
          ok: false,
          error: `history[${i}].direction debe ser 'inbound' u 'outbound'.`
        };
      }
      if (typeof h.body !== "string" || h.body.length === 0 || h.body.length > MAX_MESSAGE_LEN) {
        return {
          ok: false,
          error: `history[${i}].body debe ser un string de 1-${MAX_MESSAGE_LEN.toLocaleString("es-MX")} caracteres.`
        };
      }
      const msg: SimulateHistoryMessage = {
        direction: h.direction,
        body: h.body
      };
      if (h.timestamp !== undefined) {
        if (!isValidIso(h.timestamp)) {
          return { ok: false, error: `history[${i}].timestamp debe ser ISO 8601.` };
        }
        msg.timestamp = h.timestamp as string;
      }
      history.push(msg);
    }
  }

  // modeOverride
  let modeOverride: BotMode | null = null;
  if (body.modeOverride !== undefined && body.modeOverride !== null) {
    if (!VALID_MODES.has(body.modeOverride as BotMode)) {
      return {
        ok: false,
        error: `'modeOverride' debe ser uno de: ${[...VALID_MODES].join(", ")}.`
      };
    }
    modeOverride = body.modeOverride as BotMode;
  }

  // leadContext
  let leadContext: SimulateRequest["leadContext"] = null;
  if (body.leadContext !== undefined && body.leadContext !== null) {
    const lc = body.leadContext as Record<string, unknown>;
    if (typeof lc.leadId !== "string" || !isValidUuid(lc.leadId)) {
      return { ok: false, error: "leadContext.leadId debe ser un UUID válido." };
    }
    leadContext = {
      leadId: lc.leadId,
      ...(typeof lc.isFirstMessage === "boolean"
        ? { isFirstMessage: lc.isFirstMessage }
        : {}),
      ...(lc.profile && typeof lc.profile === "object"
        ? { profile: lc.profile as never }
        : {})
    };
  }

  return {
    ok: true,
    value: {
      message,
      history,
      modeOverride,
      leadContext,
      ignoreLeadPause: body.ignoreLeadPause === true,
      includeEventContext: body.includeEventContext !== false,
      includeInjectedRules: body.includeInjectedRules !== false,
      // Sprint v0.9.7: tierOverride opcional. Default null (Flash con
      // escalación automática).
      tierOverride:
        body.tierOverride === "flash" || body.tierOverride === "pro"
          ? body.tierOverride
          : null
    }
  };
}
