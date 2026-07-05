/**
 * Punto de entrada único para el módulo de eventos (Fase 3).
 *
 * Re-exporta la fachada pública de los server libs de eventos.
 * Sigue el patrón de `src/lib/crm/index.ts`.
 *
 * Server-only. Los Client Components NO deben importar funciones async
 * (getPublishedEventBySlug, getAdminEvents, etc.) directamente — deben
 * pasar por server actions o route handlers.
 */

// Server libs.
export {
  getPublishedEventBySlug,
  getEventBySlug,
  getEventById,
  getAdminEvents,
  createEvent,
  updateEvent,
  updateEventStatus,
  deleteEvent,
  cloneEvent,
  listPublishedEventSlugs,
  listPublishedEvents,
  type AdminEventSummary,
  type CreateEventInput,
  type UpdateEventInput,
  type AdminEventOpResult,
} from "./events-server";

export {
  getConfirmationsByEventId,
  findConfirmationByEmailOrPhone,
  createConfirmation,
  type CreateConfirmationInput,
  type CreateConfirmationResult,
} from "./confirmations-server";

export {
  getAttendeesByEventId,
  getUnmatchedAttendees,
  createAttendee,
  linkAttendeeToConfirmation,
  getUnmatchedConfirmations,
  type CreateAttendeeInput,
  type CreateAttendeeResult,
  type LinkAttendeeResult,
} from "./attendees-server";

export {
  getSurveysByEventId,
  getSurveyById,
  createSurvey,
  deleteEventSurvey,
  type CreateSurveyInput,
  type CreateSurveyResult,
} from "./surveys-server";

export {
  evaluatePromotion,
  promoteSurveyToLead,
  getUnmatchedSurveys,
  type PromotionResult,
  type PromotionContext,
} from "./promotion";

// Importer (pure, testeable).
export {
  parseXlsxForImport,
  resolveHeader,
  parseYesNo,
  mapSourceToEnum,
  HEADER_SYNONYMS,
  type ParsedSheet,
  type NormalizedRow,
} from "./importer";

// Mappers (por si el caller quiere mapear manualmente).
export {
  mapEventRowToEvent,
  mapEventConfirmationRowToEventConfirmation,
  mapEventAttendeeRowToEventAttendee,
  mapEventSurveyRowToEventSurvey,
  mapEventSurveyUnmatchedRowToEventSurveyUnmatched,
  mapLeadEventLinkRowToLeadEventLink,
  type EventRow,
  type EventConfirmationRow,
  type EventAttendeeRow,
  type EventSurveyRow,
  type EventSurveyUnmatchedRow,
  type LeadEventLinkRow,
} from "./event-mapper";

// Re-export de tipos del dominio (para no obligar al caller a importar
// de @/types/events directamente).
export type {
  Event,
  EventStatus,
  EventConfirmation,
  EventConfirmationSource,
  EventAttendee,
  EventAttendeeSource,
  EventSurvey,
  EventSurveyUnmatched,
  EventSurveyUnmatchedReason,
  LeadEventLink,
  LeadEventLinkType,
  EventImportType,
  EventImportSummary,
  ImportWarning,
} from "@/types/events";
