/**
 * Tareas de seguimiento del CRM por lead (server-only).
 *
 * Server-only: usa el cliente admin (service role, bypass RLS).
 * El caller valida admin.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import type {
  CrmTaskRow,
  CrmTaskInsert,
  CrmTaskUpdate,
  CrmTaskStatus,
} from "./crm-rows";

/** Devuelve las tareas de un lead, ordenadas por vencimiento asc. */
export async function getLeadTasks(leadId: string): Promise<CrmTaskRow[]> {
  if (!checkSupabaseConfig().configured || !leadId) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("lead_id", leadId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[tasks] getLeadTasks falló", { code: error.code, leadId });
    return [];
  }
  return data ?? [];
}

/** Resultado de getAllPendingTasks: partición por estado temporal. */
export interface PendingTasksSplit {
  /** Tareas pendientes con due_at < ahora. */
  overdue: CrmTaskRow[];
  /** Tareas pendientes con due_at >= ahora O sin due_at. */
  upcoming: CrmTaskRow[];
}

/**
 * Lista TODAS las tareas pendientes (status='pending') de todos los leads,
 * particionándolas en vencidas vs próximas. Las tareas sin due_at caen en
 * `upcoming` (no se pueden vencer si no tienen fecha).
 *
 * Server-only: usa el cliente admin (bypass RLS). El caller valida admin.
 */
export async function getAllPendingTasks(): Promise<PendingTasksSplit> {
  const empty: PendingTasksSplit = { overdue: [], upcoming: [] };
  if (!checkSupabaseConfig().configured) return empty;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[tasks] getAllPendingTasks falló", { code: error.code });
    return empty;
  }
  const rows = data ?? [];
  const now = Date.now();
  const overdue: CrmTaskRow[] = [];
  const upcoming: CrmTaskRow[] = [];
  for (const row of rows) {
    if (row.due_at && new Date(row.due_at).getTime() < now) {
      overdue.push(row);
    } else {
      upcoming.push(row);
    }
  }
  return { overdue, upcoming };
}

/** Crea una tarea. title sanitizado. */
export async function createCRMTask(
  input: {
    leadId: string;
    title: string;
    description?: string;
    dueAt?: string;
  },
  actorEmail: string,
): Promise<{ ok: boolean; task?: CrmTaskRow; error?: string }> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado." };
  }
  const title = input.title?.trim().slice(0, 300) ?? "";
  if (!title) return { ok: false, error: "Título vacío." };
  if (!input.leadId || !actorEmail) {
    return { ok: false, error: "Faltan datos (leadId/actor)." };
  }

  const payload: CrmTaskInsert = {
    lead_id: input.leadId,
    title,
    description: input.description?.trim().slice(0, 2000) || null,
    due_at: input.dueAt || null,
    created_by_email: actorEmail.trim().toLowerCase(),
  };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_tasks")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[tasks] createCRMTask falló", { code: error?.code });
    return { ok: false, error: "No se pudo crear la tarea." };
  }
  return { ok: true, task: data };
}

const TASK_STATUSES: readonly CrmTaskStatus[] = [
  "pending",
  "completed",
  "cancelled",
];

/** Actualiza el status de una tarea (y completed_at si corresponde). */
export async function updateTaskStatus(
  taskId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado." };
  }
  if (!TASK_STATUSES.includes(status as CrmTaskStatus)) {
    return { ok: false, error: "Status inválido." };
  }
  const next = status as CrmTaskStatus;
  const update: CrmTaskUpdate = {
    status: next,
    completed_at: next === "completed" ? new Date().toISOString() : null,
  };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("crm_tasks")
    .update(update)
    .eq("id", taskId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[tasks] updateTaskStatus falló", { code: error.code });
    return { ok: false, error: "No se pudo actualizar la tarea." };
  }
  return { ok: true };
}
