/**
 * Mapper entre la fila de Postgres (snake_case) y el tipo `Lead` (camelCase)
 * de `src/types/crm.ts`.
 *
 * Mantiene la firma pública del CRM (camelCase) desacoplada del schema físico
 * de la DB. Si la migración cambia un nombre de columna, solo se toca aquí.
 */

import type {
  Lead,
  LeadStatus,
  LeadSource,
  LeadIntent,
} from "@/types";

/**
 * Forma de una fila de la tabla `public.leads` tal como la devuelve Supabase.
 * Alineada con supabase/migrations/20260623000001_init_leads.sql.
 */
export interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  course_of_interest: string | null;
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  owner_id: string | null;
  tags: string[] | null;
  summary: string | null;
  estimated_value_mxn: number | null;
  next_follow_up_at: string | null;
  consent_to_contact: boolean;
  message: string | null;
  created_at: string;
  updated_at: string;
}

/** Convierte una fila de la DB a un `Lead` del dominio. */
export function mapLeadRowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    courseOfInterest: row.course_of_interest ?? undefined,
    status: row.status,
    source: row.source,
    intent: row.intent,
    ownerId: row.owner_id ?? undefined,
    tags: row.tags ?? undefined,
    summary: row.summary ?? undefined,
    estimatedValueMXN:
      row.estimated_value_mxn == null ? undefined : Number(row.estimated_value_mxn),
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
    consentToContact: row.consent_to_contact,
    // `message` no se expone en el tipo Lead (privacidad); queda en la DB.
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Payload de inserción desde el formulario. La columna `message` se conserva
 * aquí (no en Lead) para que el texto del lead quede registrado pero no sea
 * accesible por el dominio público.
 */
export interface InsertLeadPayload {
  name: string;
  email: string;
  phone: string | null;
  course_of_interest: string | null;
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  consent_to_contact: boolean;
  message: string | null;
}
