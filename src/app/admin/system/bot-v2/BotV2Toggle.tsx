/**
 * BotV2Toggle.tsx — Client Component del interruptor dinámico.
 *
 * Sprint 2 sub-sprint 2.1. Renderiza un toggle iOS-like que controla
 * el flag `deepseek_tools_enabled` del Motor IA Socrático v2.
 *
 * UX:
 *   - Estado inicial desde props (`initialEnabled`): server component
 *     resuelve el valor actual (DB o fallback) y lo pasa al cliente.
 *   - Al hacer click: invoca `toggleDeepseekToolsAction(...)` y muestra
 *     un feedback inmediato. Optimista: el estado visible cambia
 *     ANTES de la respuesta del server, luego se reconcilia.
 *   - Si falla: revert al estado previo + mensaje de error.
 *
 * Accesibilidad: aria-checked, aria-label, label visible.
 */

"use client";

import { useState, useTransition } from "react";
import { toggleDeepseekToolsAction } from "./_actions";

export interface BotV2ToggleProps {
  /** Estado actual desde el server component (DB lookup). */
  initialEnabled: boolean;
  /** Fuente del valor resuelto (para mostrar en el label). */
  source: "db" | "env" | "default";
}

export function BotV2Toggle({ initialEnabled, source }: BotV2ToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sourceLabel =
    source === "db"
      ? "DB"
      : source === "env"
        ? "env"
        : "default";

  function handleToggle() {
    const next = !enabled;
    setError(null);
    // Optimistic update: el switch se mueve antes de la respuesta.
    setEnabled(next);
    startTransition(async () => {
      const res = await toggleDeepseekToolsAction(next);
      if (!res.ok) {
        // Revertir si la accion fallo.
        setEnabled(!next);
        setError(res.note);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle Motor IA Socratico v2"
          disabled={isPending}
          onClick={handleToggle}
          className={[
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
            enabled ? "bg-emerald-500" : "bg-slate-300",
            isPending ? "opacity-60 cursor-wait" : "cursor-pointer",
          ].join(" ")}
          data-testid="bot-v2-toggle"
        >
          <span
            aria-hidden="true"
            className={[
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">
            {enabled ? "🟢 ACTIVADO" : "⚪ APAGADO"}
          </span>
          <span className="text-xs text-slate-500">({sourceLabel})</span>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          Error: {error}
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          {isPending
            ? "Guardando..."
            : "El cambio toma efecto para el siguiente mensaje del bot."}
        </p>
      )}
    </div>
  );
}
