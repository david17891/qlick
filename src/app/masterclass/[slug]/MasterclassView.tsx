"use client";

/**
 * Vista cliente del formulario de registro de masterclass.
 *
 * Renderiza:
 * - Datos de la masterclass (título, subtítulo, descripción, fecha, instructor).
 * - Formulario de registro (name, email, phone, consentimiento).
 * - Estado de envío + resultado.
 *
 * La lógica de envío delega a `submitMasterclassRegistration` (server action).
 * NO hace fetch directo al cliente de Supabase: el server action corre con
 * service role server-side.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, Field, Input, Button, Badge } from "@/components/ui";
import type { Masterclass } from "@/types/masterclass";
import { submitMasterclassRegistration } from "@/app/actions/masterclass";

type Status = "idle" | "success" | "error";

interface Props {
  masterclass: Masterclass;
  utmSource?: string;
  utmCampaign?: string;
}

const CONSENT_LEAD =
  "Acepto que Qlick Marketing Digital use mis datos para contactarme sobre esta masterclass, contenidos relacionados y seguimiento comercial";
const CONSENT_TAIL = "conforme al Aviso de Privacidad.";

export function MasterclassView({ masterclass, utmSource, utmCampaign }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [resultNote, setResultNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!consent) {
      setStatus("error");
      setResultNote("Debes aceptar el consentimiento para registrarte.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setStatus("error");
      setResultNote("Nombre y email son obligatorios.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await submitMasterclassRegistration({
          masterclassId: masterclass.id,
          name,
          email,
          phone: phone || undefined,
          utmSource,
          utmCampaign,
          consentToContact: true,
        });
        if (!result.ok) {
          setStatus("error");
          setResultNote(result.note);
          return;
        }
        setStatus("success");
        setResultNote(result.note);
        setName("");
        setEmail("");
        setPhone("");
        setConsent(false);
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

  const startsAtFormatted = masterclass.startsAt
    ? new Date(masterclass.startsAt).toLocaleString("es-MX", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : "Fecha por confirmar";

  const modalityLabel: Record<Masterclass["modality"], string> = {
    online: "En línea",
    in_person: "Presencial",
    hybrid: "Híbrido",
  };

  if (status === "success") {
    return (
      <Card className="p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-2xl">
            ✓
          </div>
          <h3 className="text-xl font-bold text-ink">¡Registro confirmado!</h3>
          <p className="mt-2 text-ink-muted text-sm max-w-md mx-auto">
            {resultNote ??
              "Te enviaremos los detalles de la masterclass por email."}
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => {
              setStatus("idle");
              setResultNote(null);
            }}
          >
            Registrar a otra persona
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-5 gap-8 items-start">
      {/* Columna izquierda: info de la masterclass */}
      <div className="lg:col-span-2 space-y-4">
        <Badge tone="accent">Masterclass gratuita</Badge>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">
          {masterclass.title}
        </h1>
        {masterclass.subtitle && (
          <p className="text-lg text-ink-soft">{masterclass.subtitle}</p>
        )}
        {masterclass.description && (
          <p className="text-ink-muted whitespace-pre-line">
            {masterclass.description}
          </p>
        )}
        <ul className="space-y-2 text-sm text-ink-soft pt-2">
          <li>
            📅 <strong>Cuándo:</strong> {startsAtFormatted}
          </li>
          {masterclass.durationMinutes && (
            <li>
              ⏱️ <strong>Duración:</strong> {masterclass.durationMinutes} minutos
            </li>
          )}
          {masterclass.instructorName && (
            <li>
              🎤 <strong>Instructor:</strong> {masterclass.instructorName}
            </li>
          )}
          <li>
            💻 <strong>Modalidad:</strong> {modalityLabel[masterclass.modality]}
          </li>
        </ul>
      </div>

      {/* Columna derecha: formulario */}
      <Card className="p-6 lg:col-span-3">
        <h2 className="text-lg font-bold text-ink mb-1">{masterclass.ctaLabel}</h2>
        <p className="text-sm text-ink-muted mb-5">
          Déjanos tus datos y te enviamos los detalles para conectarte.
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nombre" htmlFor="mc-name">
              <Input
                id="mc-name"
                name="name"
                autoComplete="name"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field label="Email" htmlFor="mc-email">
              <Input
                id="mc-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field
            label="Teléfono / WhatsApp (opcional)"
            htmlFor="mc-phone"
            hint="Solo si quieres que te contactemos por teléfono."
          >
            <Input
              id="mc-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+52 ..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          {/* Consentimiento obligatorio */}
          <label
            htmlFor="mc-consent"
            className="flex items-start gap-3 cursor-pointer rounded-xl border border-brand-100 bg-brand-50/30 px-4 py-3"
          >
            <input
              id="mc-consent"
              name="consent"
              type="checkbox"
              className="mt-0.5 h-5 w-5 rounded border-brand-200 text-brand-600 focus:ring-brand-400 shrink-0"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span className="text-xs text-ink-soft leading-relaxed">
              {CONSENT_LEAD}{" "}
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
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {resultNote}
            </div>
          )}

          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? "Enviando..." : masterclass.ctaLabel}
          </Button>
          <p className="text-xs text-ink-muted text-center">
            Al registrarte aceptas recibir comunicaciones sobre esta masterclass.
            Puedes darte de baja en cualquier momento.
          </p>
        </form>
      </Card>
    </div>
  );
}