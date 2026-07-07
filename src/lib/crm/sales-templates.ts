/**
 * Templates puros del Agente IA Comercial (Fase 3).
 *
 * Helpers sin dependencias de Supabase — se pueden importar directamente
 * desde scripts Node con `node --experimental-strip-types` (tests, audit).
 *
 * El módulo `ai-sales-server.ts` importa de acá y agrega la lectura real
 * del lead + encuesta. Este módulo solo sabe construir textos + URLs.
 */

import type { Lead } from "@/types";

export type SalesIntent = "close" | "value" | "reactivate";

export interface SalesTemplate {
  intent: SalesIntent;
  label: string;
  angle: string;
  message: string;
}

/** Convierte teléfono a formato wa.me: solo dígitos, sin '+'. */
export function phoneToWaMeDigits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * Construye un link wa.me con texto pre-cargado. El texto se codifica
 * con encodeURIComponent (wa.me espera URL encoding estándar).
 *
 * Si el teléfono está vacío o inválido, devuelve `null` para que la UI
 * muestre un botón deshabilitado.
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  if (!phone) return null;
  const digits = phoneToWaMeDigits(phone);
  if (digits.length < 8) return null;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${encoded}`;
}

/* ------------------------------------------------------------------ */
/* Builders de mensajes por intent                                     */
/* ------------------------------------------------------------------ */

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

export function buildCloseMessage(
  lead: Lead,
  courseInterest: string | null,
): string {
  const name = firstName(lead.name);
  const course = courseInterest ?? lead.courseOfInterest ?? "nuestro curso";
  return [
    `¡Hola ${name}! 😊`,
    `Soy David de Qlick. Vi que te interesa mucho ${course} y quería ayudarte a dar el siguiente paso.`,
    `Tenemos ${course} con precio de lanzamiento. ¿Quieres que te comparta el link de pago o prefieres que resolvamos cualquier duda primero?`,
    `Estoy por aquí para lo que necesites. 🙌`,
  ].join("\n");
}

export function buildValueMessage(
  lead: Lead,
  courseInterest: string | null,
): string {
  const name = firstName(lead.name);
  const course = courseInterest ?? lead.courseOfInterest ?? "el curso";
  return [
    `Hola ${name}, gracias por tu interés en ${course}.`,
    `Te paso el temario completo en PDF y te cuento cómo se desarrolla cada módulo. Si te quedan dudas técnicas (herramientas, horarios, certificación), dime y las resolvemos juntos.`,
    `¿Quieres que agendemos una llamada de 15 min para revisar el programa?`,
  ].join("\n");
}

export function buildReactivateMessage(
  lead: Lead,
  courseInterest: string | null,
): string {
  const name = firstName(lead.name);
  const course = courseInterest ?? lead.courseOfInterest ?? "nuestros cursos";
  return [
    `¡Hola ${name}! 🙂`,
    `Soy David de Qlick. Hace un tiempo nos escribiste sobre ${course} y quería retomar la conversación para saber cómo te fue y si aún te interesa.`,
    `¿Tienes 5 min para platicar?`,
  ].join("\n");
}

/**
 * Decide cuántos templates generar según el score del lead.
 *
 * - score >= 60  → 3 templates (close / value / reactivate)
 * - 40 ≤ score < 60 → 2 templates (value / reactivate)
 * - score < 40 o null → 1 template (reactivate)
 */
export function buildSalesTemplatesForLead(
  lead: Lead,
  courseInterest: string | null = null,
): SalesTemplate[] {
  const score = typeof lead.score === "number" ? lead.score : null;
  const templates: SalesTemplate[] = [];

  if (score !== null && score >= 60) {
    templates.push({
      intent: "close",
      label: "Cierre · Hot",
      angle: "Inscripción + links de pago",
      message: buildCloseMessage(lead, courseInterest),
    });
  }

  if (score === null || score >= 40) {
    templates.push({
      intent: "value",
      label: "Valor · Warm",
      angle: "Temario + resolver dudas",
      message: buildValueMessage(lead, courseInterest),
    });
  }

  templates.push({
    intent: "reactivate",
    label: "Reactivación · Cold",
    angle: "Saludo amable retomando contacto",
    message: buildReactivateMessage(lead, courseInterest),
  });

  return templates;
}

/** Helper que combina templates + links wa.me listos para la UI. */
export function buildSalesSuggestions(
  lead: Lead,
  courseInterest: string | null = null,
): Array<SalesTemplate & { whatsappUrl: string }> {
  const templates = buildSalesTemplatesForLead(lead, courseInterest);
  return templates.map((t) => ({
    ...t,
    whatsappUrl: buildWhatsAppLink(lead.phone, t.message) ?? "",
  }));
}