/**
 * Sprint v0.12 + FIX 2026-07-16 (sprint cobro-en-puerta): lógica
 * del endpoint "Olvidar mi número" / "Olvidar este número".
 *
 * Resetea el contexto de un lead para que David pueda probar el bot
 * con su número real entre sesiones sin que el contexto se acumule.
 *
 * Limpia:
 *   1. leads.name + email + status + whatsapp_status (memoria de
 *      identificación del lead).
 *   2. Wizard state en el último outbound (awaiting_survey_step,
 *      awaiting_field, etc.) — efectivamente "olvida" dónde quedó
 *      la conversación.
 *   3. lead_profile.summary (memoria persistente entre sesiones).
 *   4. event_qr_tokens (por attendee_phone_normalized) — para que
 *      el bot no reutilice el QR previo.
 *   5. event_confirmations (por phone_normalized O email) — para
 *      que el bot no dispare "ya estás registrado" en
 *      interactive_event_inscribir.
 *   6. event_payments (vinculadas a las confirmations borradas).
 *      Se borran ANTES que las confirmations por la FK.
 *   7. event_access (por lead_id) — el lead ya no tiene acceso
 *      al evento después de reset.
 *   8. Opcional: event_attendees (por lead_id) — solo si
 *      alsoDeleteAttendees=true.
 *
 * NO borra el row del lead (eso es reset-test-lead).
 * NO borra el historial de lead_whatsapp_conversations.
 *
 * El siguiente mensaje del lead se trata como conversación nueva.
 *
 * Función pura testeable: recibe el cliente de Supabase como
 * argumento, no depende de Next.js. Esto permite testearla
 * directamente con mocks de node --test.
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { errorLog, infoLog } from "../log";
import { normalizePhone } from "../crm/phone-utils";
import type { Database } from "@/types/supabase";

export interface ResetLeadContextOptions {
  /** Si true, también borra event_attendees rows del lead. */
  alsoDeleteAttendees?: boolean;
  /** Email del admin que ejecuta el reset (para audit log). */
  adminEmail?: string;
}

export interface ResetLeadContextResult {
  ok: boolean;
  leadId?: string;
  phone: string;
  cleared?: {
    outbounds: number;
    profiles: number;
    attendees: number;
    qrTokens: number;
    confirmations: number;
    payments: number;
    access: number;
  };
  note?: string;
  error?: string;
}

type Supabase = SupabaseClient<Database>;

/**
 * Resetea el contexto de un lead. Server-only.
 *
 * @param sb - Cliente de Supabase admin.
 * @param phoneInput - Phone del lead (E.164, ej. "+526532935492").
 * @param options - Opciones (alsoDeleteAttendees, adminEmail).
 * @returns Resultado del reset.
 */
export async function resetLeadContext(
  sb: Supabase,
  phoneInput: string,
  options: ResetLeadContextOptions = {}
): Promise<ResetLeadContextResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) {
    return {
      ok: false,
      phone: phoneInput,
      error: `No se pudo normalizar el phone: ${phoneInput}`,
    };
  }

  const alsoDeleteAttendees = options.alsoDeleteAttendees ?? false;

  try {
    // 1. Buscar el lead por phone.
    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, name, phone_normalized, email, status, whatsapp_status")
      .eq("phone_normalized", phone)
      .maybeSingle();
    if (leadErr) {
      return {
        ok: false,
        phone,
        error: `Error buscando lead: ${leadErr.message}`,
      };
    }
    if (!lead) {
      return {
        ok: true,
        phone,
        note: `No existe lead con phone=${phone}; nada que resetear`,
        cleared: {
          outbounds: 0,
          profiles: 0,
          attendees: 0,
          qrTokens: 0,
          confirmations: 0,
          payments: 0,
          access: 0,
        },
      };
    }

    // 2. FIX 2026-07-16: limpiar name + email + status + whatsapp_status
    // del lead. Sin esto, findLeadByPhone encuentra al lead con
    // name="David Martinez" y el bot dice "ya te tengo registrado".
    const hadNameOrEmail = Boolean(lead.name || lead.email);
    if (hadNameOrEmail) {
      const { error: leadUpdateErr } = await sb
        .from("leads")
        .update({
          name: null,
          email: null,
          status: "new",
          whatsapp_status: "pending",
        } as never)
        .eq("id", lead.id);
      if (leadUpdateErr) {
        errorLog("[reset-lead] error limpiando name/email del lead", {
          leadId: lead.id,
          error: leadUpdateErr.message,
        });
      } else {
        infoLog("[reset-lead] lead name/email limpiados", {
          leadId: lead.id,
          phone,
          prevName: lead.name,
          prevEmail: lead.email,
        });
      }
    }

    // 3. Limpiar wizard state en el último outbound.
    let outboundsCleared = 0;
    {
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
      } else if (lastOutbounds && lastOutbounds.length > 0) {
        const lastOutbound = lastOutbounds[0];
        const oldMetadata =
          lastOutbound.metadata && typeof lastOutbound.metadata === "object"
            ? (lastOutbound.metadata as Record<string, unknown>)
            : {};
        const newMetadata: Record<string, unknown> = { ...oldMetadata };
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
    }

    // 4. Limpiar leadProfile.summary (memoria persistente).
    let profilesCleared = 0;
    {
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
      } else if (profiles && profiles.length > 0) {
        const profile = profiles[0];
        if (profile.summary) {
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
    }

    // 5. Opcional: borrar event_attendees rows del lead.
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

    // 6. FIX 2026-07-16: borrar TODOS los registros de eventos del
    // lead que el bot usa para "recordar" que ya está registrado.
    // Orden importa (FKs):
    //   1. event_payments (FK -> event_confirmations, hay que borrar antes)
    //   2. event_qr_tokens (independiente)
    //   3. event_confirmations (después de payments)
    //   4. event_access (independiente, FK -> leads)
    let qrTokensDeleted = 0;
    let confirmationsDeleted = 0;
    let paymentsDeleted = 0;
    let accessDeleted = 0;

    // 6.1 Buscar confirmation_ids del lead (por phone Y por email).
    const confirmationIds = new Set<string>();
    {
      const { data: confsByPhone, error: confByPhoneErr } = await sb
        .from("event_confirmations")
        .select("id")
        .eq("phone_normalized", phone);
      if (confByPhoneErr) {
        errorLog("[reset-lead] error buscando confirmations por phone", {
          leadId: lead.id,
          error: confByPhoneErr.message,
        });
      } else {
        for (const c of confsByPhone ?? []) confirmationIds.add(c.id);
      }
      if (lead.email) {
        const leadEmail = lead.email.toLowerCase();
        const { data: confsByEmail, error: confByEmailErr } = await sb
          .from("event_confirmations")
          .select("id")
          .eq("email", leadEmail);
        if (confByEmailErr) {
          errorLog("[reset-lead] error buscando confirmations por email", {
            leadId: lead.id,
            error: confByEmailErr.message,
          });
        } else {
          for (const c of confsByEmail ?? []) confirmationIds.add(c.id);
        }
      }
    }

    // 6.2 event_payments: borrar PRIMERO (FK a confirmations).
    if (confirmationIds.size > 0) {
      const { data: deletedPays, error: payDelErr } = await sb
        // FIX 2026-07-15f: typegen stale — event_payments no está en
        // Database. Usamos `as never` para evitar el error de TS sin
        // tocar el codigo del feature. (Patrón del mark-paid.)
        .from("event_payments" as never)
        .delete()
        .in("confirmation_id" as never, Array.from(confirmationIds) as never)
        .select("id" as never);
      if (payDelErr) {
        errorLog("[reset-lead] error borrando event_payments", {
          leadId: lead.id,
          error: payDelErr.message,
        });
      } else {
        paymentsDeleted = ((deletedPays as { id: string }[] | null) ?? []).length;
      }
    }

    // 6.3 event_qr_tokens: por attendee_phone_normalized.
    {
      const { data: deletedQr, error: qrDelErr } = await sb
        .from("event_qr_tokens")
        .delete()
        .eq("attendee_phone_normalized", phone)
        .select("id");
      if (qrDelErr) {
        errorLog("[reset-lead] error borrando event_qr_tokens", {
          leadId: lead.id,
          error: qrDelErr.message,
        });
      } else {
        qrTokensDeleted = (deletedQr ?? []).length;
      }
    }

    // 6.4 event_confirmations.
    if (confirmationIds.size > 0) {
      const { data: deletedConf, error: confDelErr } = await sb
        .from("event_confirmations")
        .delete()
        .in("id", Array.from(confirmationIds))
        .select("id");
      if (confDelErr) {
        errorLog("[reset-lead] error borrando event_confirmations", {
          leadId: lead.id,
          error: confDelErr.message,
        });
      } else {
        confirmationsDeleted = (deletedConf ?? []).length;
      }
    }

    // 6.5 event_access: por lead_id.
    {
      // FIX 2026-07-15f: typegen stale — event_access.lead_id se
      // agregó en migration 20260715131000 pero el Database typegen
      // no se ha regenerado. Usamos `as never` (patrón del mark-paid).
      const { data: deletedAcc, error: accDelErr } = await sb
        .from("event_access")
        .delete()
        .eq("lead_id" as never, lead.id)
        .select("id");
      if (accDelErr) {
        errorLog("[reset-lead] error borrando event_access", {
          leadId: lead.id,
          error: accDelErr.message,
        });
      } else {
        accessDeleted = (deletedAcc ?? []).length;
      }
    }

    infoLog("[reset-lead] reset OK", {
      leadId: lead.id,
      phone,
      outboundsCleared,
      profilesCleared,
      attendeesDeleted,
      qrTokensDeleted,
      confirmationsDeleted,
      paymentsDeleted,
      accessDeleted,
      alsoDeleteAttendees,
      adminEmail: options.adminEmail,
    });

    return {
      ok: true,
      leadId: lead.id,
      phone,
      cleared: {
        outbounds: outboundsCleared,
        profiles: profilesCleared,
        attendees: attendeesDeleted,
        qrTokens: qrTokensDeleted,
        confirmations: confirmationsDeleted,
        payments: paymentsDeleted,
        access: accessDeleted,
      },
      note: "Siguiente mensaje del lead se trata como conversación nueva.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorLog("[reset-lead] error fatal", { error: msg, phone });
    return { ok: false, phone, error: msg };
  }
}
