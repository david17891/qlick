/**
 * Tipos de fila para las tablas de operaciones CRM (v0.5.0).
 *
 * Estas tablas (crm_notes, crm_tasks, lead_interactions, admin_audit_log) se
 * definen en `supabase/migrations/20260624000001_crm_operations_tables.sql` y
 * están declaradas en `src/types/supabase.ts` (hand-authored, fieles al SQL;
 * tras aplicar la migración, `gen types` producirá las mismas formas).
 *
 * Derivamos de los helpers `Tables`/`TablesInsert`/`TablesUpdate`/`Enums` de
 * supabase.ts para tener una única fuente de verdad y type-safety de punta a
 * punta en el query builder del cliente admin.
 *
 * snake_case intencional para coincidir con el schema físico.
 */

import type {
  Enums,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/types/supabase";

export type CrmTaskStatus = Enums<"crm_task_status">;
export type InteractionChannel = Enums<"interaction_channel">;
export type InteractionDirection = Enums<"interaction_direction">;

/** Fila de public.crm_notes. */
export type CrmNoteRow = Tables<"crm_notes">;
/** Payload de inserción de nota. */
export type CrmNoteInsert = TablesInsert<"crm_notes">;

/** Fila de public.crm_tasks. */
export type CrmTaskRow = Tables<"crm_tasks">;
/** Payload de inserción de tarea. */
export type CrmTaskInsert = TablesInsert<"crm_tasks">;
/** Actualización parcial de tarea (status y completed_at). */
export type CrmTaskUpdate = TablesUpdate<"crm_tasks">;

/** Fila de public.lead_interactions. */
export type LeadInteractionRow = Tables<"lead_interactions">;
/** Payload de inserción de interacción. */
export type LeadInteractionInsert = TablesInsert<"lead_interactions">;

/** Fila de public.admin_audit_log. */
export type AdminAuditLogRow = Tables<"admin_audit_log">;
/** Payload de inserción de audit log. */
export type AdminAuditLogInsert = TablesInsert<"admin_audit_log">;
