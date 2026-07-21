"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-[95vw] h-[90vh]"
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  /** Deshabilita el cierre por click fuera o escape. */
  persistent?: boolean;
  children: ReactNode;
  /** Footer con acciones (típicamente botones). */
  footer?: ReactNode;
}

/**
 * Modal reutilizable con overlay consistente, animación scale-in, escape
 * para cerrar, y click-fuera para cerrar (a menos que sea `persistent`).
 *
 * Reemplaza overlays ad-hoc en: ConfirmDeleteEventModal, CheckoutButton,
 * y cualquier dialog improvisado en el sitio.
 *
 * Patrón:
 *   <Modal open={x} onClose={() => setX(false)} title="..." footer={...}>
 *     contenido
 *   </Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  persistent = false,
  children,
  footer
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock scroll de body mientras el modal está abierto
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, persistent, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm p-0 sm:items-center sm:p-4 animate-fade-in"
      onClick={() => !persistent && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={description ? "modal-description" : undefined}
    >
      <div
        ref={dialogRef}
        className={cn(
          "relative w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl animate-scale-in",
          sizeClasses[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="border-b border-brand-100 px-6 py-4 sm:px-8">
            {title && (
              <h2
                id="modal-title"
                className="font-display text-xl font-bold text-ink"
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                id="modal-description"
                className="mt-1 text-sm text-ink-muted"
              >
                {description}
              </p>
            )}
          </div>
        )}
        <div className="px-6 py-5 sm:px-8 sm:py-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-brand-100 bg-brand-50/30 px-6 py-3 sm:px-8">
            {footer}
          </div>
        )}
        {!persistent && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-brand-50"
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
