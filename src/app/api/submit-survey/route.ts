/**
 * Endpoint publico: submit de encuesta post-evento via token.
 *
 * POST /api/submit-survey
 *   Body: {
 *     token: string,             // token del link /encuesta/[token]
 *     responses: {               // respuestas del form (libre)
 *       [questionKey: string]: string | number | boolean | string[] | null
 *     },
 *     consentToContact: boolean, // obligatorios para promover a lead
 *     commercialInterest?: string, // texto libre; requerido para promover
 *     // ===[ campos auto-rellenados desde el token, no vienen del cliente ]===
 *     // email, phone, attendeeId, confirmationId se resuelven server-side.
 *   }
 *
 * Flujo:
 *   1. Valida token (existe + no usado + no expirado).
 *   2. Resuelve datos del token (email, phone, attendee_id, event_id).
 *   3. Llama createSurvey() con los datos resueltos + body.
 *   4. Marca token como usado (linkando al survey).
 *   5. Llama promoteSurveyToLead() (corre las 3 reglas del concept §5).
 *   6. Devuelve { ok, surveyId, promoted, leadId?, reason? }.
 *
 * **Auth:** el token es la "autorizacion" (192 bits entropia).
 * No requiere login (la persona viene desde un email personal).
 *
 * **Anti-abuso:** rate limit deberia aplicarse a nivel Vercel Edge o
 * middleware. Por simplicidad en MVP confiamos en:
 *   - El token es unico (no enumerable).
 *   - submitted_survey_id se setea una sola vez (idempotencia).
 *
 * Server-only.
 *
 * FIX 2026-07-03 (sesion David G-4): antes solo existia la importacion
 * via Excel admin. Este endpoint cierra el ciclo para walks-in y
 * confirmados.
 */

import { NextResponse } from "next/server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "@/lib/crm/audit-server";
import { createSurvey } from "@/lib/events/surveys-server";
import { promoteSurveyToLead } from "@/lib/events/promotion";
import {
  lookupSurveyToken,
  markSurveyTokenUsed,
} from "@/lib/events/survey-tokens";

export const dynamic = "force-dynamic";

interface SubmitSurveyBody {
  token?: string;
  responses?: Record<string, unknown>;
  consentToContact?: boolean;
  commercialInterest?: string | null;
}

export async function POST(req: Request) {
  // 1. Body parse.
  let body: SubmitSurveyBody;
  try {
    body = (await req.json()) as SubmitSurveyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalido." }, { status: 400 });
  }
  const { token, responses, consentToContact, commercialInterest } = body;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Falta token." }, { status: 400 });
  }
  if (!responses || typeof responses !== "object") {
    return NextResponse.json(
      { ok: false, error: "Faltan las respuestas del formulario." },
      { status: 400 },
    );
  }
  if (typeof consentToContact !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Falta el consentimiento de contacto." },
      { status: 400 },
    );
  }

  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Encuestas deshabilitadas en modo demo." },
      { status: 501 },
    );
  }

  // 2. Lookup del token + validacion.
  const tokenRow = await lookupSurveyToken(token);
  if (!tokenRow) {
    return NextResponse.json(
      { ok: false, error: "Link invalido." },
      { status: 404 },
    );
  }
  if (tokenRow.status === "used") {
    return NextResponse.json(
      { ok: false, error: "Esta encuesta ya fue enviada." },
      { status: 409 },
    );
  }
  if (tokenRow.status === "expired") {
    return NextResponse.json(
      {
        ok: false,
        error: "El link de la encuesta expiró. Pedile al organizador un link nuevo.",
      },
      { status: 410 },
    );
  }
  if (tokenRow.status !== "valid") {
    return NextResponse.json(
      { ok: false, error: `Estado del link: ${tokenRow.status}.` },
      { status: 400 },
    );
  }

  // 3. Crear la encuesta con datos del token (server-side, no del cliente).
  const surveyResult = await createSurvey({
    eventId: tokenRow.event_id,
    confirmationId: tokenRow.confirmation_id,
    attendeeId: tokenRow.attendee_id,
    respondentEmail: tokenRow.email,
    respondentPhone: tokenRow.phone_normalized,
    phoneNormalized: tokenRow.phone_normalized,
    responses: responses ?? {},
    consentToContact,
    commercialInterest: commercialInterest ?? null,
  });

  if (!surveyResult.ok || !surveyResult.survey) {
    return NextResponse.json(
      {
        ok: false,
        error: surveyResult.note ?? "No se pudo guardar la encuesta.",
      },
      { status: 500 },
    );
  }

  const surveyId = surveyResult.survey.id;

  // 4. Marcar token como usado (idempotente).
  await markSurveyTokenUsed(token, surveyId);

  // 5. Correr promotion (las 3 reglas del concept §5).
  //    Si consent = false, commercialInterest vacio, o no email/phone,
  //    queda en event_survey_unmatched, no se promueve.
  const actorEmail = "self@survey.public";
  const promoResult = await promoteSurveyToLead(surveyId, {
    actorEmail,
  });

  // 6. Audit log.
  await logAdminAction({
    actor_email: actorEmail,
    action: "survey_submit_public",
    entity_type: "event_survey",
    entity_id: surveyId,
    metadata: {
      eventId: tokenRow.event_id,
      surveyTokenId: tokenRow.id,
      consent: consentToContact,
      hasCommercialInterest: Boolean(commercialInterest?.trim()),
      promoted: promoResult.promoted,
      ...(promoResult.leadId ? { leadId: promoResult.leadId } : {}),
      ...(promoResult.reason ? { reason: promoResult.reason } : {}),
      ip: req.headers.get("x-forwarded-for") ?? null,
      ua: req.headers.get("user-agent") ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    surveyId,
    promoted: promoResult.promoted,
    ...(promoResult.leadId ? { leadId: promoResult.leadId } : {}),
    ...(promoResult.reason ? { reason: promoResult.reason } : {}),
  });
}
