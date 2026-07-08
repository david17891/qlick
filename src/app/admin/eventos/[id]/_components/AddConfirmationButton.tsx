"use client";

/**
 * AddConfirmationButton — botón "+ Agregar confirmado" en la toolbar de
 * la pestaña Confirmados.
 *
 * FIX 2026-07-07 (sesión David): David quiere poder agregar confirmados
 * manualmente desde el panel admin (no solo vía Excel/WhatsApp bot).
 * El botón abre un modal con form de nombre + email/phone + checkbox
 * "¿enviar email ahora?", llama al endpoint
 *   POST /api/admin/events/[id]/confirmations
 * y muestra feedback (✓ / ✗). router.refresh() recarga la tabla.
 *
 * UX:
 *  - Modal centrado, overlay oscuro, ESC para cerrar.
 *  - Validación client-side: nombre requerido, al menos email o phone.
 *  - Mensaje de éxito: muestra email mode + link al asistente.
 *  - Mensaje de error: muestra el error devuelto.
 *  - Tras éxito: cierra el modal y refresca la página.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | {
      kind: "ok";
      confirmationName: string;
      emailMode: "dev" | "prod";
      emailOk: boolean;
      emailId?: string;
    }
  | { kind: "error"; message: string };

export function AddConfirmationButton({ eventId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const router = useRouter();

  function close() {
    setOpen(false);
    setState({ kind: "idle" });
    // No limpiamos los inputs acá para que el admin pueda hacer una
    // variante rápida (ej. corregir typo y reenviar). El reset ocurre
    // después de un éxito confirmado.
  }

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setSendEmail(true);
    setState({ kind: "idle" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setState({ kind: "error", message: "Falta el nombre." });
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setState({
        kind: "error",
        message: "Necesito al menos un correo o teléfono.",
      });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/admin/events/${eventId}/confirmations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          sendEmail: sendEmail && Boolean(email.trim()),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        confirmation?: { name: string };
        email?: {
          ok?: boolean;
          mode?: "dev" | "prod";
          id?: string;
          error?: string;
        };
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setState({
          kind: "error",
          message:
            data.email?.error ?? data.error ?? `HTTP ${res.status}: error.`,
        });
        return;
      }
      setState({
        kind: "ok",
        confirmationName: data.confirmation?.name ?? name.trim(),
        emailMode: data.email?.mode ?? "prod",
        emailOk: Boolean(data.email?.ok),
        emailId: data.email?.id,
      });
      // Refresca la tabla después de un toque para que aparezca.
      setTimeout(() => {
        router.refresh();
      }, 700);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Error de red.",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition shadow-sm"
      >
        ➕ Agregar confirmado
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Agregar confirmado"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-brand-100 overflow-hidden">
            <div className="p-5 border-b border-brand-50 flex items-center justify-between">
              <h2 className="font-bold text-ink">➕ Agregar confirmado</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="text-ink-muted hover:text-ink"
              >
                ✕
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="add-conf-name"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Nombre <span className="text-rose-600">*</span>
                </label>
                <input
                  id="add-conf-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Gabriela Terán"
                  className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div>
                <label
                  htmlFor="add-conf-email"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Email
                </label>
                <input
                  id="add-conf-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div>
                <label
                  htmlFor="add-conf-phone"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Teléfono (con código de país, ej. +52 1 653 123 4567)
                </label>
                <input
                  id="add-conf-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 1 653 123 4567"
                  className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
                <p className="text-[10px] text-ink-muted mt-1">
                  Necesito al menos uno: email o teléfono.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={sendEmail && Boolean(email.trim())}
                  disabled={!email.trim()}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded border-brand-300 text-brand-500 focus:ring-brand-300"
                />
                Enviar email con QR pass (si tiene email)
              </label>

              {state.kind === "error" && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  ✗ {state.message}
                </div>
              )}

              {state.kind === "ok" && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 space-y-1">
                  <p className="font-semibold">
                    ✓ {state.confirmationName} agregado.
                  </p>
                  {state.emailOk ? (
                    <p>
                      Email enviado ({state.emailMode}
                      {state.emailId ? ` · ${state.emailId.slice(0, 12)}…` : ""}).
                    </p>
                  ) : email.trim() ? (
                    <p className="text-amber-700">
                      Email NO se pudo enviar. Reenviar desde la fila.
                    </p>
                  ) : (
                    <p>Sin email — no se envió correo.</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                {state.kind === "ok" ? (
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                    }}
                    className="px-4 py-2 border border-brand-200 rounded-lg text-sm font-semibold text-ink-soft hover:bg-brand-50 transition"
                  >
                    Agregar otro
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={close}
                    className="px-4 py-2 border border-brand-200 rounded-lg text-sm font-semibold text-ink-soft hover:bg-brand-50 transition"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={state.kind === "submitting"}
                  className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:bg-brand-600 transition disabled:opacity-50"
                >
                  {state.kind === "submitting" ? "Agregando…" : "Agregar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cerrar con ESC */}
      {open && (
        <EscCloser onEsc={() => close()} />
      )}
    </>
  );
}

function EscCloser({ onEsc }: { onEsc: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onEsc();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEsc]);
  return null;
}