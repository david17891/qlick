"use client";

/**
 * ResendQrPassButton — botón para reenviar el email de QR pass a un asistente.
 *
 * Caso de uso (sesión David 2026-07-07): David quiere un botón en el panel
 * admin para reenviar el pase QR con la plantilla oficial (`renderEventQrPassEmail`
 * + sender `noreply@qlick.digital`) sin tener que generar uno ad-hoc.
 *
 * Usa el endpoint existente:
 *   POST /api/admin/events/[id]/send-qr-pass
 *   Body: { email } | { phone }
 *
 * Auth: el endpoint hace `requireAdmin()` server-side, así que cualquier
 * sesión admin válida puede disparar el reenvío. Audit log persiste cada
 * disparo en `admin_audit_log` con `action=manual_send_qr_pass`.
 *
 * FIX 2026-07-07: agregado en StaffQrTokenList para que David pueda
 * reenviar el pase sin tener que ir a Brevo manualmente o pegar keys.
 */

import { useState } from "react";

interface Props {
  eventId: string;
  /** Email del asistente (preferido; el endpoint hace lookup case-insensitive). */
  attendeeEmail: string | null;
  /** Phone fallback si no hay email. */
  attendeePhone: string | null;
  /** Nombre para el aria-label. */
  attendeeName: string;
  /** Label del botón (default "Reenviar email"). */
  label?: string;
}

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; messageId?: string; mode: "dev" | "prod" }
  | { kind: "error"; message: string };

export function ResendQrPassButton({
  eventId,
  attendeeEmail,
  attendeePhone,
  attendeeName,
  label = "Reenviar email",
}: Props) {
  const [state, setState] = useState<SendState>({ kind: "idle" });

  async function onSend() {
    if (!attendeeEmail && !attendeePhone) {
      setState({ kind: "error", message: "Sin email ni phone." });
      return;
    }
    setState({ kind: "sending" });
    try {
      const res = await fetch(`/api/admin/events/${eventId}/send-qr-pass`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          attendeeEmail ? { email: attendeeEmail } : { phone: attendeePhone },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        email?: { ok?: boolean; id?: string; mode?: "dev" | "prod"; error?: string };
        error?: string;
      };
      if (!res.ok || data.ok === false || data.email?.ok === false) {
        setState({
          kind: "error",
          message:
            data.email?.error ??
            data.error ??
            `HTTP ${res.status}: error al reenviar.`,
        });
        return;
      }
      setState({
        kind: "ok",
        messageId: data.email?.id,
        mode: data.email?.mode ?? "prod",
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Error de red.",
      });
    }
  }

  const disabled = state.kind === "sending" || (!attendeeEmail && !attendeePhone);

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void onSend()}
        disabled={disabled}
        aria-label={`Reenviar email del pase QR a ${attendeeName}`}
        title={
          attendeeEmail
            ? `Reenviar a ${attendeeEmail}`
            : attendeePhone
              ? `Reenviar al teléfono ${attendeePhone}`
              : "Sin contacto para enviar"
        }
        className="text-xs px-2 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        {state.kind === "sending" ? "Enviando…" : `📧 ${label}`}
      </button>
      {state.kind === "ok" && (
        <span className="text-[10px] text-emerald-700 font-semibold">
          ✓ Enviado{state.messageId ? ` (${state.messageId.slice(0, 12)}…)` : ""}
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