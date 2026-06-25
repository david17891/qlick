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
  const { data, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .select("*")
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] updateLeadStatus falló", {
      code: error?.code,
      leadId,
    });
    return { ok: false, note: "No se pudo actualizar el lead." };
  }

  const lead = mapLeadRowToLead(data as LeadRow);

  // Audit log best-effort + interacción del sistema.
  await logAdminAction({
    actor_email: actorEmail,
    action: "lead_status_change",
    entity_type: "lead",
    entity_id: leadId,
    metadata: { from: undefined, to: status },
  });

  return { ok: true, lead };
}
