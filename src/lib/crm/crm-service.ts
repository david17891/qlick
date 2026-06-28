/**
 * Servicio CRM — fachada de lectura/escritura del módulo comercial.
 *
 * MVP: lee de datos mock (`src/lib/data/crm-data.ts`). La firma pública está
 * pensada para migrar a Supabase sin romper a los consumidores (mismo patrón
 * que el resto de `src/lib/data/*`). Ver docs/ARCHITECTURE.md.
 *
 * Reglas de la fase demo:
 * - Las funciones de lectura son reales (devuelven datos mock).
 * - Las funciones de escritura (createLeadFromContactForm, cambios de estado)
 *   son demo: no persisten. Devuelven un resultado con `demo: true` para que la
 *   UI pueda etiquetarlo claramente.
 */

import type {
  Lead,
  LeadStatus,
  LeadSource,
  LeadIntent,
  LeadInteraction,
  Conversation,
  CRMTask,
  CRMOverview,
  SalesOwner,
  WhatsAppProviderConfig,
  CRMNote
} from "@/types";
import {
  leads,
  salesOwners,
  leadInteractions,
  conversations,
  crmTasks,
  crmNotes,
  whatsappProviders
} from "@/lib/data/crm-data";
import { calculateConversionRate } from "./pipeline-utils";

/* --------------------------- Lecturas --------------------------- */

export function getLeads(): Lead[] {
  return [...leads];
}

export function getLeadById(id: string): Lead | undefined {
  return leads.find((l) => l.id === id);
}

export function getLeadsByStatus(status: LeadStatus): Lead[] {
  return leads.filter((l) => l.status === status);
}

export function getLeadsBySource(source: LeadSource): Lead[] {
  return leads.filter((l) => l.source === source);
}

export function getSalesOwners(): SalesOwner[] {
  return [...salesOwners];
}

export function getLeadInteractions(leadId: string): LeadInteraction[] {
  return leadInteractions
    .filter((i) => i.leadId === leadId)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function getLeadNotes(leadId: string): CRMNote[] {
  return crmNotes
    .filter((n) => n.leadId === leadId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getLeadConversation(leadId: string): Conversation | undefined {
  return conversations.find((c) => c.leadId === leadId);
}

export function getConversations(): Conversation[] {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getWhatsAppProviders(): WhatsAppProviderConfig[] {
  return [...whatsappProviders];
}

export function getCRMTasks(): CRMTask[] {
  return [...crmTasks];
}

export function getUpcomingCRMTasks(): CRMTask[] {
  const now = Date.now();
  return crmTasks
    .filter((t) => !t.done && new Date(t.dueAt).getTime() >= now)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function getOverdueCRMTasks(): CRMTask[] {
  const now = Date.now();
  return crmTasks
    .filter((t) => !t.done && new Date(t.dueAt).getTime() < now)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function getCRMOverview(): CRMOverview {
  const total = leads.length;
  return {
    totalLeads: total,
    newLeads: leads.filter((l) => l.status === "new").length,
    contactedLeads: leads.filter((l) => l.status === "contacted").length,
    paymentPending: leads.filter((l) => l.status === "payment_pending").length,
    enrolled: leads.filter((l) => l.status === "enrolled").length,
    activeStudents: leads.filter((l) => l.status === "active_student").length,
    conversionRate: calculateConversionRate(leads),
    overdueFollowUps: getOverdueCRMTasks().length,
    upcomingAppointments: 0 // se rellena en appointments.ts; aquí se deja 0 para evitar dependencia circular
  };
}

/* --------------------------- Escrituras (demo) --------------------------- */

export interface CreateLeadInput {
  name: string;
  email: string;
  phone?: string;
  courseOfInterest?: string;
  intent?: LeadIntent;
  source?: LeadSource;
  message?: string;
  consentToContact: boolean;
}

export interface CreateLeadResult {
  ok: boolean;
  /** En demo, el id es ficticio y no se persiste. */
  leadId: string;
  demo: boolean;
  note: string;
}

/**
 * Crea un lead a partir del formulario de contacto.
 *
 * MODO DEMO: no persiste. En producción (Fase 1+) esto inserta en Supabase,
 * asigna a un responsable de ventas por round-robin y dispara la notificación.
 *
 * El input llega del formulario público; la firma queda estable para no tener
 * que tocar el formulario cuando se migre el backend.
 */
export function createLeadFromContactForm(
  input: CreateLeadInput
): CreateLeadResult {
  const leadId = `lead_demo_${Date.now().toString(36)}`;

  // Demo: solo registramos en consola para QA. Log SIN PII: solo IDs
  // y flags. Cumple política de datos del repo.
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.info("[crm:demo] lead creado (no persistido)", {
      leadId,
      nameLength: input.name.length,
      emailLength: input.email.length,
      emailDomain: input.email.split("@")[1] ?? "(none)",
      intent: input.intent ?? "course_information",
      consent: input.consentToContact
    });
  }

  return {
    ok: true,
    leadId,
    demo: true,
    note:
      "Lead registrado en modo demo. En producción se guardará en el CRM y se asignará a ventas."
  };
}

export interface LeadStatusChangeResult {
  ok: boolean;
  demo: boolean;
  note: string;
}

/** Cambio de estado de un lead (demo: no persiste). */
export function changeLeadStatus(
  leadId: string,
  nextStatus: LeadStatus
): LeadStatusChangeResult {
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.info("[crm:demo] cambio de estado (no persistido)", {
      leadId,
      nextStatus
    });
  }
  return {
    ok: true,
    demo: true,
    note: `Cambio a "${nextStatus}" registrado en modo demo. En producción se persiste y dispara notificaciones.`
  };
}
