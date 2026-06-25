"use client";

/**
 * Login dev: usa el endpoint /api/dev/admin-session para obtener credenciales
 * temporales y luego hace signInWithPassword en el cliente.
 *
 * Solo se monta si NODE_ENV !== "production" (chequeado en page.tsx padre).
 * No usa magic link → bypass el rate-limit del plan free de Supabase.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Field, Input, Button, Badge } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  allowlistHint: string;
}

export function DevLoginClient({ allowlistHint }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/dev/admin-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, secret }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          setError(data?.error ?? `Error ${res.status}`);
          return;
        }

        // Ahora hacemos signInWithPassword en el cliente → cookies vía PKCE.
        const browserClient = createSupabaseBrowserClient();
        const signInResult = await browserClient.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInResult.error) {
          setError(
            `Credenciales OK pero signInWithPassword falló: ${signInResult.error.message}`,
          );
          return;
        }

        setSuccess(
          `Login dev OK como ${data.email}. Redirigiendo al panel admin…`,
        );
        // Pequeño delay para que el usuario vea el mensaje.
        setTimeout(() => {
          router.push("/admin");
          router.refresh();
        }, 600);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado.");
      }
    });
  };

  return (
    <Card className="p-8 max-w-md mx-auto">
      <div className="mb-6">
        <span className="inline-block px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs font-semibold uppercase">
          Solo dev
        </span>
        <h1 className="text-2xl font-bold text-ink mt-3">Dev Login (sin email)</h1>
        <p className="text-sm text-ink-muted mt-1">
          Bypass temporal del rate-limit de Supabase. Usa el secret de tu{" "}
          <code className="bg-brand-50 px-1 rounded">.env.local</code> (
          <code className="bg-brand-50 px-1 rounded">DEV_ADMIN_SECRET</code>).
        </p>
        <p className="text-xs text-ink-muted mt-2">
          Emails permitidos: <span className="font-mono">{allowlistHint}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email admin" htmlFor="dev-email">
          <Input
            id="dev-email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field
          label="DEV_ADMIN_SECRET"
          htmlFor="dev-secret"
          hint="Lo defines tú en .env.local y lo pegas aquí cada vez."
        >
          <Input
            id="dev-secret"
            type="password"
            placeholder="********"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
        </Field>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? "Conectando…" : "Entrar al panel admin"}
        </Button>
        <p className="text-xs text-ink-muted text-center">
          Este endpoint devuelve <strong>404</strong> en producción (
          <code className="bg-brand-50 px-1 rounded">NODE_ENV=production</code>).
          No hay riesgo de fuga en builds deployados.
        </p>
      </form>

      <div className="mt-6 pt-6 border-t border-brand-100 text-xs text-ink-muted">
        <p className="font-semibold mb-1">¿Prefieres el magic link normal?</p>
        <Link href="/admin/login" className="text-brand-700 underline">
          Ir al login con magic link →
        </Link>
      </div>
    </Card>
  );
}