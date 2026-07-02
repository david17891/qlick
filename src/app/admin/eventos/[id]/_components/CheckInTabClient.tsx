"use client";

/**
 * CheckInTabClient — Client Component con los forms de la tab Check-in.
 *
 * Tiene:
 *  - Form "Generar QRs" (llama a `generateQrTokensAction` server action).
 *  - Botón de descarga CSV (toma el `csv` que devuelve la server action).
 *  - Form "Check-in manual" (búsqueda por nombre/email/phone + select
 *    opcional para elegir un confirmado).
 *  - Feedback inline de cada action.
 */

import { useState, useTransition } from "react";
import {
  generateQrTokensAction,
  manualCheckInAction,
} from "../_actions";

interface ConfirmationOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  eventId: string;
  hasTokens: boolean;
  confirmations: ConfirmationOption[];
}

export function CheckInTabClient({ eventId, hasTokens, confirmations }: Props) {
  const [isPendingGen, startTransitionGen] = useTransition();
  const [isPendingCheck, startTransitionCheck] = useTransition();
  const [genNote, setGenNote] = useState<string | null>(null);
  const [genOk, setGenOk] = useState<boolean>(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [checkOk, setCheckOk] = useState<boolean>(false);

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

  function onManualCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckNote(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set("eventId", eventId);
    startTransitionCheck(async () => {
      const result = await manualCheckInAction(null, fd);
      setCheckOk(result.ok);
      setCheckNote(result.note);
      if (result.ok) {
        form.reset();
      }
    });
  }

  return (
    <div className="p-5 border-b border-brand-50 space-y-4">
      {/* Toolbar: generar QRs + descarga CSV */}
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
          <p
            className={`text-xs mt-2 ${
              genOk ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {genOk ? "✓" : "✗"} {genNote}
          </p>
        )}
        <p className="text-[10px] text-ink-muted mt-2">
          El CSV incluye el QR como data URL PNG para imprimir. Re-generar
          es idempotente: si un asistente ya tiene token activo, se
          reutiliza.
        </p>
      </div>

      {/* Check-in manual */}
      <div className="rounded-xl border border-brand-100 bg-white p-4">
        <h3 className="text-xs font-bold uppercase text-brand-600 mb-3">
          🙋 Check-in manual
        </h3>
        <form
          onSubmit={onManualCheckIn}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[220px]">
            <label
              htmlFor="checkin-q"
              className="block text-xs font-semibold text-ink-muted mb-1"
            >
              Buscar asistente
            </label>
            <input
              id="checkin-q"
              name="q"
              type="search"
              required
              placeholder="Nombre, email o teléfono…"
              className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          {confirmations.length > 0 && (
            <div className="min-w-[200px]">
              <label
                htmlFor="checkin-conf"
                className="block text-xs font-semibold text-ink-muted mb-1"
              >
                O elegir de confirmados
              </label>
              <select
                id="checkin-conf"
                name="confirmationId"
                className="px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                defaultValue=""
              >
                <option value="">—</option>
                {confirmations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? ` · ${c.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            disabled={isPendingCheck}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition disabled:opacity-50"
          >
            {isPendingCheck ? "Chequeando…" : "✓ Check-in manual"}
          </button>
        </form>
        {checkNote && (
          <p
            className={`text-xs mt-2 ${
              checkOk ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {checkOk ? "✓" : "✗"} {checkNote}
          </p>
        )}
        <p className="text-[10px] text-ink-muted mt-2">
          Si el asistente no está en la lista, se registra como walk-in y
          el admin puede matchearlo después en la tab Asistentes.
        </p>
      </div>
    </div>
  );
}