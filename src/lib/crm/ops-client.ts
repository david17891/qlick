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
import type { Event, EventStatus } from "@/types/events";
import type { CrmNoteRow, CrmTaskRow, LeadInteractionRow } from "./crm-rows";
import type { LeadEventContext } from ".";

/** Canales válidos para crear una interacción (mirror del enum Supabase). */
export type InteractionChannel = "whatsapp" | "email" | "phone" | "form" | "system";
/** Dirección válida (mirror del enum Supabase). */
export type InteractionDirection = "inbound" | "outbound" | "system";

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

/**
 * GET /api/admin/leads/[id]/event-context → contexto del evento del
 * que provino el lead (o null si el lead no tiene origen de evento).
 * Usado por el drawer del CRM para mostrar el badge "📅 Vino de evento X".
 */
export async function fetchEventContext(
  leadId: string,
): Promise<LeadEventContext | null> {
  const res = await fetch(`/api/admin/leads/${leadId}/event-context`, {
    cache: "no-store",
  });
  const data = await parseEnvelope<{
    ok: true;
    context: LeadEventContext | null;
  }>(res);
  return data.context;
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

/** Split de tareas pendientes para el Calendario del CRM. */
export interface PendingTasksSplitClient {
  overdue: CrmTaskRow[];
  upcoming: CrmTaskRow[];
}

/** GET /api/admin/crm/tasks → todas las tareas pendientes particionadas. */
export async function fetchPendingCRMTasks(): Promise<PendingTasksSplitClient> {
  const res = await fetch(`/api/admin/crm/tasks`, { cache: "no-store" });
  const data = await parseEnvelope<{
    ok: true;
    overdue: CrmTaskRow[];
    upcoming: CrmTaskRow[];
  }>(res);
  return { overdue: data.overdue, upcoming: data.upcoming };
}

/* ------------------------------------------------------------------ */
/* Interacciones del lead (Bloque 2E — Fase 4)                        */
/* ------------------------------------------------------------------ */

/** Input para crear una interacción (registrar un contacto outbound/inbound). */
export interface NewInteractionInput {
  summary: string;
  channel?: InteractionChannel;
  direction?: InteractionDirection;
}

/** GET /api/admin/leads/[id]/interactions → historial (snake_case). */
export async function fetchLeadInteractions(leadId: string): Promise<LeadInteractionRow[]> {
  const res = await fetch(`/api/admin/leads/${leadId}/interactions`, {
    cache: "no-store",
  });
  const data = await parseEnvelope<{ ok: true; interactions: LeadInteractionRow[] }>(res);
  return data.interactions;
}

/**
 * POST /api/admin/leads/[id]/interactions → registra un contacto.
 * Devuelve la lista actualizada para que el drawer refresque en una sola llamada.
 */
export async function createLeadInteraction(
  leadId: string,
  input: NewInteractionInput,
): Promise<LeadInteractionRow[]> {
  const res = await fetch(`/api/admin/leads/${leadId}/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseEnvelope<{ ok: true; interactions: LeadInteractionRow[] }>(res);
  return data.interactions;
}

/* ------------------------------------------------------------------ */
/* CRUD admin de eventos                                                */
/* ------------------------------------------------------------------ */

/** Input del form de creación/edición de evento en el panel admin. */
export interface EventFormInput {
  slug: string;
  title: string;
  description?: string;
  startsAt: string; // ISO (datetime-local → new Date().toISOString())
  endsAt?: string;
  location?: string;
  coverImageUrl?: string;
  /** Solo usado al crear; al editar se manda por updateEventStatus. */
  status?: EventStatus;
  /**
   * Reglas de comportamiento del bot (Fase 7b). Se inyecta al prompt
   * del bot cuando el evento está activo.
   */
  eventRules?: {
    personality: string;
    rules: string[];
  };
}

/** POST /api/admin/events → crea un evento. */
export async function createEvent(input: EventFormInput): Promise<Event> {
  const res = await fetch(`/api/admin/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseEnvelope<{ ok: true; event: Event }>(res);
  return data.event;
}

/** PATCH /api/admin/events/[id] → edita campos no-status. */
export async function updateEvent(
  eventId: string,
  patch: Partial<Omit<EventFormInput, "slug" | "status">>,
): Promise<Event> {
  const res = await fetch(`/api/admin/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await parseEnvelope<{ ok: true; event: Event }>(res);
  return data.event;
}

/** PATCH /api/admin/events/[id]/status → cambia status (incluye archivar). */
export async function updateEventStatus(
  eventId: string,
  status: EventStatus,
): Promise<Event> {
  const res = await fetch(`/api/admin/events/${eventId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await parseEnvelope<{ ok: true; event: Event }>(res);
  return data.event;
}

/** DELETE /api/admin/events/[id] → hard delete del evento.
 *  Cascade borra confirmations, attendees, surveys, lead_event_links, etc.
 *  NO reversible — el caller debe pedir confirmación al admin antes. */
export async function deleteEvent(eventId: string): Promise<string> {
  const res = await fetch(`/api/admin/events/${eventId}`, {
    method: "DELETE",
  });
  const data = await parseEnvelope<{ ok: true; note: string }>(res);
  return data.note;
}

/**
 * POST /api/admin/events/[id]/clone → clona un evento.
 * Devuelve el evento nuevo y el sourceEvent original (para mostrar
 * contexto en el toast de éxito).
 */
export async function cloneEvent(eventId: string): Promise<{
  event: Event;
  sourceEvent?: Event;
}> {
  const res = await fetch(`/api/admin/events/${eventId}/clone`, {
    method: "POST",
  });
  const data = await parseEnvelope<{
    ok: true;
    event: Event;
    sourceEvent?: Event;
  }>(res);
  return { event: data.event, sourceEvent: data.sourceEvent };
}

/** Summary devuelto por el import wizard (mirror del server lib). */
export interface ImportSummaryClient {
  batchId: string;
  eventSlug: string;
  importType: "confirmation" | "attendee" | "survey";
  totalRows: number;
  inserted: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  warnings: { row: number; field: string; note: string }[];
  durationMs: number;
}

/** Input del wizard de import. */
export interface ImportInput {
  file: File;
  type: "confirmation" | "attendee" | "survey";
  dryRun: boolean;
  mapOverride?: Record<string, string>;
}

/** POST /api/admin/events/[id]/import → ejecuta o simula el import. */
export async function runEventImport(
  eventId: string,
  input: ImportInput,
): Promise<ImportSummaryClient> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("type", input.type);
  form.append("dryRun", String(input.dryRun));
  if (input.mapOverride) {
    form.append("mapOverride", JSON.stringify(input.mapOverride));
  }
  const res = await fetch(`/api/admin/events/${eventId}/import`, {
    method: "POST",
    body: form,
  });
  const data = await parseEnvelope<{ ok: true; summary: ImportSummaryClient }>(
    res,
  );
  return data.summary;
}

/** Genera un slug URL-safe a partir de un título (kebab-case, sin acentos básicos). */
export function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")    // solo alfanumérico, espacios y guiones
    .replace(/\s+/g, "-")             // espacios → guiones
    .replace(/-+/g, "-")              // guiones repetidos
    .replace(/^-+|-+$/g, "")          // trim de guiones
    .slice(0, 80);
}

/** Convierte "2026-06-28T18:00" (datetime-local) a ISO string con offset Z. */
export function datetimeLocalToIso(local: string): string {
  if (!local) return "";
  // new Date("2026-06-28T18:00") interpreta como local time. Si queremos UTC puro,
  // podríamos ajustar, pero para un evento lo más útil es guardar la hora local del
  // admin interpretándola como local del navegador.
  return new Date(local).toISOString();
}
