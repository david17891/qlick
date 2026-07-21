"use client";

import { useState } from "react";
import { Modal, Input, Textarea, Field, LucideIcon } from "@/components/ui";
import { resolveIcon } from "./ServiceIcon";
import { formatMXN } from "@/lib/utils";
import type { ServiceWithVariants, ServiceVariant } from "@/types/services";

/**
 * Modal de checkout para un servicio.
 *
 * Form con:
 * - Nombre (required)
 * - Email (required)
 * - Teléfono (opcional pero recomendado para que el admin contacte por WhatsApp)
 * - Notas (opcional, ej. "mi negocio es una taquería en San Luis")
 * - Fecha de agendamiento (solo si service.requiresScheduling)
 *
 * Submit: POST /api/services/checkout con payload JSON.
 * On success: muestra vista de confirmación con número de pedido + WhatsApp.
 *
 * Privacy: el cliente NO necesita cuenta. Solo completa y el admin lo contacta.
 */
export function ServiceCheckoutModal({
  open,
  onClose,
  service,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  service: ServiceWithVariants;
  variant: ServiceVariant;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    orderNumber: string;
    customerName: string;
  } | null>(null);

  // Reset state al cerrar.
  function handleClose() {
    onClose();
    // Delay el reset para que no se vea el cambio durante la animación de salida.
    setTimeout(() => {
      setError(null);
      setSuccess(null);
      setSubmitting(false);
    }, 200);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      serviceSlug: service.slug,
      variantSlug: variant.slug,
      customerName: String(fd.get("customerName") ?? "").trim(),
      customerEmail: String(fd.get("customerEmail") ?? "").trim().toLowerCase(),
      customerPhone: String(fd.get("customerPhone") ?? "").trim() || undefined,
      customerNotes: String(fd.get("customerNotes") ?? "").trim() || undefined,
      paymentMode: "pending", // el admin confirma el modo de pago después
      scheduledAt: service.requiresScheduling
        ? String(fd.get("scheduledAt") ?? "") || undefined
        : undefined,
    };

    try {
      const res = await fetch("/api/services/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as
        | { ok: true; orderNumber: string; order: { customerName: string } }
        | { ok: false; error: string };

      if (!data.ok) {
        setError(data.error);
        setSubmitting(false);
        return;
      }

      setSuccess({
        orderNumber: data.orderNumber,
        customerName: data.order.customerName,
      });
      setSubmitting(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error de red. Intentá de nuevo en un momento.",
      );
      setSubmitting(false);
    }
  }

  // Vista de éxito
  if (success) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        size="md"
        title="¡Pedido enviado!"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <LucideIcon
              icon={resolveIcon("CheckCircle2")}
              size="xl"
              className="text-emerald-600"
            />
          </div>
          <h3 className="font-display text-xl font-bold text-ink">
            Listo, {success.customerName.split(" ")[0]}
          </h3>
          <p className="mt-2 text-sm text-ink-soft">
            Tu pedido <strong>{success.orderNumber}</strong> ya está en
            nuestro sistema. Te contactamos por WhatsApp en menos de 24 horas
            para confirmar los detalles.
          </p>
          <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Resumen
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              <strong>{service.displayName}</strong> — {variant.label}
            </p>
            <p className="mt-1 text-lg font-bold text-ink">
              {formatMXN(variant.priceMXN)} MXN
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href="https://wa.me/5216532935492?text=Hola%2C%20acabo%20de%20hacer%20un%20pedido%20en%20la%20web."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              <LucideIcon
                icon={resolveIcon("MessageCircle")}
                size="sm"
                className="text-white"
              />
              Abrir WhatsApp
            </a>
            <button
              type="button"
              onClick={handleClose}
              className="text-sm text-ink-muted hover:text-ink"
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Form de checkout
  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title={`Contratar ${variant.label}`}
      description={`${service.displayName} · ${formatMXN(variant.priceMXN)} MXN`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Tu nombre" required error={error && error.toLowerCase().includes("nombre") ? error : null}>
          <Input
            name="customerName"
            type="text"
            required
            autoComplete="name"
            placeholder="¿Cómo te llamas?"
            disabled={submitting}
          />
        </Field>

        <Field label="Email" required error={error && error.toLowerCase().includes("email") ? error : null}>
          <Input
            name="customerEmail"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@email.com"
            disabled={submitting}
          />
        </Field>

        <Field
          label="WhatsApp"
          hint="Para contactarte y enviarte el link de pago. Recomendado."
        >
          <Input
            name="customerPhone"
            type="tel"
            autoComplete="tel"
            placeholder="+52 1 653 123 4567"
            disabled={submitting}
          />
        </Field>

        {service.requiresScheduling && (
          <Field
            label="¿Cuándo te queda mejor?"
            required
            hint="Te confirmamos disponibilidad por WhatsApp."
          >
            <Input
              name="scheduledAt"
              type="datetime-local"
              required
              disabled={submitting}
            />
          </Field>
        )}

        <Field
          label="Cuéntanos brevemente"
          hint="¿Qué necesitas? ¿Para qué tipo de negocio? Mientras más, mejor."
        >
          <Textarea
            name="customerNotes"
            rows={3}
            placeholder="Tengo una taquería en San Luis Río Colorado, quiero una página para que me encuentren en Google..."
            disabled={submitting}
          />
        </Field>

        {error && !error.toLowerCase().includes("nombre") && !error.toLowerCase().includes("email") && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-full px-6 py-3 text-sm font-semibold text-ink-muted transition hover:bg-brand-50 hover:text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin"
                />
                Enviando...
              </>
            ) : (
              <>
                Enviar pedido
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </div>

        <p className="pt-2 text-center text-xs text-ink-muted">
          Al enviar aceptás que te contactemos por WhatsApp para confirmar tu
          pedido. Sin compromiso hasta que confirmes el pago.
        </p>
      </form>
    </Modal>
  );
}
