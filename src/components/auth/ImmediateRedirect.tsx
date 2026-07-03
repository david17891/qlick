/**
 * ImmediateRedirect — fuerza un redirect client-side SIN delay.
 *
 * FIX 2026-07-03 v6 (sesion David, agujero persistente): el matcher del
 * middleware de Next.js 14 NO matchea "/admin" exacto (probado en 5
 * variantes: ["/admin", "/admin/:path*"], "{/:path*}", "(?:/.*)?", "(/.*)?",
 * "^...$"). El server component del /admin/page.tsx llama redirect(),
 * pero Next.js emite 200 + meta-refresh (delay 1s) en lugar de 307 HTTP.
 *
 * David confirmo: en incognito y en normal, el panel admin sigue siendo
 * accesible sin auth. El meta-refresh no se ejecuta en su browser.
 *
 * Solucion definitiva: componente cliente que ejecuta window.location.replace()
 * inmediatamente al hidratar. No depende de meta-refresh ni del matcher.
 *
 * Defense in depth: si el matcher NO matchea, el server component llama
 * requireAdmin() + retorna este componente. El cliente ejecuta el redirect
 * al instante. Sin delay, sin HTML renderizado.
 */

"use client";

import { useEffect } from "react";

interface Props {
  to: string;
}

export function ImmediateRedirect({ to }: Props) {
  useEffect(() => {
    // Reemplaza la entrada del history para que el back button no regrese
    // a la pagina admin sin auth.
    window.location.replace(to);
  }, [to]);

  // Mientras React hidrata el useEffect, mostramos una pantalla minima
  // que indica que estamos redirigiendo. Si JS esta deshabilitado, el
  // meta refresh (delay 0) actua como fallback.
  return (
    <main className="min-h-screen bg-brand-50/40 flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <div className="text-4xl">🔒</div>
        <p className="text-sm text-ink-muted">Sesion requerida. Redirigiendo...</p>
        <meta httpEquiv="refresh" content={`0; url=${to}`} />
      </div>
    </main>
  );
}