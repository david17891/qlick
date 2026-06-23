/**
 * Citas y calendario (modo demo).
 *
 * No se conecta a Google Calendar todavía. Los tipos en `src/types/crm.ts`
 * ya dejan el campo `externalCalendarId` listo para sincronización futura.
 */

import type { Appointment } from "@/types";
import { appointments as allAppointments } from "@/lib/data/crm-data";

export function getAppointments(): Appointment[] {
  return [...allAppointments].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
}

export function getUpcomingAppointments(): Appointment[] {
  const now = Date.now();
  return getAppointments().filter(
    (a) => new Date(a.startsAt).getTime() >= now && a.status === "scheduled"
  );
}

export function getAppointmentsForLead(leadId: string): Appointment[] {
  return getAppointments().filter((a) => a.leadId === leadId);
}

export const appointmentTypeLabel: Record<Appointment["type"], string> = {
  sales_call: "Llamada comercial",
  advisory_call: "Asesoría",
  demo_session: "Sesión demo",
  follow_up: "Seguimiento",
  webinar: "Webinar",
  live_class: "Clase en vivo"
};

export const appointmentStatusTone: Record<
  Appointment["status"],
  "brand" | "accent" | "neutral" | "success" | "warning" | "danger" | "info"
> = {
  scheduled: "info",
  completed: "success",
  cancelled: "neutral",
  no_show: "warning",
  rescheduled: "accent"
};

export const appointmentStatusLabel: Record<Appointment["status"], string> = {
  scheduled: "Agendada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
  rescheduled: "Reagendada"
};
