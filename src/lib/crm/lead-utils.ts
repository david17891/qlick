/**
 * Utilidades para leads: etiquetas, colores, riesgo y helpers.
 *
 * Puro/presentacional: sin I/O. Facilita una UI consistente para el panel CRM
 * y para el detalle de lead. Estas funciones no cambian al migrar a Supabase.
 */

import type {
  Lead,
  LeadStatus,
  LeadSource,
  LeadIntent
} from "@/types";

/* --------------------- Etiquetas legibles (es-MX) --------------------- */

export const leadStatusLabel: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  interested: "Interesado",
  info_requested: "Info solicitada",
  payment_pending: "Pago pendiente",
  enrolled: "Inscrito",
  active_student: "Alumno activo",
  lost: "Perdido",
  archived: "Archivado"
};

export const leadSourceLabel: Record<LeadSource, string> = {
  website: "Sitio web",
  whatsapp: "WhatsApp",
  facebook_ads: "Facebook Ads",
  instagram_ads: "Instagram Ads",
  referral: "Referido",
  event: "Evento",
  manual: "Carga manual",
  organic: "Orgánico",
  other: "Otro"
};

export const leadIntentLabel: Record<LeadIntent, string> = {
  course_information: "Info de curso",
  enroll_course: "Inscripción",
  pricing: "Precio",
  payment_help: "Ayuda de pago",
  group_access: "Acceso a grupo",
  support: "Soporte",
  schedule_call: "Agendar llamada",
  course_recommendation: "Recomendación",
  unknown: "Sin intención clara"
};

/** Tono de badge según etapa (coherencia visual con el resto del admin). */
export const statusTone: Record<
  LeadStatus,
  "brand" | "accent" | "neutral" | "success" | "warning" | "danger" | "info"
> = {
  new: "info",
  contacted: "brand",
  interested: "accent",
  info_requested: "info",
  payment_pending: "warning",
  enrolled: "success",
  active_student: "success",
  lost: "danger",
  archived: "neutral"
};

/** Tono para el badge de intención. */
export const intentTone: Record<
  LeadIntent,
  "brand" | "accent" | "neutral" | "success" | "warning" | "danger" | "info"
> = {
  course_information: "info",
  enroll_course: "success",
  pricing: "accent",
  payment_help: "warning",
  group_access: "brand",
  support: "danger",
  schedule_call: "brand",
  course_recommendation: "info",
  unknown: "neutral"
};

/* --------------------- Riesgo de respuesta --------------------- */

export type LeadRiskLevel = "low" | "medium" | "high";

export interface LeadRisk {
  level: LeadRiskLevel;
  score: number; // 0–100, mayor = más riesgo de perderse el lead
  reasons: string[];
}

/**
 * Calcula el riesgo de que un lead se enfríe o se pierda si no hay respuesta.
 *
 * Heurística determinista (demo), sin fechas relativas al reloj: compara contra
 * el campo `nextFollowUpAt` y la etapa actual. Pensada para sustituirse por una
 * regla de negocio real cuando haya backend.
 */
export function calculateLeadResponseRisk(lead: Lead): LeadRisk {
  const reasons: string[] = [];
  let score = 0;

  // Lead nuevo sin asignar = riesgo alto.
  if (!lead.ownerId) {
    score += 25;
    reasons.push("Sin responsable asignado");
  }

  // Consentimiento falso → no se le puede contactar.
  if (!lead.consentToContact) {
    score += 20;
    reasons.push("Sin consentimiento de contacto");
  }

  // Etapas críticas donde el silencio cuesta la venta.
  if (lead.status === "payment_pending") {
    score += 35;
    reasons.push("Pago pendiente sin resolver");
  } else if (lead.status === "interested") {
    score += 20;
    reasons.push("Lead caliente que puede enfriarse");
  } else if (lead.status === "new") {
    score += 15;
    reasons.push("Recién llegado, sin contacto aún");
  }

  // Próximo seguimiento vencido (en el pasado respecto a la base del dataset).
  if (lead.nextFollowUpAt) {
    const due = new Date(lead.nextFollowUpAt).getTime();
    // Referencia: ahora en runtime. Solo informativo en demo.
    const now = Date.now();
    if (due < now) {
      score += 25;
      reasons.push("Seguimiento vencido");
    }
  }

  const clamped = Math.max(0, Math.min(100, score));
  const level: LeadRiskLevel =
    clamped >= 60 ? "high" : clamped >= 30 ? "medium" : "low";

  return { level, score: clamped, reasons: reasons.length ? reasons : ["Sin señales de riesgo"] };
}

export const riskTone: Record<LeadRiskLevel, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger"
};

export const riskLabel: Record<LeadRiskLevel, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto"
};
