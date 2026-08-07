import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createCRMTask } from "@/lib/crm/tasks-server";
import { sendServiceLeadNotificationToAdmin } from "@/lib/email/service-lead-notification";
import type {
  CaptureServiceInterestInput,
  CaptureServiceInterestResult,
} from "@/types/service-leads";

export async function captureServiceInterest(
  input: CaptureServiceInterestInput
): Promise<CaptureServiceInterestResult> {
  const fail = (note: string): CaptureServiceInterestResult => ({
    ok: false,
    leadId: null,
    interestId: null,
    taskId: null,
    createdLead: false,
    duplicate: false,
    notificationSent: false,
    persisted: false,
    note,
  });

  if (!checkSupabaseConfig().configured) {
    return fail("Supabase no configurado.");
  }

  if (!input.phoneNormalized || !input.serviceSlug || !input.sourceMessageId) {
    return fail("Faltan datos obligatorios para registrar el interés de servicio.");
  }

  const supabase = createSupabaseAdminClient();

  try {
    // 1. Chequeo de duplicados por sourceMessageId
    const { data: existingInterest } = await supabase
      .from("lead_service_interests")
      .select("id, lead_id")
      .eq("source_message_id", input.sourceMessageId)
      .maybeSingle();

    if (existingInterest) {
      return {
        ok: true,
        leadId: existingInterest.lead_id,
        interestId: existingInterest.id,
        taskId: null,
        createdLead: false,
        duplicate: true,
        notificationSent: false,
        persisted: true,
        note: "Interés de servicio previamente registrado.",
      };
    }

    // 2. Buscar lead por teléfono normalizado
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, status, tags, name")
      .or(`phone_normalized.eq.${input.phoneNormalized},phone.eq.${input.phoneNormalized}`)
      .limit(1)
      .maybeSingle();

    let leadId: string;
    let createdLead = false;
    const serviceTag = `servicio:${input.serviceSlug}`;

    if (!existingLead) {
      createdLead = true;
      const initialName = input.leadName?.trim() || "Por confirmar";
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          name: initialName,
          email: null,
          phone: input.phoneNormalized,
          phone_normalized: input.phoneNormalized,
          status: "interested",
          source: input.source || "whatsapp",
          intent: "schedule_call",
          consent_to_contact: true,
          tags: [serviceTag],
        })
        .select("id")
        .single();

      if (leadError || !newLead) {
        // eslint-disable-next-line no-console
        console.error("[service-leads] Error creando lead:", leadError);
        return fail("No se pudo crear el lead de servicios.");
      }
      leadId = newLead.id;
    } else {
      leadId = existingLead.id;
      const currentTags: string[] = existingLead.tags || [];
      const updatedTags = Array.from(new Set([...currentTags, serviceTag]));

      // Promover status únicamente si está en etapa inicial ('new' o 'info_requested')
      let nextStatus = existingLead.status;
      if (existingLead.status === "new" || existingLead.status === "info_requested") {
        nextStatus = "interested";
      }

      // Si el lead no tenía nombre real y viene uno nuevo válido, actualizarlo
      if ((!existingLead.name || existingLead.name === "Por confirmar") && input.leadName && input.leadName !== "Por confirmar") {
        await supabase
          .from("leads")
          .update({
            tags: updatedTags,
            status: nextStatus,
            name: input.leadName.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      } else {
        await supabase
          .from("leads")
          .update({
            tags: updatedTags,
            status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }
    }

    // 3. Resolver service_id y variant_id desde el catálogo de la DB
    let serviceId: string | null = null;
    let variantId: string | null = null;

    const { data: serviceRow } = await supabase
      .from("services")
      .select("id")
      .eq("slug", input.serviceSlug)
      .maybeSingle();

    if (serviceRow) {
      serviceId = serviceRow.id;
      if (input.variantSlug) {
        const { data: variantRow } = await supabase
          .from("service_variants")
          .select("id")
          .eq("service_id", serviceRow.id)
          .eq("slug", input.variantSlug)
          .maybeSingle();
        if (variantRow) {
          variantId = variantRow.id;
        }
      }
    }

    // 4. Insertar fila en lead_service_interests
    const { data: interestRow, error: interestError } = await supabase
      .from("lead_service_interests")
      .insert({
        lead_id: leadId,
        service_id: serviceId,
        service_slug: input.serviceSlug,
        variant_id: variantId,
        variant_slug: input.variantSlug || null,
        category: input.category,
        need_summary: input.needSummary,
        preferred_contact_time: input.preferredContactTime || null,
        source: input.source || "whatsapp",
        campaign_key: input.campaignKey || null,
        consent_basis: input.consentBasis || "inbound_service_request",
        status: "detected",
        source_message_id: input.sourceMessageId,
      })
      .select("id")
      .single();

    if (interestError || !interestRow) {
      // eslint-disable-next-line no-console
      console.error("[service-leads] Error registrando interés:", interestError);
      return fail("No se pudo registrar el interés de servicio.");
    }

    // 5. Crear Tarea CRM asociada al lead y al interés
    const taskTitle = `Contacto de servicio: ${input.serviceSlug}`;
    const taskDesc = [
      `Servicio: ${input.serviceSlug}`,
      `Categoría: ${input.category}`,
      `Necesidad: ${input.needSummary}`,
      `Horario preferido: ${input.preferredContactTime || "No especificado"}`,
      `Campaña: ${input.campaignKey || "WhatsApp directo"}`,
    ].join("\n");

    const taskResult = await createCRMTask(
      {
        leadId,
        title: taskTitle,
        description: taskDesc,
        serviceInterestId: interestRow.id,
      },
      "system@qlick"
    );

    const taskId = taskResult.ok && taskResult.task ? taskResult.task.id : null;

    // 6. Notificación por correo al admin (best effort)
    let notificationSent = false;
    try {
      const emailResult = await sendServiceLeadNotificationToAdmin({
        leadName: input.leadName,
        phoneNormalized: input.phoneNormalized,
        serviceSlug: input.serviceSlug,
        variantSlug: input.variantSlug,
        category: input.category,
        needSummary: input.needSummary,
        preferredContactTime: input.preferredContactTime,
        campaignKey: input.campaignKey,
      });
      notificationSent = emailResult.ok;
    } catch {
      // El error de envío de email no debe deshacer ni fallar la captura
      notificationSent = false;
    }

    return {
      ok: true,
      leadId,
      interestId: interestRow.id,
      taskId,
      createdLead,
      duplicate: false,
      notificationSent,
      persisted: true,
      note: "Interés de servicio registrado exitosamente.",
    };
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[service-leads] Excepción en captureServiceInterest:", err);
    return fail("Error interno al procesar la solicitud de servicios.");
  }
}

export async function updateServiceInterestDetails(input: {
  interestId?: string | null;
  leadId?: string | null;
  leadName?: string | null;
  preferredContactTime?: string | null;
}): Promise<{ ok: boolean }> {
  if (!checkSupabaseConfig().configured) return { ok: false };
  const supabase = createSupabaseAdminClient();

  try {
    if (input.leadId && input.leadName && input.leadName !== "Por confirmar") {
      await supabase
        .from("leads")
        .update({ name: input.leadName.trim(), updated_at: new Date().toISOString() })
        .eq("id", input.leadId)
        .eq("name", "Por confirmar");
    }

    if (input.interestId && input.preferredContactTime) {
      await supabase
        .from("lead_service_interests")
        .update({
          preferred_contact_time: input.preferredContactTime.trim(),
          status: "qualified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.interestId);
    }

    if (input.leadId) {
      const { data: leadData } = await supabase
        .from("leads")
        .select("name, phone_normalized, email")
        .eq("id", input.leadId)
        .maybeSingle();

      const { data: interestData } = await supabase
        .from("lead_service_interests")
        .select("service_slug, variant_slug, category, need_summary, campaign_key")
        .eq("lead_id", input.leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (leadData && interestData) {
        void sendServiceLeadNotificationToAdmin({
          leadName: input.leadName || leadData.name,
          leadEmail: leadData.email,
          phoneNormalized: leadData.phone_normalized || "",
          serviceSlug: interestData.service_slug,
          variantSlug: interestData.variant_slug,
          category: interestData.category,
          needSummary: interestData.need_summary,
          preferredContactTime: input.preferredContactTime || "Confirmado en chat",
          campaignKey: interestData.campaign_key,
          isAppointmentConfirmed: true,
        }).catch(() => null);
      }
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function hasActiveServiceInterest(
  leadId: string | null | undefined
): Promise<boolean> {
  if (!leadId || !checkSupabaseConfig().configured) return false;
  const supabase = createSupabaseAdminClient();
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("lead_service_interests")
      .select("id")
      .eq("lead_id", leadId)
      .gte("created_at", twentyFourHoursAgo)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

