"use client";

import { useState } from "react";
import { Card, Field, Input, Textarea, Button, Badge } from "@/components/ui";
import {
  validateContactMessage,
  type ContactMessage,
  type ValidationError
} from "@/lib/contact";
import { getAllCourses } from "@/lib/data/courses";

type Status = "idle" | "loading" | "success" | "error";

const initialForm: ContactMessage = {
  name: "",
  email: "",
  phone: "",
  topic: "Quiero tomar un curso",
  message: "",
  courseSlug: "",
  consentToContact: false
};

const CONSENT_TEXT =
  "Acepto ser contactado por Qlick por WhatsApp, llamada o correo sobre mi consulta, y entiendo que mis datos se tratarán según el aviso de privacidad.";

const topics = [
  "Quiero tomar un curso",
  "Capacitación para mi equipo",
  "Servicios de agencia",
  "Duda sobre pagos o facturación",
  "Otro"
];

/**
 * Formulario de contacto con validación y estados claros.
 * MVP: usa mock-contact-provider (no envía nada real).
 * Además registra un lead demo en el CRM (createLeadFromContactForm, demo:true).
 * El mensaje de éxito deja explícito que es modo demo.
 */
export function ContactForm() {
  const courses = getAllCourses();
  const [form, setForm] = useState<ContactMessage>(initialForm);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [resultNote, setResultNote] = useState<string | null>(null);

  const update = (field: keyof ContactMessage, value: string | boolean) => {
    setForm((f) => ({ ...f, [field]: value }));
    // Limpia el error del campo al editarlo.
    if (errors.some((e) => e.field === field)) {
      setErrors((prev) => prev.filter((e) => e.field !== field));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return; // previene doble envío

    const validationErrors = validateContactMessage(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrors([]);
    setResultNote(null);

    try {
      // Carga perezosa del provider (cliente).
      const { getContactProvider } = await import("@/lib/contact");
      const provider = getContactProvider();
      const result = await provider.send(form);

      // Registra el lead en el CRM (demo: no persiste).
      const course = courses.find((c) => c.slug === form.courseSlug);
      const { createLeadFromContactForm } = await import("@/lib/crm/crm-service");
      const leadResult = createLeadFromContactForm({
        name: form.name,
        email: form.email,
        phone: form.phone,
        courseOfInterest: course?.title,
        intent: "course_information",
        source: "website",
        message: form.message,
        consentToContact: true
      });

      setStatus("success");
      setResultNote(
        leadResult.demo
          ? "Lead registrado en modo demo. En producción se guardará en el CRM y se asignará a ventas."
          : result.note
      );
      setForm(initialForm);
    } catch (err) {
      setStatus("error");
      setResultNote(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado. Intenta de nuevo."
      );
    }
  };

  const fieldError = (field: keyof ContactMessage) =>
    errors.find((e) => e.field === field)?.message;

  if (status === "success") {
    return (
      <Card className="p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-2xl">
            ✓
          </div>
          <h3 className="text-xl font-bold text-ink">¡Mensaje registrado!</h3>
          <p className="mt-2 text-ink-muted text-sm max-w-md mx-auto">
            {resultNote ??
              "Mensaje registrado en modo demo. En producción se conectará a CRM, email o WhatsApp."}
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => {
              setStatus("idle");
              setResultNote(null);
            }}
          >
            Enviar otro mensaje
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-ink">Envíanos un mensaje</h2>
        <Badge tone="warning">Modo demo</Badge>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Nombre" htmlFor="name">
            <Input
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Tu nombre"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              aria-invalid={Boolean(fieldError("name"))}
              aria-describedby={fieldError("name") ? "err-name" : undefined}
            />
            {fieldError("name") && (
              <p id="err-name" className="mt-1 text-xs text-red-600">
                {fieldError("name")}
              </p>
            )}
          </Field>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={Boolean(fieldError("email"))}
              aria-describedby={fieldError("email") ? "err-email" : undefined}
            />
            {fieldError("email") && (
              <p id="err-email" className="mt-1 text-xs text-red-600">
                {fieldError("email")}
              </p>
            )}
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field
            label="Teléfono / WhatsApp (opcional)"
            htmlFor="phone"
            hint="Solo si quieres que te contactemos por teléfono."
          >
            <Input
              id="phone"
              name="phone"
              autoComplete="tel"
              placeholder="+52 ..."
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              aria-invalid={Boolean(fieldError("phone"))}
              aria-describedby={fieldError("phone") ? "err-phone" : undefined}
            />
            {fieldError("phone") && (
              <p id="err-phone" className="mt-1 text-xs text-red-600">
                {fieldError("phone")}
              </p>
            )}
          </Field>
          <Field label="¿Qué necesitas?" htmlFor="topic">
            <select
              id="topic"
              name="topic"
              className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              value={form.topic}
              onChange={(e) => update("topic", e.target.value)}
            >
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Curso de interés (opcional)" htmlFor="course">
          <select
            id="course"
            name="course"
            className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            value={form.courseSlug ?? ""}
            onChange={(e) => update("courseSlug", e.target.value)}
          >
            <option value="">Aún no lo decido</option>
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Mensaje" htmlFor="message">
          <Textarea
            id="message"
            name="message"
            rows={5}
            placeholder="Cuéntanos un poco más..."
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
            aria-invalid={Boolean(fieldError("message"))}
            aria-describedby={fieldError("message") ? "err-message" : undefined}
          />
          {fieldError("message") && (
            <p id="err-message" className="mt-1 text-xs text-red-600">
              {fieldError("message")}
            </p>
          )}
        </Field>

        {/* Consentimiento obligatorio */}
        <div>
          <label
            htmlFor="consent"
            className="flex items-start gap-3 cursor-pointer rounded-xl border border-brand-100 bg-brand-50/30 px-4 py-3"
          >
            <input
              id="consent"
              name="consent"
              type="checkbox"
              className="mt-0.5 h-5 w-5 rounded border-brand-200 text-brand-600 focus:ring-brand-400 shrink-0"
              checked={Boolean(form.consentToContact)}
              onChange={(e) => update("consentToContact", e.target.checked)}
              aria-invalid={Boolean(fieldError("consentToContact"))}
              aria-describedby={
                fieldError("consentToContact") ? "err-consent" : undefined
              }
            />
            <span className="text-xs text-ink-soft leading-relaxed">
              {CONSENT_TEXT}
            </span>
          </label>
          {fieldError("consentToContact") && (
            <p id="err-consent" className="mt-1 text-xs text-red-600">
              {fieldError("consentToContact")}
            </p>
          )}
        </div>

        {status === "error" && resultNote && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {resultNote}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-ink-muted">
            Demo: este formulario no envía correos reales ni guarda datos reales todavía.
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={status === "loading"}
          >
            {status === "loading" ? "Enviando..." : "Enviar mensaje"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
