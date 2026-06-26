/**
 * Operaciones admin sobre leads (server-only).
 *
 * Escrituras que realiza el admin autenticado: cambio de status. Las lecturas
 * (getLeads/getLeadById) viven en leads-server.ts (compartidas con el flujo
 * público). Aquí solo las operaciones que requieren admin.
 *
 * Modelo (D-018): usa createSupabaseAdminClient() (service role, bypass RLS).
 * El `actorEmail` se registra en el audit log y, donde aplica, como
 * created_by_email de entidades relacionadas (interacciones).
 *
 * No implementa fallback demo: las operaciones admin son exclusivamente reales.
 * El caller (route handler) ya validó admin vía requireAdmin().
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { mapLeadRowToLead, type LeadRow } from "./leads-mapper";
import { logAdminAction } from "./audit-server";
import type { Lead, LeadStatus } from "@/types";

/** Resultado de una operación admin sobre un lead. */
export interface AdminLeadOpResult {
  ok: boolean;
  /** Lead actualizado si la op tuvo éxito; undefined si no. */
  lead?: Lead;
  note?: string;
}

/**
 * Valida que un string sea un LeadStatus válido del dominio.
 * Evita aceptar cualquier string y llevarlo a la DB.
 */
const LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "info_requested",
  "payment_pending",
  "enrolled",
  "active_student",
  "lost",
  "archived",
];

function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Cambia el status de un lead. Server-only, admin.
 *
 * @param leadId  UUID del lead.
 * @param status  Nuevo status (validado contra el dominio).
 * @param actorEmail Email del admin (para audit log).
 */
export async function updateLeadStatus(
  leadId: string,
  status: string,
  actorEmail: string,
): Promise<AdminLeadOpResult> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!isLeadStatus(status)) {
    return { ok: false, note: "Status inválido." };
  }
  if (!leadId || !actorEmail) {
    return { ok: false, note: "Faltan datos (leadId/actor)." };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leemos el status actual para el audit log. Sin esto, el audit log
  //    registra "to: X" pero no "from: Y", y no se puede responder
  //    "¿quién cambió este lead de Y a X?". Necesario para trazabilidad
  //    real.
  const { data: prevRow, error: prevErr } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();

  if (prevErr || !prevRow) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] updateLeadStatus: no se pudo leer status previo", {
      code: prevErr?.code,
      leadId,
    });
    return {
      ok: false,
      note: prevErr
        ? "No se pudo leer el lead antes de actualizar."
        : "El lead no existe.",
    };
  }
  const prevStatus = prevRow.status as LeadStatus;

  // 2. UPDATE atómico: solo aplicamos si el status sigue siendo el que
  //    leímos. Si otro admin cambió el status en el medio, `data` viene
  //    vacío y devolvemos conflicto (no silencioso). Esto cierra la race
  //    window entre el SELECT previo y el UPDATE.
  const { data, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("status", prevStatus)
    .select("*")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] updateLeadStatus falló", {
      code: error.code,
      leadId,
    });
    return { ok: false, note: "No se pudo actualizar el lead." };
  }

  if (!data) {
    // El WHERE no matcheó: el status cambió entre nuestro SELECT y el UPDATE.
    return {
      ok: false,
      note: `Conflicto: el lead ya no estaba en "${prevStatus}". Otro proceso pudo haberlo cambiado. Recarga y reintenta.`,
    };
  }

  const lead = mapLeadRowToLead(data as LeadRow);

  // 3. Audit log con from/to reales (trazabilidad útil).
  await logAdminAction({
    actor_email: actorEmail,
    action: "lead_status_change",
    entity_type: "lead",
    entity_id: leadId,
    metadata: { from: prevStatus, to: status },
  });

  return { ok: true, lead };
}

/**
 * Alias semántico de `updateLeadStatus` para el contexto del flujo de
 * eventos (Fase 2). En la terminología del cliente, el campo `status`
 * del lead representa su "estado comercial" en el pipeline de ventas
 * (new → contacted → interested → enrolled, etc.).
 *
 * Por ahora es el mismo campo en la misma tabla; este alias es solo
 * claridad de lectura en el código de eventos. Si en el futuro el
 * pipeline comercial se separa del "status del funnel" (ej. cuando
 * tengamos marketing-qualified vs sales-qualified), se puede partir
 * en una columna `commercial_status` propia sin romper el contrato
 * público de esta función.
 */
export async function updateLeadCommercialStatus(
  leadId: string,
  status: string,
  actorEmail: string,
): Promise<AdminLeadOpResult> {
  return updateLeadStatus(leadId, status, actorEmail);
}
