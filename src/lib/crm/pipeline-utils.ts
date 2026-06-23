/**
 * Utilidades del pipeline comercial: orden de etapas, agrupación y conversión.
 */

import type { Lead, LeadStatus, PipelineStage } from "@/types";
import { leads as allLeads } from "@/lib/data/crm-data";
import { leadStatusLabel, statusTone } from "./lead-utils";

/** Orden canónico de las etapas (excluye terminales que van aparte). */
export const PIPELINE_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "info_requested",
  "payment_pending",
  "enrolled",
  "active_student"
];

/** Etapas terminales (no son columnas "de avance" en el kanban). */
export const TERMINAL_STATUSES: LeadStatus[] = ["lost", "archived"];

/**
 * Devuelve las columnas del pipeline con sus leads.
 * Las etapas terminales (lost/archived) se excluyen del kanban principal
 * pero siguen contando para la conversión global.
 */
export function getPipelineStages(leads: Lead[] = allLeads): PipelineStage[] {
  return PIPELINE_ORDER.map((status, idx) => ({
    status,
    label: leadStatusLabel[status],
    order: idx,
    tone: statusTone[status],
    leads: leads.filter((l) => l.status === status)
  }));
}

/**
 * Tasa de conversión simulada = (leads ganados) / (total de leads activos).
 * Se consideran "ganados": enrolled y active_student. Se excluyen archivados.
 * Devuelve un porcentaje 0–100 redondeado.
 */
export function calculateConversionRate(leads: Lead[] = allLeads): number {
  const relevant = leads.filter((l) => l.status !== "archived");
  if (relevant.length === 0) return 0;
  const won = relevant.filter(
    (l) => l.status === "enrolled" || l.status === "active_student"
  ).length;
  return Math.round((won / relevant.length) * 100);
}

/** Valor total potencial del pipeline (suma de estimatedValueMXN). */
export function calculatePipelineValue(leads: Lead[] = allLeads): number {
  return leads.reduce((sum, l) => sum + (l.estimatedValueMXN ?? 0), 0);
}
