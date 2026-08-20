"use client";

/**
 * Controles de la pestaña Check-in.
 *
 * El flujo rápido está pensado para la puerta: busca un registrado por
 * nombre/email/teléfono, permite confirmar el cobro y redirige a Asistentes
 * al terminar. El QR sigue siendo el camino principal.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateQrTokensAction,
  quickManualCheckInAction,
} from "../_actions";

interface ConfirmationOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  paymentStatus: string | null;
  registrationStatus: string | null;
  hasQr: boolean;
}

interface Props {
  eventId: string;
  hasTokens: boolean;
  eventPriceMXN: number;
  confirmations: ConfirmationOption[];
}

export function CheckInTabClient({
  eventId,
  hasTokens,
  eventPriceMXN,
  confirmations,
}: Props) {
  const router = useRouter();
  const [isPendingGen, startTransitionGen] = useTransition();
  const [isPendingQuick, startTransitionQuick] = useTransition();
  const [genNote, setGenNote] = useState<string | null>(null);
  const [genOk, setGenOk] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [quickNote, setQuickNote] = useState<string | null>(null);
  const [quickOk, setQuickOk] = useState(false);
  const [name, setName] = useState("");
  const [selectedConfirmationId, setSelectedConfirmationId] = useState("");
  const [entryMode, setEntryMode] = useState<"search" | "manual">("search");
  const [paid, setPaid] = useState(eventPriceMXN <= 0);

  const suggestions = useMemo(() => {
    const query = name.trim().toLocaleLowerCase();
    if (!query) return confirmations;
    return confirmations
      .filter((confirmation) =>
        [confirmation.name, confirmation.email, confirmation.phone]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(query)),
      );
  }, [confirmations, name]);

  function onGenerateQr(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenNote(null);
    setCsv(null);
    const fd = new FormData();
    fd.set("eventId", eventId);
    startTransitionGen(async () => {
      const result = await generateQrTokensAction(null, fd);
      setGenOk(result.ok);
      setGenNote(result.note);
      if (result.csv) setCsv(result.csv);
    });
  }

  function onDownloadCsv() {
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-tokens-${eventId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function selectConfirmation(confirmation: ConfirmationOption) {
    setEntryMode("search");
    setName(confirmation.name);
    setSelectedConfirmationId(confirmation.id);
    setPaid(
      confirmation.paymentStatus === "paid" ||
        confirmation.paymentStatus === "paid_manual" ||
        confirmation.paymentStatus === "partial" ||
        confirmation.paymentStatus === "not_required",
    );
  }

  function onQuickCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuickNote(null);
    const fd = new FormData(event.currentTarget);
    fd.set("eventId", eventId);
    if (selectedConfirmationId) fd.set("confirmationId", selectedConfirmationId);
    if (paid) fd.set("paid", "true");
    startTransitionQuick(async () => {
      const result = await quickManualCheckInAction(null, fd);
      setQuickOk(result.ok);
      setQuickNote(result.note);
      if (result.ok) {
        router.push(`/admin/eventos/${eventId}?tab=attendees`);
      }
    });
  }

  return (
    <div className="p-5 border-b border-brand-50 space-y-4">
      <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4">
        <h3 className="text-xs font-bold uppercase text-brand-600 mb-3">
          🎟️ Generar QRs para imprimir
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={onGenerateQr}>
            <button
              type="submit"
              disabled={isPendingGen}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
            >
              {isPendingGen
                ? "Generando…"
                : hasTokens
                  ? "♻️ Regenerar tokens (idempotente)"
                  : "🎟️ Generar QRs"}
            </button>
          </form>
          {csv && (
            <button
              type="button"
              onClick={onDownloadCsv}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-brand-200 text-ink-soft hover:bg-brand-50 transition"
            >
              ⬇️ Descargar CSV imprimible
            </button>
          )}
        </div>
        {genNote && (
          <p className={`text-xs mt-2 ${genOk ? "text-emerald-700" : "text-rose-700"}`}>
            {genOk ? "✓" : "✗"} {genNote}
          </p>
        )}
        <p className="text-[10px] text-ink-muted mt-2">
          El CSV incluye el QR como data URL PNG para imprimir. Regenerar es
          idempotente para tokens activos.
        </p>
      </div>

      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold uppercase text-emerald-800">
              ⚡ Check-in rápido manual
            </h3>
            <p className="text-xs text-emerald-900/80 mt-1">
              Busca a un registrado o escribe un nombre nuevo. Al terminar se
              abre directamente la pestaña Asistentes.
            </p>
          </div>
          {eventPriceMXN > 0 && (
            <span className="text-[10px] font-semibold text-emerald-900">
              Evento de ${eventPriceMXN.toLocaleString("es-MX")} MXN
            </span>
          )}
        </div>

        <form onSubmit={onQuickCheckIn} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1 border border-emerald-200">
            <button
              type="button"
              onClick={() => setEntryMode("search")}
              className={`rounded-md px-3 py-2 text-xs font-bold transition ${entryMode === "search" ? "bg-emerald-600 text-white" : "text-emerald-800 hover:bg-emerald-50"}`}
            >
              Buscar registrado
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryMode("manual");
                setSelectedConfirmationId("");
              }}
              className={`rounded-md px-3 py-2 text-xs font-bold transition ${entryMode === "manual" ? "bg-emerald-600 text-white" : "text-emerald-800 hover:bg-emerald-50"}`}
            >
              Alta manual
            </button>
          </div>

          <div>
            <label htmlFor="quick-checkin-name" className="block text-xs font-semibold text-ink-muted mb-1">
              {entryMode === "manual" ? "Nombre del asistente" : "Buscar por nombre, teléfono o correo"}
            </label>
            <input
              id="quick-checkin-name"
              name="name"
              type="search"
              required
              minLength={2}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (entryMode === "search") setSelectedConfirmationId("");
              }}
              placeholder={entryMode === "manual" ? "Ej. Luis Ramírez" : "Ej. Ana López, teléfono o correo…"}
              className="w-full px-3 py-3 border border-emerald-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>

          {entryMode === "search" && suggestions.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-white divide-y divide-emerald-50 max-h-52 overflow-y-auto">
              <p className="px-3 py-2 text-[10px] uppercase font-semibold text-ink-muted">
                {suggestions.length} registrados encontrados · confirmados y pendientes de pago
              </p>
              {suggestions.map((confirmation) => {
                const selected = confirmation.id === selectedConfirmationId;
                const paidStatus =
                  confirmation.paymentStatus === "not_required" ||
                  confirmation.paymentStatus === "paid" ||
                  confirmation.paymentStatus === "paid_manual" ||
                  confirmation.paymentStatus === "partial";
                const registrationLabel = paidStatus
                  ? "registro confirmado"
                  : confirmation.registrationStatus === "payment_pending" ||
                      confirmation.paymentStatus === "pending" ||
                      confirmation.paymentStatus === "pending_verification"
                    ? "pago pendiente"
                    : "por confirmar";
                return (
                  <button
                    key={confirmation.id}
                    type="button"
                    onClick={() => selectConfirmation(confirmation)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 ${selected ? "bg-emerald-100" : ""}`}
                  >
                    <span className="font-semibold text-ink">{confirmation.name}</span>
                    <span className="block text-[11px] text-ink-muted">
                      {confirmation.phone ?? confirmation.email ?? "sin contacto"}
                      {` · ${registrationLabel}`}
                      {confirmation.hasQr ? " · QR listo" : " · sin QR"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {eventPriceMXN > 0 && (
            <label className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-3 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                name="paid"
                checked={paid}
                onChange={(event) => setPaid(event.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              <span>
                <strong>Pagado en puerta</strong>
                <span className="block text-[11px] text-ink-muted">
                  Registra efectivo y habilita el acceso financiero.
                </span>
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={isPendingQuick || name.trim().length < 2}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {isPendingQuick ? "Registrando…" : "⚡ Check-in rápido manual"}
          </button>
        </form>
        {quickNote && (
          <p className={`text-xs mt-3 ${quickOk ? "text-emerald-800" : "text-rose-700"}`}>
            {quickOk ? "✓" : "✗"} {quickNote}
          </p>
        )}
        <p className="text-[10px] text-emerald-900/70 mt-2">
          Si el QR falla, este camino deja el check-in en la misma lista de
          Asistentes y conserva el registro de pago cuando corresponde.
        </p>
      </div>
    </div>
  );
}
