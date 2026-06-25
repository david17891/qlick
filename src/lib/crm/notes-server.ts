/**
 * Notas internas del CRM por lead (server-only).
 *
 * Las notas son privadas (no visibles para el lead). Server-only: usa el
 * cliente admin (service role, bypass RLS). El caller valida admin.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import type { CrmNoteRow, CrmNoteInsert } from "./crm-rows";

/** Devuelve las notas de un lead, ordenadas por creación ascendente. */
export async function getLeadNotes(leadId: string): Promise<CrmNoteRow[]> {
  if (!checkSupabaseConfig().configured || !leadId) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[notes] getLeadNotes falló", { code: error.code, leadId });
    return [];
  }
  return data ?? [];
}

/** Crea una nota. body sanitizado (trim, longitud máxima). */
export async function createCRMNote(
  leadId: string,
  body: string,
  actorEmail: string,
): Promise<{ ok: boolean; note?: CrmNoteRow; error?: string }> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado." };
  }
  const trimmed = body?.trim().slice(0, 5000) ?? "";
  if (!trimmed) return { ok: false, error: "Nota vacía." };
  if (!leadId || !actorEmail) {
    return { ok: false, error: "Faltan datos (leadId/actor)." };
  }

  const payload: CrmNoteInsert = {
    lead_id: leadId,
    body: trimmed,
    created_by_email: actorEmail.trim().toLowerCase(),
  };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_notes")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[notes] createCRMNote falló", { code: error?.code, leadId });
    return { ok: false, error: "No se pudo guardar la nota." };
  }
  return { ok: true, note: data };
}
