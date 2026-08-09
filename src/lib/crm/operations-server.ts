import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { listHandoffs } from "./handoffs-server";

export interface CRMOperationsSummary {
  leads: number;
  unassignedLeads: number;
  eventLeads: number;
  commercialLeads: number;
  withoutConsent: number;
  openTasks: number;
  overdueTasks: number;
  staleLeadsWithoutTask: number;
  whatsappConversations: number;
  internalInteractions: number;
  internalNotes: number;
  orphanHandoffs: number;
  generatedAt: string;
}

const EMPTY: CRMOperationsSummary = {
  leads: 0,
  unassignedLeads: 0,
  eventLeads: 0,
  commercialLeads: 0,
  withoutConsent: 0,
  openTasks: 0,
  overdueTasks: 0,
  staleLeadsWithoutTask: 0,
  whatsappConversations: 0,
  internalInteractions: 0,
  internalNotes: 0,
  orphanHandoffs: 0,
  generatedAt: new Date(0).toISOString(),
};

/** Métricas operativas reales para el centro de control del CRM. */
export async function getCRMOperationsSummary(): Promise<CRMOperationsSummary> {
  if (!checkSupabaseConfig().configured) return EMPTY;
  const supabase = createSupabaseAdminClient();

  const [leadResult, taskResult, interactionResult, noteResult, whatsappResult, handoffResult] =
    await Promise.all([
      supabase.from("leads").select("id,status,owner_id,source,consent_to_contact,updated_at"),
      supabase.from("crm_tasks").select("id,lead_id,due_at").eq("status", "pending"),
      supabase.from("lead_interactions").select("lead_id,created_at").order("created_at", { ascending: false }),
      supabase.from("crm_notes").select("id", { count: "exact", head: true }),
      supabase.from("lead_whatsapp_conversations").select("id", { count: "exact", head: true }),
      listHandoffs({ filters: { limit: 200 } }),
    ]);

  const leads = (leadResult.data ?? []) as Array<{
    id: string;
    status: string;
    owner_id: string | null;
    source: string;
    consent_to_contact: boolean;
    updated_at: string;
  }>;
  const tasks = (taskResult.data ?? []) as Array<{ id: string; lead_id: string; due_at: string | null }>;
  const interactions = (interactionResult.data ?? []) as Array<{ lead_id: string; created_at: string }>;
  const now = Date.now();
  const openTaskLeadIds = new Set(tasks.map((task) => task.lead_id));
  const lastInteraction = new Map<string, string>();
  for (const interaction of interactions) {
    if (!lastInteraction.has(interaction.lead_id)) lastInteraction.set(interaction.lead_id, interaction.created_at);
  }

  const staleLeadsWithoutTask = leads.filter((lead) => {
    if (!["new", "contacted"].includes(lead.status) || openTaskLeadIds.has(lead.id)) return false;
    const updated = new Date(lead.updated_at).getTime();
    const last = lastInteraction.get(lead.id);
    const lastContact = Math.max(updated, last ? new Date(last).getTime() : 0);
    return lastContact > 0 && now - lastContact > 48 * 60 * 60 * 1000;
  }).length;

  const leadIds = new Set(leads.map((lead) => lead.id));
  const orphanHandoffs = handoffResult.ok
    ? handoffResult.rows.filter((handoff) => handoff.lead_id === null || !leadIds.has(handoff.lead_id)).length
    : 0;

  return {
    leads: leads.length,
    unassignedLeads: leads.filter((lead) => !lead.owner_id).length,
    eventLeads: leads.filter((lead) => lead.source === "event").length,
    commercialLeads: leads.filter((lead) => lead.source !== "event").length,
    withoutConsent: leads.filter((lead) => !lead.consent_to_contact).length,
    openTasks: tasks.length,
    overdueTasks: tasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < now).length,
    staleLeadsWithoutTask,
    whatsappConversations: whatsappResult.count ?? 0,
    internalInteractions: interactionResult.data?.length ?? 0,
    internalNotes: noteResult.count ?? 0,
    orphanHandoffs,
    generatedAt: new Date().toISOString(),
  };
}
