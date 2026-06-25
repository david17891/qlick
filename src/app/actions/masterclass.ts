"use server";

/**
 * Server Action público: registrar una persona en una masterclass.
 *
 * Lo llama el formulario en `src/app/masterclass/[slug]/MasterclassView.tsx`.
 * No requiere auth admin (es público), pero sí valida consentimiento y
 * datos mínimos antes de delegar a `createMasterclassRegistration` (server lib).
 *
 * Decisión de seguridad (D-018 + buenas prácticas Next.js):
 * - El server action corre en el servidor, no en el navegador.
 * - Usa service role server-side, NUNCA expone la key al cliente.
 * - anon NO tiene acceso directo a `masterclass_registrations` (RLS deny).
 * - La validación de consentimiento es defensa en profundidad: también se
 *   exige en el server lib.
 */

import { createMasterclassRegistration } from "@/lib/masterclasses";
import type {
  CreateMasterclassRegistrationResult,
  MasterclassRegistrationInput,
} from "@/types/masterclass";

export type SubmitRegistrationResult = CreateMasterclassRegistrationResult;

export async function submitMasterclassRegistration(
  input: MasterclassRegistrationInput,
): Promise<SubmitRegistrationResult> {
  return createMasterclassRegistration(input);
}