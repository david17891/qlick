"use client";

import { useEffect, useState } from "react";
import {
  getWhatsAppLink,
  type WhatsAppIntent
} from "@/lib/contact/whatsapp";
import { Button } from "@/components/ui";
import type { ButtonProps } from "@/components/ui";

/**
 * Botón de WhatsApp reutilizable.
 *
 * Si el número/grupo está configurado vía env, renderiza un link <a> real
 * que abre wa.me (o el grupo) en pestaña nueva. Si NO está configurado,
 * renderiza un botón deshabilitado con etiqueta "próximamente" — nunca un
 * link falso ni un # silencioso.
 */
export function WhatsAppButton({
  intent = "sales",
  courseName,
  courseTitle,
  name,
  customMessage,
  label,
  variant = "accent",
  size = "md",
  className,
  fullWidth
}: {
  intent?: WhatsAppIntent;
  courseName?: string;
  /** Título legible del curso (alias de courseName). */
  courseTitle?: string;
  /** Nombre del lead/alumno para personalizar el saludo. */
  name?: string;
  /** Mensaje pre-armado; si se pasa, tiene prioridad sobre la plantilla. */
  customMessage?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  fullWidth?: boolean;
}) {
  // El provider se resuelve en cliente (env públicas) para evitar mismatch SSR.
  const [link, setLink] = useState<{
    href: string;
    configured: boolean;
    label: string;
  } | null>(null);

  useEffect(() => {
    setLink(
      getWhatsAppLink(intent, { courseName, courseTitle, name, customMessage })
    );
  }, [intent, courseName, courseTitle, name, customMessage]);

  if (!link) {
    return (
      <Button variant={variant} size={size} className={className} disabled>
        <SpinnerDot />
      </Button>
    );
  }

  const finalLabel = label ?? link.label;
  const widthClass = fullWidth ? "w-full justify-center" : "";

  if (!link.configured) {
    return (
      <Button
        variant="outline"
        size={size}
        className={className + " " + widthClass}
        disabled
        title="Aún no configurado. Define NEXT_PUBLIC_WHATSAPP_SALES_NUMBER."
      >
        <WhatsAppIcon />
        <span>{finalLabel}</span>
      </Button>
    );
  }

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-200 " +
        (variant === "accent"
          ? "bg-brand-accent text-ink hover:brightness-95 shadow-[0_6px_20px_-6px_rgba(239,159,8,0.6)] "
          : variant === "outline"
            ? "border-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50 "
            : "bg-emerald-500 text-white hover:bg-emerald-600 ") +
        (size === "sm" ? "text-sm px-4 py-2 " : size === "lg" ? "text-base px-8 py-4 " : "text-sm px-6 py-3 ") +
        widthClass +
        " " +
        (className ?? "")
      }
    >
      <WhatsAppIcon />
      <span>{finalLabel}</span>
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.24zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

function SpinnerDot() {
  return (
    <span className="inline-block h-3 w-3 rounded-full bg-current opacity-40 animate-pulse" />
  );
}
