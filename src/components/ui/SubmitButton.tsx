"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Boton de submit que muestra "Procesando..." mientras el form esta pending.
 *
 * Se usa en vez del `<button type="submit">` normal dentro de un
 * `<form action={serverAction}>`. Aprovecha `useFormStatus` (React 18+)
 * que da el estado del form sin necesidad de useState.
 *
 * Patron:
 *   <form action={someServerAction.bind(null, null)}>
 *     <input type="hidden" name="x" value="y" />
 *     <SubmitButton>Aceptar</SubmitButton>
 *   </form>
 *
 * Mientras el form esta en pending, el boton se deshabilita y muestra
 * el `pendingLabel` (default: "Procesando..."). El `type` por default
 * es "submit" (no necesita pasarlo).
 */
export function SubmitButton({
  children,
  pendingLabel = "Procesando...",
  variant = "primary",
  size = "sm",
  className,
  fullWidth,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
  className?: string;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();

  // Variant styles. Replica el look del Button del UI pero sin
  // importar el componente (que es server-side y no acepta children
  // condicionales basados en useFormStatus).
  const variantClass =
    variant === "outline"
      ? "border border-brand-200 text-ink-soft hover:bg-brand-50"
      : variant === "ghost"
        ? "text-ink-soft hover:bg-brand-50"
        : "bg-brand-500 text-white hover:bg-brand-600 shadow-sm";
  const sizeClass =
    size === "md" ? "text-sm px-4 py-2" : "text-xs px-2 py-1";
  const widthClass = fullWidth ? "w-full justify-center" : "";

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed",
        variantClass,
        sizeClass,
        widthClass,
        className,
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
