/**
 * Tipos del dominio — Masterclass Funnel (v0.6.0).
 *
 * Esta capa representa el modelo de negocio (camelCase, formas estables).
 * La capa física (snake_case, enums de Postgres) se mapea en
 * `src/lib/masterclasses/masterclass-mapper.ts` y se regenera vía
 * `npx supabase gen types typescript --linked` cuando se aplican migraciones.
 *
 * Convención:
 * - Enums: union de strings literales.
 * - Timestamps: ISO 8601 string (lo que devuelve Supabase).
 * - UUIDs: string.
 * - Campos opcionales: `string | null` (al estilo DB) para que el dominio
 *   refleje fielmente la presencia/ausencia en la tabla.
 */

export type MasterclassStatus = "draft" | "published" | "archived";
export type MasterclassModality = "online" | "in_person" | "hybrid";

/** Estado del registro en sí (no confundir con asistencia). */
export type MasterclassRegistrationStatus =
  | "registered"
  | "cancelled"
  | "no_show"
  | "attended";

/** Asistencia: ¿vino a la masterclass? */
export type MasterclassAttendanceStatus = "pending" | "attended" | "no_show";

/** Resultado comercial del seguimiento posterior. */
export type MasterclassCommercialStatus =
  | "new"
  | "interested"
  | "not_interested"
  | "converted"
  | "lost";

/* ------------------------------------------------------------------ */
/* Masterclass — catálogo                                                */
/* ------------------------------------------------------------------ */

export interface Masterclass {
  id: string;
  slug: string;
  title: string;
  /** Eslogan corto debajo del título. */
  subtitle: string | null;
  /** Descripción larga. Markdown/HTML ligero soportado en UI. */
  description: string | null;
  instructorName: string | null;
  /** Cuándo inicia la masterclass. null = por anunciar. */
  startsAt: string | null;
  durationMinutes: number | null;
  modality: MasterclassModality;
  /** Link de Zoom/Meet (online) o dirección (presencial). */
  location: string | null;
  coverImageUrl: string | null;
  status: MasterclassStatus;
  /** Texto del botón de registro. */
  ctaLabel: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* MasterclassRegistration — registro de una persona                     */
/* ------------------------------------------------------------------ */

export interface MasterclassRegistration {
  id: string;
  masterclassId: string;
  /** FK opcional a leads.id. Null si falló la creación del lead. */
  leadId: string | null;
  name: string;
  email: string;
  phone: string | null;
  registrationStatus: MasterclassRegistrationStatus;
  attendanceStatus: MasterclassAttendanceStatus;
  commercialStatus: MasterclassCommercialStatus;
  /** Origen del registro (ej. 'masterclass', 'instagram', 'referral'). */
  source: string;
  utmSource: string | null;
  utmCampaign: string | null;
  /** Consentimiento LFPDPPP. Requerido true para persistir. */
  consentToContact: boolean;
  registeredAt: string;
  /** Cuándo marcó asistencia attended. */
  attendedAt: string | null;
  notes: string | null;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                                */
/* ------------------------------------------------------------------ */

/** Input público del formulario de registro. Validar antes de enviar. */
export interface MasterclassRegistrationInput {
  masterclassId: string;
  name: string;
  email: string;
  phone?: string;
  utmSource?: string;
  utmCampaign?: string;
  /** Requerido: true. El server action lo exige antes de insertar. */
  consentToContact: boolean;
}

export interface CreateMasterclassRegistrationResult {
  ok: boolean;
  /** ID del registration creado. */
  registrationId: string;
  /** ID del lead creado o reutilizado. */
  leadId: string | null;
  /** true si persistió en Supabase; false si cayó a demo. */
  persisted: boolean;
  /** true si fue demo/fallback (compatible con CreateLeadServerResult). */
  demo: boolean;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Updates admin                                                         */
/* ------------------------------------------------------------------ */

export interface UpdateRegistrationStatusInput {
  registrationId: string;
  registrationStatus?: MasterclassRegistrationStatus;
  attendanceStatus?: MasterclassAttendanceStatus;
  commercialStatus?: MasterclassCommercialStatus;
  notes?: string | null;
}

/* ------------------------------------------------------------------ */
/* Listas admin                                                          */
/* ------------------------------------------------------------------ */

/** Vista admin: masterclass + conteo de registrados. */
export interface AdminMasterclassSummary {
  masterclass: Masterclass;
  registrationCount: number;
  attendedCount: number;
  interestedCount: number;
}

/** Vista admin: registration + datos del lead vinculado (si existe). */
export interface AdminRegistrationRow {
  registration: MasterclassRegistration;
  lead: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
  } | null;
}