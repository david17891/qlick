/**
 * Endpoint publico: submit de encuesta post-evento via token.
 *
 * POST /api/submit-survey
 *   Body: {
 *     token: string,             // token del link /encuesta/[token]
 *     responses: Record<string, string>,   // shape dinámico (qId → value)
 *     consentToContact: boolean, // obligatorios para promover a lead
 *     commercialInterest?: string | null,
 *   }
 *
 * Flujo (commit 9, feat/funnel-dynamic-surveys-crm, 2026-07-05):
 *   1. Rate limit por IP (5 / 60s).
 *   2. Body parse + validacion de campos requeridos.
 *   3. Valida token (existe + no usado + no expirado).
 *   4. Carga el evento del token → extrae `survey_config`.
 *   5. Crea encuesta (`createSurvey`) con responses + consent + config.
 *   6. Marca token como usado (linkando al survey).
 *   7. **Auto-promoción**: si consent=true + commercial_interest,
 *      llama `promoteSurveyToLead()`.
 *   8. **Promotion Engine**: calcula score con config dinámico y aplica
 *      reglas (status transitions + CRM tasks).
 *   9. **Follow-up WhatsApp al lead**: envía mensaje del bucket
 *      correspondiente (mql/hot/coldWarm) vía texto libre.
 *  10. **Email Brevo al admin**: si MQL/Hot, notifica vía Brevo.
 *  11. Devuelve { ok, surveyId, promoted, leadId?, reason? }.
 *
 * **Auth:** el token es la "autorizacion" (192 bits entropia).
 * No requiere login (la persona viene desde un email personal).
 *
 * **Anti-abuso:** rate limit per-IP (sliding window in-memory) +
 * idempotencia por `submitted_survey_id`.
 *
 * Server-only.
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
import {
  getClientIp,
  recordAndCheckRateLimit,
} from "@/lib/api/rate-limit";
import { getEventById } from "@/lib/events/events-server";
import {
  calculateLeadScoreFromConfig,
  substituteTemplateVars,
} from "@/lib/crm/lead-scoring";
import {
  applyPromotionRules,
  selectFollowUpBucket,
} from "@/lib/crm/promotion-engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findLeadByEmail, findLeadByPhone } from "@/lib/crm/leads-server";
import { getActiveWhatsAppProvider } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email/brevo-client";
import { renderSurveyWithConsentEmail } from "@/lib/email/templates/survey-with-consent";
import { buildDynamicSurveyStep } from "@/lib/whatsapp/survey-wizard";

export const dynamic = "force-dynamic";

interface SubmitSurveyBody {
  token?: string;
  responses?: Record<string, unknown>;
  consentToContact?: boolean;
  commercialInterest?: string | null;
}

export async function POST(req: Request) {
  // 1. Rate limit per-IP.
  const ip = getClientIp(req);
  const rl = recordAndCheckRateLimit(`submit-survey:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Demasiadas solicitudes. Probá de nuevo en unos segundos.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rl.resetMs / 1000).toString(),
        },
      },
    );
  }

  // 2. Body parse.
  let body: SubmitSurveyBody;
  try {
    body = (await req.json()) as SubmitSurveyBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body invalido." },
      { status: 400 },
    );
  }
  const { token, responses, consentToContact, commercialInterest } = body;
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { ok: false, error: "Falta token." },
      { status: 400 },
    );
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
  // FIX 2026-07-06 (Paquete 3 — seguridad): limit de tamaño para
  // commercialInterest y responses. Antes un atacante podía mandar
  // 10MB de HTML o un JSON con keys arbitrarias → DoS o XSS via email
  // admin (Brevo). Ahora clampamos antes de persistir.
  const MAX_COMMERCIAL_INTEREST_LEN = 500;
  const MAX_RESPONSES_KEYS = 50;
  const MAX_RESPONSE_VALUE_LEN = 1000;
  if (
    commercialInterest &&
    typeof commercialInterest === "string" &&
    commercialInterest.length > MAX_COMMERCIAL_INTEREST_LEN
  ) {
    return NextResponse.json(
      { ok: false, error: "commercialInterest demasiado largo (max 500 chars)." },
      { status: 400 },
    );
  }
  const responseKeys = Object.keys(responses);
  if (responseKeys.length > MAX_RESPONSES_KEYS) {
    return NextResponse.json(
      { ok: false, error: "Demasiadas respuestas (max 50 keys)." },
      { status: 400 },
    );
  }
  for (const k of responseKeys) {
    const v = responses[k];
    if (typeof v === "string" && v.length > MAX_RESPONSE_VALUE_LEN) {
      return NextResponse.json(
        {
          ok: false,
          error: `Respuesta "${k}" demasiado larga (max 1000 chars).`,
        },
        { status: 400 },
      );
    }
  }

  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Encuestas deshabilitadas en modo demo." },
      { status: 501 },
    );
  }

  // 3. Lookup del token + validacion.
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

  // 4. Cargar evento + survey_config (mapper hace fallback a Default).
  const event = await getEventById(tokenRow.event_id);
  const surveyConfig = event?.surveyConfig;

  // 5. Crear la encuesta con datos del token + surveyConfig para scoring.
  const surveyResult = await createSurvey({
    eventId: tokenRow.event_id,
    confirmationId: tokenRow.confirmation_id,
    attendeeId: tokenRow.attendee_id,
    respondentEmail: tokenRow.email,
    respondentPhone: tokenRow.phone_normalized,
    phoneNormalized: tokenRow.phone_normalized,
    responses: (responses ?? {}) as Record<string, unknown>,
    consentToContact,
    commercialInterest: commercialInterest ?? null,
    surveyConfig: surveyConfig ?? undefined,
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

  // 6. Marcar token como usado (idempotente).
  await markSurveyTokenUsed(token, surveyId);

  // 7. Auto-promoción (si consent + commercial interest).
  //    La promotion.ts ya ejecuta las 3 reglas del concept §5
  //    (consent + commercial_interest + email/phone). Si falla,
  //    la encuesta queda persistida y el admin puede promover manual.
  const actorEmail = "self@survey.public";
  let promoResult: { ok: boolean; promoted: boolean; leadId?: string; reason?: string; note: string } = {
    ok: false,
    promoted: false,
    note: "no intentado",
  };
  if (consentToContact && commercialInterest?.trim()) {
    promoResult = await promoteSurveyToLead(surveyId, { actorEmail });
  }

  // 8. Promotion Engine — score + status transitions + CRM tasks.
  //    Best-effort: si falla, no rompemos el submit.
  const supabase = createSupabaseAdminClient();
  let promotionResultNote = "";
  if (surveyConfig && supabase) {
    try {
      // Resolver leadId (puede ser del promoResult o lookup por email/phone)
      let leadId: string | null = promoResult.leadId ?? null;
      if (!leadId && tokenRow.email) {
        const lead = await findLeadByEmail(tokenRow.email).catch(() => null);
        if (lead) leadId = lead.id;
      }
      if (!leadId && tokenRow.phone_normalized) {
        const lead = await findLeadByPhone(tokenRow.phone_normalized).catch(
          () => null,
        );
        if (lead) leadId = lead.id;
      }
      if (leadId) {
        const scoreResult = calculateLeadScoreFromConfig(
          responses as Record<string, string>,
          surveyConfig,
        );
        const promotionResult = await applyPromotionRules(
          leadId,
          scoreResult,
          {
            supabase,
            actorEmail,
            leadEmail: tokenRow.email,
            leadName: null, // el admin puede verlo en el drawer
            eventTitle: event?.title ?? "(sin título)",
          },
        );
        promotionResultNote = promotionResult.notes.join("; ");

        // 9. Follow-up WhatsApp al lead (texto libre con {{1}}).
        //    Solo si tenemos teléfono + provider configurado.
        if (tokenRow.phone_normalized) {
          const bucket = selectFollowUpBucket(scoreResult.score);
          const followUp = surveyConfig.followUps?.[bucket];
          if (followUp?.text) {
            const personalizedText = substituteTemplateVars(followUp.text, {
              "1": tokenRow.email?.split("@")[0] ?? "ahí",
            });
            try {
              const provider = getActiveWhatsAppProvider();
              // Si el follow-up tiene templateName y la ventana 24h está
              // cerrada, idealmente usamos Meta template. Por ahora (Fase 7d.2),
              // siempre texto libre. La selección templateName vs texto se
              // agrega en Fase 8+ con window tracking real.
              await provider.send({
                to: tokenRow.phone_normalized,
                body: personalizedText,
              });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn(
                "[submit-survey] follow-up WhatsApp falló",
                {
                  leadId,
                  error: err instanceof Error ? err.message : String(err),
                },
              );
            }
          }
        }

        // 10. Email Brevo al admin si MQL/Hot.
        if (
          scoreResult.score >= 40 &&
          process.env.ADMIN_NOTIFICATION_EMAILS
        ) {
          try {
            const { subject, html } = renderSurveyWithConsentEmail({
              leadName: tokenRow.email?.split("@")[0] ?? "",
              leadEmail: tokenRow.email ?? "(sin email)",
              leadPhone: tokenRow.phone_normalized ?? null,
              eventTitle: event?.title ?? "(sin título)",
              commercialInterest: commercialInterest ?? null,
              leadId,
            });
            await sendEmail({
              to: process.env.ADMIN_NOTIFICATION_EMAILS,
              subject,
              html,
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
              "[submit-survey] email Brevo al admin falló",
              {
                leadId,
                error: err instanceof Error ? err.message : String(err),
              },
            );
          }
        }

        // Silenciar warning de variable no usada (buildDynamicSurveyStep
        // no se usa directamente acá pero la importamos para mantener el
        // typecheck coherente con la API del builder).
        void buildDynamicSurveyStep;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[submit-survey] promotion engine falló",
        {
          surveyId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  }

  // 11. Audit log.
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
      promotionNotes: promotionResultNote,
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