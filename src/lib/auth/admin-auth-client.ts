"use client";

/**
 * Helper client-side para solicitar el magic link de admin.
 *
 * CORRE EN EL NAVEGADOR (no en Server Action). Esto es CRÍTICO para PKCE:
 * `signInWithOtp` con flow PKCE genera un `code_verifier` que debe persistir en
 * una cookie DEL NAVEGADOR. Si se llamara desde una Server Action (server), el
 * verifier quedaría en cookies del response de la action, no en el navegador, y
 * el callback (/auth/callback) no lo encontraría al intercambiar el code →
 * `exchangeCodeForSession` fallaría con "invalid request" / code_verifier missing.
 *
 * Usando el browser client (createBrowserClient), el verifier se escribe en la
 * cookie del navegador directamente, y el callback server-side lo lee sin
 * problema.
 *
 * IMPORTANTE: las variables NEXT_PUBLIC_* se leen con acceso literal
 * (process.env.NEXT_PUBLIC_*) para que Next.js las inline en el bundle del
 * cliente. Leerlas vía readEnv(key) dinámico NO funciona en el navegador
 * (process.env es {} en el client).
 */

import { createBrowserClient } from "@supabase/ssr";

export interface RequestMagicLinkClientResult {
  ok: boolean;
  /** true si el envío del OTP se procesó (sin revelar enumeración). */
  sent: boolean;
  note: string;
}

export async function requestMagicLinkClient(
  email: string,
): Promise<RequestMagicLinkClientResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !/^[^@]+@[^@]+\.[^@]+$/.test(normalized)) {
    return { ok: false, sent: false, note: "Email inválido." };
  }

  // Acceso literal para que Next.js inline las vars en el bundle del cliente.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!supabaseUrl || !publishableKey) {
    return {
      ok: false,
      sent: false,
      note: "El inicio de sesión no está disponible en este momento.",
    };
  }

  const supabase = createBrowserClient(supabaseUrl, publishableKey);

  const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    // Rate-limit del mailer integrado de Supabase.
    if (error.code === "over_email_send_rate_limit") {
      return {
        ok: false,
        sent: false,
        note: "Demasiados intentos en poco tiempo. Espera unos minutos (o hasta una hora) antes de pedir otro enlace.",
      };
    }
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
