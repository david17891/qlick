import { useState } from "react";
import { TemplateNav } from "@/components/web-templates/TemplateNav";
import { TemplateFooter } from "@/components/web-templates/TemplateFooter";
import { QlickBadge } from "@/components/web-templates/QlickBadge";

export const metadata = {
  title: "Reservar cita · Lumière Studio",
  description:
    "Agenda tu cita en Lumière Studio, salón de belleza en la Roma Norte, CDMX. Cortes, color, manicura, pedicura y tratamientos faciales.",
};

const ACCENT = "#b76e79";
const ACCENT_DARK = "#8e4f5a";

const SERVICES = [
  { name: "Corte + Peinado", price: "$350", duration: "60 min" },
  { name: "Color & Balayage", price: "$1,200", duration: "3 h" },
  { name: "Manicura + Gel", price: "$280", duration: "75 min" },
  { name: "Tratamiento Facial", price: "$650", duration: "60 min" },
  { name: "Pedicura Spa", price: "$380", duration: "60 min" },
  { name: "Paquete Novia", price: "$2,800", duration: "Medio día" },
];

export default function Demo1AContacto() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("Corte + Peinado");
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
          demo: "lumiere-studio",
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

  return (
    <div className="min-h-screen bg-[#fdf8f5] text-neutral-900">
      <QlickBadge />
      <TemplateNav
        brand="Lumière"
        tagline="Studio · Roma Norte"
        accentColor={ACCENT_DARK}
        links={[
          { label: "Inicio", href: "/diseno-paginas/demo-1a" },
          { label: "Reservar", href: "#reservar" },
          { label: "Servicios", href: "#servicios" },
          { label: "Contacto", href: "#contacto" },
        ]}
        ctaLabel="Reservar ahora"
        ctaHref="#reservar"
      />

      {/* ── Hero ── */}
      <section
        id="reservar"
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #fdf8f5 0%, #fce8e9 60%, #f5d4d7 100%)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <span
              className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT_DARK }}
            >
              Reservar cita
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl">
              Agenda tu cita en{" "}
              <span style={{ color: ACCENT_DARK }}>3 minutos</span>.
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-neutral-700">
              Dinos qué servicio quieres y te confirmamos horario por WhatsApp en menos de 2 horas.
            </p>
          </div>
        </div>
      </section>

      {/* ── Form ── */}
      <section
        id="contacto"
        className="bg-white py-14 sm:py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {done ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-neutral-200 bg-[#fdf8f5] p-8 text-center">
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT_DARK }}
              >
                ✓
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-neutral-950">
                ¡Solicitud enviada!
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                Recibimos tu solicitud para <strong>{service}</strong>. Te
                contactamos por WhatsApp en menos de 2 horas para confirmar
                horario y disponibilidad.
              </p>
              <a
                href="/diseno-paginas/demo-1a"
                className="mt-6 inline-block text-sm font-semibold underline"
                style={{ color: ACCENT_DARK }}
              >
                ← Volver al inicio
              </a>
            </div>
          ) : (
            <div className="grid gap-10 md:grid-cols-[1.2fr,1fr]">
              <div>
                <span
                  className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
                  style={{ color: ACCENT_DARK }}
                >
                  Elige tu servicio
                </span>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                  ¿Qué te gustaría hoy?
                </h2>
                <div
                  id="servicios"
                  className="mt-6 grid gap-3 sm:grid-cols-2"
                >
                  {SERVICES.map((svc) => (
                    <label
                      key={svc.name}
                      className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 has-[:checked]:border-2 has-[:checked]:border-current"
                      style={{ color: ACCENT_DARK }}
                    >
                      <input
                        type="radio"
                        name="servicio"
                        value={svc.name}
                        checked={service === svc.name}
                        onChange={() => setService(svc.name)}
                        className="mt-1 h-4 w-4 accent-current"
                      />
                      <div className="flex-1">
                        <div className="font-display text-sm font-semibold text-neutral-950">
                          {svc.name}
                        </div>
                        <div className="mt-1 flex items-baseline gap-2 text-xs text-neutral-600">
                          <span style={{ color: ACCENT_DARK }} className="font-semibold">
                            {svc.price}
                          </span>
                          <span>·</span>
                          <span>{svc.duration}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-[#fdf8f5] p-6">
                <h3 className="font-display text-lg font-semibold text-neutral-950">
                  Tus datos
                </h3>
                <form onSubmit={handleSubmit} className="mt-5 space-y-3">
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
              </div>
            </div>
          )}
        </div>
      </section>

      <TemplateFooter
        brand="Lumière Studio"
        tagline="Salón de belleza · Roma Norte"
        description="Estética de autor en la Roma Norte, CDMX. Cortes, color, manicura y tratamientos faciales desde 2016."
        address="Av. Álvaro Obregón 121, Roma Norte, CDMX 06700"
        phone="+52 55 1234 5678"
        email="hola@lumiere-studio.mx"
        schedule="Lun-Vie 10-20 · Sáb 10-18"
        accentColor={ACCENT_DARK}
        socialLinks={[
          { label: "Instagram · @lumiere.studio", href: "#" },
          { label: "Facebook · Lumière Studio", href: "#" },
        ]}
      />
    </div>
  );
}
