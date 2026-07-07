/**
 * PipelineCard — card individual dentro de una PipelineColumn.
 *
 * Renderiza nombre, contacto (email/phone), badge de source y fecha.
 * Es la "tarjeta" de un usuario en una etapa del funnel.
 *
 * Por ahora es display-only (sin acciones). Las acciones por nivel
 * (match manual, marcar revisada, WhatsApp) llegan en commits
 * separados (Capa 3, Capa 4, Sub-bloque C).
 */

import { Badge } from "@/components/ui";

interface SelectableProps {
  /** ID único del item (lead.id, etc.). Se usa como key del state del padre. */
  id: string;
  /** Si está seleccionado actualmente. */
  selected: boolean;
  /** Toggle de selección. Lo llama el padre (board client component). */
  onToggle: () => void;
}

interface Props {
  /** Nombre de la persona (puede ser "Sin nombre" si no hay dato). */
  name: string;
  /** Email (opcional). */
  email?: string | null;
  /** Teléfono (opcional, prioriza normalizado). */
  phone?: string | null;
  /** Source tag (ej. "public_form", "imported_excel"). */
  source?: string | null;
  /** Fecha del evento significativo (confirmó / asistió / respondió / etc). */
  date?: string | null;
  /** Link opcional al detalle en el CRM / tab del evento. */
  href?: string;
  /** Si la card fue revisada (Capa 4: badge "Revisada" + fecha). */
  reviewedAt?: string | null;
  /**
   * Score 0-100 derivado de la encuesta post-evento (lead-scoring.ts).
   * FIX 2026-07-06 (G-15 r4): agregado para que el admin vea la
   * calificación del lead promovido sin abrir el drawer.
   */
  score?: number | null;
  /**
   * Bucket del score ("cold"/"warm"/"hot"/"mql"). FIX 2026-07-06 r4.
   */
  qualification?: string | null;
  /**
   * FIX 2026-07-06 (Fase 3): SLA ALERTA si el lead está en etapa
   * `new` o `contacted` con más de 48h sin contacto. El padre
   * (page.tsx) computa este flag mirando `lead_interactions` y
   * `updated_at` del lead.
   */
  slaOverdue?: boolean;
  /** Slot opcional para acciones (form, botones) debajo del contenido. */
  action?: React.ReactNode;
  /**
   * FIX 2026-07-06 ~19:00 — habilita modo selección múltiple en la
   * columna. Cuando está definido, se renderiza un checkbox en la
   * esquina superior derecha y se resalta el borde si está
   * seleccionado. El padre (board cliente) controla el state.
   */
  selectable?: SelectableProps;
}

export function PipelineCard({
  name,
  email,
  phone,
  source,
  date,
  href,
  reviewedAt,
  score,
  qualification,
  slaOverdue,
  action,
  selectable,
}: Props) {
  // FIX 2026-07-06 (Fase 3): HOT incluye tanto `score >= 60` como
  // `qualification in ('hot','mql')`. Borde cálido para destacar
  // visualmente.
  const isHot =
    (typeof score === "number" && score >= 60) ||
    qualification === "hot" ||
    qualification === "mql";

  const inner = (
    <>
      {selectable && (
        <div className="absolute top-2 right-2 z-10">
          <label
            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-brand-300 cursor-pointer shadow-sm hover:border-brand-500 transition"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selectable.selected}
              onChange={selectable.onToggle}
              aria-label={`Seleccionar ${name}`}
              className="w-4 h-4 accent-brand-600 cursor-pointer"
            />
          </label>
        </div>
      )}
      <p
        className={
          "font-semibold text-sm text-ink truncate " +
          (selectable ? "pr-9" : "")
        }
      >
        {name}
      </p>
      {(email || phone) && (
        <p className="text-xs text-ink-muted truncate">
          {email && <span>{email}</span>}
          {email && phone && <span> · </span>}
          {phone && <span>{phone}</span>}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 mt-1.5">
        {source && <Badge tone="neutral">{source}</Badge>}
        {date && (
          <span className="text-[10px] text-ink-muted ml-auto">{date}</span>
        )}
      </div>
      {/* FIX 2026-07-06 (Fase 3): badges de inteligencia comercial.
          HOT con borde cálido si calificación >= 60. SLA ALERTA si
          el lead lleva >48h sin contacto. */}
      {(isHot || slaOverdue || typeof score === "number" || qualification) && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {isHot && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-orange-300 bg-orange-50 text-orange-700"
              title="Lead caliente — vale la pena contactar hoy"
            >
              🔥 HOT
            </span>
          )}
          {slaOverdue && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-rose-300 bg-rose-50 text-rose-700"
              title="Más de 48h sin contacto"
            >
              ⚠️ SLA
            </span>
          )}
          {typeof score === "number" && (
            <Badge tone="brand">🎯 {score}</Badge>
          )}
          {qualification && !isHot && (
            <Badge
              tone={
                qualification === "warm"
                  ? "warning"
                  : "neutral"
              }
            >
              {qualification.toUpperCase()}
            </Badge>
          )}
        </div>
      )}
      {reviewedAt && (
        <div className="mt-1.5 pt-1.5 border-t border-brand-50">
          <Badge tone="success">✓ Revisada</Badge>
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </>
  );

  // FIX 2026-07-06 ~19:00 — selección múltiple: borde resaltado en
  // brand cuando la tarjeta está seleccionada (independiente de HOT/SLA).
  let className: string;
  if (selectable?.selected) {
    className =
      "relative block p-3 rounded-xl border-2 border-brand-500 bg-brand-50/40 shadow-md transition";
  } else if (isHot) {
    className =
      "relative block p-3 rounded-xl border-2 border-orange-300 bg-orange-50/30 hover:border-orange-400 hover:shadow-sm transition";
  } else if (slaOverdue) {
    className =
      "relative block p-3 rounded-xl border-2 border-rose-200 bg-rose-50/20 hover:border-rose-300 hover:shadow-sm transition";
  } else {
    className =
      "relative block p-3 rounded-xl border border-brand-100 bg-white hover:border-brand-300 hover:shadow-sm transition";
  }

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }
  return <div className={className}>{inner}</div>;
}