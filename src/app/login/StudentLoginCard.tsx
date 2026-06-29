"use client";

/**
 * Tarjeta de login de alumno con Google OAuth prominente + magic link como
 * fallback opcional. (Fase 6 — Hito B)
 *
 * UX flow:
 * 1. Botón grande "Continuar con Google" → 1 click, sin escribir email.
 * 2. Botón secundario "Entrar con mi correo" → expande el MagicLinkForm inline.
 *
 * Por qué este patrón:
 * - Google OAuth = método principal (mercado mexicano, familiar con "Continuar
 *   con Google", evita espera de correo).
 * - Magic link = fallback para quien no tiene o no quiere usar Google.
 *
 * Privacidad:
 * - No expone ningún error verbatim (anti-enumeración).
 * - El fallback aparece abajo del botón, no como opción primaria.
 *
 * F-2026-06-28 M-8 (state preservation):
 * - El MagicLinkForm se renderiza SIEMPRE (no se desmonta al cambiar de
 *   modo). Cuando mode !== "magic" se oculta con `hidden`.
 * - Esto preserva el state interno (email, sent) del MagicLinkForm entre
 *   toggles: si el usuario pidió un enlace, cambió a Google para probar,
 *   y vuelve a magic, sigue viendo "Revisa tu correo" sin tener que
 *   re-enviar.
 */

import { useState } from "react";
import Link from "next/link";
import { OAuthLoginForm } from "./OAuthLoginForm";
import { MagicLinkForm } from "./MagicLinkForm";

type Mode = "google" | "magic";

export function StudentLoginCard() {
  // F-2026-06-28 M-8: el state `mode` se queda acá pero ya no controla el
  // mount/unmount del MagicLinkForm — solo su visibilidad.
  const [mode, setMode] = useState<Mode>("google");

  return (
    <div className="space-y-5">
      {/* OAuth siempre visible cuando mode === "google" */}
      <div hidden={mode !== "google"}>
        <OAuthLoginForm />
      </div>

      {/* Magic link SIEMPRE montado (preserva state interno), solo cambia visibility */}
      <div hidden={mode !== "magic"}>
        <MagicLinkForm />
      </div>

      {/* Toggle de modo: muestra el botón del modo opuesto al actual */}
      {mode === "google" ? (
        <>
          {/* Divider "o" */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-brand-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-ink-muted tracking-wide">
                o usa otro método
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMode("magic")}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-brand-200 text-ink-soft hover:bg-brand-50 transition"
          >
            ✉️ Entrar con mi correo
          </button>

          <p className="text-[11px] text-center text-ink-muted leading-relaxed pt-2">
            Te enviamos un enlace mágico al correo para entrar sin contraseña.
            Útil si no querés usar tu cuenta de Google.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setMode("google")}
          className="w-full text-xs text-ink-muted hover:text-ink underline underline-offset-2 mt-2"
        >
          ← Mejor entro con Google
        </button>
      )}

      {/* Footer: cross-links a admin y a cursos */}
      <div className="pt-4 border-t border-brand-50 space-y-1.5">
        <p className="text-sm text-ink-muted text-center">
          ¿Eres administrador?{" "}
          <Link
            href="/admin/login"
            className="font-semibold text-brand-600 hover:underline"
          >
            Acceso admin
          </Link>
        </p>
        <p className="text-xs text-ink-muted text-center">
          ¿Aún no tienes cuenta?{" "}
          <Link
            href="/cursos"
            className="font-semibold text-brand-600 hover:underline"
          >
            Explora los cursos
          </Link>
        </p>
      </div>
    </div>
  );
}