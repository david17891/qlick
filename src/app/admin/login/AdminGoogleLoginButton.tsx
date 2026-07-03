"use client";

/**
 * Botón "Continuar con Google" para el login ADMIN.
 *
 * TEMPORAL — agregado 2026-06-29 a pedido de David para entrar más rápido
 * sin esperar magic link (Supabase rate-limita el mailer). Pensado para
 * retirar después. Solo funciona para david17891@gmail.com porque el
 * allowlist de admin sigue gobernando quién entra — un email OAuth no
 * allowlisted cae al mismo "forbidden" del callback.
 *
 * Patrón: idéntico al OAuthLoginForm de alumnos pero apuntando a
 * `/auth/callback` (no `/auth/callback-student`). El callback de admin ya
 * valida el allowlist, así que este botón no abre un vector de seguridad
 * nuevo.
 *
 * Defensa:
 * - Si Supabase no está configurado (no hay URL/publishable), no intentamos
 *   la llamada: mostramos mensaje amable.
 * - Si signInWithOAuth devuelve error, NO lo exponemos verbatim. Log
 *   + mensaje genérico.
 */

import { useState } from "react";
import { Button } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidSupabaseUrl } from "@/lib/supabase/config";

export function AdminGoogleLoginButton({
  returnUrl,
}: {
  /** Path interno al que volver después del login (ej. "/admin/eventos/abc"). */
  returnUrl?: string;
}) {
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
        "El acceso admin no está disponible en este momento. Usa el enlace mágico.",
      );
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      // Apuntamos al callback de admin (que valida allowlist), no al de
      // student. Si el email OAuth no está en ADMIN_EMAIL_ALLOWLIST, el
      // callback hace signOut() y redirige a /admin/login?error=forbidden.
      //
      // FIX 2026-07-03 (sesion David): pasamos `returnUrl` para que el
      // callback redirija al path original (no a /admin por default).
      const params = new URLSearchParams();
      if (returnUrl) params.set("returnUrl", returnUrl);
      const qs = params.toString();
      const redirectTo = `${window.location.origin}/auth/callback${qs ? `?${qs}` : ""}`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[admin-auth] signInWithOAuth error", { code: error.code });
        setErrorNote(
          "No pudimos iniciar el acceso con Google. Intenta con el enlace mágico.",
        );
        setLoading(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      setErrorNote(
        "No pudimos iniciar el acceso con Google. Intenta con el enlace mágico.",
      );
      setLoading(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[admin-auth] signInWithOAuth throw", err);
      setErrorNote("Ocurrió un error inesperado. Intenta con el enlace mágico.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        variant="outline"
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