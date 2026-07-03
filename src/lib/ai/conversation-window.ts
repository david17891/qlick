/**
 * Conversation Window — ventana de últimos N mensajes de una conversación.
 *
 * Carga los últimos `limit` mensajes (inbound + outbound) de `lead_whatsapp_conversations`
 * para un teléfono normalizado. Usado por el bot para mantener contexto entre
 * mensajes y permitir que el LLM responda con consciencia de lo que ya se dijo.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions.
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhone } from "../crm/phone-utils";
import type { Database } from "@/types/supabase";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string | null;
  timestamp: string;
  /**
   * FIX 2026-07-02 (sesion David, Commit A): metadata del mensaje.
   * El bot-engine consulta esto para state machine (ej. awaiting_field
   * del flow secuencial nombre → email). Es JSON arbitrario.
   */
  metadata: Record<string, unknown> | null;
}

export interface ConversationWindow {
  phoneNormalized: string;
  leadId: string | null;
  messages: ConversationMessage[];
  /** Texto listo para inyectar en el prompt del LLM. */
  promptBlock: string;
}

type SupabaseAdmin = SupabaseClient<Database>;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getSupabase(): Promise<SupabaseAdmin | null> {
  try {
    const { checkSupabaseConfig } = await import("../supabase/health");
    const { createSupabaseAdminClient } = await import("../supabase/admin");
    if (!checkSupabaseConfig().configured) return null;
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/**
 * Formatea la ventana de conversación para inyección en el prompt.
 *
 * Output ejemplo:
 *   === HISTORIAL DE CONVERSACIÓN ===
 *   [15:32] lead: Hola, buenas tardes
 *   [15:32] bot: Hola, bienvenido a Qlick. ¿Te interesa info del evento?
 *   [15:33] lead: Sí, por favor
 *   =================================
 */
function formatPromptBlock(messages: ConversationMessage[]): string {
  if (messages.length === 0) {
    return "=== HISTORIAL DE CONVERSACIÓN ===\n(primer mensaje del usuario)\n=================================";
  }
  const lines = messages.map((m) => {
    const date = new Date(m.timestamp);
    const hh = date.getUTCHours().toString().padStart(2, "0");
    const mm = date.getUTCMinutes().toString().padStart(2, "0");
    const actor = m.direction === "inbound" ? "lead" : "bot";
    const body = (m.body ?? "").slice(0, 300).replace(/\n+/g, " ");
    return `[${hh}:${mm}] ${actor}: ${body}`;
  });
  return [
    "=== HISTORIAL DE CONVERSACIÓN ===",
    ...lines,
    "================================="
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Carga la ventana de conversación para un teléfono.
 *
 * @param from teléfono crudo (con o sin formato), se normaliza.
 * @param limit número máximo de mensajes a traer (default 8, max 20).
 */
export async function loadConversationWindow(
  from: string,
  limit: number = DEFAULT_LIMIT
): Promise<ConversationWindow> {
  const phoneNormalized = normalizePhone(from);
  if (!phoneNormalized) {
    return {
      phoneNormalized: from,
      leadId: null,
      messages: [],
      promptBlock: formatPromptBlock([])
    };
  }

  const safeLimit = Math.max(1, Math.min(limit, MAX_LIMIT));
  const supabase = await getSupabase();
  if (!supabase) {
    return {
      phoneNormalized,
      leadId: null,
      messages: [],
      promptBlock: formatPromptBlock([])
    };
  }

  try {
    // Una sola query con relación embebida: trae los últimos N mensajes
    // de la conversación filtrando por phone_normalized del lead relacionado.
    // Esto reemplaza el patrón anterior de 2 queries (lead_id lookup +
    // messages lookup) con un LEFT JOIN en una sola ronda.
    // Fix M3 del auditor 2026-07-01.
    //
    // FIX 2026-07-02 (Commit A): ahora tambien pedimos `metadata` para
    // que el bot-engine pueda consultar state machine (ej. awaiting_field
    // del flow secuencial nombre -> email).
    //
    // Sintaxis PostgREST: `leads!lead_id(...)` para hacer LEFT JOIN a través
    // de la FK `lead_whatsapp_conversations.lead_id → leads.id`. El LEFT
    // asegura que pre-lead messages (lead_id = NULL) también aparecen vía
    // phone_normalized de la conversación misma. PERO el filtro por
    // leads.phone_normalized requiere que lead_id NO sea null, así que
    // combinamos ambos con un OR para cubrir ambos casos.
    const { data: convRows, error } = await supabase
      .from("lead_whatsapp_conversations" as never)
      .select(
        "id, direction, message_type, body, created_at, metadata, lead_id, leads!lead_id(phone_normalized)" as never
      )
      .or(
        `phone_normalized.eq.${phoneNormalized},leads.phone_normalized.eq.${phoneNormalized}` as never
      )
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error || !convRows) {
      return {
        phoneNormalized,
        leadId: null,
        messages: [],
        promptBlock: formatPromptBlock([])
      };
    }

    // Extraemos el primer lead_id no-null (es el del lead de esta conversación).
    const firstLeadId = (convRows as Array<{ lead_id: string | null }>).find(
      (r) => r.lead_id
    )?.lead_id ?? null;

    const messages: ConversationMessage[] = (
      convRows as Array<{
        id: string;
        direction: "inbound" | "outbound";
        message_type: string;
        body: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
      }>
    )
      .map((r) => ({
        id: r.id,
        direction: r.direction,
        messageType: r.message_type,
        body: r.body,
        timestamp: r.created_at,
        metadata: r.metadata
      }))
      // Revertir para que el orden cronológico sea ascendente
      // (lead_oldest → lead_newest).
      .reverse();

    return {
      phoneNormalized,
      leadId: firstLeadId,
      messages,
      promptBlock: formatPromptBlock(messages)
    };
  } catch {
    return {
      phoneNormalized,
      leadId: null,
      messages: [],
      promptBlock: formatPromptBlock([])
    };
  }
}