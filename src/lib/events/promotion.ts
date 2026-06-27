/**
 * Promotion — la lógica central del funnel de eventos (Fase 3).
 *
 * Esta capa decide si una encuesta se promueve a `leads` según las reglas
 * del `EVENTS_FUNNEL_CONCEPT.md` §5:
 *
 *   1. consent_to_contact = true (sin esto, NO se promueve)
 *   2. commercial_interest no vacío
 *   3. email O phone presente (para identificar al prospecto)
 *
 * Si NO se cumplen, la encuesta queda en `event_survey_unmatched` con la
 * razón (visibilidad para el admin — feedback al cliente).
 *
 * Si SÍ se cumplen: usa `createLeadFromEvent` (Fase 2) para crear el lead
 * con dedup + re-activación, y crea un row en `lead_event_links` para
 * la trazabilidad lead ↔ survey.
 *
 * Server-only.
 *
 * @server
 */

import type { EventSurvey, EventSurveyUnmatchedReason } from "@/types/events";
import { getSurveyById } from "./surveys-server";
import { type EventSurveyRow } from "./event-mapper";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { findConfirmationByEmailOrPhone } from "./confirmations-server";
import { findLeadByEmail, findLeadByPhone, createLeadFromEvent } from "../crm/leads-server";

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export interface PromotionResult {
  ok: boolean;
  promoted: boolean;
  leadId?: string;
  reason?: EventSurveyUnmatchedReason;
  note: string;
}

export interface PromotionContext {
  /** Email del admin que está corriendo la promotion (para audit). */
  actorEmail: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers puros (testables sin DB)
// ─────────────────────────────────────────────────────────────

/**
 * Evalúa las 3 reglas del concept §5. Devuelve null si se puede
 * promover, o la razón por la que NO se debe promover.
 *
 * Pura — fácil de testear.
 */
export function evaluatePromotion(
  survey: Pick<
    EventSurvey,
    "consentToContact" | "commercialInterest" | "respondentEmail" | "phoneNormalized"
  >,
): EventSurveyUnmatchedReason | null {
  if (!survey.consentToContact) return "no_consent";
  if (!survey.commercialInterest?.trim()) return "no_interest";
  if (!survey.respondentEmail && !survey.phoneNormalized) {
    return "no_email_no_phone";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Promotion principal
// ─────────────────────────────────────────────────────────────

/**
 * Promueve una encuesta a lead, o la marca como unmatched.
 *
 * Flujo:
 *   1. Trae la encuesta.
 *   2. Si ya fue promovida → no-op.
 *   3. Evalúa las 3 reglas. Si falla → marca unmatched y devuelve.
 *   4. Cross-check con confirmation (por email o phone normalizado).
 *   5. Llama a `createLeadFromEvent` (Fase 2) con los datos disponibles.
 *   6. Marca la encuesta como promovida (promoted_to_lead_id, promoted_at).
 *   7. Crea row en `lead_event_links` para trazabilidad (si el refactor
 *      de Fase 2 ya está aplicado — ver TODO en commit 7).
 *
 * Server-only. Si Supabase no está configurado → ok:false.
 */
export async function promoteSurveyToLead(
  surveyId: string,
  ctx: PromotionContext,
): Promise<PromotionResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      promoted: false,
      note: "Supabase no configurado.",
    };
  }

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return { ok: false, promoted: false, note: "Encuesta no encontrada." };
  }
  if (survey.promotedToLeadId) {
    return {
      ok: true,
      promoted: true,
      leadId: survey.promotedToLeadId,
      note: "Ya estaba promovida.",
    };
  }

  // 3. Reglas del concept §5.
  const blockReason = evaluatePromotion(survey);
  if (blockReason) {
    await markSurveyUnmatched(survey.id, blockReason);
    return {
      ok: true,
      promoted: false,
      reason: blockReason,
      note: `No promovida: ${blockReason}.`,
    };
  }

  // 4. Cross-check con confirmation para enrich (nombre, email verificado).
  const confirmation = await findConfirmationByEmailOrPhone(
    survey.eventId,
    survey.respondentEmail,
    survey.phoneNormalized,
  );

  // 5. Necesitamos el slug del evento para createLeadFromEvent.
  const supabase = createSupabaseAdminClient();
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("slug, title")
    .eq("id", survey.eventId)
    .maybeSingle();
  if (evErr || !event) {
    return {
      ok: false,
      promoted: false,
      note: "No se pudo leer el evento.",
    };
  }
  const eventSlug = event.slug as string;

  // Construir input para createLeadFromEvent. Priorizamos los datos de la
  // encuesta (más recientes y explícitos); confirmation como fallback.
  const leadInput = {
    name: confirmation?.name ?? survey.respondentEmail?.split("@")[0] ?? "Sin nombre",
    email: survey.respondentEmail ?? confirmation?.email ?? undefined,
    phone: survey.phoneNormalized ?? confirmation?.phoneNormalized ?? undefined,
    eventSlug,
    source: "event_survey_consent" as const,
    consentToContact: true,
    commercialInterest: survey.commercialInterest,
    surveyId: survey.id,
  };

  // 6. Llamar a createLeadFromEvent (Fase 2: dedup + re-activación + tags).
  const leadResult = await createLeadFromEvent(leadInput);
  if (!leadResult.ok || !leadResult.leadId) {
    return {
      ok: false,
      promoted: false,
      note: `createLeadFromEvent falló: ${leadResult.note}`,
    };
  }

  // 7. Marcar la encuesta como promovida.
  const { error: updErr } = await supabase
    .from("event_surveys")
    .update({
      promoted_to_lead_id: leadResult.leadId,
      promoted_at: new Date().toISOString(),
    })
    .eq("id", surveyId);

  if (updErr) {
    // El lead ya existe pero no pudimos marcar la encuesta. Loggeamos
    // pero NO rollbackeamos (el admin puede reconciliar manual si quiere).
    // eslint-disable-next-line no-console
    console.error("[promotion] survey no se pudo marcar como promovida", {
      code: updErr.code,
      surveyId,
      leadId: leadResult.leadId,
    });
  }

  // 8. Crear link lead ↔ survey en lead_event_links.
  // (Cuando el refactor de linkLeadToEventRecord esté aplicado, llamar a
  //  la versión real; por ahora el STUB tag-based se sigue aplicando en
  //  createLeadFromEvent, así que la trazabilidad queda OK.)
  // TODO(commit-7): reemplazar este insert directo por linkLeadToEventRecord
  // una vez que esa función use lead_event_links.
  const { error: linkErr } = await supabase.from("lead_event_links").insert({
    lead_id: leadResult.leadId,
    event_id: survey.eventId,
    link_type: "survey",
    link_id: survey.id,
  });
  if (linkErr && linkErr.code !== "23505") {
    // 23505 = unique violation → ya existe el link, OK.
    // eslint-disable-next-line no-console
    console.warn("[promotion] link lead↔survey no creado", {
      code: linkErr.code,
      surveyId,
      leadId: leadResult.leadId,
    });
  }

  return {
    ok: true,
    promoted: true,
    leadId: leadResult.leadId,
    note: leadResult.reactivated
      ? "Encuesta promovida; lead existente reactivado."
      : leadResult.created
        ? "Encuesta promovida; lead nuevo creado."
        : "Encuesta promovida; lead existente reutilizado.",
  };
}

// ─────────────────────────────────────────────────────────────
// Marcar como unmatched
// ─────────────────────────────────────────────────────────────

async function markSurveyUnmatched(
  surveyId: string,
  reason: EventSurveyUnmatchedReason,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  // INSERT con ignoreDuplicates: si ya estaba marcada, no falla.
  const { error } = await supabase
    .from("event_survey_unmatched")
    .upsert(
      { survey_id: surveyId, reason },
      { onConflict: "survey_id", ignoreDuplicates: true },
    );
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[promotion] markSurveyUnmatched falló", {
      code: error.code,
      surveyId,
      reason,
    });
  }
}

/**
 * Lista las encuestas unmatched de un evento (para el panel admin).
 */
export async function getUnmatchedSurveys(
  eventId: string,
): Promise<Array<{ survey: EventSurvey; reason: EventSurveyUnmatchedReason }>> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  const { data: unmatched, error: uErr } = await supabase
    .from("event_survey_unmatched")
    .select("survey_id, reason");
  if (uErr || !unmatched) return [];

  const surveyIds = unmatched.map((r) => r.survey_id);
  if (surveyIds.length === 0) return [];

  const { data: surveys, error: sErr } = await supabase
    .from("event_surveys")
    .select("*")
    .in("id", surveyIds)
    .eq("event_id", eventId);
  if (sErr || !surveys) return [];

  const byId = new Map<string, EventSurveyUnmatchedReason>();
  for (const row of unmatched) {
    byId.set(row.survey_id, row.reason as EventSurveyUnmatchedReason);
  }

  return (surveys as EventSurveyRow[]).map((s) => ({
    survey: mapEventSurvey(s),
    reason: byId.get(s.id) ?? "no_consent",
  }));
}

// Helper local (evita import circular).
function mapEventSurvey(row: EventSurveyRow): EventSurvey {
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
  };
}
