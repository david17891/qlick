"use server";

/**
 * Server Action: crear un lead desde el formulario de contacto público.
 *
 * Este es el único punto por el que el cliente (ContactForm) puede pedir la
 * creación de un lead real. Centraliza:
 * - La verificación de consentimiento (defensa en profundidad).
 * - La decisión demo vs. real (la toma `createLead` en leads-server).
 * - El mensaje que vuelve al usuario final.
 *
 * El cuerpo real de inserción y RLS vive en:
 *   src/lib/crm/leads-server.ts → supabase/migrations/20260623000001_init_leads.sql
 */

import { createLead, type CreateLeadServerInput } from "@/lib/crm/leads-server";

export type SubmitLeadState = {
  ok: boolean;
  /** true si se persistió en Supabase; false si fue demo/fallback. */
  persisted: boolean;
  /** Compatibilidad con la UI existente (demo:true en modo mock). */
  demo: boolean;
  note: string;
};

export async function submitLead(
  input: CreateLeadServerInput,
): Promise<SubmitLeadState> {
  // Defensa en profundidad: el checkbox del formulario ya impide llegar aquí
  // sin consentimiento, pero validamos de nuevo server-side.
  if (!input.consentToContact) {
    return {
      ok: false,
      persisted: false,
      demo: true,
      note: "Debes aceptar ser contactado para enviar el formulario.",
    };
  }

  const result = await createLead(input);
  return {
    ok: result.ok,
    persisted: result.persisted,
    demo: result.demo,
    note: result.note,
  };
}
