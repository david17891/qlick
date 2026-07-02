"use client";

/**
 * CheckInClient — UI mobile-first para confirmar asistencia.
 *
 * Server Component padre (`page.tsx`) pasa el attendee + evento, y
 * este Client Component maneja el botón "Confirmar asistencia" +
 * estados (loading / success / already).
 *
 * Pega contra `POST /api/check-in/[token]` (mismo segmento dinámico).
 */

import { useState } from "react";
import { formatDate } from "@/lib/utils";

interface Props {
  token: string;
  attendeeName: string;
  eventTitle: string;
  eventStartsAt: string;
  eventLocation: string | null;
  alreadyCheckedIn: boolean;
  checkedInAt: string | null;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; at: string }
  | { kind: "already"; at: string }
  | { kind: "error"; message: string };

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CheckInClient({
  token,
  attendeeName,
  eventTitle,
  eventStartsAt,
  eventLocation,
  alreadyCheckedIn,
  checkedInAt,
}: Props) {
  const [status, setStatus] = useState<Status>(
    alreadyCheckedIn && checkedInAt
      ? { kind: "already", at: checkedInAt }
      : { kind: "idle" },
  );

  async function onConfirm() {
    setStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/check-in/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as {
        ok: boolean;
        checkedInAt?: string;
        alreadyCheckedIn?: boolean;
        error?: string;
      };
      if (res.status === 410) {
        setStatus({ kind: "error", message: "Tu pase venció. Hablá por WhatsApp." });
        return;
      }
      if (res.status === 404) {
        setStatus({ kind: "error", message: "Pase no encontrado." });
        return;
      }
      if (!res.ok || !data.ok) {
        setStatus({
          kind: "error",
          message: data.error ?? `Error ${res.status}`,
        });
        return;
      }
      if (data.alreadyCheckedIn && data.checkedInAt) {
        setStatus({ kind: "already", at: data.checkedInAt });
      } else if (data.checkedInAt) {
        setStatus({ kind: "success", at: data.checkedInAt });
      } else {
        setStatus({ kind: "error", message: "Respuesta inválida del servidor." });
      }
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Error de red.",
      });
    }
  }

  // Success
  if (status.kind === "success") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-50/40 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-bold text-ink">
            ¡Listo, {attendeeName}!
          </h1>
          <p className="text-base text-ink-soft">
            Que disfrutes la conferencia.
          </p>
          <p className="text-xs text-ink-muted">
            Check-in registrado a las {formatTime(status.at)}.
          </p>
          <div className="rounded-2xl bg-white border border-emerald-200 p-4 text-left">
            <p className="text-xs uppercase font-bold text-emerald-700 mb-1">
              {eventTitle}
            </p>
            <p className="text-sm text-ink-soft">
              📅 {formatDate(eventStartsAt)}
            </p>
            {eventLocation && (
              <p className="text-sm text-ink-soft">📍 {eventLocation}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Already checked in
  if (status.kind === "already") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-brand-50/40 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="text-6xl">✅</div>
          <h1 className="text-2xl font-bold text-ink">
            Ya registraste tu asistencia
          </h1>
          <p className="text-sm text-ink-muted">
            {attendeeName}, hiciste check-in a las {formatTime(status.at)}.
            Pasá y disfrutá.
          </p>
          <div className="rounded-2xl bg-white border border-brand-200 p-4 text-left">
            <p className="text-xs uppercase font-bold text-brand-700 mb-1">
              {eventTitle}
            </p>
            <p className="text-sm text-ink-soft">
              📅 {formatDate(eventStartsAt)}
            </p>
            {eventLocation && (
              <p className="text-sm text-ink-soft">📍 {eventLocation}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Error
  if (status.kind === "error") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-rose-50/40 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-ink">
            Algo salió mal
          </h1>
          <p className="text-sm text-ink-muted">{status.message}</p>
          <a
            href="https://wa.me/5212222222222?text=Hola%2C%20no%20pude%20completar%20mi%20check-in"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full max-w-xs mx-auto px-6 py-4 rounded-2xl bg-emerald-500 text-white font-semibold text-base shadow-md hover:bg-emerald-600 transition"
          >
            💬 Hablar por WhatsApp
          </a>
        </div>
      </main>
    );
  }

  // Idle / loading — el estado principal, con el botón grande.
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50/40 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        {/* Header Qlick */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
            Qlick Marketing Integral
          </p>
        </div>

        {/* Card de info */}
        <div className="rounded-2xl bg-white border border-brand-200 shadow-sm p-5 space-y-3">
          <div className="text-center">
            <p className="text-xs uppercase font-bold text-brand-700">
              Hola,
            </p>
            <h1 className="text-2xl font-bold text-ink mt-1">
              {attendeeName}
            </h1>
          </div>
          <div className="border-t border-brand-100 pt-3 space-y-1.5">
            <p className="text-sm font-semibold text-ink">{eventTitle}</p>
            <p className="text-sm text-ink-soft">📅 {formatDate(eventStartsAt)}</p>
            {eventLocation && (
              <p className="text-sm text-ink-soft">📍 {eventLocation}</p>
            )}
          </div>
        </div>

        {/* Botón principal */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={status.kind === "loading"}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-5 rounded-2xl bg-brand-500 text-white font-bold text-lg shadow-lg hover:bg-brand-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status.kind === "loading" ? (
            <>
              <span className="inline-block h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Confirmando…
            </>
          ) : (
            <>✓ Confirmar asistencia</>
          )}
        </button>

        <p className="text-center text-[11px] text-ink-muted">
          Al confirmar, el staff en puerta verá tu nombre registrado.
        </p>
      </div>
    </main>
  );
}