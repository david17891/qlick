"use client";

/**
 * Form de login para ALUMNOS vía Google OAuth (Supabase Auth).
 *
 * Por qué Google OAuth y no magic link:
 * - En el mercado mexicano (objetivo del LMS), los alumnos están más
 *   familiarizados con "Continuar con Google" que con esperar un correo.
 * - El mailer integrado de Supabase tiene rate-limit y a veces se retrasa.
 *   Con OAuth no dependemos del mailer para entrar.
 * - Magic link se conserva como fallback en `MagicLinkForm.tsx` (deprecated)
 *   por si se necesita volver rápido.
 *
 * Flujo:
 * 1. Click → `signInWithOAuth({ provider: "google", options: { redirectTo } })`.
 * 2. Supabase redirige al consent screen de Google.
 * 3. Usuario acepta → Google redirige a Supabase → Supabase redirige a
 *    `/auth/callback-student?code=...`.
 * 4. El route handler intercambia el `code` por sesión (mismo código que
 *    ya teníamos para magic link, funciona igual) y redirige a `/dashboard`.
 *
 * Nota sobre el redirect:
 * - El `redirectTo` DEBE estar registrado en Supabase (Authentication →
 *   URL Configuration → Redirect URLs). Para dev local:
 *   `http://localhost:3000/auth/callback-student`.
 *
 * Defensa:
 * - Si Supabase no está configurado (no hay URL/publishable key), no
 *   intentamos la llamada: mostramos mensaje amable y dejamos al usuario
 *   salir por el link "¿Eres administrador?".
 * - Si `signInWithOAuth` devuelve error, NO lo exponemos verbatim (anti-
 *   enumeración / anti-leak). Mensaje genérico + log server-side-friendly.
 */

import { useState } from "react";
import { Button } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidSupabaseUrl } from "@/lib/supabase/config";

export function OAuthLoginForm() {
  const [loading, setLoading] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  async function handleGoogle() {
    if (loading) return;
    setLoading(true);
    setErrorNote(null);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "";
    if (!isValidSupabaseUrl(url) || !publishableKey) {
      setLoading(false);
      setErrorNote(
        "El acceso para alumnos aún no está disponible. Vuelve pronto o escribe a soporte.",
      );
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback-student`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      // @supabase/ssr v0.12 NO auto-navega: tenemos que ir manualmente a
      // data.url. Si llegamos acá sin error y con url, navegamos; si no,
      // mostramos el mensaje amable.
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[student-auth] signInWithOAuth error", {
          code: error.code,
        });
        setErrorNote(
          "No pudimos iniciar el acceso con Google. Intenta de nuevo en un momento.",
        );
        setLoading(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      // Sin error y sin url: estado inesperado. Defendamos.
      setErrorNote(
        "No pudimos iniciar el acceso con Google. Intenta de nuevo en un momento.",
      );
      setLoading(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[student-auth] signInWithOAuth throw", err);
      setErrorNote("Ocurrió un error inesperado. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={handleGoogle}
        disabled={loading}
      >
        <GoogleIcon />
        {loading ? "Abriendo Google..." : "Continuar con Google"}
      </Button>

      {errorNote && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorNote}
        </div>
      )}
    </div>
  );
}

/** Logo oficial de Google (4 colores). Inline SVG para no agregar deps. */
function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 48 48"
      className="shrink-0"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"
      />
    </svg>
  );
}
