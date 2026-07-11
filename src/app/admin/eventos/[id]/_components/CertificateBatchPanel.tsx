"use client";

/**
 * CertificateBatchPanel — panel admin para envio batch de certs por correo.
 *
 * Sprint v0.9.2 Cert Email (2026-07-08).
 *
 * UX de 2 pasos:
 *  1. Preview (estado inicial): click en "📧 Preparar envio de certs" llama
 *     `getCertificateBatchPreviewAction`. Muestra cuantos van a recibir
 *     correo, cuantos quedan para fallback WhatsApp, cuantos se skipean
 *     (placeholder names), y un preview del subject.
 *  2. Confirm (estado 'confirm'): boton "✅ Confirmar envio" llama
 *     `sendBatchCertificatesAction`. Muestra el resumen final.
 *
 * Para attendees sin email, el panel muestra un link directo a
 * `wa.me/[phone]?text=...` pre-armado con mensaje + link al cert. Esto
 * abre web.whatsapp.com en el browser de David (no es el bot).
 */

import { useState, useTransition } from "react";
import {
  getCertificateBatchPreviewAction,
  sendBatchCertificatesAction,
  type BatchCertificatePreview,
  type BatchCertificateSendResult,
} from "../_actions";

interface Props {
  eventId: string;
  eventTitle: string;
}

export function CertificateBatchPanel({ eventId, eventTitle }: Props) {
  const [preview, setPreview] = useState<BatchCertificatePreview | null>(null);
  const [result, setResult] = useState<BatchCertificateSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPendingPreview, startPreviewTransition] = useTransition();
  const [isPendingSend, startSendTransition] = useTransition();

  function handlePreview() {
    setError(null);
    setResult(null);
    startPreviewTransition(async () => {
      const r = await getCertificateBatchPreviewAction(eventId);
      if (r.ok) setPreview(r.preview);
      else setError(r.note);
    });
  }

  function handleSend() {
    setError(null);
    startSendTransition(async () => {
      const r = await sendBatchCertificatesAction(eventId);
      setResult(r);
      if (!r.ok && r.errorCount > 0) {
        setError(r.note);
      }
    });
  }

  function buildWhatsAppLink(phone: string, name: string, folio: string | null): string {
    // Deep link a web.whatsapp.com (NO bot). Mensaje pre-armado.
    const safeName = (name || "asistente").trim();
    const folioText = folio ? ` (folio ${folio})` : "";
    const certLine = folio ? `Tu constancia: https://qlick.digital/cert/${folio}` : "Pronto te llegara tu constancia por este medio.";
    const text = encodeURIComponent(
      `Hola ${safeName}, ¡felicidades por completar "${eventTitle}"! 🎉\n\n${certLine}\n\nAbri el link para ver y guardar tu constancia como PDF${folioText}.`,
    );
    // wa.me/[phone]?text=... abre web.whatsapp.com en el browser.
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`;
  }

  // Ya enviado: mostrar resumen final.
  if (result) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="font-semibold text-sm text-emerald-900">
            ✅ {result.note}
          </p>
        </div>
        {result.errors.length > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="font-semibold text-sm text-amber-900 mb-2">
              ⚠️ {result.errors.length} error{result.errors.length === 1 ? "" : "es"}:
            </p>
            <ul className="text-xs text-amber-900 space-y-1">
              {result.errors.map((e) => (
                <li key={e.attendeeId}>
                  <strong>{e.attendeeName}:</strong> {e.error}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setPreview(null);
          }}
          className="text-xs text-brand-600 hover:text-brand-700 underline"
        >
          ← Preparar otro envio
        </button>
      </div>
    );
  }

  // Estado inicial: boton para cargar preview.
  if (!preview) {
    return (
      <div className="p-4 bg-gradient-to-br from-brand-50/40 to-amber-50/40 border border-brand-100 rounded-lg">
        <p className="text-sm text-ink mb-3">
          <strong>Envio masivo de constancias:</strong> emite el cert (si falta) y
          manda el correo de felicitacion a todos los asistentes con check-in que
          tengan email. Los que no tengan email quedan abajo con un link directo a
          WhatsApp para que les mandes manualmente.
        </p>
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPendingPreview}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold bg-gradient-to-r from-brand-500 to-amber-500 text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-wait"
        >
          {isPendingPreview ? "Cargando..." : "📧 Preparar envio de certs"}
        </button>
        {error && (
          <p className="text-xs text-red-600 mt-3">{error}</p>
        )}
      </div>
    );
  }

  // Preview: mostrar desglose + boton de confirmacion.
  const totalToProcess = preview.toEmail.length + preview.toWhatsApp.length;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip label="Total check-in" value={preview.totalCheckedIn} tone="neutral" />
        <StatChip label="📧 Por email" value={preview.toEmail.length} tone="brand" />
        <StatChip label="📱 Por WhatsApp" value={preview.toWhatsApp.length} tone="emerald" />
        <StatChip label="⚠️ Skipped" value={preview.skipped.length} tone="amber" />
      </div>

      {/* Preview subject */}
      <div className="p-3 bg-brand-50/30 border border-brand-100 rounded-lg">
        <p className="text-xs text-ink-muted mb-1">
          <strong>Asunto del correo:</strong>
        </p>
        <p className="text-sm font-mono text-ink">{preview.emailSubjectTemplate}</p>
      </div>

      {/* Lista de email */}
      {preview.toEmail.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-brand-700 font-semibold">
            Ver lista de {preview.toEmail.length} destinatario{preview.toEmail.length === 1 ? "" : "s"} por email
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-ink-muted">
            {preview.toEmail.map((r) => (
              <li key={r.attendeeId}>
                <strong className="text-ink">{r.attendeeName}</strong> · {r.attendeeEmail}
                {r.certStatus === "already_issued" && (
                  <span className="ml-2 text-emerald-600">✓ folio {r.folio}</span>
                )}
                {r.certStatus === "needs_issue" && (
                  <span className="ml-2 text-amber-600">⏳ emitir folio nuevo</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Lista WhatsApp fallback */}
      {preview.toWhatsApp.length > 0 && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-xs font-bold text-emerald-900 mb-2">
            📱 Fallback WhatsApp ({preview.toWhatsApp.length})
          </p>
          <p className="text-xs text-emerald-900/80 mb-3">
            Estos asistentes no tienen email. Click en cada link para abrir
            WhatsApp Web con el mensaje pre-armado (lo mandas manualmente):
          </p>
          <ul className="space-y-1">
            {preview.toWhatsApp.map((r) => (
              <li key={r.attendeeId} className="text-xs">
                <a
                  href={r.attendeePhone ? buildWhatsAppLink(r.attendeePhone, r.attendeeName, r.folio) : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${r.attendeePhone
                    ? "text-emerald-700 hover:text-emerald-800 underline"
                    : "text-ink-muted/50 cursor-not-allowed"
                  }`}
                  onClick={(e) => !r.attendeePhone && e.preventDefault()}
                >
                  📱 {r.attendeeName} ({r.attendeePhone ?? "sin teléfono"})
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skipped */}
      {preview.skipped.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-bold text-amber-900">
            ⚠️ {preview.skipped.length} skipeado{preview.skipped.length === 1 ? "" : "s"} (nombre placeholder)
          </p>
          <p className="text-xs text-amber-900/80 mt-1">
            No se procesan en este batch. Editá el nombre desde el panel para incluirlos.
          </p>
        </div>
      )}

      {/* Boton confirmar */}
      {totalToProcess > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={isPendingSend}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold bg-gradient-to-r from-brand-500 via-pink-500 to-amber-500 text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-wait"
          >
            {isPendingSend ? "Enviando..." : `✅ Confirmar envio (${preview.toEmail.length} email${preview.toEmail.length === 1 ? "" : "s"})`}
          </button>
          <button
            type="button"
            onClick={() => setPreview(null)}
            disabled={isPendingSend}
            className="text-xs text-ink-muted hover:text-ink underline"
          >
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "brand" | "emerald" | "amber";
}) {
  const toneClass: Record<typeof tone, string> = {
    neutral: "bg-white border-brand-100",
    brand: "bg-brand-50 border-brand-200 text-brand-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
  };
  return (
    <div className={`rounded-lg border p-2 ${toneClass[tone]}`}>
      <p className="text-[10px] uppercase font-semibold opacity-70">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}