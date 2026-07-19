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

/**
 * Modalidad del evento (migration 20260707000000_event_format_and_streaming).
 *
 * - `in_person`  → presencial, check-in por QR en puerta (default legacy)
 * - `virtual`    → 100% online, no hay sede física
 * - `hybrid`     → presencial + online simultáneamente
 */
export type EventFormat = "in_person" | "virtual" | "hybrid";

/**
 * Provider de streaming (migration 20260707000000). Para analytics y
 * hints en admin UI. `other` cubre providers no listados explícitamente.
 */
export type EventStreamingProvider =
  | "youtube_live"
  | "facebook_live"
  | "zoom"
  | "other";

/** Cómo entró la confirmación al sistema (auditoría). */
export type EventConfirmationSource =
  | "imported_excel"
  | "public_form"
  | "manual"
  | "whatsapp_bot"
  /** FIX 2026-07-15: safety net del bot-engine cuando el LLM en
   * human_first mintio con "quedaste registrado" sin haber llamado a
   * la tool. El bot-engine extrae nombre+email del body del lead y
   * crea la confirmation via createConfirmation. */
  | "whatsapp_safety_net";

/** Cómo se registró la asistencia (auditoría). */
export type EventAttendeeSource =
  | "check_in"
  | "imported_excel"
  | "zoom_export"
  | "manual"
  /**
   * FIX 2026-07-11 (sprint cierre-eventos-virtuales): el attendee fue
   * confirmado porque respondió "Sí" en la Q0 de la encuesta post-evento
   * (`isAttendanceCheck=true`). Usado por `surveys-server.ts` cuando
   * el confirmado NUNCA abrió el gate virtual NI escaneó el QR — el
   * UPSERT crea el row al vuelo con `checked_in_at=now()`. Si el row
   * ya existía (gate click o check-in previo), se preserva el `source`
   * original y solo se actualiza `checked_in_at` (idempotente).
   *
   * Migration: `20260711100000_event_attendee_source_survey_attended.sql`.
   */
  | "survey_attended";

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

/**
 * Reglas de comportamiento del bot para este evento.
 *
 * `personality`: tono del bot (predefinido o custom string).
 * `rules`: array de strings — cada uno es una regla libre que el admin
 * escribe (o que DeepSeek pre-llena desde la description).
 *
 * El bot inyecta esto en el system prompt antes de responder.
 * Regla dura built-in (no almacenada): "Solo responde con info del
 * contexto. Si no sabes, di que no tienes la info."
 */
export interface EventBotRules {
  /** Tono del bot. Sugeridos: "seria", "casual", "con humor", "supervendedor". */
  personality: string;
  /** Lista de reglas. Una por línea en la UI. */
  rules: string[];
  /**
   * FIX 2026-07-18 (sprint Stripe Live prep): modo de Stripe para este
   * evento. Default "test" si no está seteado (el provider de Stripe
   * lo lee via `event.event_rules?.payment_mode` en create-checkout).
   *
   * - "test"  → usa STRIPE_SECRET_KEY (sk_test_*). Sin cargo real.
   * - "live"  → usa STRIPE_SECRET_KEY_LIVE (sk_live_*). Cargo real.
   *
   * Solo el admin puede setear este campo (via /admin/eventos). El
   * bot NO lo modifica (es decision de David). Default seguro: "test".
   */
  payment_mode?: "test" | "live";
}

/* ------------------------------------------------------------------ */
/* Encuesta dinámica por evento (Fase 7d.2)                            */
/* ------------------------------------------------------------------ */

/**
 * Una opción de respuesta para una pregunta tipo "buttons".
 *
 * `score`: puntos que suma esta opción al `LeadScore` (0-100 clamped).
 * `isConsent`: si true, esta opción representa consentimiento comercial
 *   (LFPDPPP). Al elegirla, el wizard auto-promueve el lead.
 * `isCommercialInterest`: si true, el `title` de esta opción se usa
 *   como `commercialInterest` del lead.
 *
 * Límite de Meta Cloud API: `title` debe tener ≤20 caracteres.
 */
export interface SurveyQuestionOption {
  id: string;
  /** Texto del botón. Máx 20 caracteres (validado en runtime). */
  title: string;
  /** Puntos para el LeadScore. */
  score: number;
  /** Marca esta opción como consentimiento comercial explícito. */
  isConsent?: boolean;
  /** Marca esta opción como interés comercial (se guarda como commercialInterest). */
  isCommercialInterest?: boolean;
}

/**
 * Tipo de pregunta. `buttons` = interactiva con 2-3 opciones.
 * `text` = texto libre opcional.
 */
export type SurveyQuestionType = "buttons" | "text";

/**
 * Una pregunta de la encuesta dinámica.
 *
 * - `type: "buttons"` → 2-3 opciones (límite Meta Cloud API).
 *   El lead responde con un click.
 * - `type: "text"` → texto libre. Útil para "contanos de tu negocio".
 *   El lead puede responder "saltar" para omitir.
 *
 * Flags exclusivos (validados por Zod en runtime):
 * - Como máximo 1 pregunta con `isConsent: true`.
 * - Como máximo 1 pregunta con `isBusinessDescription: true`.
 * - Como máximo 1 pregunta con `isAttendanceCheck: true` (migration
 *   20260707000000_event_format_and_streaming). La respuesta "Sí"
 *   marca al attendee como realmente presente (checked_in_at).
 */
export interface SurveyQuestion {
  id: string;
  /** Texto de la pregunta que verá el lead. */
  text: string;
  type: SurveyQuestionType;
  /** Solo si type === "buttons". */
  options?: SurveyQuestionOption[];
  /** Marca esta pregunta como descripción del negocio (se guarda en lead.description). */
  isBusinessDescription?: boolean;
  /**
   * Marca esta pregunta como verificación de asistencia real (Sí/No).
   * Usado en encuestas de eventos virtuales/híbridos como Q1.
   * La respuesta "Sí" actualiza `checked_in_at` en event_attendees
   * (defense-in-depth: ya tenemos el intent del gate, esto confirma
   * el ingreso real).
   */
  isAttendanceCheck?: boolean;
}

/**
 * Mensaje de seguimiento post-encuesta para un bucket de calificación.
 *
 * El `text` puede tener placeholders `{{1}}` (nombre del lead) que el
 * bot sustituye al enviar.
 *
 * Si `templateName` está set + la ventana 24h está cerrada, se usa
 * la plantilla Meta. Si la ventana está abierta o `templateName` es
 * null, se envía texto libre.
 */
export interface SurveyFollowUp {
  text: string;
  /**
   * Nombre de la plantilla Meta (ej. "conf_bienvenida"). Si null,
   * siempre se envía texto libre.
   */
  templateName?: string | null;
  /** Código de idioma BCP-47 (default "es_MX"). */
  templateLanguage?: string;
}

/**
 * Mensajes de seguimiento por bucket de calificación.
 *
 * Cada bucket corresponde a una categoría del LeadQualification:
 * - `mql`       → score >= 60 (marketing qualified lead)
 * - `hot`       → score 40-59
 * - `coldWarm`  → score < 40 (cold y warm comparten mensaje)
 *
 * El Promotion Engine (commit 7) elige el bucket según el score.
 */
export interface SurveyFollowUps {
  mql?: SurveyFollowUp;
  hot?: SurveyFollowUp;
  coldWarm?: SurveyFollowUp;
}

/**
 * Configuración dinámica de la encuesta de un evento.
 *
 * Persistida en `events.survey_config` (jsonb, ver migration
 * `20260705220000_add_survey_config_to_events.sql`).
 *
 * Si `survey_config = {}` (vacío), el mapper usa la plantilla Default
 * del sistema (5 preguntas) — ver `src/lib/events/event-mapper.ts`.
 *
 * Validación: Zod en runtime al insertar/actualizar/leer
 * (ver `src/lib/events/survey-config-schema.ts` — commit 3).
 */
export interface SurveyConfig {
  questions: SurveyQuestion[];
  followUps?: SurveyFollowUps;
}

export interface Event {
  id: string;
  /** URL-safe identifier único. Base de la URL pública. */
  slug: string;
  /**
   * ID corto aleatorio (4 chars base32 sin 0/1/O/I, e.g. `7A3X`).
   * Único por evento, distinto del slug (que se reutiliza vía `-copia`
   * para duplicados). WhatsApp-friendly. Auto-generado por el trigger
   * `events_set_short_code` si no se provee. Ver
   * `src/lib/events/short-code.ts` y migration
   * `20260705120000_events_short_code.sql`.
   *
   * El bot WA lo usa como identificador canónico para desambiguar
   * eventos con título similar (e.g. dos "Pinguinos" consecutivos):
   * si el lead escribe `7A3X`, matchea exacto, no cae al fallback
   * de "primer published por start_at".
   */
  shortCode?: string;
  /** Título visible. */
  title: string;
  description?: string;
  /** Inicio del evento (ISO). */
  startsAt: string;
  /** Fin del evento (ISO). Opcional (eventos sin hora de cierre). */
  endsAt?: string;
  /** Lugar físico o link de Zoom/Meet. */
  location?: string;
  /**
   * Modalidad del evento (migration 20260707000000).
   * Default `in_person` para preservar eventos legacy.
   */
  format?: EventFormat;
  /**
   * Link de streaming (YouTube Live, Zoom, FB Live, etc.).
   * Requerido si format ∈ {virtual, hybrid}. Libre para in_person.
   */
  streamingUrl?: string;
  /** Provider declarado (analytics + hints UI). */
  streamingProvider?: EventStreamingProvider;
  /**
   * Nota visible al asistente (ej: "el link se desbloquea 10 min antes").
   */
  streamingAccessNote?: string;
  /**
   * Precio de la entrada en MXN (migration 20260714230000).
   * `0` o `undefined` = evento gratuito (no muestra checkout, va
   * directo al form de confirmacion). Para eventos cobrados, el
   * flow de pago usa `ProductRefEvent.priceMXN`
   * (ver `src/lib/payments/payment-provider.ts`).
   */
  priceMXN?: number;
  /**
   * Codigo de moneda ISO-4217 (default 'MXN'). El provider de pago
   * lo usa para construir el Checkout Session de Stripe. Sprint
   * futuro podria soportar USD para eventos online internacionales.
   */
  currency?: string;
  /** URL de la imagen de portada. */
  coverImageUrl?: string;
  /** Estado de publicación. Solo `published` es lectura pública. */
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * Reglas de comportamiento del bot (Fase 7b, 2026-07-05).
   * Editable desde `/admin/eventos/[id]`. Inyectado al prompt del bot.
   */
  eventRules?: EventBotRules;
  /**
   * Configuración dinámica de la encuesta (Fase 7d.2, 2026-07-05).
   * Si está vacío o undefined, el mapper usa la plantilla Default
   * del sistema (5 preguntas). Ver `SurveyConfig` arriba.
   */
  surveyConfig?: SurveyConfig;
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
  /**
   * Estado de pago del confirmado (migration 20260715014706):
   *   - 'not_required'        -> evento free (legacy, no se cobra).
   *   - 'pending'             -> evento de pago, sin pago aun.
   *   - 'pending_verification' -> admin marco un pago manual pero
   *                               el voucher/PI no se valido contra
   *                               Stripe API; queda esperando confirmacion.
   *   - 'paid'                -> pago confirmado (via Stripe webhook,
   *                               via validacion contra Stripe API, o via
   *                               admin puro con cash/transfer).
   *   - 'revoked'             -> admin revoco (voucher expiro, devolucion).
   *
   * El admin UI consume este flag en la tabla de confirmados y en el
   * tab 'payments' del evento.
   */
  paymentStatus?:
    | "not_required"
    | "pending"
    | "pending_verification"
    | "paid"
    | "revoked";
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
  /**
   * Timestamp del check-in real. NULL hasta que (a) el staff escanea
   * el QR en puerta, o (b) el usuario confirma asistencia via survey
   * Q0. Para el flujo virtual, queda NULL entre el click del gate y
   * la confirmación de la survey.
   *
   * Migration 20260707090000: la columna es nullable.
   */
  checkedInAt?: string;
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
