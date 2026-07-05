"use client";

/**
 * Botón "Eliminar" reutilizable para filas de encuestas (admin/eventos).
 *
 * FIX 2026-07-05: este form necesita un confirm() nativo en el cliente
 * antes de submitir. Si lo dejás inline en el Server Component,
 * "window" no existe → "window is not defined" → render error →
 * "no pudimos cargar este evento" en el error.tsx.
 *
 * Encapsulado en un Client Component — es el mismo patrón que
 * `DeleteRowButton.tsx` (FIX 2026-07-03). Server action `action` se
 * pasa como prop.
 */

import type { FormEvent } from "react";

export interface DeleteSurveyButtonProps {
  /** Server action que procesa el delete. */
  action: (formData: FormData) => Promise<unknown>;
  /** ID del row a eliminar. */
  surveyId: string;
  /** ID del evento (para el formData y revalidation). */
  eventId: string;
  /** Texto identificador del row — se usa en el confirm(). */
  identifier: string;
}

export function DeleteSurveyButton({
  action,
  surveyId,
  eventId,
  identifier
}: DeleteSurveyButtonProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    const ok = window.confirm(
      `¿Eliminar la encuesta de "${identifier}"?\n\n` +
        "Esto borra el row de event_surveys. NO toca leads ni eventos. " +
        "Si ya fue promovida, el lead sobrevive."
    );
    if (!ok) {
      e.preventDefault();
    }
  };

  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="surveyId" value={surveyId} />
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 transition"
        title="Eliminar este row de event_surveys"
        aria-label={`Eliminar encuesta de ${identifier}`}
      >
        Eliminar
      </button>
    </form>
  );
}
