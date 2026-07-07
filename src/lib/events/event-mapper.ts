/**
 * Mapper entre las filas de Postgres (snake_case) y los tipos del dominio
 * (camelCase) de `src/types/events.ts`.
 *
 * Mantiene la firma pública de los server libs desacoplada del schema
 * físico. Si la migration cambia un nombre de columna, solo se toca acá.
 *
 * Los tipos Row vienen del typegen de Supabase (`src/types/supabase.ts`),
 * así que cualquier cambio de schema se propaga en compilación.
 */

import type { Database } from "@/types/supabase";
import type {
  Event,
  EventBotRules,
  EventConfirmation,
  EventAttendee,
  EventSurvey,
  EventSurveyUnmatched,
  LeadEventLink,
} from "@/types/events";
import { resolveSurveyConfig } from "./survey-config-validator";

// ─────────────────────────────────────────────────────────────
// Row types — derivados del typegen. Single source of truth.
// ─────────────────────────────────────────────────────────────

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type EventConfirmationRow =
  Database["public"]["Tables"]["event_confirmations"]["Row"];
export type EventAttendeeRow =
  Database["public"]["Tables"]["event_attendees"]["Row"];
export type EventSurveyRow =
  Database["public"]["Tables"]["event_surveys"]["Row"];
export type EventSurveyUnmatchedRow =
  Database["public"]["Tables"]["event_survey_unmatched"]["Row"];
export type LeadEventLinkRow =
  Database["public"]["Tables"]["lead_event_links"]["Row"];

// ─────────────────────────────────────────────────────────────
// Mappers row → dominio
// ─────────────────────────────────────────────────────────────

export function mapEventRowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    slug: row.slug,
    // FIX 2026-07-05 (sesión David, ya-esta-registrado por nombre duplicado):
    // `short_code` agregado en migration 20260705120000. El typegen puede no
    // incluirlo todavía (se regenera con `npx supabase gen types`); casteamos
    // con `as never` para no romper builds mientras el typegen queda stale.
    shortCode: (row as unknown as { short_code?: string | null }).short_code ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    location: row.location ?? undefined,
    // FIX 2026-07-07 (feat/eventos-virtual-y-formato): typegen queda stale
    // hasta que David regenere con `npx supabase gen types`. Cast seguro
    // siguiendo el patrón de `short_code` y `survey_config`.
    format:
      ((row as unknown as { format?: Event["format"] }).format as Event["format"]) ??
      "in_person",
    streamingUrl: (row as unknown as { streaming_url?: string | null })
      .streaming_url ?? undefined,
    streamingProvider: (row as unknown as {
      streaming_provider?: Event["streamingProvider"];
    }).streaming_provider as Event["streamingProvider"] | undefined,
    streamingAccessNote: (row as unknown as { streaming_access_note?: string | null })
      .streaming_access_note ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventRules: normalizeEventRules(row.event_rules),
    // FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 3): el typegen
    // puede no incluir `survey_config` todavía (migration 20260705220000).
    // Casteamos con `as never` para no romper builds mientras el typegen
    // queda stale. Cuando David regenere el typegen, este cast se quita.
    surveyConfig: resolveSurveyConfig(
      (row as unknown as { survey_config?: unknown }).survey_config,
    )
  };
}

/**
 * Normaliza el jsonb de `event_rules` al shape `EventBotRules`.
 * Si la DB tiene null, {} o un shape raro, devolvemos defaults seguros.
 */
export function normalizeEventRules(
  raw: unknown,
): EventBotRules {
  if (!raw || typeof raw !== "object") {
    return { personality: "", rules: [] };
  }
  const obj = raw as { personality?: unknown; rules?: unknown };
  return {
    personality: typeof obj.personality === "string" ? obj.personality : "",
    rules: Array.isArray(obj.rules)
      ? obj.rules.filter((r) => typeof r === "string" && r.trim().length > 0)
      : []
  };
}

export function mapEventConfirmationRowToEventConfirmation(
  row: EventConfirmationRow,
): EventConfirmation {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    email: row.email ?? undefined,
    phoneRaw: row.phone_raw ?? undefined,
    phoneNormalized: row.phone_normalized ?? undefined,
    source: row.source,
    confirmedAt: row.confirmed_at,
    importBatchId: row.import_batch_id ?? undefined,
  };
}

export function mapEventAttendeeRowToEventAttendee(
  row: EventAttendeeRow,
): EventAttendee {
  return {
    id: row.id,
    eventId: row.event_id,
    confirmationId: row.confirmation_id ?? undefined,
    name: row.name ?? undefined,
    email: row.email ?? undefined,
    phoneNormalized: row.phone_normalized ?? undefined,
    checkedInAt: row.checked_in_at,
    checkedInBy: row.checked_in_by ?? undefined,
    source: row.source,
    importBatchId: row.import_batch_id ?? undefined,
  };
}

export function mapEventSurveyRowToEventSurvey(
  row: EventSurveyRow,
): EventSurvey {
  return {
    id: row.id,
    eventId: row.event_id,
    confirmationId: row.confirmation_id ?? undefined,
    attendeeId: row.attendee_id ?? undefined,
    respondentEmail: row.respondent_email ?? undefined,
    respondentPhone: row.respondent_phone ?? undefined,
    phoneNormalized: row.phone_normalized ?? undefined,
    responses: (row.responses ?? {}) as Record<string, unknown>,
    consentToContact: row.consent_to_contact,
    commercialInterest: row.commercial_interest ?? undefined,
    submittedAt: row.submitted_at,
    importBatchId: row.import_batch_id ?? undefined,
    promotedToLeadId: row.promoted_to_lead_id ?? undefined,
    promotedAt: row.promoted_at ?? undefined,
    // Capa 4: reviewed_at + reviewed_by (agregados por migration 20260627020000).
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
  };
}

export function mapEventSurveyUnmatchedRowToEventSurveyUnmatched(
  row: EventSurveyUnmatchedRow,
): EventSurveyUnmatched {
  return {
    id: row.id,
    surveyId: row.survey_id,
    // El typegen tiene `reason: string` por simplicidad. En runtime el valor
    // es uno de los del union `EventSurveyUnmatchedReason`. Si la DB tiene un
    // valor fuera del union (no debería pasar), lo casteamos con seguridad.
    reason: row.reason as EventSurveyUnmatched["reason"],
    createdAt: row.created_at,
  };
}

export function mapLeadEventLinkRowToLeadEventLink(
  row: LeadEventLinkRow,
): LeadEventLink {
  return {
    id: row.id,
    leadId: row.lead_id,
    eventId: row.event_id,
    linkType: row.link_type,
    linkId: row.link_id,
    createdAt: row.created_at,
  };
}
