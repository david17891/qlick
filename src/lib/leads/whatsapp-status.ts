/**
 * Helpers puros y server lib para el estado de WhatsApp follow-up
 * (Bloque 2 de Fase 4, Sub-bloque C).
 *
 * Estados del flujo: no_contactado -> contactado -> interested | lost.
 * Cada cambio de estado se loggea en `lead_whatsapp_log` (audit append-only).
 *
 * @server
 */

/**
 * Helpers puros y server lib para el estado de WhatsApp follow-up
 * (Bloque 2 de Fase 4, Sub-bloque C).
 *
 * Estados del flujo: no_contactado -> contactado -> interested | lost.
 * Cada cambio de estado se loggea en `lead_whatsapp_log` (audit append-only).
 *
 * NOTA sobre imports: las dependencias de Supabase se importan LAZY
 * (dentro de la funcion) en vez de en el top-level. Esto permite
 * que los helpers puros (isValidWhatsAppStatus, getNextStatusOptions)
 * sean testeables con `node --test` sin cargar el cliente de Supabase.
 *
 * @server
 */

/* ─────────────────────────────────────────────────────────────
 * Constantes y tipos
 * ───────────────────────────────────────────────────────────── */

export const WHATSAPP_STATUSES = [
  "no_contactado",
  "contactado",
  "interested",
  "lost",
] as const;
export type WhatsAppStatus = (typeof WHATSAPP_STATUSES)[number];

export const WHATSAPP_STATUS_LABEL: Record<WhatsAppStatus, string> = {
  no_contactado: "No contactado",
  contactado: "Contactado",
  interested: "Interesado",
  lost: "Perdido",
};

export const WHATSAPP_STATUS_TONE: Record<
  WhatsAppStatus,
  "neutral" | "info" | "success" | "danger"
> = {
  no_contactado: "neutral",
  contactado: "info",
  interested: "success",
  lost: "danger",
};

/* ─────────────────────────────────────────────────────────────
 * Helpers puros (testables sin DB)
 * ───────────────────────────────────────────────────────────── */

export function isValidWhatsAppStatus(s: unknown): s is WhatsAppStatus {
  return (
    typeof s === "string" &&
    (WHATSAPP_STATUSES as readonly string[]).includes(s)
  );
}

/** Devuelve los estados validos siguientes a uno dado (para sugerir transiciones). */
export function getNextStatusOptions(current: WhatsAppStatus): WhatsAppStatus[] {
  switch (current) {
    case "no_contactado":
      return ["contactado"];
    case "contactado":
      return ["interested", "lost", "no_contactado"];
    case "interested":
      return ["contactado", "lost"];
    case "lost":
      return ["contactado", "interested"];
  }
}

/* ─────────────────────────────────────────────────────────────
 * Server lib (mutaciones con audit log)
 * ───────────────────────────────────────────────────────────── */

export interface MarkWhatsAppStatusResult {
  ok: boolean;
  newStatus: WhatsAppStatus | null;
  note: string;
}

export interface MarkWhatsAppStatusInput {
  leadId: string;
  newStatus: WhatsAppStatus;
  actorEmail: string | null;
  /** Preview del mensaje enviado (opcional, primeros 200 chars). */
  messagePreview?: string | null;
  /** ID del evento del que vino el lead (opcional, para trazabilidad). */
  eventId?: string | null;
  /** Metadata libre (jsonb-serializable). */
  metadata?: Record<string, unknown>;
}

/**
 * Cambia el estado de WhatsApp de un lead + loggea el cambio.
 *
 * Patron de transaccion logica (no es una transaction SQL atomica,
 * pero la logica esta en orden para minimizar el drift):
 *   1. SELECT del lead actual (para prev_status).
 *   2. UPDATE leads SET whatsapp_status, last_contacted_at.
 *   3. INSERT en lead_whatsapp_log con prev/new + actor.
 *
 * Si el UPDATE falla, no se inserta log. Si el INSERT falla, el UPDATE
 * ya esta pero el admin puede ver que el log falta. En la practica
 * es seguro: ambas operaciones son idempotentes y la UI muestra
 * ambos estados.
 */
export async function markWhatsAppStatus(
  input: MarkWhatsAppStatusInput,
): Promise<MarkWhatsAppStatusResult> {
  if (!input.leadId) {
    return { ok: false, newStatus: null, note: "Falta leadId." };
  }
  if (!isValidWhatsAppStatus(input.newStatus)) {
    return {
      ok: false,
      newStatus: null,
      note: `Estado invalido: ${String(input.newStatus)}.`,
    };
  }
  // Lazy import: no se carga al importar el modulo. Solo cuando se
  // ejecuta esta funcion. Permite que los helpers puros sean testeables
  // sin Supabase.
  const { checkSupabaseConfig } = await import("../supabase/health");
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  if (!checkSupabaseConfig().configured) {
    return { ok: false, newStatus: null, note: "Supabase no configurado." };
  }
  const supabase = createSupabaseAdminClient();

  // 1. Traer el prev_status.
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, whatsapp_status")
    .eq("id", input.leadId)
    .maybeSingle();
  if (leadErr || !lead) {
    return { ok: false, newStatus: null, note: "Lead no encontrado." };
  }
  const prevStatus = lead.whatsapp_status as string;
  if (prevStatus === input.newStatus) {
    return {
      ok: true,
      newStatus: input.newStatus,
      note: "El estado ya era ese. No se hicieron cambios.",
    };
  }

  // 2. UPDATE el lead.
  const { error: updErr } = await supabase
    .from("leads")
    .update({
      whatsapp_status: input.newStatus,
      last_contacted_at: new Date().toISOString(),
    })
    .eq("id", input.leadId);
  if (updErr) {
    // eslint-disable-next-line no-console
    console.error("[leads/whatsapp-status] markWhatsAppStatus update falló", {
      code: updErr.code,
      leadId: input.leadId,
    });
    return {
      ok: false,
      newStatus: null,
      note: `No se pudo actualizar (${updErr.code ?? "unknown"}).`,
    };
  }

  // 3. INSERT log.
  const { error: logErr } = await supabase.from("lead_whatsapp_log").insert({
    lead_id: input.leadId,
    event_id: input.eventId ?? null,
    new_status: input.newStatus,
    prev_status: prevStatus,
    actor_email: input.actorEmail,
    message_preview: input.messagePreview ?? null,
    // Cast a Json (tipo de la DB). Record<string, unknown> es el shape
    // de la API; el typegen quiere Json.
    metadata: (input.metadata ?? {}) as unknown as import("../../types/supabase").Json,
  });
  if (logErr) {
    // El UPDATE ya paso. Loggeamos el error pero devolvemos OK parcial.
    // El admin ve el estado nuevo en el dropdown y puede consultar el log.
    // eslint-disable-next-line no-console
    console.error("[leads/whatsapp-status] markWhatsAppStatus log falló", {
      code: logErr.code,
      leadId: input.leadId,
    });
  }

  return {
    ok: true,
    newStatus: input.newStatus,
    note: `Estado actualizado a "${WHATSAPP_STATUS_LABEL[input.newStatus]}".`,
  };
}
