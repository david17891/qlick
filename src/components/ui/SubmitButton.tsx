"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Botón de submit con estado pending. Se usa con `<form action={serverAction}>`.
 *
 * Refactor 2026-07-21 (FASE 3 plan estético): se alinea con `Button` del UI
 * usando `rounded-full` y los mismos variants. Aprovecha `useFormStatus` (React 18+)
 * que da el estado del form sin necesidad de useState.
 *
 * Patrón:
 *   <form action={someServerAction.bind(null, null)}>
 *     <input type="hidden" name="x" value="y" />
 *     <SubmitButton>Aceptar</SubmitButton>
 *   </form>
 *
 * Mientras el form está en pending, el botón se deshabilita y muestra
 * el `pendingLabel` (default: "Procesando...").
 */
export function SubmitButton({
  children,
  pendingLabel = "Procesando...",
  variant = "primary",
  size = "md",
  className,
  fullWidth
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "outline" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
  className?: string;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();

  // Variants alineados con Button.tsx (mismas clases, mismo radius)
  const variantClass =
    variant === "outline"
      ? "border-2 border-brand-500 text-brand-700 hover:bg-brand-50"
      : variant === "ghost"
        ? "text-ink hover:bg-brand-50"
        : variant === "accent"
          ? "bg-brand-accent text-ink hover:brightness-95"
          : "bg-brand-500 text-white hover:bg-brand-600";
  const sizeClass =
    size === "sm"
      ? "text-sm px-4 py-2"
      : size === "lg"
        ? "text-base px-8 py-4"
        : "text-sm px-6 py-3";
  const widthClass = fullWidth ? "w-full justify-center" : "";

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:pointer-events-none",
        variantClass,
        sizeClass,
        widthClass,
        className
      )}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
