/**
 * Tipos del dominio de Eventos (Fase 3 — Events Funnel Foundation).
 *
 * Modelo basado en `docs/EVENTS_FUNNEL_CONCEPT.md` (Fase 1 conceptual)
 * y extendido en `docs/EVENTS_FUNNEL_FOUNDATION.md` (Fase 3 implementación).
 *
 * Estos tipos son la fuente de verdad del modelo de eventos. El mapper
 * `src/lib/events/event-mapper.ts` convierte entre estos tipos y las filas
 * de la DB (snake_case, derivadas del typegen de Supabase).
 *
 * Privacidad: este módulo es puro (sin imports de runtime). Los datos
 * nunca salen del server. Los server libs validan consentimiento antes
 * de promover una encuesta a lead (regla inquebrantable de Fase 0).
 */

/* ------------------------------------------------------------------ */
/* Catálogos base (uniones literales)                                  */
/* ------------------------------------------------------------------ */

/** Estado del evento en el ciclo de vida. */
export type EventStatus = "draft" | "published" | "archived";

/** Cómo entró la confirmación al sistema (auditoría). */
export type EventConfirmationSource =
  | "imported_excel"
  | "public_form"
  | "manual";

/** Cómo se registró la asistencia (auditoría). */
export type EventAttendeeSource =
  | "check_in"
  | "imported_excel"
  | "zoom_export"
  | "manual";

/** Tipo de vínculo lead ↔ event record (para `lead_event_links`). */
export type LeadEventLinkType = "confirmation" | "attendee" | "survey";

/** Por qué una encuesta con interés comercial NO se promovió a lead. */
export type EventSurveyUnmatchedReason =
  | "no_consent"           // falta consent_to_contact=true
  | "no_email_no_phone"    // no se puede identificar al prospecto
  | "no_interest";         // no mencionó interés comercial

/** Tipos de import que soporta el importador CLI. */
export type EventImportType = "confirmation" | "attendee" | "survey";

/* ------------------------------------------------------------------ */
/* Evento (catálogo)                                                   */
/* ------------------------------------------------------------------ */

export interface Event {
  id: string;
  /** URL-safe identifier único. Base de la URL pública. */
  slug: string;
  /** Título visible. */
  title: string;
  description?: string;
  /** Inicio del evento (ISO). */
  startsAt: string;
  /** Fin del evento (ISO). Opcional (eventos sin hora de cierre). */
  endsAt?: string;
  /** Lugar físico o link de Zoom/Meet. */
  location?: string;
  /** URL de la imagen de portada. */
  coverImageUrl?: string;
  /** Estado de publicación. Solo `published` es lectura pública. */
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Confirmaciones                                                      */
/* ------------------------------------------------------------------ */

/**
 * Persona que confirmó asistencia al evento.
 *
 * Importante: NO es un lead. Son prospectos en frío. Solo se vuelven
 * leads cuando responden la encuesta con consent_to_contact=true
 * (ver `EventSurvey` y la lógica de `promotion.ts`).
 */
export interface EventConfirmation {
  id: string;
  eventId: string;
  name: string;
  email?: string;
  /** Tal como vino del Excel o form (ej. "33 1234 5678"). */
  phoneRaw?: string;
  /** Canónico E.164 MX: "+52XXXXXXXXXX". Lo usa el cross-check. */
  phoneNormalized?: string;
  source: EventConfirmationSource;
  confirmedAt: string;
  /** Agrupa filas del mismo import (rollback por batch). */
  importBatchId?: string;
}

/* ------------------------------------------------------------------ */
/* Asistentes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Persona que realmente asistió.
 *
 * Puede NO matchear con `EventConfirmation` (la persona pudo haberse
 * presentado sin confirmar antes). En ese caso `confirmationId` queda NULL
 * y `name`/`email`/`phoneNormalized` se llenan desde el check-in / Excel.
 */
export interface EventAttendee {
  id: string;
  eventId: string;
  confirmationId?: string;
  name?: string;
  email?: string;
  phoneNormalized?: string;
  checkedInAt: string;
  /** Email del admin que marcó (audit). */
  checkedInBy?: string;
  source: EventAttendeeSource;
  importBatchId?: string;
}

/* ------------------------------------------------------------------ */
/* Encuestas                                                           */
/* ------------------------------------------------------------------ */

/**
 * Respuesta de encuesta post-evento.
 *
 * Esta es la pieza que gatilla el consent_to_contact y la promoción
 * a lead. Sin `consentToContact: true`, NO se promueve (regla D-1
 * del concept).
 */
export interface EventSurvey {
  id: string;
  eventId: string;
  confirmationId?: string;
  attendeeId?: string;
  respondentEmail?: string;
  respondentPhone?: string;
  phoneNormalized?: string;
  /** Respuestas crudas (jsonb de la DB). Shape libre por evento. */
  responses: Record<string, unknown>;
  /** Campo clave: sin true, NO se promueve a lead. */
  consentToContact: boolean;
  commercialInterest?: string;
  submittedAt: string;
  importBatchId?: string;
  /** Si se promovió a lead, el ID del lead creado. */
  promotedToLeadId?: string;
  promotedAt?: string;
  /**
   * Si el admin ya marcó esta encuesta como revisada, timestamp de
   * cuándo. NULL = pendiente. Agregado en migration 20260627020000
   * (Capa 4 de Fase 4).
   */
  reviewedAt?: string;
  /** Email del admin que la marcó. Metadata interna. */
  reviewedBy?: string;
}

/* ------------------------------------------------------------------ */
/* Encuestas no promovidas (visibilidad admin)                         */
/* ------------------------------------------------------------------ */

/**
 * Encuesta con interés comercial que NO se promovió a lead.
 *
 * Se guarda para que el admin pueda reportar "tuviste X respuestas
 * con interés pero sin consentimiento" — útil para feedback al cliente
 * sobre cómo conseguir más consent explícito.
 */
export interface EventSurveyUnmatched {
  id: string;
  surveyId: string;
  reason: EventSurveyUnmatchedReason;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Lead ↔ event link (join table)                                       */
/* ------------------------------------------------------------------ */

/**
 * Vínculo entre un lead y un record de evento.
 *
 * Reemplaza el STUB tag-based de Fase 2 (`linkLeadToEventRecord` en
 * `leads-server.ts`). Cierra el H2 del QA round 1 (race condition en
 * tags) por construcción: esta tabla es INSERT-only, no UPDATE, así
 * que dos requests concurrentes pueden agregar links sin conflicto.
 *
 * `linkId` es FK lógica (no enforced) al id del record según `linkType`:
 * - `confirmation` → `event_confirmations.id`
 * - `attendee`     → `event_attendees.id`
 * - `survey`       → `event_surveys.id`
 */
export interface LeadEventLink {
  id: string;
  leadId: string;
  eventId: string;
  linkType: LeadEventLinkType;
  linkId: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Resultado de import                                                 */
/* ------------------------------------------------------------------ */

/**
 * Resumen de un import del Excel. Lo devuelve el importador CLI y los
 * server libs. Permite al admin ver qué se importó, qué se saltó por
 * duplicado, y qué falló por data quality.
 */
export interface EventImportSummary {
  /** ID del batch (todas las filas del mismo import comparten este ID). */
  batchId: string;
  /** Slug del evento al que se importó. */
  eventSlug: string;
  /** Tipo de record importado. */
  importType: EventImportType;
  /** Filas leídas del Excel. */
  totalRows: number;
  /** Filas insertadas en la DB. */
  inserted: number;
  /** Filas saltadas porque ya existían (dedup). */
  skippedDuplicates: number;
  /** Filas saltadas por data quality (ej. email inválido, phone no normalizable). */
  skippedInvalid: number;
  /** Warnings de data quality (no bloquean el import). */
  warnings: ImportWarning[];
  /** Duración en ms. */
  durationMs: number;
}

export interface ImportWarning {
  /** Número de fila del Excel (1-indexed, contando desde el header). */
  row: number;
  /** Campo problemático (ej. "phone", "email"). */
  field: string;
  /** Valor recibido (sin PII, solo shape). */
  note: string;
}
