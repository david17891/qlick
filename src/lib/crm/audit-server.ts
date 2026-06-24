/**
 * Auditoría de acciones admin (server-only).
 *
 * Registra quién (actor_email) hizo qué (action) sobre qué entidad
 * (entity_type/entity_id). Best-effort: si falla, no rompe la operación
 * principal, solo loggea (el audit log es complementario, no crítico).
 *
 * Server-only: usa createSupabaseAdminClient() (service role, bypass RLS).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import type { AdminAuditLogInsert } from "./crm-rows";

/**
 * Registra una acción admin en el log de auditoría. Best-effort.
 * No lanza; errores se loggean server-side.
 */
export async function logAdminAction(input: AdminAuditLogInsert): Promise<void> {
  if (!checkSupabaseConfig().configured) return;
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("admin_audit_log").insert({
      actor_email: input.actor_email.trim().toLowerCase(),
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      metadata: input.metadata ?? null,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[audit] logAdminAction falló", { code: error.code });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] logAdminAction excepción", err);
  }
}
