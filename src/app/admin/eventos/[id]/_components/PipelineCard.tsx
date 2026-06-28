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
  /** Slot opcional para acciones (form, botones) debajo del contenido. */
  action?: React.ReactNode;
}

export function PipelineCard({
  name,
  email,
  phone,
  source,
  date,
  href,
  reviewedAt,
  action,
}: Props) {
  const inner = (
    <>
      <p className="font-semibold text-sm text-ink truncate">{name}</p>
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
      {reviewedAt && (
        <div className="mt-1.5 pt-1.5 border-t border-brand-50">
          <Badge tone="success">✓ Revisada</Badge>
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </>
  );

  const className =
    "block p-3 rounded-xl border border-brand-100 bg-white hover:border-brand-300 hover:shadow-sm transition";

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }
  return <div className={className}>{inner}</div>;
}