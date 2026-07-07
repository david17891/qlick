"use client";

/**
 * Vista cliente de la landing pública de un evento (`/eventos/[slug]`).
 *
 * Layout single-column (no sidecar):
 * - Hero: detalles del evento (título, fecha, lugar, descripción, cover
 *   image). Visible para TODOS, sin registro. CTA "Confirmar asistencia"
 *   hace anchor scroll a la sección del form.
 * - Sección de confirmación: separada por fondo distinto + heading
 *   prominent. Si el evento ya pasó, muestra mensaje. Si la inscripción
 *   fue exitosa, muestra confirmación. Si no, muestra el form.
 *
 * Privacidad: el consent de este form cubre solo los recordatorios del
 * evento (email/WhatsApp con info logística). El consent para ser LEAD
 * se captura en la encuesta post-evento (per EVENTS_FUNNEL_CONCEPT §7).
 *
 * La lógica de envío delega a `submitEventRegistration` (server action).
 * NO hace fetch directo al cliente de Supabase: el server action corre
 * con service role server-side (RLS deny para anon, defense-in-depth).
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Card,
  Field,
  Input,
  Button,
  Badge,
  Container,
} from "@/components/ui";
import type { Event } from "@/types/events";
import { submitEventRegistration } from "./actions";

type Status = "idle" | "success" | "already-registered" | "error";

interface Props {
  event: Event;
  /** Server calcula: true si el evento ya terminó. Si true, NO mostramos form. */
  pastEvent: boolean;
}

const CONSENT_TEXT =
  "Acepto que Qlick Marketing Digital me envíe recordatorios del evento por email o WhatsApp";

const CONSENT_TAIL = "conforme al Aviso de Privacidad.";

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
  /**
   * URL del gate virtual "SÍ, VOY" (migration 20260707000000). Solo
   * presente si el evento es virtual/híbrido y el visitante confirmó
   * asistencia. Si está set, mostramos el bloque CTA de acceso al stream.
   */
  const [gateUrl, setGateUrl] = useState<string | null>(null);
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
        // Gate virtual (migration 20260707000000). Si el server action
        // devolvió una URL (evento virtual/híbrido), la guardamos para
        // mostrar el botón "SÍ, VOY" en el bloque de éxito.
        if (result.gateUrl) {
          setGateUrl(result.gateUrl);
        }
        // Limpiamos el form solo si fue una creación real.
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
  const showHeroCta =
    !pastEvent && (status === "idle" || status === "error");
  const showForm =
    !pastEvent && status !== "success" && status !== "already-registered";

  return (
    <>
      {/* Hero: detalles del evento — visible para todos, sin registro. */}
      <section className="py-12 sm:py-16">
        <Container>
          <Badge tone="accent">Evento Qlick</Badge>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold text-ink leading-tight">
            {event.title}
          </h1>
          {/* FIX 2026-07-05 (sesión David, ya-estas-registrado con nombre
              duplicado): mostramos el short_code en la landing pública.
              Si el lead contacta al bot por WhatsApp mencionando el
              código del evento, el bot matchea exacto (no ambiguo) y
              lo asocia al evento correcto. */}
          {event.shortCode && (
            <p className="mt-3 text-sm text-ink-soft">
              Código del evento:{" "}
              <span className="font-mono font-semibold tracking-wider bg-ink/5 px-2 py-0.5 rounded">
                {event.shortCode}
              </span>
            </p>
          )}
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
            <li>
              📅 <strong>Cuándo:</strong> {startsAtFormatted}
              {endsAtFormatted && (
                <>
                  {" — "}
                  <span className="text-ink-muted">{endsAtFormatted}</span>
                </>
              )}
            </li>
            {event.location && (
              <li>
                📍 <strong>Lugar:</strong> {event.location}
              </li>
            )}
          </ul>
          {/*
            Decisión B-5: hero sin imagen. Solo tipografía + meta. Si se
            reactiva, ver OPEN_ITEMS.md → B-5. El campo cover_image_url
            en DB se conserva (no se borra) por compat.
          */}
          {event.description && (
            <p className="mt-8 text-lg text-ink-soft whitespace-pre-line leading-relaxed">
              {event.description}
            </p>
          )}
          {showHeroCta && (
            <div className="mt-10">
              <a
                href="#confirmar-asistencia"
                className="inline-block focus:outline-none"
              >
                <Button size="lg" variant="primary">
                  Confirmar asistencia ↓
                </Button>
              </a>
              <p className="mt-3 text-xs text-ink-muted">
                El registro es gratis y te toma menos de un minuto.
              </p>
            </div>
          )}
        </Container>
      </section>

      {/* Sección de confirmación — fondo distinto, heading prominent. */}
      <section
        id="confirmar-asistencia"
        className="py-12 sm:py-16 bg-brand-50/60 border-t border-brand-100 scroll-mt-20"
      >
        <Container size="narrow">
          {pastEvent ? (
            <Card className="p-8">
              <div className="text-center py-4">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-2xl">
                  ⏳
                </div>
                <h2 className="text-2xl font-bold text-ink">
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
            </Card>
          ) : status === "success" || status === "already-registered" ? (
            <Card className="p-8">
              <div className="text-center py-4">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-2xl">
                  ✓
                </div>
                <h2 className="text-2xl font-bold text-ink">
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

                {/* Bloque gate virtual (migration 20260707000000): solo
                    visible si el evento es virtual o híbrido Y el server
                    action devolvió una URL del gate. */}
                {gateUrl && event.format && event.format !== "in_person" && (
                  <div className="mt-6 rounded-2xl border-2 border-brand-500 bg-gradient-to-br from-brand-50 to-pink-50 p-6 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
                      🎥 Acceso al evento virtual
                    </p>
                    <p className="mt-2 text-sm text-ink-soft">
                      Cuando estés listo para entrar al stream, hacé click en
                      el botón. Te contamos como asistencia y te llevamos al
                      vivo.
                    </p>
                    {event.streamingAccessNote && (
                      <p className="mt-2 text-xs font-semibold text-brand-700">
                        {event.streamingAccessNote}
                      </p>
                    )}
                    <a
                      href={gateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-block w-full text-center bg-gradient-to-r from-brand-600 to-pink-600 hover:from-brand-700 hover:to-pink-700 text-white font-bold text-lg py-3 px-6 rounded-full shadow-lg transition"
                    >
                      🎥 SÍ, VOY A ENTRAR
                    </a>
                    <p className="mt-3 text-[11px] text-ink-muted text-center">
                      Al confirmar, te llevamos al stream. Solo se cuenta 1 vez.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink">
                Confirma tu asistencia
              </h2>
              <p className="mt-2 text-ink-muted">
                Déjanos tus datos y te enviaremos los detalles del evento por
                email o WhatsApp.
              </p>
              <Card className="mt-6 p-6 sm:p-8">
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

                  {/* Honeypot: oculto a humanos pero visible a bots que
                      llenan todos los inputs. Si el server action lo recibe
                      con contenido, finge éxito silencioso. */}
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
                    className="flex items-start gap-3 cursor-pointer rounded-xl border border-brand-100 bg-white px-4 py-3"
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
                    Te enviaremos recordatorios por el canal que indicaste.
                    Puedes darte de baja en cualquier momento.
                  </p>
                </form>
              </Card>
            </>
          )}
        </Container>
      </section>
    </>
  );
}
