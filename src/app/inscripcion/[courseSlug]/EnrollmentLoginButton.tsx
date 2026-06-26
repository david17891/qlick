"use client";

/**
 * Botón Google OAuth específico para el flujo de inscripción.
 *
 * A diferencia del `OAuthLoginForm` de `/login` (que vuelve a `/dashboard`
 * después del callback), este botón vuelve a `returnPath` (la página de
 * inscripción) para que el server action de inscripción corra inmediatamente
 * después de autenticar.
 *
 * Server-only callback: el `redirectTo` apunta a
 * `/auth/callback-student?next=<returnPath>` y el route handler respeta el
 * `next` para redirigir de vuelta.
 */

import { useState } from "react";
import { Button } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidSupabaseUrl } from "@/lib/supabase/config";

interface Props {
  /** Path al que volver después del OAuth (ej: "/inscripcion/curso-x?ref=qr"). */
  returnPath: string;
  /** Título del curso, para personalizar el copy del botón. */
  courseTitle: string;
}

export function EnrollmentLoginButton({ returnPath, courseTitle }: Props) {
  const [loading, setLoading] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  async function handleClick() {
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
        "El acceso aún no está disponible. Vuelve pronto o escribe a soporte.",
      );
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      // El callback lee ?next= y vuelve a returnPath después de autenticar.
      const callbackUrl = `${window.location.origin}/auth/callback-student?next=${encodeURIComponent(returnPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl },
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[enrollment] signInWithOAuth error", {
          code: error.code,
        });
        setErrorNote(
          "No pudimos iniciar el acceso. Intenta de nuevo en un momento.",
        );
        setLoading(false);
      }
      // En éxito, Supabase redirige la página (no llegamos a esta línea).
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[enrollment] signInWithOAuth throw", err);
      setErrorNote("Ocurrió un error inesperado. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={handleClick}
        disabled={loading}
      >
        {loading
          ? "Abriendo Google..."
          : `Inscribirme a ${courseTitle} con Google`}
      </Button>
      {errorNote && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorNote}
        </div>
      )}
    </div>
  );
}
