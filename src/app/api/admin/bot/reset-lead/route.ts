/**
 * Sprint v0.12: endpoint "Olvidar este número" para que David pueda
 * probar el bot con su número real sin que el contexto se acumule
 * entre pruebas.
 *
 * Limpia:
 *   1. Wizard state en el último outbound del lead (awaiting_survey_step,
 *      awaiting_field, etc.) — efectivamente "olvida" dónde quedó la
 *      conversación.
 *   2. leadProfile.summary (memoria persistente entre sesiones).
 *   3. NO toca el historial de lead_whatsapp_conversations (David
 *      puede ver qué pasó en cada prueba).
 *   4. NO toca event_attendees (opcional: lo limpia el simulator).
 *
 * El siguiente mensaje del lead se trata como conversación nueva.
 *
 * Auth: `requireAdmin` (David usa la sesión admin que ya tiene).
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorLog, infoLog } from "@/lib/log";
import { normalizePhone } from "@/lib/crm/phone-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResetLeadRequest {
  phone: string;
  /** Opcional: si true, también borra event_attendees rows del lead. */
  alsoDeleteAttendees?: boolean;
}

export async function POST(req: NextRequest) {
  // 1. Auth admin.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No admin session" }, { status: 401 });
  }

  // 2. Parse body.
  let body: ResetLeadRequest;
  try {
    body = (await req.json()) as ResetLeadRequest;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.phone || typeof body.phone !== "string") {
    return NextResponse.json(
      { error: "Falta `phone` (string E.164, ej. '+526532935492')" },
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
  const alsoDeleteAttendees = body.alsoDeleteAttendees ?? false;

  try {
    // 3. Buscar el lead por phone.
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
    if (!lead) {
      return NextResponse.json(
        { ok: true, note: `No existe lead con phone=${phone}; nada que resetear` },
        { status: 200 }
      );
    }

    // 4. Limpiar wizard state en el último outbound de este lead.
    // El wizard state vive en lead_whatsapp_conversations.metadata
    // (en el ÚLTIMO outbound). Lo limpiamos poniendo los campos a null.
    const { data: lastOutbounds, error: outErr } = await sb
      .from("lead_whatsapp_conversations")
      .select("id, metadata")
      .eq("lead_id", lead.id)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1);
    if (outErr) {
      errorLog("[reset-lead] error buscando último outbound", {
        leadId: lead.id,
        error: outErr.message,
      });
    }

    let outboundsCleared = 0;
    if (lastOutbounds && lastOutbounds.length > 0) {
      const lastOutbound = lastOutbounds[0];
      // metadata puede venir null, undefined, o no-objeto. Defensive copy.
      const oldMetadata = (lastOutbound.metadata && typeof lastOutbound.metadata === "object")
        ? (lastOutbound.metadata as Record<string, unknown>)
        : {};
      const newMetadata: Record<string, unknown> = { ...oldMetadata };
      // Limpiamos los campos que controlan el wizard state.
      delete newMetadata.awaiting_survey_step;
      delete newMetadata.awaiting_field;
      delete newMetadata.survey_event_id;
      delete newMetadata.survey_event_title;
      delete newMetadata.survey_questions;
      delete newMetadata.survey_answers;
      delete newMetadata.wizard_step;
      delete newMetadata.wizard_event_id;
      delete newMetadata.wizard_event_title;
      const { error: updateErr } = await sb
        .from("lead_whatsapp_conversations")
        .update({ metadata: newMetadata as unknown as never })
        .eq("id", lastOutbound.id);
      if (updateErr) {
        errorLog("[reset-lead] error limpiando metadata del último outbound", {
          outboundId: lastOutbound.id,
          error: updateErr.message,
        });
      } else {
        outboundsCleared = 1;
      }
    }

    // 5. Limpiar leadProfile.summary (memoria persistente).
    // NOTA: lead_profile usa lead_id como PK (no id separado).
    const { data: profiles, error: profErr } = await sb
      .from("lead_profile")
      .select("lead_id, summary")
      .eq("lead_id", lead.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (profErr) {
      errorLog("[reset-lead] error buscando lead_profile", {
        leadId: lead.id,
        error: profErr.message,
      });
    }

    let profilesCleared = 0;
    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      if (profile.summary) {
        // FIX: lead_profile.summary es NOT NULL con default ''. Limpiamos
        // con string vacío en lugar de null para no violar la constraint.
        const { error: profUpdateErr } = await sb
          .from("lead_profile")
          .update({ summary: "", updated_at: new Date().toISOString() })
          .eq("lead_id", profile.lead_id);
        if (profUpdateErr) {
          errorLog("[reset-lead] error limpiando lead_profile.summary", {
            profileId: profile.lead_id,
            error: profUpdateErr.message,
          });
        } else {
          profilesCleared = 1;
        }
      }
    }

    // 6. Opcional: borrar event_attendees rows del lead.
    let attendeesDeleted = 0;
    if (alsoDeleteAttendees) {
      const { data: deletedAtt, error: delAttErr } = await sb
        .from("event_attendees")
        .delete()
        .eq("lead_id", lead.id)
        .select("id");
      if (delAttErr) {
        errorLog("[reset-lead] error borrando event_attendees", {
          leadId: lead.id,
          error: delAttErr.message,
        });
      } else {
        attendeesDeleted = (deletedAtt ?? []).length;
      }
    }

    infoLog("[reset-lead] reset OK", {
      leadId: lead.id,
      phone,
      outboundsCleared,
      profilesCleared,
      attendeesDeleted,
      alsoDeleteAttendees,
      adminEmail: admin.email,
    });

    return NextResponse.json(
      {
        ok: true,
        leadId: lead.id,
        phone,
        cleared: {
          outbounds: outboundsCleared,
          profiles: profilesCleared,
          attendees: attendeesDeleted
        },
        note: "Siguiente mensaje del lead se trata como conversación nueva."
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorLog("[reset-lead] error fatal", { error: msg, phone });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
