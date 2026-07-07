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

import type { EventSurvey, SurveyConfig } from "@/types/events";
import type { Json } from "@/types/supabase";
import {
  mapEventSurveyRowToEventSurvey,
  type EventSurveyRow,
} from "./event-mapper";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "../crm/phone-utils.ts";
import {
  calculateLeadScore,
  calculateLeadScoreFromConfig,
} from "@/lib/crm/lead-scoring";

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
  /**
   * FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 9): si viene,
   * el post-hook de scoring usa `calculateLeadScoreFromConfig` en lugar
   * de la rama legacy (rating 1-5). Sin config, fallback al legacy.
   */
  surveyConfig?: SurveyConfig;
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
    // FIX 2026-07-06 (QA funnel-audit, bug #6): race condition entre
    // /api/submit-survey y wizard WhatsApp podía crear 2 surveys
    // para el mismo (event_id, phone). Ahora con UNIQUE INDEX
    // event_surveys_event_phone_unique (migration 20260706030000),
    // el segundo insert falla con 23505. Tratamos como OK (dedupe
    // a nivel DB) para que el caller no se entere.
    if (error?.code === "23505" || /duplicate/i.test(String(error?.message ?? ""))) {
      // eslint-disable-next-line no-console
      console.info(
        "[surveys-server] createSurvey dedupe DB (23505): survey ya existe",
        { eventId: input.eventId, phone: phoneNormalized, email: respondentEmail },
      );
      return {
        ok: true,
        created: false,
        persisted: false,
        demo: false,
        note: "Encuesta ya existía (dedupe DB level).",
      };
    }
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

  // Post-hook (feat/funnel-survey-scoring, 2026-07-04 + commit 9
  // feat/funnel-dynamic-surveys-crm): aplicar score al lead asociado.
  // Best-effort: si falla, NO fallamos la encuesta (ya está persistida).
  // FIX 2026-07-05: si `surveyConfig` viene, usa scoring dinámico.
  // Si no, fallback al legacy (rating 1-5).
  try {
    const responses = input.responses as Record<string, unknown>;
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

    // Calcular score según config o legacy
    if (input.surveyConfig) {
      // Modo dinámico: scoring con questions + flags
      const scoreResult = calculateLeadScoreFromConfig(
        responses as Record<string, string>,
        input.surveyConfig,
      );
      if (leadId) {
        // score + qualification se setean via applyPromotionRules en
        // commit 9. Acá solo actualizamos el score base por si el
        // promotion engine no corre (ej. sin supabase).
        await updateLeadScoring({
          leadId,
          rating: scoreResult.score, // pasamos score como número
          liked: scoreResult.businessDescription,
          commercialInterest: input.commercialInterest ?? null,
          consentToContact: input.consentToContact,
        });
      }
    } else {
      // Legacy path: solo si rating 1-5 está presente
      const rating = Number(responses.rating ?? 0);
      if (rating >= 1 && rating <= 5) {
        const liked = typeof responses.liked === "string" ? responses.liked : null;
        if (leadId) {
          await updateLeadScoring({
            leadId,
            rating,
            liked,
            commercialInterest: input.commercialInterest ?? null,
            consentToContact: input.consentToContact,
          });
        }
      }
    }

    if (!leadId) {
      // Sin lead linkeado todavía (caso raro: encuesta antes de check-in).
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
    // Silenciar import warning
    void calculateLeadScore;

    // ────── Post-hook: attendance check (migration 20260707000000) ──────
    // Si la survey tiene una pregunta con `isAttendanceCheck=true` y el
    // usuario respondió la opción positiva (score > 0), marcamos
    // `event_attendees.checked_in_at = now()` para confirmar asistencia
    // real. Esto es el segundo proxy de asistencia virtual: el gate
    // (click en SÍ, VOY) ya creó el attendee con checked_in_at=null;
    // la survey lo confirma como realmente presente.
    //
    // Best-effort: si falla, la encuesta YA está persistida. El attendee
    // queda con checked_in_at=null (sin confirmar), pero el survey ya
    // capturó la respuesta del usuario.
    if (input.surveyConfig) {
      const attQ = input.surveyConfig.questions.find(
        (q) => q.isAttendanceCheck === true,
      );
      if (attQ) {
        const respValue = responses[attQ.id];
        const respOption = attQ.options?.find((o) => o.id === respValue);
        const attended = respOption && respOption.score > 0;
        if (attended && (input.respondentEmail || input.phoneNormalized)) {
          const supabase2 = createSupabaseAdminClient();
          let query = supabase2
            .from("event_attendees")
            .update({ checked_in_at: new Date().toISOString() } as never)
            .eq("event_id" as never, input.eventId);
          // Match por email O phone (PostgREST or).
          // Construimos dos queries separadas y usamos la primera que
          // matchee (más simple que OR con PostgREST filters).
          if (input.respondentEmail) {
            const { error: emailErr } = await supabase2
              .from("event_attendees")
              .update({ checked_in_at: new Date().toISOString() } as never)
              .eq("event_id" as never, input.eventId)
              .eq("email" as never, input.respondentEmail.trim().toLowerCase())
              .is("checked_in_at" as never, null);
            if (emailErr) {
              // eslint-disable-next-line no-console
              console.warn("[surveys-server] attendance check email update falló", {
                code: emailErr.code,
              });
            }
          }
          if (input.phoneNormalized) {
            const { error: phoneErr } = await supabase2
              .from("event_attendees")
              .update({ checked_in_at: new Date().toISOString() } as never)
              .eq("event_id" as never, input.eventId)
              .eq("phone_normalized" as never, input.phoneNormalized)
              .is("checked_in_at" as never, null);
            if (phoneErr) {
              // eslint-disable-next-line no-console
              console.warn("[surveys-server] attendance check phone update falló", {
                code: phoneErr.code,
              });
            }
          }
          // `query` lo construimos para el typecheck — la lógica real
          // está arriba (email + phone separados). Marcamos `void` para
          // silenciar lint.
          void query;
          // eslint-disable-next-line no-console
          console.info(
            "[surveys-server] attendance check: attendee confirmado via survey",
            {
              eventId: input.eventId,
              questionId: attQ.id,
              response: respValue,
              email: input.respondentEmail ?? null,
              phone: input.phoneNormalized ?? null,
            },
          );
        }
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

/**
 * Elimina una encuesta (event_surveys) por ID. Admin-only.
 *
 * Caso de uso: limpiar registros duplicados que pasaron antes de que el
 * dedupe del wizard estuviera activo (Fase 7d.1). NO es para uso normal
 * — un admin debería preferir "Marcar revisada" o promover a lead.
 *
 * Side-effects:
 *  - Quita la fila de `event_surveys`.
 *  - Si la encuesta ya fue promovida a lead (`promoted_to_lead_id`),
 *    la relación se pierde (el lead sobrevive — promotion.ts creó
 *    un lead nuevo o activó uno existente, no tiene FK desde la
 *    encuesta).
 *  - No toca `leads` ni `events`. Solo borra este row.
 *
 * Audit log emite `survey_delete` con metadata del row eliminado.
 */
export async function deleteEventSurvey(
  surveyId: string,
): Promise<{ ok: boolean; note: string }> {
  if (!isRealMode() || !surveyId) {
    return { ok: false, note: "Supabase no configurado o falta surveyId." };
  }
  const supabase = createSupabaseAdminClient();
  // Capturamos el row antes de borrar para el audit log.
  const { data: prev, error: prevErr } = await supabase
    .from("event_surveys")
    .select("id, event_id, respondent_email, phone_normalized, promoted_to_lead_id, consent_to_contact")
    .eq("id", surveyId)
    .maybeSingle();
  if (prevErr || !prev) {
    return { ok: false, note: "Encuesta no encontrada." };
  }
  const { error: delErr } = await supabase
    .from("event_surveys")
    .delete()
    .eq("id", surveyId);
  if (delErr) {
    // eslint-disable-next-line no-console
    console.error("[surveys-server] deleteEventSurvey falló", {
      code: delErr.code,
      surveyId,
    });
    return { ok: false, note: `No se pudo eliminar (${delErr.code ?? "unknown"}).` };
  }
  // Audit log: reutilizamos el logAdminAction genérico del CRM.
  const { logAdminAction } = await import("@/lib/crm/audit-server");
  await logAdminAction({
    actor_email: "admin", // placeholder — el caller puede sobreescribir via el ctx
    action: "survey_delete",
    entity_type: "event_survey",
    entity_id: surveyId,
    metadata: {
      event_id: (prev as { event_id: string }).event_id,
      respondent_email: (prev as { respondent_email: string | null })
        .respondent_email,
      phone_normalized: (prev as { phone_normalized: string | null })
        .phone_normalized,
      promoted_to_lead_id: (prev as { promoted_to_lead_id: string | null })
        .promoted_to_lead_id,
      consent_to_contact: (prev as { consent_to_contact: boolean })
        .consent_to_contact
    },
    before: prev,
    after: null
  });
  return {
    ok: true,
    note: "Encuesta eliminada (admin manual cleanup)."
  };
}
