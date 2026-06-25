/**
 * Interacciones de un lead (server-only).
 *
 * Server-only: usa el cliente admin (service role, bypass RLS).
 * El caller valida admin.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import type { LeadInteractionRow, LeadInteractionInsert } from "./crm-rows";

/** Devuelve las interacciones de un lead (descendente por creación). */
export async function getLeadInteractions(
  leadId: string,
): Promise<LeadInteractionRow[]> {
  if (!checkSupabaseConfig().configured || !leadId) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("lead_interactions")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[interactions] getLeadInteractions falló", {
      code: error.code,
      leadId,
    });
    return [];
  }
  return data ?? [];
}

/**
 * Crea una interacción (registro de contacto con el lead). Usado para dejar
 * evidencia de que el admin contactó al lead (WhatsApp, llamada, email).
 */
export async function createLeadInteraction(
  input: {
    leadId: string;
    channel?: LeadInteractionInsert["channel"];
    direction?: LeadInteractionInsert["direction"];
    summary: string;
  },
  actorEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado." };
  }
  const summary = input.summary?.trim().slice(0, 1000) ?? "";
  if (!summary) return { ok: false, error: "Resumen vacío." };
  if (!input.leadId || !actorEmail) {
    return { ok: false, error: "Faltan datos (leadId/actor)." };
  }

  const payload: LeadInteractionInsert = {
    lead_id: input.leadId,
    channel: input.channel ?? "system",
    direction: input.direction ?? "outbound",
    summary,
    created_by_email: actorEmail.trim().toLowerCase(),
  };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("lead_interactions")
    .insert(payload);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[interactions] createLeadInteraction falló", {
      code: error.code,
    });
    return { ok: false, error: "No se pudo registrar la interacción." };
  }
  return { ok: true };
}
