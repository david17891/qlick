/**
 * PipelineColumn — columna Kanban del pipeline view del evento.
 *
 * Sub-componente de `/admin/eventos/[id]?view=pipeline`. Renderiza
 * el header de la columna (icono + título + count) y un body scrollable
 * con cards de usuarios.
 *
 * El color del header cambia según la `tone` para distinguir visualmente
 * las etapas del funnel.
 */

import { Card } from "@/components/ui";

interface Props {
  /** Icono emoji del nivel (ej. "📋" para Confirmados). */
  icon: string;
  /** Título visible de la columna. */
  title: string;
  /** Cantidad de items en la columna (badge en el header). */
  count: number;
  /** Tono del header (color del badge del count). */
  tone: "brand" | "emerald" | "amber" | "blue" | "neutral";
  /** Cards o empty state. */
  children: React.ReactNode;
}

const toneStyles: Record<Props["tone"], { border: string; bg: string; text: string }> = {
  brand: { border: "border-brand-200", bg: "bg-brand-50", text: "text-brand-700" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" },
  amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" },
  blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700" },
  neutral: { border: "border-brand-100", bg: "bg-brand-50/50", text: "text-ink-soft" },
};

export function PipelineColumn({ icon, title, count, tone, children }: Props) {
  const styles = toneStyles[tone];
  return (
    <div
      className={`flex flex-col rounded-2xl border ${styles.border} bg-white overflow-hidden min-h-[200px]`}
      role="region"
      aria-label={`${title}: ${count}`}
    >
      <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${styles.border} ${styles.bg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true">{icon}</span>
          <h3 className="font-bold text-sm text-ink truncate">{title}</h3>
        </div>
        <span
          className={`shrink-0 inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full text-xs font-bold ${styles.text} bg-white border ${styles.border}`}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[60vh]">
        {children}
      </div>
    </div>
  );
}