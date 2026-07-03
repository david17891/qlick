"use client";

/**
 * Botón "Eliminar" reutilizable para filas de admin/eventos.
 *
 * FIX 2026-07-03 (sesion David): antes este form estaba inline en
 * `src/app/admin/eventos/[id]/page.tsx` (Server Component) con un
 * `onSubmit` event handler. Eso crasheaba el render de la tab con
 * "Event handlers cannot be passed to Client Component props" en
 * cuanto había datos reales para mostrar.
 *
 * Encapsulamos el form en un Client Component para que el onSubmit
 * sea válido (los event handlers SÍ se pueden usar en Client
 * Components), y dejamos el Server Component padre limpio.
 *
 * Server actions (`action={...}`) se pasan como prop — es el patrón
 * estándar de Next.js 14 para que Client Components ejecuten lógica
 * server-side.
 */

import type { FormEvent } from "react";

export interface DeleteRowButtonProps {
  /** Server action que procesa el delete. Devuelve Promise<unknown>
   * porque las server actions de Next.js devuelven FormState por
   * convención, pero el botón no necesita leer la respuesta. */
  action: (formData: FormData) => Promise<unknown>;
  /** ID del item a eliminar (confirmation o attendee). */
  itemId: string;
  /** ID del evento (para el formData). */
  eventId: string;
  /** Nombre del item — se usa en el mensaje de confirm(). */
  itemName: string;
  /** Tipo — define el nombre del hidden input + texto del confirm. */
  itemType: "confirmado" | "asistente";
  /** Texto extra del confirm (ej. "Esto borra también sus QR tokens"). */
  cascadeNote?: string;
}

export function DeleteRowButton({
  action,
  itemId,
  eventId,
  itemName,
  itemType,
  cascadeNote,
}: DeleteRowButtonProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    const baseMessage =
      itemType === "confirmado"
        ? `¿Eliminar a "${itemName}"?`
        : `¿Eliminar ${itemType} "${itemName}"?`;
    const message = cascadeNote
      ? `${baseMessage} ${cascadeNote}`
      : baseMessage;
    if (!window.confirm(message)) {
      e.preventDefault();
    }
  };

  const hiddenName = itemType === "confirmado" ? "confirmationId" : "attendeeId";
  const titleText =
    itemType === "confirmado"
      ? "Eliminar este confirmado y sus QR tokens asociados"
      : "Eliminar este asistente";

  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name={hiddenName} value={itemId} />
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 transition"
        title={titleText}
      >
        Eliminar
      </button>
    </form>
  );
}