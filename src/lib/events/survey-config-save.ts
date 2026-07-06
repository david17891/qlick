/**
 * Lógica pura para guardar survey_config de un evento.
 *
 * FIX 2026-07-05 (deuda #1): extraído del endpoint para hacerlo
 * testeable sin Supabase real.
 *
 * Server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SurveyConfig } from "@/types/events";
import { logAdminAction } from "@/lib/crm/audit-server";
import { resolveSurveyConfig } from "./survey-config-validator";

export interface SaveSurveyConfigInput {
  supabase: SupabaseClient;
  eventId: string;
  surveyConfig: SurveyConfig;
  actorEmail: string;
}

export interface SaveSurveyConfigResult {
  ok: boolean;
  note: string;
  questionsCount: number;
  errorCode?: "not_found" | "update_failed";
}

/**
 * Persiste `events.survey_config` (jsonb) + escribe audit log.
 *
 * Best-effort: si falla la lectura previa o el update, devuelve
 * `ok: false` con `errorCode` para que el caller decida el HTTP status.
 *
 * Server-only.
 */
export async function saveSurveyConfigForEvent(
  input: SaveSurveyConfigInput,
): Promise<SaveSurveyConfigResult> {
  // 1. Leer config anterior para audit log.
  const { data: prev, error: prevErr } = await input.supabase
    .from("events" as never)
    .select("survey_config" as never)
    .eq("id" as never, input.eventId)
    .maybeSingle();

  if (prevErr) {
    return {
      ok: false,
      note: `No se pudo leer el evento: ${(prevErr as { code?: string }).code ?? "unknown"}`,
      questionsCount: 0,
      errorCode: "update_failed",
    };
  }

  if (!prev) {
    return {
      ok: false,
      note: "Evento no encontrado.",
      questionsCount: 0,
      errorCode: "not_found",
    };
  }

  const prevConfig = (prev as unknown as { survey_config: unknown }).survey_config;

  // 2. UPDATE.
  const { error: updateErr } = await input.supabase
    .from("events" as never)
    .update({ survey_config: input.surveyConfig as never } as never)
    .eq("id" as never, input.eventId);

  if (updateErr) {
    return {
      ok: false,
      note: `No se pudo actualizar: ${(updateErr as { code?: string }).code ?? "unknown"}`,
      questionsCount: 0,
      errorCode: "update_failed",
    };
  }

  // 3. Audit log (best-effort — si falla, no rompemos el save).
  try {
    await logAdminAction({
      actor_email: input.actorEmail,
      action: "event_survey_config_update",
      entity_type: "event",
      entity_id: input.eventId,
      metadata: {
        questionsCount: input.surveyConfig.questions.length,
        hadFollowUps: input.surveyConfig.followUps !== undefined,
        prevQuestionsCount: resolveSurveyConfig(prevConfig).questions.length,
      },
      before: { survey_config: prevConfig } as never,
      after: { survey_config: input.surveyConfig } as never,
    });
  } catch {
    // best-effort: el save ya está persistido
  }

  return {
    ok: true,
    note: `Survey config actualizado con ${input.surveyConfig.questions.length} pregunta(s).`,
    questionsCount: input.surveyConfig.questions.length,
  };
}