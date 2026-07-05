"use client";

import { useEffect, useId, useState } from "react";
import { Button, Input, Field } from "@/components/ui";
import {
  canDeleteEventWith,
  deleteEventInputPlaceholder,
} from "@/lib/events/delete-confirm";

/**
 * Modal compartido de confirmación para borrado de evento (hard delete,
 * no reversible). Fricción alta: el admin debe escribir al menos las
 * **primeras 3 letras** del título del evento (o el título completo si
 * tiene menos) en el input para habilitar el botón.
 *
 * Usado por:
 * - `EventDrawer` (modo editar) — `src/components/events/EventDrawer.tsx`
 * - `AdminEventosClient` (botón directo en la card) — `src/components/events/AdminEventosClient.tsx`
 *
 * Implementa: backdrop semitransparente (`z-60`), dialog centrado (`z-70`),
 * aria-modal, aria-labelledby/describedby, Escape para cerrar. Bloquea close
 * mientras `pending=true`.
 *
 * @example
 *   <ConfirmDeleteEventModal
 *     eventTitle={event.title}
 *     onCancel={() => setShowModal(false)}
 *     onConfirm={handleDelete}
 *     pending={isDeleting}
 *   />
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
  const [confirmation, setConfirmation] = useState("");
  const inputId = useId();
  const titleId = useId();
  const descId = useId();
  const errorId = useId();

  const canConfirm = canDeleteEventWith(eventTitle, confirmation);

  // Reset del input cada vez que el modal se abre. Como el padre controla
  // mount/unmount (`{showModal && <ConfirmDeleteEventModal ... />}`), el
  // state interno se reinicia solo — pero si el padre reusa el modal sin
  // remontarlo, el useEffect igual lo limpia por seguridad.
  useEffect(() => {
    setConfirmation("");
  }, []);

  // Cerrar con Escape (solo si no está pending).
  useEffect(() => {
    if (pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  const placeholder = deleteEventInputPlaceholder(eventTitle);
  const trimmedTitle = eventTitle.trim();

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
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 pointer-events-auto">
          <h3
            id={titleId}
            className="text-lg font-bold text-red-700 mb-2"
          >
            🗑️ ¿Eliminar este evento?
          </h3>
          <p
            id={descId}
            className="text-sm text-ink-soft mb-1"
          >
            Evento:{" "}
            <span className="font-semibold text-ink">
              {trimmedTitle || "(sin título)"}
            </span>
          </p>
          <p className="text-sm text-ink-soft mb-3">
            Esta acción{" "}
            <strong className="text-red-700">NO se puede deshacer</strong>.
            Se eliminarán también los confirmados, asistentes, encuestas y
            links asociados (cascade en DB).
          </p>
          <p className="text-xs text-ink-muted italic mb-5">
            Si solo querés ocultarlo temporalmente, usá{" "}
            <strong>Archivar</strong> en su lugar.
          </p>

          {/* Input de confirmación con fricción alta: primeras 3 letras */}
          <div className="mb-5">
            <Field
              label={
                trimmedTitle
                  ? `Escribí las primeras 3 letras para confirmar`
                  : "Escribí el título del evento para confirmar"
              }
              htmlFor={inputId}
            >
              <Input
                id={inputId}
                name="delete-confirmation"
                type="text"
                autoComplete="off"
                autoFocus
                placeholder={placeholder || undefined}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={pending}
                className="font-mono"
              />
            </Field>
          </div>
          <p id={errorId} className="sr-only">
            {canConfirm
              ? "Confirmación válida. Botón Eliminar habilitado."
              : "Escribí las primeras 3 letras del título del evento para habilitar el botón."}
          </p>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={onConfirm}
              disabled={pending || !canConfirm}
            >
              {pending ? "Eliminando…" : "Sí, eliminar"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
