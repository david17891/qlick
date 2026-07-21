"use client";

import { useState } from "react";

const ACCENT_DARK = "#8e4f5a";

type ReservarFormProps = {
  demo: string;
  services: { name: string }[];
  successHref: string;
};

export function ReservarForm({ demo, services, successHref }: ReservarFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(services[0]?.name ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim() || !date || !time) {
      setError("Falta tu nombre, WhatsApp, fecha u horario.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/diseno-paginas/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          service,
          demo,
          notes: `${date} ${time}${notes ? ` · ${notes}` : ""}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos enviar. Inténtalo de nuevo.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-[#fdf8f5] p-8 text-center">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: `${ACCENT_DARK}1f`, color: ACCENT_DARK }}
        >
          ✓
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-neutral-950">
          ¡Solicitud enviada!
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">
          Recibimos tu solicitud para <strong>{service}</strong>. Te contactamos
          por WhatsApp en menos de 2 horas para confirmar horario y
          disponibilidad.
        </p>
        <a
          href={successHref}
          className="mt-6 inline-block text-sm font-semibold underline"
          style={{ color: ACCENT_DARK }}
        >
          ← Volver al inicio
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        required
        placeholder="Tu nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
      />
      <input
        type="tel"
        required
        placeholder="WhatsApp (10 dígitos)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
        />
        <select
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
        >
          <option value="" disabled>
            Horario
          </option>
          <option value="Mañana (10-13)">Mañana (10-13)</option>
          <option value="Mediodía (13-16)">Mediodía (13-16)</option>
          <option value="Tarde (16-19)">Tarde (16-19)</option>
        </select>
      </div>
      <textarea
        placeholder="¿Algo que debamos saber? (alergias, preferencia de estilista…)"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
      />
      {error ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: ACCENT_DARK }}
      >
        {submitting ? "Enviando…" : "Solicitar cita"}
      </button>
      <p className="text-center text-xs text-neutral-500">
        Te respondemos por WhatsApp en menos de 2 horas.
      </p>
    </form>
  );
}
