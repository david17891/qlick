"use client";

/**
 * EditConfirmationButton — FIX 2026-07-08 (sesión David "registrados sin
 * nombre/correo/teléfono"): botón "Editar" por cada fila de la tabla de
 * Confirmados en `/admin/eventos/[id]?tab=confirmations`.
 *
 * Abre un modal inline con form (name/email/phone) + Save/Cancel.
 * Llama a `editConfirmationAction` (server action) que valida +
 * persiste + audita + re-mapea QR token si cambió email/phone.
 *
 * Replica el patrón del `LeadDetailDrawer` del CRM global:
 *   - Validación client-side (mismas reglas para feedback inmediato).
 *   - Optimistic update local (cierre del modal en success).
 *   - Rollback del estado de error si la server action falla.
 *
 * Reuso del modal: la página tiene muchos otros modales (delete
 * confirmation, etc), pero este es un form editable — necesita su
 * propio componente para mantener el JSX manageable.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { editConfirmationAction } from "../_actions";
import type { EventConfirmation } from "@/types/events";

const initialState = { ok: false, note: "" };

export function EditConfirmationButton({
  confirmation,
  eventId,
}: {
  confirmation: EventConfirmation;
  eventId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(confirmation.name);
  const [email, setEmail] = useState(confirmation.email ?? "");
  const [phone, setPhone] = useState(
    confirmation.phoneNormalized ?? confirmation.phoneRaw ?? "",
  );
  // Hook de react-dom para server actions. Necesita un form real (no
  // async/await directo) para que useFormState/onSubmit funcionen.
  const [serverState, formAction] = useFormState(
    editConfirmationAction,
    initialState,
  );
  // Trackear si ya tuvimos un success para cerrar el modal + reset.
  // (useFormState no expone el último submit; usamos un flag local
  // en el efecto del useState de abajo.)
  const [submittedOk, setSubmittedOk] = useState(false);

  // Cuando serverState.ok pasa a true después de un submit, cerramos.
  if (serverState.ok && !submittedOk) {
    setSubmittedOk(true);
    // Cerrar el modal en el siguiente tick (después del render).
    setTimeout(() => {
      setOpen(false);
      setSubmittedOk(false);
    }, 800);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-brand-200 text-brand-700 hover:bg-brand-50 transition"
        aria-label={`Editar datos de ${confirmation.name}`}
        title="Editar nombre, email y teléfono"
      >
        ✏️ Editar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`edit-conf-${confirmation.id}-title`}
          onClick={(e) => {
            // Cerrar al click en el overlay (no en el contenido).
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl animate-fade-in">
            <h2
              id={`edit-conf-${confirmation.id}-title`}
              className="text-lg font-bold text-ink mb-1"
            >
              Editar confirmado
            </h2>
            <p className="text-sm text-ink-muted mb-4">
              {confirmation.name}
              {confirmation.email ? ` · ${confirmation.email}` : ""}
            </p>
            <form action={formAction} className="space-y-3">
              {/* Hidden inputs para que el server action reciba los IDs. */}
              <input
                type="hidden"
                name="confirmationId"
                value={confirmation.id}
              />
              <input type="hidden" name="eventId" value={eventId} />

              <div>
                <label
                  htmlFor={`edit-name-${confirmation.id}`}
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Nombre
                </label>
                <input
                  id={`edit-name-${confirmation.id}`}
                  name="name"
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-email-${confirmation.id}`}
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Email
                </label>
                <input
                  id={`edit-email-${confirmation.id}`}
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-phone-${confirmation.id}`}
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Teléfono
                </label>
                <input
                  id={`edit-phone-${confirmation.id}`}
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 686 123 4567"
                  className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              {serverState.note && (
                <div
                  className={
                    "p-3 rounded-lg border text-sm " +
                    (serverState.ok
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-800")
                  }
                  role={serverState.ok ? "status" : "alert"}
                >
                  {serverState.note}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink"
                >
                  Cancelar
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function SubmitButton() {
  // useFormStatus solo funciona dentro de un <form action={...}>.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
    >
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}
