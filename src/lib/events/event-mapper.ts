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
    shortCode: row.short_code ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    location: row.location ?? undefined,
    // Streaming (migration 20260707000000). Typegen regenerado 2026-07-07,
    // columnas disponibles nativamente en row.
    format: row.format ?? "in_person",
    streamingUrl: row.streaming_url ?? undefined,
    streamingProvider: row.streaming_provider ?? undefined,
    streamingAccessNote: row.streaming_access_note ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    // Pago (migration 20260714230000). Typegen puede estar stale (las
    // columnas son nuevas), asi que casteamos el row a `Record<string,
    // unknown>` y leemos con fallback. Si la columna no esta, queda
    // undefined → evento se trata como gratuito por default.
    priceMXN:
      typeof (row as Record<string, unknown>).price_mxn === "string"
        ? Number((row as Record<string, unknown>).price_mxn)
        : typeof (row as Record<string, unknown>).price_mxn === "number"
          ? ((row as Record<string, unknown>).price_mxn as number)
          : undefined,
    currency:
      typeof (row as Record<string, unknown>).currency === "string"
        ? ((row as Record<string, unknown>).currency as string)
        : "MXN",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventRules: normalizeEventRules(row.event_rules),
    surveyConfig: resolveSurveyConfig(row.survey_config, row.format),
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
  const obj = raw as {
    personality?: unknown;
    rules?: unknown;
    payment_mode?: unknown;
    reservation_enabled?: unknown;
    reservation_amount_mxn?: unknown;
    balance_amount_mxn?: unknown;
    balance_due_note?: unknown;
  };
  const normalized: EventBotRules = {
    personality: typeof obj.personality === "string" ? obj.personality : "",
    rules: Array.isArray(obj.rules)
      ? obj.rules.filter((r) => typeof r === "string" && r.trim().length > 0)
      : []
  };
  if (obj.payment_mode === "test" || obj.payment_mode === "live") {
    normalized.payment_mode = obj.payment_mode;
  }
  if (typeof obj.reservation_enabled === "boolean") {
    normalized.reservation_enabled = obj.reservation_enabled;
  }
  if (typeof obj.reservation_amount_mxn === "number" && Number.isFinite(obj.reservation_amount_mxn)) {
    normalized.reservation_amount_mxn = obj.reservation_amount_mxn;
  }
  if (typeof obj.balance_amount_mxn === "number" && Number.isFinite(obj.balance_amount_mxn)) {
    normalized.balance_amount_mxn = obj.balance_amount_mxn;
  }
  if (typeof obj.balance_due_note === "string" && obj.balance_due_note.trim()) {
    normalized.balance_due_note = obj.balance_due_note.trim();
  }
  return normalized;
}

export function mapEventConfirmationRowToEventConfirmation(
  row: EventConfirmationRow,
): EventConfirmation {
  // payment_status existe en DB desde la migration 20260715014706 pero
  // el typegen de Supabase no lo incluye. Cast defensivo del row.
  const payStatus = (row as Record<string, unknown>).payment_status;
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
    paymentStatus:
      payStatus === "pending" ||
      payStatus === "pending_verification" ||
      payStatus === "paid" ||
      payStatus === "revoked" ||
      payStatus === "not_required"
        ? payStatus
        : "not_required",
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
    checkedInAt: row.checked_in_at ?? undefined,
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
