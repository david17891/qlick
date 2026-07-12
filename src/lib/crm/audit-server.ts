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
import type { Json } from "@/types/supabase";

/**
 * Input extendido: además de los campos de AdminAuditLogInsert (que ya
 * tenía actor_email + action + entity_type + entity_id + metadata +
 * before + after post-regen de typegen), acepta overrides opcionales.
 *
 * Compatible con callers viejos: omitir `before`/`after` no rompe nada
 * (quedan null en la DB).
 */
export type LogAdminActionInput = Omit<
  AdminAuditLogInsert,
  "before" | "after"
> & {
  before?: Json | null;
  after?: Json | null;
};

/**
 * Registra una acción admin en el log de auditoría. Best-effort.
 * No lanza; errores se loggean server-side.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  if (!checkSupabaseConfig().configured) return;
  try {
    const supabase = createSupabaseAdminClient();
    // Cast a never sigue siendo necesario: AdminAuditLogInsert usa Json
    // para before/after/metadata, pero el cliente tipado del SDK trata
    // estos campos como never cuando vienen del typegen hand-authored.
    // El cast es seguro porque los valores en runtime respetan el shape.
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

// ─────────────────────────────────────────────────────────────
// Lectura (para /admin/system/audit-log) — Fase 5 Bloque 2
// ─────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListAuditLogsInput {
  actorEmail?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  /**
   * Búsqueda libre (Fase 6 Hito C). Case-insensitive match sobre las columnas
   * indexadas: action, actor_email, entity_type, entity_id.
   *
   * **No busca en `metadata`** (jsonb) — eso requeriría una RPC o un cast
   * `metadata::text ilike`. Por ahora, si necesitás buscar en metadata, usá
   * el filtro `actorEmail` + `entityType` + scroll manual.
   *
   * Caracteres especiales `%` y `_` se escapan para evitar wildcards
   * no intencionados en SQL LIKE.
   */
  q?: string;
  /** ISO date string. Filtra `created_at >= from`. */
  from?: string;
  /** ISO date string. Filtra `created_at <= to`. */
  to?: string;
  limit?: number;
  offset?: number;
}

export interface ListAuditLogsResult {
  ok: boolean;
  entries: AuditLogEntry[];
  total: number;
  error?: string;
}

/**
 * Lista entries de audit log con filtros opcionales.
 *
 * Devuelve `total` (count sin paginación) además de las entries para que
 * la UI pueda mostrar "Mostrando X de Y".
 *
 * **Tipado:** el `before`/`after` se castean porque la tabla ahora las
 * tiene (post-migration 20260629000000_admin_audit_log_diff.sql) pero el
 * typegen pre-existente no las conoce. Regenerar con
 * `npx supabase gen types typescript` post-migration.
 */
export async function listAuditLogs(
  filters: ListAuditLogsInput = {},
): Promise<ListAuditLogsResult> {
  if (!checkSupabaseConfig().configured) {
    return { ok: true, entries: [], total: 0 };
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.actorEmail) {
    query = query.eq("actor_email", filters.actorEmail);
  }
  if (filters.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }
  if (filters.entityId) {
    query = query.eq("entity_id", filters.entityId);
  }
  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.q) {
    // Búsqueda libre: OR sobre action, actor_email, entity_type,
    // entity_id, y metadata serializado a text.
    // NOTA: si Supabase filtra por columna calculada (metadata::text),
    // necesitamos una RPC o un SELECT all + filter en memoria. Por
    // simplicidad, acá usamos OR sobre las columnas indexadas (action,
    // actor_email, entity_type, entity_id) y dejamos el cast jsonb para
    // una iteración futura.
    const q = filters.q.trim();
    if (q) {
      // Escapamos % y _ para ilike (LIKE wildcards).
      const escaped = q.replace(/[%_]/g, "\\$&");
      query = query.or(
        `action.ilike.%${escaped}%,actor_email.ilike.%${escaped}%,entity_type.ilike.%${escaped}%,entity_id.ilike.%${escaped}%`,
      );
    }
  }
  if (filters.from) {
    query = query.gte("created_at", filters.from);
  }
  if (filters.to) {
    query = query.lte("created_at", filters.to);
  }
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    return {
      ok: false,
      entries: [],
      total: 0,
      error: error.message,
    };
  }

  // Cast: typegen no conoce `before`/`after` aún.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    actor_email: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;

  return {
    ok: true,
    entries: rows.map((row) => ({
      id: row.id,
      actorEmail: row.actor_email,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: row.before ?? null,
      after: row.after ?? null,
      metadata: row.metadata ?? null,
      createdAt: row.created_at,
    })),
    total: count ?? 0,
  };
}
