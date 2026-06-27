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

  return {
    ok: true,
    survey: mapEventSurveyRowToEventSurvey(data as EventSurveyRow),
    created: true,
    persisted: true,
    demo: false,
    note: "Encuesta creada en Supabase.",
  };
}
