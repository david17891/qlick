"use client";

/**
 * SendCertEmailButton — botón individual para enviar la constancia de
 * UN asistente por email (o link wa.me pre-armado si no tiene email).
 *
 * Sprint Cert-Individual 2026-07-15.
 *
 * Estados visuales (3 ramas):
 *  1. `alreadySent=true` (cargado desde `event_email_log`):
 *     → badge "✓ Enviado" verde, read-only.
 *  2. `attendeeEmail` presente:
 *     → botón "✉️ Enviar cert". Click llama al action.
 *     → Si OK → badge "✓ Enviado".
 *     → Si error → muestra nota en rojo.
 *  3. `attendeeEmail` ausente pero `attendeePhone` presente:
 *     → link "📱 WhatsApp" (anchor) que abre `wa.me` en nueva tab.
 *     → Antes de abrir, llama al action para emitir cert si falta y
 *       obtener el link con el folio. El click NO se bloquea: si el
 *       action falla, se muestra el error.
 *  4. Sin email ni teléfono:
 *     → no se renderiza nada (la fila no puede entregar constancia).
 *
 * Decisión UX (David, 2026-07-15): badge simple sin fecha ni botón
 * "reenviar". El batch ya deja la fila con `✓ Enviado` y el admin
 * puede ver el log completo en el panel.
 */

import { useState, useTransition } from "react";
import { sendCertificateToAttendeeAction } from "../_actions";

interface Props {
  attendeeId: string;
  eventId: string;
  attendeeName: string;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  /** True si ya hay un entry en event_email_log con ok=true para este cert. */
  alreadySent: boolean;
}

export function SendCertEmailButton({
  attendeeId,
  eventId,
  attendeeName,
  attendeeEmail,
  attendeePhone,
  alreadySent,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState<boolean>(alreadySent);
  const [error, setError] = useState<string | null>(null);
  const [waLink, setWaLink] = useState<string | null>(null);

  // Ya enviado al cargar la página.
  if (sent) {
    return (
      <span
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800"
        title={`Constancia enviada a ${attendeeName}`}
      >
        ✓ Enviado
      </span>
    );
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const r = await sendCertificateToAttendeeAction(attendeeId, eventId);
      if (r.ok) {
        if (r.whatsappFallbackLink) {
          // No tiene email: abrimos wa.me en nueva tab.
          setWaLink(r.whatsappFallbackLink);
          window.open(r.whatsappFallbackLink, "_blank", "noopener,noreferrer");
        } else {
          setSent(true);
        }
      } else {
        setError(r.note);
      }
    });
  }

  // Sin email y sin teléfono: la fila no puede entregar constancia.
  if (!attendeeEmail && !attendeePhone) {
    return (
      <span className="text-[10px] text-ink-muted italic">sin contacto</span>
    );
  }

  // Sin email pero con teléfono: el "botón" es un anchor a wa.me, pero
  // primero necesitamos emitir el cert (si falta) y obtener el link con
  // el folio correcto. El handler ejecuta el action y al terminar abre
  // el link. Mientras está pendiente, mostramos el estado de carga.
  if (!attendeeEmail && attendeePhone) {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition"
            title={`Reabrir WhatsApp para ${attendeeName}`}
          >
            📱 Reabrir WhatsApp
          </a>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition disabled:opacity-50 disabled:cursor-wait"
          >
            {isPending ? "..." : "📱 WhatsApp"}
          </button>
        )}
        {error && (
          <span className="text-[10px] text-red-600 max-w-[200px] text-right">
            {error}
          </span>
        )}
      </div>
    );
  }

  // Tiene email: botón "✉️ Enviar cert".
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSend}
        disabled={isPending}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-wait"
      >
        {isPending ? "..." : "✉️ Enviar cert"}
      </button>
      {error && (
        <span className="text-[10px] text-red-600 max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}
