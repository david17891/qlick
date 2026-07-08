"use client";

/**
 * IssueCertButton — botón "✨ Emitir cert" inline en CheckInTab.
 *
 * Sprint Concept C 2026-07-08 — Nivel 1.
 *
 * Wrapper client del server action `issueCertificateAction` que muestra
 * feedback inmediato al admin:
 *   - Botón deshabilitado mientras se ejecuta (useTransition).
 *   - Si la action devuelve `folio`, lo muestra como link "📜 Ver cert" con
 *     un check verde, en vez de dejar el botón ahí (idempotente: si ya
 *     existía cert, la action devuelve el folio y nosotros solo refrescamos).
 *   - Si hay error, lo muestra en rojo.
 *
 * Importante: NO usa `useFormState` porque no tenemos un form con
 * inputs del usuario (solo hidden attendeeId/eventId). Llamamos la
 * action directamente con bind(null, prev) — patrón de Next 14.
 */

import { useState, useTransition } from "react";
import { issueCertificateAction } from "../_actions";

interface Props {
  attendeeId: string;
  eventId: string;
  attendeeName: string;
}

export function IssueCertButton({ attendeeId, eventId, attendeeName }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    folio: string;
    alreadyIssued: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const fd = new FormData();
    fd.set("attendeeId", attendeeId);
    fd.set("eventId", eventId);
    startTransition(async () => {
      const r = await issueCertificateAction(null, fd);
      if (r.ok && r.folio) {
        setResult({ folio: r.folio, alreadyIssued: !!r.alreadyIssued });
      } else {
        setError(r.note || "Error al emitir cert.");
      }
    });
  }

  if (result) {
    return (
      <a
        href={`/cert/${encodeURIComponent(result.folio)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition"
        title={`Folio ${result.folio} (${result.alreadyIssued ? "ya emitido" : "recién emitido"})`}
      >
        ✓ {result.alreadyIssued ? "Ya emitido" : "Ver cert"} ({result.folio})
      </a>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-wait"
      >
        {isPending ? "..." : "✨ Emitir cert"}
      </button>
      {error && (
        <span className="text-[10px] text-red-600 max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}