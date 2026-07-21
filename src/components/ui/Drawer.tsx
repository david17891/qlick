"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DrawerPosition = "right" | "left" | "top" | "bottom";

const positionClasses: Record<DrawerPosition, string> = {
  right: "right-0 top-0 h-full w-full max-w-md translate-x-0",
  left: "left-0 top-0 h-full w-full max-w-md",
  top: "top-0 left-0 w-full max-h-[80vh]",
  bottom: "bottom-0 left-0 w-full max-h-[80vh]"
};

const animationClasses: Record<DrawerPosition, string> = {
  right: "animate-slide-in-right",
  left: "animate-slide-in-left",
  top: "animate-fade-up",
  bottom: "animate-fade-up"
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  position?: DrawerPosition;
  /** Header sticky con título + botón cerrar. Default true. */
  stickyHeader?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Drawer lateral reutilizable. Reemplaza las 2 implementaciones casi
 * idénticas que existían: LeadDetailDrawer (CRM) y EventDrawer (events).
 *
 * Patrón:
 *   const [open, setOpen] = useState(false);
 *   <Drawer open={open} onClose={() => setOpen(false)} title="Detalle del lead">
 *     contenido
 *   </Drawer>
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  position = "right",
  stickyHeader = true,
  children,
  footer
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "drawer-title" : undefined}
    >
      <div
        className={cn(
          "fixed bg-white shadow-2xl flex flex-col",
          positionClasses[position],
          animationClasses[position]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div
            className={cn(
              "flex items-start justify-between gap-4 border-b border-brand-100 px-6 py-4",
              stickyHeader && "sticky top-0 z-10 bg-white"
            )}
          >
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id="drawer-title"
                  className="font-display text-lg font-bold text-ink truncate"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-ink-muted">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-brand-50"
              aria-label="Cerrar"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-brand-100 bg-brand-50/30 px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
