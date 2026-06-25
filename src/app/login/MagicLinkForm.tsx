"use client";

/**
 * Form de magic link para ALUMNOS.
 *
 * IMPORTANTE: este form NO consulta ADMIN_EMAIL_ALLOWLIST — cualquier email
 * puede pedir un enlace. La validación de admin vive en el callback de admin
 * (`/auth/callback`) y no nos concierne.
 *
 * ¿Por qué se hace en el cliente (no en una Server Action)?
 * - PKCE: `signInWithOtp` genera un `code_verifier` que DEBE persistir en una
 *   cookie DEL NAVEGADOR. Si se llamara desde una Server Action (server), el
 *   verifier quedaría en cookies del response de la action, no en el navegador
 *   del usuario, y el callback (`/auth/callback-student`) no lo encontraría al
 *   intercambiar el `code` → `exchangeCodeForSession` fallaría.
 * - El cliente browser (`createBrowserClient`) escribe el verifier en la
 *   cookie del navegador y el callback server-side lo lee correctamente.
 *
 * Anti-enumeración: si Supabase devuelve error "user not found" o cualquier
 * otro, NO se lo mostramos al usuario. Mostramos siempre el mismo mensaje
 * genérico ("si el correo está registrado, recibirás un enlace"). Esto evita
 * que alguien pueda enumerar qué emails tienen cuenta.
 */

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidSupabaseUrl } from "@/lib/supabase/config";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^@]+@[^@]+\.[^@]+$/.test(normalized)) {
      setErrorNote("Ingresa un correo válido.");
      return;
    }

    setLoading(true);
    setErrorNote(null);

    // Defensa: si Supabase no está configurado, no intentamos la llamada
    // (causaría un throw y el build/SSR falla). Mostramos mensaje amable.
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
      // PKCE flow: el redirectTo debe apuntar a la página que intercambia el
      // code. Esa ruta es server-only y setea las cookies de sesión.
      const redirectTo = `${window.location.origin}/auth/callback-student`;

      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo: redirectTo },
      });

      setLoading(false);

      if (error) {
        // Rate-limit del mailer integrado de Supabase.
        if (error.code === "over_email_send_rate_limit") {
          setErrorNote(
            "Demasiados intentos en poco tiempo. Espera unos minutos antes de pedir otro enlace.",
          );
          return;
        }
        // Anti-enumeración: mensaje genérico, sin filtrar si el email existe.
        setErrorNote(
          "No pudimos enviar el enlace ahora. Intenta de nuevo en un momento.",
        );
        // eslint-disable-next-line no-console
        console.error("[student-auth] signInWithOtp error", { code: error.code });
        return;
      }

      setSent(true);
    } catch (err) {
      setLoading(false);
      // eslint-disable-next-line no-console
      console.error("[student-auth] signInWithOtp throw", err);
      setErrorNote("Ocurrió un error inesperado. Intenta de nuevo.");
    }
  };

  if (sent) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-sm text-emerald-800">
        <p className="font-semibold mb-1">Revisa tu correo</p>
        <p>
          Si la dirección está registrada, te enviamos un enlace mágico. Ábrelo
          desde este dispositivo para entrar a tu panel.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setEmail("");
            setErrorNote(null);
          }}
          className="mt-3 text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          Usar otro correo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Tu correo"
        htmlFor="student-email"
        hint="Te enviaremos un enlace mágico para entrar sin contraseña."
      >
        <Input
          id="student-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errorNote) setErrorNote(null);
          }}
          required
        />
      </Field>

      {errorNote && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorNote}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Enviando enlace..." : "Enviar enlace mágico"}
      </Button>
    </form>
  );
}