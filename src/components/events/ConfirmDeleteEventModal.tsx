"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Modal de confirmación simple para borrado de evento (hard delete,
 * irreversible).
 *
 * FIX 2026-07-05: era un input fricción alta ("escribí las primeras 3
 * letras") que David marcó como over-engineering para un evento. Lo
 * simplifiqué a un OK/Cancel nativo del browser-level — el dialog del
 * modal solo muestra CONTEXTO (qué evento se borra + qué cascada)
 * pero NO pide tecleo extra. El "Sí, eliminar" hace el trabajo.
 *
 * Usado por:
 * - `EventDrawer` (modo editar, al fondo del footer)
 * - `AdminEventosClient` (botón directo en cada card del listado)
 *
 * Estructura:
 * - Backdrop semitransparente (z-60) clickeable para cancelar.
 * - Dialog centrado (z-70) con título + cuerpo + 2 botones (Cancelar
 *   / Sí, eliminar). El botón Sí queda disabled mientras `pending=true`
 *   para evitar doble-click.
 * - Escape para cancelar (solo si no está pending).
 */
export function ConfirmDeleteEventModal({
  eventTitle,
  onCancel,
  onConfirm,
  pending,
}: {
  eventTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  // Escape para cancelar (solo si no está pending).
  useEffect(() => {
    if (pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  const trimmedTitle = eventTitle.trim() || "(sin título)";

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={() => !pending && onCancel()}
        className="fixed inset-0 bg-ink/60 z-[60] cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 pointer-events-auto">
          <h3 className="text-lg font-bold text-red-700 mb-2">
            🗑️ ¿Eliminar este evento?
          </h3>
          <p className="text-sm text-ink-soft mb-1">
            Evento:{" "}
            <span className="font-semibold text-ink">{trimmedTitle}</span>
          </p>
          <p className="text-sm text-ink-soft mb-3">
            Esta acción{" "}
            <strong className="text-red-700">NO se puede deshacer</strong>. Se
            eliminan también los confirmados, asistentes, encuestas y links
            asociados (cascade en DB).
          </p>
          <p className="text-xs text-ink-muted italic mb-5">
            Si solo quieres ocultarlo temporalmente, usa{" "}
            <strong>Archivar</strong> en su lugar.
          </p>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? "Eliminando…" : "Sí, eliminar"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
