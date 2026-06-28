/**
 * Auditoría de acciones admin (server-only).
 *
 * Registra quién (actor_email) hizo qué (action) sobre qué entidad
 * (entity_type/entity_id). Best-effort: si falla, no rompe la operación
 * principal, solo loggea (el audit log es complementario, no crítico).
 *
 * Server-only: usa createSupabaseAdminClient() (service role, bypass RLS).
 *
 * **Fase 5 Bloque 2:** ahora soporta `before` / `after` (snapshots JSONB
 * del estado de la entidad). Permite diff view en
 * `/admin/system/audit-log`. Si no se pasan, quedan null (compatible con
 * callers viejos que no tienen el snapshot).
 *
 * **Tipado:** `before` / `after` se castean a `never` porque la tabla
 * tiene esas columnas pero el typegen generado previamente no las incluye.
 * Regenerar con `npx supabase gen types typescript` post-migration
 * (20260629000000_admin_audit_log_diff.sql) para tipado fuerte.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import type { AdminAuditLogInsert } from "./crm-rows";

/**
 * Input extendido: además de los campos de AdminAuditLogInsert (que ya
 * tenía actor_email + action + entity_type + entity_id + metadata),
 * acepta `before` y `after` para diff view.
 *
 * Compatible con callers viejos: omitir `before`/`after` no rompe nada
 * (quedan null en la DB).
 */
export type LogAdminActionInput = AdminAuditLogInsert & {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/**
 * Registra una acción admin en el log de auditoría. Best-effort.
 * No lanza; errores se loggean server-side.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  if (!checkSupabaseConfig().configured) return;
  try {
    const supabase = createSupabaseAdminClient();
    // Cast: `before`/`after` existen en la DB (post-migration) pero el
    // typegen pre-existente no las conoce. Regenerar types para tipado fuerte.
    const payload = {
      actor_email: input.actor_email.trim().toLowerCase(),
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      metadata: input.metadata ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
    } as never;
    const { error } = await supabase.from("admin_audit_log").insert(payload);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[audit] logAdminAction falló", { code: error.code });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] logAdminAction excepción", err);
  }
}
