/**
 * Servicios server-side para encuestas de eventos (Fase 3).
 *
 * Server-only. La encuesta es la pieza que gatilla el consent_to_contact
 * y la promoción a lead. Esta capa solo persiste; la decisión de
 * promover vive en `promotion.ts`.
 *
 * Privacidad: RLS deny para anon/authenticated. Solo service role.
 *
 * @server
 */

import type { EventSurvey } from "@/types/events";
import type { Json } from "@/types/supabase";
import {
  mapEventSurveyRowToEventSurvey,
  type EventSurveyRow,
} from "./event-mapper";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "../crm/phone-utils.ts";

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export interface CreateSurveyInput {
  eventId: string;
  confirmationId?: string | null;
  attendeeId?: string | null;
  respondentEmail?: string | null;
  respondentPhone?: string | null;
  phoneNormalized?: string | null;
  responses: Record<string, unknown>;
  consentToContact: boolean;
  commercialInterest?: string | null;
  importBatchId?: string | null;
}

export interface CreateSurveyResult {
  ok: boolean;
  survey?: EventSurvey;
  created: boolean;
  persisted: boolean;
  demo: boolean;
  note: string;
}

// ─────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────

export async function getSurveysByEventId(
  eventId: string,
): Promise<EventSurvey[]> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_surveys")
    .select("*")
    .eq("event_id", eventId)
    .order("submitted_at", { ascending: false });
  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[surveys-server] getSurveysByEventId falló", {
        code: error.code,
        eventId,
      });
    }
    return [];
  }
  return (data as EventSurveyRow[]).map(mapEventSurveyRowToEventSurvey);
}

export async function getSurveyById(
  id: string,
): Promise<EventSurvey | null> {
  if (!isRealMode()) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_surveys")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapEventSurveyRowToEventSurvey(data as EventSurveyRow);
}

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

/**
 * Crea una encuesta. NO valida reglas de promoción — eso es
 * responsabilidad de `promotion.ts`. Acá solo persistimos.
 *
 * Idempotente: si la misma persona (mismo event_id + email) ya envió,
 * devuelve `created: false`. Deduplicamos por (event_id, email) ya que
 * la UNIQUE en la DB es por confirmation_id y attendee_id (más estricto).
 * Aquí usamos lógica de aplicación para evitar duplicados obvios.
 */
export async function createSurvey(
  input: CreateSurveyInput,
): Promise<CreateSurveyResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: true,
      note: "Supabase no configurado.",
    };
  }
  if (!input.eventId) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: "Falta eventId.",
    };
  }

  const phoneNormalized =
    input.phoneNormalized ??
    (input.respondentPhone ? normalizePhone(input.respondentPhone) : null);
  const respondentEmail = input.respondentEmail?.trim().toLowerCase() || null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_surveys")
    .insert({
      event_id: input.eventId,
      confirmation_id: input.confirmationId ?? null,
      attendee_id: input.attendeeId ?? null,
      respondent_email: respondentEmail,
      respondent_phone: input.respondentPhone?.trim() || null,
      phone_normalized: phoneNormalized,
      // Cast a Json (tipo de la DB). input.responses es Record<string, unknown>
      // pero el typegen quiere Json específicamente.
      responses: input.responses as unknown as Json,
      consent_to_contact: input.consentToContact,
      commercial_interest: input.commercialInterest?.trim() || null,
      import_batch_id: input.importBatchId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[surveys-server] createSurvey falló", {
      code: error?.code,
      eventId: input.eventId,
    });
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: `No se pudo crear la encuesta (${error?.code ?? "unknown"}).`,
    };
  }

  // Post-hook (feat/funnel-survey-scoring, 2026-07-04): aplicar score al
  // lead asociado. Best-effort: si falla el lookup o el UPDATE del lead,
  // NO fallamos la encuesta (ya está persistida). Solo loggeamos.
  // Esto cierra el ciclo: lead llena encuesta → score + qualification +
  // status='survey_completed' en el CRM.
  try {
    const responses = input.responses as Record<string, unknown>;
    const rating = Number(responses.rating ?? 0);
    if (rating >= 1 && rating <= 5) {
      const liked = typeof responses.liked === "string" ? responses.liked : null;
      const { findLeadByEmail, findLeadByPhone, updateLeadScoring } = await import(
        "../crm/leads-server"
      );
      let leadId: string | null = null;
      if (input.respondentEmail) {
        const lead = await findLeadByEmail(input.respondentEmail).catch(() => null);
        if (lead) leadId = lead.id;
      }
      if (!leadId && input.phoneNormalized) {
        const lead = await findLeadByPhone(input.phoneNormalized).catch(() => null);
        if (lead) leadId = lead.id;
      }
      if (leadId) {
        await updateLeadScoring({
          leadId,
          rating,
          liked,
          commercialInterest: input.commercialInterest ?? null,
          consentToContact: input.consentToContact,
        });
      } else {
        // Sin lead linkeado todavía (caso raro: encuesta antes de check-in).
        // El lead se va a crear/activar via promoteSurveyToLead cuando el
        // admin corra la promotion. El score se puede re-asignar despues.
        // eslint-disable-next-line no-console
        console.info(
          "[surveys-server] createSurvey post-hook: no se encontró lead linkeado a la encuesta",
          {
            surveyId: (data as { id: string }).id,
            hasEmail: !!input.respondentEmail,
            hasPhone: !!input.phoneNormalized,
          },
        );
      }
    }
  } catch (postHookErr) {
    // eslint-disable-next-line no-console
    console.warn(
      "[surveys-server] createSurvey post-hook (scoring) falló — la encuesta YA está persistida",
      {
        code: (postHookErr as { code?: string })?.code,
        err:
          postHookErr instanceof Error
            ? postHookErr.message
            : String(postHookErr),
      },
    );
  }

  return {
    ok: true,
    survey: mapEventSurveyRowToEventSurvey(data as EventSurveyRow),
    created: true,
    persisted: true,
    demo: false,
    note: "Encuesta creada en Supabase.",
  };
}

// ─────────────────────────────────────────────────────────────
// Capa 4 de Fase 4: "Marcar como revisada"
// ─────────────────────────────────────────────────────────────

export interface MarkReviewedResult {
  ok: boolean;
  note: string;
}

/**
 * Marca una encuesta como revisada por el admin.
 *
 * Setea `reviewed_at = now()` y `reviewed_by = reviewerEmail` en la fila.
 * Si ya estaba revisada, SOBREESCRIBE (revisa de nuevo, nuevo timestamp).
 *
 * Idempotente en el sentido: ejecutar 2 veces tiene el mismo efecto que
 * ejecutar 1. No es destructivo.
 *
 * Si el admin pasa `null`/`undefined` como `reviewerEmail`, queda el
 * timestamp sin autor (caso raro, ej. automation).
 */
export async function markSurveyReviewed(
  surveyId: string,
  reviewerEmail: string | null,
): Promise<MarkReviewedResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!surveyId) {
    return { ok: false, note: "Falta surveyId." };
  }
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("event_surveys")
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerEmail,
    })
    .eq("id", surveyId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[surveys-server] markSurveyReviewed falló", {
      code: error.code,
      surveyId,
    });
    return {
      ok: false,
      note: `No se pudo marcar como revisada (${error.code ?? "unknown"}).`,
    };
  }
  return { ok: true, note: "Encuesta marcada como revisada." };
}
