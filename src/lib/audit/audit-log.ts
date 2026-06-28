/**
 * Admin audit log (Fase 5 Bloque 2).
 *
 * Server-only. Tabla `public.admin_audit_log` (ver migration
 * `20260629000000_admin_audit_log.sql`).
 *
 * Diseño:
 * - **Escritura**: solo server-side via service role (`createSupabaseAdminClient`).
 *   El código cliente NO escribe (no hay policy de INSERT). Fail-closed.
 * - **Lectura**: server-side via service role para `/admin/system/audit-log`.
 *   UI filtra por actor / entity / action / rango de fecha.
 *
 * **Por qué `before` y `after` son JSONB snapshots:**
 * - Permite diff view (modal antes/después) sin tener que re-fetchear.
 * - Si el record se borra después, el audit log conserva el estado.
 * - Costo de storage: ~1KB por entry. Con 100 cambios/día ≈ 36MB/año.
 *
 * **Acciones (convencional):**
 * - `event.create`, `event.update`, `event.archive`, `event.reactivate`,
 *   `event.publish`, `event.unpublish`, `event.clone`
 * - `lead.create`, `lead.update`, `lead.archive`
 * - `interaction.create`
 * - etc. La columna es libre (`text`) — no enum para flexibilidad.
 *
 * **Testing:**
 * - Paths con DB real (Supabase + tabla migrada): se testean manualmente
 *   desde el flujo de creación/edición de eventos y verificando que
 *   `/admin/system/audit-log` muestra las entries.
 * - Paths demo-mode (sin Supabase): testeables solo si la cadena de
 *   imports no tiene paths sin `.ts` (limitación del `--strip-types`
 *   de Node). Hoy `supabase/admin.ts` importa `./config` (sin
 *   extensión), lo cual rompe la importación transitiva. Por eso NO
 *   hay `tests/audit-log.test.mjs` todavía. Migrar a tests cuando se
 *   refactoree la cadena de imports o se configure tsx con paths alias.
 *
 * @server
 */

import { createSupabaseAdminClient } from "../supabase/admin.ts";
import { checkSupabaseConfig } from "../supabase/health.ts";

export type AuditEntityType =
  | "event"
  | "lead"
  | "survey"
  | "interaction"
  | "note"
  | "task";

export type AuditAction =
  | "event.create"
  | "event.update"
  | "event.archive"
  | "event.reactivate"
  | "event.publish"
  | "event.unpublish"
  | "event.clone"
  | "lead.create"
  | "lead.update"
  | "lead.archive"
  | "interaction.create"
  | "note.create"
  | "task.create";

export interface AuditMetadata {
  /** IP del admin que hizo el cambio (best-effort, puede ser null). */
  ip?: string | null;
  /** User agent del browser. */
  userAgent?: string | null;
  /** Cualquier info extra específica de la acción. */
  [key: string]: unknown;
}

export interface RecordAuditLogInput {
  actorEmail: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  /** Snapshot del estado anterior. null en create. */
  before?: Record<string, unknown> | null;
  /** Snapshot del estado nuevo. null en delete. */
  after?: Record<string, unknown> | null;
  /** Metadata extra (IP, UA, batch_id si es bulk, etc.). */
  metadata?: AuditMetadata;
}

export interface RecordAuditLogResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Inserta una entry en `admin_audit_log`.
 *
 * Best-effort: si la tabla no existe (migration no aplicada) o si hay
 * error de DB, NO propaga. El caller puede asumir que la acción principal
 * ya pasó; el audit log es secundario.
 *
 * **Por qué silencioso:** si falla el audit, no queremos que la
 * creación/edición del evento se rompa. El admin puede ver el problema
 * en logs / Supabase Dashboard.
 */
export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<RecordAuditLogResult> {
  if (!checkSupabaseConfig().configured) {
    // En demo mode, loggeamos local pero no escribimos a DB.
    // eslint-disable-next-line no-console
    console.log(
      `[audit/dev] actor=${input.actorEmail} action=${input.action} entity=${input.entityType}/${input.entityId} (no DB, demo mode)`,
    );
    return { ok: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    // Cast a any: la tabla es nueva (migration 20260629000000) y el typegen
    // generado previamente no la incluye. Regenerar con
    // `npx supabase gen types typescript` después de aplicar la migration
    // para tipado fuerte.
    const insertPayload = {
      actor_email: input.actorEmail,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? {},
    };
    const { data, error } = await supabase
      .from("admin_audit_log")
      .insert(insertPayload as never)
      .select("id")
      .single();
    if (error || !data) {
      // eslint-disable-next-line no-console
      console.warn(
        `[audit] recordAuditLog falló: ${error?.code ?? "unknown"} — ${error?.message ?? "(no message)"}`,
      );
      return {
        ok: false,
        error: error?.message ?? "Unknown error",
      };
    }
    return { ok: true, id: data.id as string };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[audit] recordAuditLog threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Lectura (para /admin/system/audit-log)
// ─────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ListAuditLogsInput {
  actorEmail?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
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

/** Row cruda de la DB. Cast porque la tabla es nueva y el typegen no la
 *  conoce hasta que se regenere con `supabase gen types` post-migration. */
interface RawAuditLogRow {
  id: string;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Lista entries de audit log con filtros opcionales.
 *
 * Devuelve total (count sin paginación) además de las entries para que
 * la UI pueda mostrar "Mostrando X de Y".
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

  // Cast porque la tabla es nueva (migration 20260629000000) y el typegen
  // no la incluye todavía. Regenerar types con `npx supabase gen types
  // typescript` después de aplicar la migration en Supabase.
  const rows = (data ?? []) as unknown as RawAuditLogRow[];

  return {
    ok: true,
    entries: rows.map((row) => ({
      id: row.id,
      actorEmail: row.actor_email,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: row.before,
      after: row.after,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    })),
    total: count ?? 0,
  };
}