/**
 * POST /api/admin/bot/reset-test-lead
 *
 * Sprint 2026-07-15: botón de "Olvidar TODO" para que David pueda
 * probar el bot con su número real (Carlos, +52 1 653 293 5492) sin
 * que se acumulen 300+ filas de conversaciones entre pruebas.
 *
 * A diferencia de `/api/admin/bot/reset-lead` (sprint v0.12) que
 * solo limpia wizard state + leadProfile.summary, este endpoint
 * BORRA físicamente todas las filas ligadas al phone:
 *
 *   1. lead_whatsapp_conversations       (340+ filas típicamente)
 *   2. event_attendees                   (todas las del lead)
 *   3. event_confirmations               (todas del phone)
 *   4. event_qr_tokens                   (todas del phone)
 *   5. survey_invitations (si existe)    (todas del phone)
 *   6. lead_profile                      (todas del lead)
 *   7. lead (final)
 *
 * El siguiente mensaje del phone se trata como lead completamente
 * nuevo: el bot re-crea el lead, el abridor sale desde cero, sin
 * wizard state, sin history, sin contexto residual.
 *
 * Auth: `requireAdmin` (gate via ADMIN_EMAIL_ALLOWLIST).
 * Loggeado en `admin_audit_log` con metadata del reset.
 *
 * IMPORTANTE: usar SOLO con phones de testing. Si David lo dispara
 * contra un lead real, se pierden conversaciones y attendees.
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorLog, infoLog } from "@/lib/log";
import { logAdminAction } from "@/lib/crm/audit-server";
import { normalizePhone } from "@/lib/crm/phone-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResetTestLeadRequest {
  phone: string;
}

type DeletionCounts = Record<
  | "conversations"
  | "attendees"
  | "confirmations"
  | "qrTokens"
  | "surveyInvitations"
  | "profiles"
  | "leads",
  number
>;

export async function POST(req: NextRequest) {
  // 1. Auth admin.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No admin session" }, { status: 401 });
  }

  // 2. Parse body.
  let body: ResetTestLeadRequest;
  try {
    body = (await req.json()) as ResetTestLeadRequest;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.phone || typeof body.phone !== "string") {
    return NextResponse.json(
      {
        error:
          "Falta `phone` (string E.164, ej. '+526532935492' o '+52 1 653 293 5492')",
      },
      { status: 400 }
    );
  }

  const phone = normalizePhone(body.phone);
  if (!phone) {
    return NextResponse.json(
      { error: `No se pudo normalizar el phone: ${body.phone}` },
      { status: 400 }
    );
  }

  const sb = createSupabaseAdminClient();
  const counts: DeletionCounts = {
    conversations: 0,
    attendees: 0,
    confirmations: 0,
    qrTokens: 0,
    surveyInvitations: 0,
    profiles: 0,
    leads: 0,
  };

  try {
    // 3. Buscar el lead (puede no existir — en ese caso solo borramos
    //    las filas que matcheen el phone sin lead_id).
    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, name, phone_normalized")
      .eq("phone_normalized", phone)
      .maybeSingle();
    if (leadErr) {
      return NextResponse.json(
        { error: `Error buscando lead: ${leadErr.message}` },
        { status: 500 }
      );
    }

    // 4. Borrar conversaciones del phone (no requieren lead_id, algunas
    //    pudieron crearse antes de tener el lead).
    const { data: delConvs, error: convErr } = await sb
      .from("lead_whatsapp_conversations")
      .delete()
      .eq("phone_normalized", phone)
      .select("id");
    if (convErr) {
      errorLog("[reset-test-lead] error borrando conversations", {
        phone,
        error: convErr.message,
      });
    } else {
      counts.conversations = (delConvs ?? []).length;
    }

    // 5. Borrar event_qr_tokens del phone (pueden existir sin lead_id).
    const { data: delQr, error: qrErr } = await sb
      .from("event_qr_tokens")
      .delete()
      .eq("attendee_phone_normalized", phone)
      .select("id");
    if (qrErr) {
      errorLog("[reset-test-lead] error borrando event_qr_tokens", {
        phone,
        error: qrErr.message,
      });
    } else {
      counts.qrTokens = (delQr ?? []).length;
    }

    if (lead) {
      // 6. Borrar event_attendees del lead (FK por lead_id).
      const { data: delAtt, error: attErr } = await sb
        .from("event_attendees")
        .delete()
        .eq("lead_id", lead.id)
        .select("id");
      if (attErr) {
        errorLog("[reset-test-lead] error borrando event_attendees", {
          leadId: lead.id,
          error: attErr.message,
        });
      } else {
        counts.attendees = (delAtt ?? []).length;
      }

      // 7. Borrar event_confirmations del phone (algunas por phone sin lead).
      const { data: delConf, error: confErr } = await sb
        .from("event_confirmations")
        .delete()
        .eq("phone_normalized", phone)
        .select("id");
      if (confErr) {
        errorLog("[reset-test-lead] error borrando event_confirmations", {
          leadId: lead.id,
          error: confErr.message,
        });
      } else {
        counts.confirmations = (delConf ?? []).length;
      }

      // 8. Borrar lead_profile del lead (PK = lead_id).
      const { data: delProf, error: profErr } = await sb
        .from("lead_profile")
        .delete()
        .eq("lead_id", lead.id)
        .select("lead_id");
      if (profErr) {
        errorLog("[reset-test-lead] error borrando lead_profile", {
          leadId: lead.id,
          error: profErr.message,
        });
      } else {
        counts.profiles = (delProf ?? []).length;
      }

      // 9. Borrar el lead (último, por las FK).
      const { data: delLead, error: leadDelErr } = await sb
        .from("leads")
        .delete()
        .eq("id", lead.id)
        .select("id");
      if (leadDelErr) {
        errorLog("[reset-test-lead] error borrando lead", {
          leadId: lead.id,
          error: leadDelErr.message,
        });
        return NextResponse.json(
          { error: `Error borrando lead: ${leadDelErr.message}` },
          { status: 500 }
        );
      }
      counts.leads = (delLead ?? []).length;
    }

    // 10. Audit log (best-effort, no rompe el flow si falla).
    try {
      await logAdminAction({
        action: "reset_test_lead",
        entity_type: "lead",
        entity_id: lead?.id ?? phone,
        actor_email: admin.email ?? "unknown",
        metadata: {
          phone,
          leadExisted: Boolean(lead),
          leadName: lead?.name ?? null,
          counts,
        },
      });
    } catch {
      /* swallow */
    }

    infoLog("[reset-test-lead] reset OK", {
      phone,
      leadId: lead?.id ?? null,
      counts,
      adminEmail: admin.email,
    });

    return NextResponse.json(
      {
        ok: true,
        phone,
        leadExisted: Boolean(lead),
        deleted: counts,
        note:
          "Reset completo. El próximo mensaje del phone se trata como lead nuevo.",
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorLog("[reset-test-lead] error fatal", { error: msg, phone });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
