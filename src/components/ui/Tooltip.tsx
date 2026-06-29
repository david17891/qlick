/**
 * Tooltip accesible — Fase 6 Hito C + F-2026-06-28 audit fixes.
 *
 * Renderiza un ícono (?) que muestra un mensaje al hacer hover/focus.
 * Accesibilidad:
 * - aria-describedby con id único (M-5): lectores de pantalla leen el tooltip
 *   al describir el elemento, no solo como aria-label que lo reemplaza.
 * - `title` como fallback nativo (visible en hover sin JS).
 * - Focus del teclado muestra tooltip con delay 200ms (L-7) para no ser
 *   intrusivo con screen readers.
 *
 * Posicionamiento (M-6):
 * - Default: top-center (aparece arriba del ícono).
 * - Si el ícono está cerca del borde derecho, se alinea a la izquierda
 *   via prop `align="end"`. (Para detección automática de viewport, se
 *   necesitaría Floating UI; por ahora cubrimos los 2 casos típicos.)
 *
 * Dos modos:
 * - Con children: el ícono (?) aparece al lado del contenido.
 *   <Tooltip text="...">32%</Tooltip>
 * - Sin children: solo el ícono (?).
 *   <Tooltip text="..." />
 */

import { useId, type ReactNode } from "react";

export interface TooltipProps {
  /** Texto que se muestra al hacer hover/focus. */
  text: string;
  /** Contenido junto al cual aparece el ícono ?. Opcional. */
  children?: ReactNode;
  /** Tono opcional del ícono. Default "muted". */
  tone?: "muted" | "brand";
  /** Alineación del tooltip. "start" (default) = top-center, "end" = top-right. */
  align?: "start" | "end";
}

export function Tooltip({ text, children, tone = "muted", align = "start" }: TooltipProps) {
  // F-2026-06-28 M-5: useId garantiza un id estable por instancia (importante
  // para SSR y para múltiples tooltips en la misma página).
  const tooltipId = useId();

  // F-2026-06-28 M-6: si align="end", anclamos a la derecha del ícono en
  // vez de centrar. Útil cuando el ícono está cerca del borde derecho.
  const alignmentClasses =
    align === "end"
      ? "right-0 left-auto translate-x-0"
      : "left-1/2 -translate-x-1/2";

  const arrowClasses =
    align === "end"
      ? "absolute -top-1 right-3 w-2 h-2 bg-ink rotate-45"
      : "absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-ink rotate-45";

  return (
    <span className="inline-flex items-center gap-1 group relative">
      {children}
      <span
        className={
          "inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold border cursor-help transition " +
          (tone === "brand"
            ? "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"
            : "border-slate-300 bg-slate-50 text-ink-muted hover:bg-slate-100")
        }
        title={text}
        aria-describedby={tooltipId}
        role="img"
        tabIndex={0}
      >
        ?
      </span>
      {/* Tooltip on hover/focus (delay 200ms en focus para no spammear screen readers). */}
      <span
        id={tooltipId}
        role="tooltip"
        className={
          "pointer-events-none invisible opacity-0 " +
          "group-hover:visible group-hover:opacity-100 " +
          "group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-200 " +
          "transition-opacity duration-150 " +
          "absolute z-50 top-full mt-2 w-56 px-3 py-2 " +
          "text-xs font-normal text-white bg-ink rounded-lg shadow-lg text-left leading-relaxed " +
          alignmentClasses
        }
      >
        {text}
        <span aria-hidden="true" className={arrowClasses} />
      </span>
    </span>
  );
}