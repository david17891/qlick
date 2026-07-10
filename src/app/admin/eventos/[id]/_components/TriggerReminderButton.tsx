"use client";

/**
 * TriggerReminderButton — botón para disparar manualmente el recordatorio
 * 24h de un evento desde el panel admin.
 *
 * Caso de uso (sesión David 2026-07-10 5:24 Phoenix): David decidió
 * desactivar el cron automático (Vercel Hobby 1/día, ya documentado en
 * SPRINT_3_BACKLOG). Por ahora los recordatorios se disparan manual
 * desde este botón.
 *
 * Por ahora solo se implementa el botón del 24h. Los otros kinds
 * (8am, 10am, 2h, 1h) quedan pendientes para Sprint 3.
 *
 * Usa el endpoint existente:
 *   POST /api/admin/events/[id]/trigger-reminder
 *   Body: { kind: '24h' }
 *
 * Auth: el endpoint hace `requireAdmin()` server-side, así que cualquier
 * sesión admin válida puede disparar el recordatorio. Idempotente vía
 * event_reminder_log_v2 UNIQUE constraint.
 */

import { useState } from "react";

interface Props {
  eventId: string;
}

type TriggerState =
  | { kind: "idle" }
  | { kind: "sending" }
  | {
      kind: "ok";
      sent: number;
      failed: number;
      skipped: number;
      mode: "dev" | "prod";
    }
  | { kind: "error"; message: string };

export function TriggerReminderButton({ eventId }: Props) {
  const [state, setState] = useState<TriggerState>({ kind: "idle" });

  async function onTrigger() {
    setState({ kind: "sending" });
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/trigger-reminder`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "24h" }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        failed?: number;
        skipped?: number;
        error?: string;
        note?: string;
      };
      if (!res.ok || data.ok === false) {
        setState({
          kind: "error",
          message: data.error ?? `HTTP ${res.status}: error al disparar.`,
        });
        return;
      }
      setState({
        kind: "ok",
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        skipped: data.skipped ?? 0,
        mode: "prod",
      });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Error de red.",
      });
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void onTrigger()}
        disabled={state.kind === "sending"}
        aria-label="Disparar recordatorio 24h del evento"
        title="Manda el recordatorio 24h a todos los confirmados que no lo hayan recibido aún (idempotente)"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
      >
        {state.kind === "sending"
          ? "Disparando…"
          : "🔔 Disparar recordatorio 24h"}
      </button>
      {state.kind === "ok" && (
        <span className="text-[10px] text-emerald-700 font-semibold">
          ✓ {state.sent} enviados, {state.failed} fallidos, {state.skipped}{" "}
          skipped
        </span>
      )}
      {state.kind === "error" && (
        <span className="text-[10px] text-rose-700 font-semibold max-w-[260px] text-right">
          ✗ {state.message}
        </span>
      )}
    </div>
  );
}
