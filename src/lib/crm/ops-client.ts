/**
 * Helpers client-side para las operaciones CRM del admin (v0.5.0, Checkpoint 3c).
 *
 * Cada función llama a un route handler `/api/admin/leads/[id]/*` (protegido por
 * middleware + `requireAdmin()`) y devuelve los datos tipados, o lanza con un
 * mensaje accionable si la respuesta no es 2xx o viene `{ ok: false }`.
 *
 * El caller (el drawer) es quien lleva la máquina de estados UI (`OpStatus`);
 * aquí no hay lógica de presentación. Patrón análogo al server action del
 * ContactForm, pero por HTTP porque el drawer es un Client Component.
 *
 * Las filas de notas/tareas llegan en snake_case (schema físico); el drawer las
 * mapea a vista con `rows-mapper.ts`.
 */

import type { Lead, LeadStatus } from "@/types";
import type { CrmNoteRow, CrmTaskRow } from "./crm-rows";

/** Máquina de estados para cada operación del drawer. */
export type OpStatus = "idle" | "loading" | "success" | "error";

/** Payload de creación de tarea desde el formulario del drawer. */
export interface NewTaskInput {
  title: string;
  description?: string;
  dueAt?: string;
}

/** Respuesta envolvente estándar de los routes admin. */
interface ApiEnvelope {
  ok: boolean;
  error?: string;
}

async function parseEnvelope<T extends ApiEnvelope>(
  res: Response,
): Promise<T> {
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new Error("Respuesta inválida del servidor.");
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Error (${res.status}).`);
  }
  return data;
}

/** PATCH /api/admin/leads/[id] → cambia el status; devuelve el Lead actualizado. */
export async function patchLeadStatus(
  leadId: string,
  status: LeadStatus,
): Promise<Lead> {
  const res = await fetch(`/api/admin/leads/${leadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await parseEnvelope<{ ok: true; lead: Lead }>(res);
  return data.lead;
}

/** GET /api/admin/leads/[id]/notes → lista de notas (snake_case). */
export async function fetchLeadNotes(leadId: string): Promise<CrmNoteRow[]> {
  const res = await fetch(`/api/admin/leads/${leadId}/notes`, {
    cache: "no-store",
  });
  const data = await parseEnvelope<{ ok: true; notes: CrmNoteRow[] }>(res);
  return data.notes;
}

/** POST /api/admin/leads/[id]/notes → crea una nota; la devuelve. */
export async function createLeadNote(
  leadId: string,
  body: string,
): Promise<CrmNoteRow> {
  const res = await fetch(`/api/admin/leads/${leadId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  const data = await parseEnvelope<{ ok: true; note: CrmNoteRow }>(res);
  return data.note;
}

/** GET /api/admin/leads/[id]/tasks → lista de tareas (snake_case). */
export async function fetchLeadTasks(leadId: string): Promise<CrmTaskRow[]> {
  const res = await fetch(`/api/admin/leads/${leadId}/tasks`, {
    cache: "no-store",
  });
  const data = await parseEnvelope<{ ok: true; tasks: CrmTaskRow[] }>(res);
  return data.tasks;
}

/** POST /api/admin/leads/[id]/tasks → crea una tarea; la devuelve. */
export async function createLeadTask(
  leadId: string,
  input: NewTaskInput,
): Promise<CrmTaskRow> {
  const res = await fetch(`/api/admin/leads/${leadId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseEnvelope<{ ok: true; task: CrmTaskRow }>(res);
  return data.task;
}
