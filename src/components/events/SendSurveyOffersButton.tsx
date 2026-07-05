"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/**
 * Botón "Enviar encuesta por WhatsApp" para el tab Encuestas de un
 * evento. Dispara POST /api/admin/events/[id]/send-survey-offers y
 * muestra el resultado inline (no toast — el feedback inmediato
 * abajo del botón es más útil para esta acción, ver cuántas se mandaron
 * y cuántas fallaron).
 *
 * FASE 7c (2026-07-05): pedido por David durante manual testing del
 * flow de encuesta post-evento. Por ahora la "encuesta" no está
 * configurada a nivel formulario (todavía se usa el builder legacy
 * de survey-tokens-server), pero la oferta interactiva funciona y
 * permite cerrar el ciclo: offer → link → submit → lead scored.
 */
export function SendSurveyOffersButton({
  eventId,
  eventTitle,
  attendeesWithPhone,
  confirmationsWithPhone,
}: {
  eventId: string;
  eventTitle: string;
  attendeesWithPhone: number;
  confirmationsWithPhone: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<null | {
    ok: boolean;
    scope: string;
    sent: number;
    failed: number;
    items: Array<{ name: string | null; ok: boolean; note: string }>;
    note: string;
  }>(null);

  const eligible =
    attendeesWithPhone > 0
      ? attendeesWithPhone
      : confirmationsWithPhone;

  async function handleClick() {
    if (!confirm(`¿Mandar el WhatsApp de encuesta a ${eligible} destinatario(s) del evento "${eventTitle}"?`)) {
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/send-survey-offers`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok: boolean;
        scope: string;
        sent: number;
        failed: number;
        items: Array<{ name: string | null; ok: boolean; note: string }>;
        note: string;
        error?: string;
      };
      if (!data.ok) {
        setResult({
          ok: false,
          scope: "—",
          sent: 0,
          failed: 0,
          items: [],
          note: data.error ?? "Error desconocido."
        });
        return;
      }
      setResult({
        ok: true,
        scope: data.scope,
        sent: data.sent,
        failed: data.failed,
        items: data.items,
        note: data.note
      });
      // Refresca el Server Component del padre para que los números
      // (encuestasCount, etc.) reflejen el estado nuevo.
      router.refresh();
    } catch (err) {
      setResult({
        ok: false,
        scope: "—",
        sent: 0,
        failed: 0,
        items: [],
        note: err instanceof Error ? err.message : "Error de red."
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={handleClick}
          disabled={pending || eligible === 0}
          aria-label="Enviar WhatsApp ofreciendo la encuesta"
        >
          {pending ? "Enviando…" : "🎯 Enviar encuesta por WhatsApp"}
        </Button>
        <p className="text-xs text-ink-muted">
          {eligible > 0
            ? `${eligible} destinatario${eligible === 1 ? "" : "s"} con teléfono (${
                attendeesWithPhone > 0
                  ? "asistentes"
                  : "confirmados, fallback porque no hay check-in todavía"
              }).`
            : "No hay asistentes ni confirmados con teléfono todavía."}
        </p>
      </div>

      {result && (
        <div
          className={
            "rounded-xl border p-4 text-sm " +
            (result.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900")
          }
          role={result.ok ? "status" : "alert"}
        >
          <p className="font-semibold">
            {result.ok
              ? `✓ ${result.sent} enviada${result.sent === 1 ? "" : "s"} · ${
                  result.failed
                } fallida${result.failed === 1 ? "" : "s"}`
              : "✗ Error"}
          </p>
          <p className="mt-1">{result.note}</p>
          {result.items.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {result.items.map((it, i) => (
                <li
                  key={i}
                  className={
                    "flex items-center gap-2 " +
                    (it.ok ? "text-emerald-800" : "text-red-800")
                  }
                >
                  <span>{it.ok ? "✓" : "✗"}</span>
                  <span className="font-medium">
                    {it.name ?? "(sin nombre)"}
                  </span>
                  <span className="text-ink-muted">— {it.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
