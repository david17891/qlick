/**
 * Actualización del survey_config (jsonb) de un evento.
 *
 * POST /api/admin/events/[id]/survey-config
 *   body: { surveyConfig: SurveyConfig }
 *   -> { ok: true, eventId }
 *
 * FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, deuda #1):
 * cierra el ciclo del editor visual. Permite al admin guardar la
 * encuesta desde `/admin/eventos/[id]?tab=survey-editor` sin tocar
 * SQL a mano.
 *
 * Validación:
 * - Auth: `requireAdmin()` server-side. Cookie de Supabase + email
 *   en `ADMIN_EMAIL_ALLOWLIST`. Si falla, 401.
 * - Schema: `validateSurveyConfig()` (mismo validador que el mapper).
 *   Si falla, 400 con detalle del problema.
 *
 * Persistencia:
 * - UPDATE `events.survey_config` (jsonb) por id.
 * - Audit log: action='event_survey_config_update', metadata con
 *   el número de preguntas + antes/después del config.
 *
 * Server-only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { validateSurveyConfig } from "@/lib/events/survey-config-validator";
import { saveSurveyConfigForEvent } from "@/lib/events/survey-config-save";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface UpdateSurveyConfigBody {
  surveyConfig?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // 1. Supabase debe estar configurado.
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }

  // 2. Auth admin.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  // 3. Parse body.
  let body: UpdateSurveyConfigBody;
  try {
    body = (await req.json()) as UpdateSurveyConfigBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  if (!body.surveyConfig) {
    return NextResponse.json(
      { ok: false, error: "Falta surveyConfig en el body." },
      { status: 400 },
    );
  }

  // 4. Validar schema (mismo validador que el mapper).
  // Si la validación falla, validateSurveyConfig devuelve null y
  // resolvemos al Default para no romper el flujo. Pero acá queremos
  // RECHAZAR si la config es inválida — no aceptar Default silencioso.
  const validated = validateSurveyConfig(body.surveyConfig);
  if (!validated) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "surveyConfig inválido. Verificá: questions no vacío, 2-3 options por buttons, ≤20 chars en títulos, ≤1 isConsent, ≤1 isBusinessDescription.",
      },
      { status: 400 },
    );
  }

  // 5. Persistir via service-role helper (testeable).
  const supabase = createSupabaseAdminClient();
  const result = await saveSurveyConfigForEvent({
    supabase,
    eventId: params.id,
    surveyConfig: validated,
    actorEmail: admin.email,
  });

  if (!result.ok) {
    const statusCode = result.errorCode === "not_found" ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: result.note },
      { status: statusCode },
    );
  }

  return NextResponse.json({
    ok: true,
    eventId: params.id,
    surveyConfig: validated,
    note: result.note,
  });
}