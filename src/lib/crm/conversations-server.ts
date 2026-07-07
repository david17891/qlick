/**
 * Servicio de conversaciones REALES (WhatsApp + CRM interactions).
 *
 * Lee de:
 * - `lead_whatsapp_conversations` — mensajes del bot WhatsApp (inbound del
 *   lead + outbound del bot/admin).
 * - `lead_interactions` — notas internas, llamadas, cambios de status,
 *   interacciones manuales del equipo comercial. Funcionan como fallback
 *   si el lead no tiene historial en `lead_whatsapp_conversations`.
 *
 * Devuelve la interfaz `Conversation` + `ConversationMessage` de
 * `src/types/crm.ts` (mismas formas que el demo, no introducimos un
 * nuevo contrato).
 *
 * Server-only. Usa createSupabaseAdminClient() (service role) porque el
 * admin CRM lee sin depender de la sesión del usuario.
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import type {
  Conversation,
  ConversationMessage,
  ConversationStatus,
} from "@/types/crm";

/* ------------------------------------------------------------------ */
/* Tipos de filas crudas (DB schema, snake_case)                       */
/* ------------------------------------------------------------------ */

interface WhatsAppConvRow {
  id: string;
  lead_id: string | null;
  phone_normalized: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  metadata: unknown;
  created_at: string;
}

interface LeadInteractionRow {
  id: string;
  lead_id: string;
  channel: string;
  direction: "inbound" | "outbound" | "system";
  summary: string;
  metadata: unknown;
  created_by_email: string;
  created_at: string;
}

interface LeadLiteRow {
  id: string;
  name: string;
  phone: string | null;
}

/* ------------------------------------------------------------------ */
/* Mappers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Determina el estado de una conversación a partir de su último mensaje.
 *
 * - `open`: el último mensaje es nuestro (outbound) → esperando reply.
 * - `waiting_reply`: el último mensaje es del lead (inbound) → contestar.
 * - `resolved`: sin actividad reciente (>7 días).
 * - `escalated`: si metadata.flagged === true (futuro, hoy no se setea).
 */
function inferStatus(lastDir: "inbound" | "outbound" | "system" | null, lastAt: string | null): ConversationStatus {
  if (!lastAt || !lastDir) return "open";
  const ageDays = (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 7) return "resolved";
  return lastDir === "inbound" ? "waiting_reply" : "open";
}

function whatsappRowToMessage(row: WhatsAppConvRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.lead_id ?? row.phone_normalized,
    direction: row.direction,
    body: row.body ?? "",
    author: row.direction === "inbound" ? "Lead" : "Qlick",
    aiSuggested: false,
    at: row.created_at,
  };
}

function interactionRowToMessage(row: LeadInteractionRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.lead_id,
    direction: row.direction === "system" ? "outbound" : row.direction,
    body: row.summary,
    author: row.created_by_email,
    aiSuggested: false,
    at: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Lectura principal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lista todas las conversaciones reales con su último mensaje.
 * Cada entrada representa UN lead (si tiene actividad en
 * `lead_whatsapp_conversations` o `lead_interactions`).
 *
 * Orden: `updatedAt DESC` (mensaje más reciente primero).
 *
 * Fallback: si Supabase no está configurado, devuelve `[]` (la UI
 * sigue funcionando en modo demo con datos mock).
 */
export async function listRealConversations(): Promise<Conversation[]> {
  if (!checkSupabaseConfig().configured) {
    return [];
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leads con teléfono (necesarios para construir el id estable y
  //    agrupar mensajes pre-lead por phone).
  // Cast a `any` para esquivar el typegen estricto de Supabase (los
  // nombres de columna son válidos runtime pero el typegen los marca
  // como `never` hasta regenerar con `supabase gen types`).
  const { data: leadsLite, error: leadsErr } = await (supabase.from("leads") as any)
    .select("id, name, phone")
    .not("phone", "is", null);

  if (leadsErr) {
    // eslint-disable-next-line no-console
    console.error("[conversations-server] leads query falló", {
      code: leadsErr.code,
    });
    return [];
  }

  const leadsById = new Map<string, LeadLiteRow>(
    ((leadsLite ?? []) as unknown as LeadLiteRow[]).map((l) => [
      l.id,
      l,
    ]),
  );

  // 2. Mensajes WhatsApp — agrupar por lead_id (o por phone si lead_id
  //    es NULL, i.e. pre-lead).
  // Cast a `never` porque el typegen de Supabase no incluye esta tabla
  // (legacy: aplicada 2026-06-29 antes del typegen actual). El runtime
  // funciona OK; el cast solo silencia al compilador.
  //
  // FIX 2026-07-06 (conversaciones v2): filtrar `deleted_at IS NULL`
  // para no mostrar mensajes soft-deleted en la UI. El row sigue
  // existiendo para audit, pero no aparece en este listado.
  const { data: whatsappRows, error: waErr } = await (supabase.from(
    "lead_whatsapp_conversations" as never,
  ) as any)
    .select(
      "id, lead_id, phone_normalized, direction, message_type, body, metadata, created_at",
    )
    .is("deleted_at", null)
    .is("metadata->>status" as never, null)
    .order("created_at", { ascending: false });

  if (waErr) {
    // eslint-disable-next-line no-console
    console.error("[conversations-server] whatsapp query falló", {
      code: waErr.code,
    });
    return [];
  }

  // 3. Interactions — agrupar por lead_id.
  // Cast a `never` (misma razón que arriba — tabla no en typegen).
  const { data: interactionRows, error: intErr } = await (supabase.from(
    "lead_interactions" as never,
  ) as any)
    .select(
      "id, lead_id, channel, direction, summary, metadata, created_by_email, created_at",
    )
    .order("created_at", { ascending: false });

  if (intErr) {
    // eslint-disable-next-line no-console
    console.error("[conversations-server] interactions query falló", {
      code: intErr.code,
    });
    return [];
  }

  // 4. Construir el mapa: leadId → Conversation.
  const conversationsByLeadId = new Map<string, Conversation>();

  // 4a. Primero WhatsApp (son los mensajes "fuertes" del bot).
  for (const row of ((whatsappRows ?? []) as unknown) as WhatsAppConvRow[]) {
    // Si lead_id es null pero tenemos un lead con ese phone, lo
    // "adoptamos". Si no, lo agrupamos por phone como fallback.
    let leadId = row.lead_id;
    if (!leadId) {
      const match = Array.from(leadsById.values()).find(
        (l) => l.phone === row.phone_normalized,
      );
      leadId = match?.id ?? null;
    }
    const key = leadId ?? `phone:${row.phone_normalized}`;
    const conv =
      conversationsByLeadId.get(key) ??
      ({
        id: key,
        leadId: leadId ?? "",
        channel: "whatsapp",
        status: "open",
        updatedAt: row.created_at,
        messages: [],
      } as Conversation);
    conv.messages.push(whatsappRowToMessage(row));
    if (new Date(row.created_at).getTime() > new Date(conv.updatedAt).getTime()) {
      conv.updatedAt = row.created_at;
    }
    conversationsByLeadId.set(key, conv);
  }

  // 4b. Después interactions (suman al historial si el lead existe).
  for (const row of ((interactionRows ?? []) as unknown) as LeadInteractionRow[]) {
    if (!row.lead_id) continue;
    const conv =
      conversationsByLeadId.get(row.lead_id) ??
      ({
        id: row.lead_id,
        leadId: row.lead_id,
        channel: "internal",
        status: "open",
        updatedAt: row.created_at,
        messages: [],
      } as Conversation);
    conv.messages.push(interactionRowToMessage(row));
    if (new Date(row.created_at).getTime() > new Date(conv.updatedAt).getTime()) {
      conv.updatedAt = row.created_at;
    }
    conversationsByLeadId.set(row.lead_id, conv);
  }

  // 5. Ordenar mensajes DESC dentro de cada conversación, asignar status
  //    inferido, y devolver lista ordenada por updatedAt DESC.
  const result: Conversation[] = [];
  for (const conv of conversationsByLeadId.values()) {
    conv.messages.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    const lastMsg = conv.messages[0];
    conv.status = inferStatus(lastMsg?.direction ?? null, lastMsg?.at ?? null);
    // Si la conversación no tiene leadId (caso phone fallback), no la
    // devolvemos — no podemos mostrarla en el CRM sin un lead.
    if (conv.leadId) {
      result.push(conv);
    }
  }

  result.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return result;
}

/**
 * Devuelve la conversación completa de UN lead (todos los mensajes).
 * Si no existe, devuelve `undefined`.
 */
export async function getRealConversationForLead(
  leadId: string,
): Promise<Conversation | undefined> {
  if (!checkSupabaseConfig().configured) return undefined;
  const all = await listRealConversations();
  return all.find((c) => c.leadId === leadId);
}

/* ------------------------------------------------------------------ */
/* Escritura (FIX 2026-07-06 conversaciones v2)                        */
/* ------------------------------------------------------------------ */

import { logAdminAction } from "@/lib/crm/audit-server";

/**
 * Input para `appendConversationMessage`.
 *
 * El admin puede registrar un mensaje de texto manualmente cuando
 * recibe una conversación fuera del bot (ej. el lead le escribió
 * por WhatsApp directo al celular del admin, o el admin respondió
 * por WhatsApp Web/Desktop y quiere loggear el contacto).
 *
 * Solo texto (David pidió "solo texto por ahora"). La validación
 * corre server-side en el route handler.
 */
export interface AppendConversationMessageInput {
  /** UUID del lead. Si el lead no tiene historial, se crea el primer
   *  mensaje con este lead_id (la "conversación" se crea implícita
   *  al insertar el primer mensaje). */
  leadId: string;
  /** Cuerpo del mensaje (texto plano). Validación server-side: 1-4000
   *  chars después de trim. */
  body: string;
  /** inbound = el lead habló; outbound = el admin respondió. */
  direction: "inbound" | "outbound";
  /** Teléfono normalizado del lead (E.164 sin `+`, ej. "5216532935492").
   *  Se obtiene del lead en DB si no se pasa. Necesario porque la tabla
   *  tiene `phone_normalized NOT NULL`. */
  phoneNormalized?: string;
  /** Metadata opcional libre que se persiste en la columna `metadata`.
   *  Para distinguir los mensajes manuales del bot, el server pone
   *  `metadata.manual = true` y `metadata.by_email = actorEmail`. */
  metadata?: Record<string, unknown>;
}

export interface AppendConversationMessageResult {
  ok: boolean;
  messageId?: string;
  leadId: string;
  note?: string;
}

/**
 * Append de un mensaje a la conversación de un lead. Si no hay
 * conversación previa, este mensaje es el primero (la conversación
 * se materializa al insertar el primer row).
 *
 * NO es idempotente: si el admin hace 2 clicks, se insertan 2 rows.
 * El bot SÍ es idempotente (por `whatsapp_message_id` UNIQUE); los
 * mensajes manuales desde la UI no tienen wamid, así que aceptamos
 * duplicados si el usuario lo hace.
 *
 * @server
 */
export async function appendConversationMessage(
  input: AppendConversationMessageInput,
  actorEmail: string,
): Promise<AppendConversationMessageResult> {
  if (!checkSupabaseConfig().configured) {
    return {
      ok: false,
      leadId: input.leadId,
      note: "Supabase no configurado (modo demo).",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Resolver phone_normalized si no se pasó (la columna es NOT NULL).
  let phoneNormalized = input.phoneNormalized?.trim() ?? "";
  if (!phoneNormalized) {
    const { data: leadRow, error: leadErr } = await (supabase
      .from("leads") as any)
      .select("phone, phone_normalized")
      .eq("id", input.leadId)
      .maybeSingle();
    if (leadErr) {
      // eslint-disable-next-line no-console
      console.error("[conversations-server] lead lookup falló", {
        code: leadErr.code,
      });
      return { ok: false, leadId: input.leadId, note: "No se pudo leer el lead." };
    }
    if (!leadRow) {
      return { ok: false, leadId: input.leadId, note: "Lead inexistente." };
    }
    phoneNormalized =
      leadRow.phone_normalized?.trim() ||
      leadRow.phone?.replace(/[^0-9]/g, "").trim() ||
      "";
    if (!phoneNormalized) {
      return {
        ok: false,
        leadId: input.leadId,
        note: "El lead no tiene teléfono — no se puede registrar la conversación.",
      };
    }
  }

  // 2. Construir metadata incluyendo marcadores de auditoría.
  const metadata = {
    ...(input.metadata ?? {}),
    manual: true,
    by_email: actorEmail,
    ui_source: "conversations_panel",
    at: new Date().toISOString(),
  };

  // 3. INSERT.
  // Cast a `never` por la misma razón que el query de lectura
  // (tabla no incluida en typegen actual).
  const { data: insertedRow, error: insErr } = await (supabase.from(
    "lead_whatsapp_conversations" as never,
  ) as any)
    .insert({
      lead_id: input.leadId,
      phone_normalized: phoneNormalized,
      direction: input.direction,
      message_type: "text",
      body: input.body.trim(),
      metadata,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !insertedRow) {
    // eslint-disable-next-line no-console
    console.error("[conversations-server] append falló", {
      code: insErr?.code,
      message: insErr?.message,
    });
    return {
      ok: false,
      leadId: input.leadId,
      note: `No se pudo registrar el mensaje (${insErr?.code ?? "sin código"}).`,
    };
  }

  // 4. Audit log (best-effort; si falla no afecta el resultado del append).
  try {
    await logAdminAction({
      actor_email: actorEmail,
      action: "conversation_append_manual",
      entity_type: "lead",
      entity_id: input.leadId,
      metadata: {
        message_id: insertedRow.id,
        direction: input.direction,
        body_length: input.body.trim().length,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[conversations-server] audit log (append) falló", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { ok: true, messageId: insertedRow.id, leadId: input.leadId };
}

/**
 * Soft-delete de TODA la conversación de un lead (todos los
 * mensajes de `lead_whatsapp_conversations` con ese `lead_id`).
 *
 * Preserva los rows (compliance LGPD) — solo marca `deleted_at`,
 * `deleted_by_email`, `delete_reason`. El listado y la UI los
 * filtran con `WHERE deleted_at IS NULL`.
 *
 * Si después se inserta un nuevo mensaje manualmente, ese nuevo
 * mensaje entra con `deleted_at = NULL` (es un row nuevo), por
 * lo que "reabre" la conversación naturalmente.
 *
 * Idempotente: llamar 2 veces seguidas deja el row en el mismo
 * estado (segunda llamada afecta `affected=0`).
 *
 * @server
 */
export async function softDeleteConversation(
  leadId: string,
  actorEmail: string,
  reason?: string,
): Promise<{ ok: boolean; leadId: string; deletedCount: number; note?: string }> {
  if (!checkSupabaseConfig().configured) {
    return {
      ok: false,
      leadId,
      deletedCount: 0,
      note: "Supabase no configurado (modo demo).",
    };
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // Cast a `never` por la razón ya explicada.
  const { data: updatedRows, error: updErr } = await (supabase.from(
    "lead_whatsapp_conversations" as never,
  ) as any)
    .update({
      deleted_at: now,
      deleted_by_email: actorEmail,
      delete_reason: reason ?? null,
    })
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .select("id");

  if (updErr) {
    // eslint-disable-next-line no-console
    console.error("[conversations-server] soft-delete falló", {
      code: updErr.code,
      message: updErr.message,
    });
    return { ok: false, leadId, deletedCount: 0, note: `Error de Supabase (${updErr.code ?? "?"}).` };
  }

  const deletedCount = (updatedRows ?? []).length;

  // Audit log (best-effort).
  try {
    await logAdminAction({
      actor_email: actorEmail,
      action: "conversation_soft_delete",
      entity_type: "lead",
      entity_id: leadId,
      metadata: {
        deleted_count: deletedCount,
        reason: reason ?? null,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[conversations-server] audit log (delete) falló", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { ok: true, leadId, deletedCount };
}