/**
 * Mappers entre filas de Postgres (snake_case) y tipos del dominio (camelCase).
 *
 * Los tipos `MasterclassRow` / `MasterclassRegistrationRow` están definidos
 * manualmente aquí siguiendo el schema de la migración
 * `20260625130000_masterclass_funnel.sql`. Cuando se regeneren los types
 * con `npx supabase gen types typescript --linked`, este archivo debe
 * actualizarse para apuntar a `Database["public"]["Tables"]["..."]["Row"]`
 * (mismo patrón que `leads-mapper.ts`).
 */

import type {
  Masterclass,
  MasterclassRegistration,
  MasterclassStatus,
  MasterclassModality,
  MasterclassRegistrationStatus,
  MasterclassAttendanceStatus,
  MasterclassCommercialStatus,
} from "@/types/masterclass";

/* ------------------------------------------------------------------ */
/* Masterclass row → dominio                                             */
/* ------------------------------------------------------------------ */

export interface MasterclassRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  instructor_name: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  modality: MasterclassModality;
  location: string | null;
  cover_image_url: string | null;
  status: MasterclassStatus;
  cta_label: string;
  created_at: string;
  updated_at: string;
}

export function mapMasterclassRow(row: MasterclassRow): Masterclass {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    instructorName: row.instructor_name,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    modality: row.modality,
    location: row.location,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    ctaLabel: row.cta_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* MasterclassRegistration row → dominio                                */
/* ------------------------------------------------------------------ */

export interface MasterclassRegistrationRow {
  id: string;
  masterclass_id: string;
  lead_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  registration_status: MasterclassRegistrationStatus;
  attendance_status: MasterclassAttendanceStatus;
  commercial_status: MasterclassCommercialStatus;
  source: string;
  utm_source: string | null;
  utm_campaign: string | null;
  consent_to_contact: boolean;
  registered_at: string;
  attended_at: string | null;
  notes: string | null;
}

export function mapMasterclassRegistrationRow(
  row: MasterclassRegistrationRow,
): MasterclassRegistration {
  return {
    id: row.id,
    masterclassId: row.masterclass_id,
    leadId: row.lead_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    registrationStatus: row.registration_status,
    attendanceStatus: row.attendance_status,
    commercialStatus: row.commercial_status,
    source: row.source,
    utmSource: row.utm_source,
    utmCampaign: row.utm_campaign,
    consentToContact: row.consent_to_contact,
    registeredAt: row.registered_at,
    attendedAt: row.attended_at,
    notes: row.notes,
  };
}

/* ------------------------------------------------------------------ */
/* Insert payloads (snake_case, listo para .insert())                    */
/* ------------------------------------------------------------------ */

export interface InsertMasterclassRegistrationPayload {
  masterclass_id: string;
  lead_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  registration_status: MasterclassRegistrationStatus;
  attendance_status: MasterclassAttendanceStatus;
  commercial_status: MasterclassCommercialStatus;
  source: string;
  utm_source: string | null;
  utm_campaign: string | null;
  consent_to_contact: boolean;
}