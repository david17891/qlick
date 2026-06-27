"use client";

/**
 * Vista cliente de la landing pública de un evento (`/eventos/[slug]`).
 *
 * Renderiza:
 * - Detalles del evento (título, fecha, lugar, descripción).
 * - Formulario de confirmación de asistencia (name, email, phone, consent).
 *   Si el evento ya pasó, el form se reemplaza por un mensaje informativo.
 * - Estado de envío + resultado (éxito, error, "ya registrado").
 *
 * La lógica de envío delega a `submitEventRegistration` (server action). NO
 * hace fetch directo al cliente de Supabase: el server action corre con
 * service role server-side (RLS deny para anon, defense-in-depth).
 *
 * Privacidad: el consent de este form cubre solo los recordatorios del
 * evento (email/WhatsApp con info logística). El consent para ser LEAD
 * se captura en la encuesta post-evento (per EVENTS_FUNNEL_CONCEPT §7).
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, Field, Input, Button, Badge } from "@/components/ui";
import type { Event } from "@/types/events";
import { submitEventRegistration } from "./actions";

type Status = "idle" | "success" | "already-registered" | "error";

interface Props {
  event: Event;
  /** Server calcula: true si el evento ya terminó. Si true, NO mostramos form. */
  pastEvent: boolean;
}

const CONSENT_TEXT =
  "Acepto que Qlick Marketing Integral me envíe recordatorios del evento por email o WhatsApp";

const CONSENT_TAIL = "conforme al Aviso de Privacidad.";

/**
 * Selector de date+time en es-MX para el hero del evento.
 * Usa Intl.DateTimeFormat (mismo patrón que MasterclassView).
 */
function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

export function EventView({ event, pastEvent }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  /** Honeypot. Debe quedar vacío. Los bots suelen llenarlo. */
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [resultNote, setResultNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    // Validación cliente (rápida y mejor UX). El server re-valida.
    if (!consent) {
      setStatus("error");
      setResultNote("Debes aceptar el consentimiento para confirmar asistencia.");
      return;
    }
    if (!name.trim()) {
      setStatus("error");
      setResultNote("El nombre es obligatorio.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setStatus("error");
      setResultNote("Necesitamos al menos un email o teléfono.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await submitEventRegistration({
          slug: event.slug,
          name,
          email: email || undefined,
          phone: phone || undefined,
          consent,
          hp,
        });
        if (!result.ok) {
          setStatus("error");
          setResultNote(result.note);
          return;
        }
        // created=false → ya estaba registrada (dedup). Lo mostramos con un
        // status distinto para que la UI lo pueda diferenciar.
        setStatus(result.created ? "success" : "already-registered");
        setResultNote(result.note);
        // Limpiamos el form solo si fue una creación real (si ya estaba,
        // dejamos los datos para que vea que sí se reconocieron).
        if (result.created) {
          setName("");
          setEmail("");
          setPhone("");
          setConsent(false);
        }
      } catch (err) {
        setStatus("error");
        setResultNote(
          err instanceof Error
            ? err.message
            : "Ocurrió un error inesperado. Intenta de nuevo.",
        );
      }
    });
  };

  const startsAtFormatted = formatEventDate(event.startsAt);
  const endsAtFormatted = event.endsAt ? formatEventDate(event.endsAt) : null;

  return (
    <div className="grid lg:grid-cols-5 gap-8 items-start">
      {/* Columna izquierda: info del evento */}
      <div className="lg:col-span-2 space-y-4">
        <Badge tone="accent">Evento Qlick</Badge>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">
          {event.title}
        </h1>
        {event.description && (
          <p className="text-ink-soft whitespace-pre-line">
            {event.description}
          </p>
        )}
        <ul className="space-y-2 text-sm text-ink-soft pt-2">
          <li>
            📅 <strong>Cuándo:</strong> {startsAtFormatted}
            {endsAtFormatted && (
              <>
                {" "}
                <span className="text-ink-muted">— {endsAtFormatted}</span>
              </>
            )}
          </li>
          {event.location && (
            <li>
              📍 <strong>Lugar:</strong> {event.location}
            </li>
          )}
        </ul>
      </div>

      {/* Columna derecha: form o mensaje de evento pasado */}
      <Card className="p-6 lg:col-span-3">
        {pastEvent ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-2xl">
              ⏳
            </div>
            <h2 className="text-xl font-bold text-ink">
              Este evento ya pasó
            </h2>
            <p className="mt-2 text-ink-muted text-sm max-w-md mx-auto">
              Las confirmaciones para {event.title} ya cerraron. Si te
              interesa algo similar, mira los próximos eventos o escríbenos
              por WhatsApp.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button href="/" variant="outline">
                Volver al inicio
              </Button>
              <Button href="/contacto" variant="accent">
                Contáctanos
              </Button>
            </div>
          </div>
        ) : status === "success" || status === "already-registered" ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-ink">
              {status === "success"
                ? "¡Confirmamos tu asistencia!"
                : "Ya estás registrada"}
            </h2>
            <p className="mt-2 text-ink-muted text-sm max-w-md mx-auto">
              {resultNote ??
                (status === "success"
                  ? "Te enviaremos los detalles antes del evento."
                  : "Te esperamos en el evento.")}
            </p>
            <p className="mt-4 text-xs text-ink-muted">
              📅 {startsAtFormatted}
              {event.location && (
                <>
                  <br />📍 {event.location}
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-ink mb-1">
              Confirma tu asistencia
            </h2>
            <p className="text-sm text-ink-muted mb-5">
              Déjanos tus datos y te enviamos los detalles del evento.
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Field label="Nombre" htmlFor="ev-name">
                <Input
                  id="ev-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Email" htmlFor="ev-email">
                  <Input
                    id="ev-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field
                  label="Teléfono / WhatsApp"
                  htmlFor="ev-phone"
                  hint="Necesitamos al menos uno de los dos."
                >
                  <Input
                    id="ev-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+52 ..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
              </div>

              {/* Honeypot: oculto a humanos pero visible a bots que llenan
                  todos los inputs. Si el server action lo recibe con
                  contenido, finge éxito silencioso. */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-10000px",
                  top: "auto",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                }}
              >
                <label htmlFor="ev-hp">
                  No llenar este campo
                  <input
                    id="ev-hp"
                    name="hp"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={hp}
                    onChange={(e) => setHp(e.target.value)}
                  />
                </label>
              </div>

              {/* Consentimiento obligatorio */}
              <label
                htmlFor="ev-consent"
                className="flex items-start gap-3 cursor-pointer rounded-xl border border-brand-100 bg-brand-50/30 px-4 py-3"
              >
                <input
                  id="ev-consent"
                  name="consent"
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 rounded border-brand-200 text-brand-600 focus:ring-brand-400 shrink-0"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span className="text-xs text-ink-soft leading-relaxed">
                  {CONSENT_TEXT}{" "}
                  <Link
                    href="/privacidad"
                    className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {CONSENT_TAIL}
                  </Link>
                </span>
              </label>

              {status === "error" && resultNote && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
                >
                  {resultNote}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={isPending}
                className="w-full"
              >
                {isPending ? "Enviando..." : "Confirmar asistencia"}
              </Button>
              <p className="text-xs text-ink-muted text-center">
                Te enviaremos recordatorios por el canal que indicaste. Puedes
                darte de baja en cualquier momento.
              </p>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
