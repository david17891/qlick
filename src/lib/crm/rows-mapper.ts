/**
 * Mappers snake_case → camelCase para notas y tareas del CRM (v0.5.0).
 *
 * Las filas llegan en el formato físico de la DB (`CrmNoteRow`/`CrmTaskRow` de
 * `crm-rows.ts`, que a su vez derivan del schema en `src/types/supabase.ts`).
 * El drawer de detalle las muestra en camelCase; aquí se aisla la conversión,
 * igual que `leads-mapper.ts` lo hace para `Lead`.
 *
 * Son tipos de VISTA: no viven en el dominio público (`src/types`) porque las
 * notas/tareas son datos internos del CRM, no parte del modelo del producto.
 */

import type {
  CrmNoteRow,
  CrmTaskRow,
  CrmTaskStatus,
  LeadInteractionRow
} from "./crm-rows";

/** Nota lista para renderizar. */
export interface NoteView {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: string;
}

/** Tarea lista para renderizar. */
export interface TaskView {
  id: string;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Interacción lista para renderizar (Bloque 2E — Fase 4). */
export interface InteractionView {
  id: string;
  channel: LeadInteractionRow["channel"];
  direction: LeadInteractionRow["direction"];
  summary: string;
  authorEmail: string;
  createdAt: string;
  metadata: LeadInteractionRow["metadata"];
}

export function mapNoteRow(row: CrmNoteRow): NoteView {
  return {
    id: row.id,
    body: row.body,
    authorEmail: row.created_by_email,
    createdAt: row.created_at,
  };
}

export function mapTaskRow(row: CrmTaskRow): TaskView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.due_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function mapInteractionRow(row: LeadInteractionRow): InteractionView {
  return {
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    summary: row.summary,
    authorEmail: row.created_by_email,
    createdAt: row.created_at,
    metadata: row.metadata,
  };
}
