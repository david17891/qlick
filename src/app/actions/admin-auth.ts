"use server";

/**
 * Server Action: solicitar magic link de admin.
 *
 * Invoca Supabase Auth OTP por email con redirect al callback. No revela si el
 * email está en el allowlist (anti-enumeración): siempre devuelve éxito genérico.
 *
 * El allowlist se valida en el callback y el middleware, no aquí: si lo
 * validáramos aquí, un atacante podría saber qué emails son admin pidiendo link.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";

export interface RequestMagicLinkState {
  ok: boolean;
  /** true si el envío del OTP se procesó (sin revelar enumeración). */
  sent: boolean;
  note: string;
}

export async function requestMagicLink(
  email: string,
): Promise<RequestMagicLinkState> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !/^[^@]+@[^@]+\.[^@]+$/.test(normalized)) {
    return {
      ok: false,
      sent: false,
      note: "Email inválido.",
    };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return {
      ok: false,
      sent: false,
      note: "El inicio de sesión no está disponible en este momento.",
    };
  }

  // emailRedirectTo debe apuntar a la appUrl canónica; Supabase exige que esté
  // en la lista de URLs permitidas del dashboard.
  const redirectTo = `${supabaseConfig.appUrl.replace(/\/$/, "")}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    // No filtramos el detalle del error al cliente; lo logueamos server-side.
    // eslint-disable-next-line no-console
    console.error("[admin-auth] signInWithOtp falló", { code: error.code });
    return {
      ok: false,
      sent: false,
      note: "No se pudo enviar el enlace. Intenta de nuevo.",
    };
  }

  return {
    ok: true,
    sent: true,
    note: "Si el correo está autorizado, recibirás un enlace mágico. Revisa tu bandeja.",
  };
}
