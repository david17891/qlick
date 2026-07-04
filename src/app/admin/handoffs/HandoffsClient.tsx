"use client";

/**
 * Client Component para `/admin/handoffs`.
 *
 * Renderiza la tabla de handoffs, los botones de acción
 * ("Marcar contacted" / "Marcar closed") y la paginación.
 *
 * Recibe del Server Component padre:
 *   - `rows`: HandoffRow[] (ya fetched en server).
 *   - `eventContextMap`: lookup phone_normalized → RecentEventContext (best-effort).
 *   - `currentPage`, `totalPages`: paginación.
 *
 * Las mutaciones pasan por la server action `updateHandoffStatusAction`
 * (definida en `./_actions.ts`). Después de cada cambio, `router.refresh()`
 * recarga el Server Component padre.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { formatDate, initials as makeInitials } from "@/lib/utils";
import { updateHandoffStatusAction } from "./_actions";
import type { HandoffStatus, HandoffRow } from "@/lib/crm/handoffs-server";

interface SerializedEventContext {
  eventId: string;
  eventTitle: string | null;
  startsAt: string | null;
  confirmedAt: string | null;
}

interface Props {
  rows: HandoffRow[];
  eventContextMap: Record<string, SerializedEventContext | null>;
  currentPage: number;
  totalPages: number;
}

const statusTone: Record<HandoffStatus, "warning" | "info" | "neutral"> = {
  pending: "warning",
  contacted: "info",
  closed: "neutral",
};

const statusLabel: Record<HandoffStatus, string> = {
  pending: "Pendiente",
  contacted: "Contactado",
  closed: "Cerrado",
};

export function HandoffsClient({
  rows,
  eventContextMap,
  currentPage,
  totalPages,
}: Props) {
  const router = useRouter();

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-ink">
                  Lead
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink">
                  Contacto
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink">
                  Último mensaje
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink">
                  Evento asociado
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-semibold text-ink">
                  Creado
                </th>
                <th className="text-right px-4 py-3 font-semibold text-ink">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <HandoffRow
                  key={row.id}
                  row={row}
                  eventContext={eventContextMap[row.lead_phone] ?? null}
                  onChanged={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <p className="text-ink-muted">
            Página {currentPage + 1} de {totalPages}
          </p>
          <div className="flex gap-2">
            {currentPage > 0 && (
              <Link
                href={`/admin/handoffs?page=${currentPage - 1}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-ink hover:bg-slate-50"
              >
                ← Anterior
              </Link>
            )}
            {currentPage < totalPages - 1 && (
              <Link
                href={`/admin/handoffs?page=${currentPage + 1}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-ink hover:bg-slate-50"
              >
                Siguiente →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Fila individual + botones de acción                                 */
/* ─────────────────────────────────────────────────────────────────── */

function HandoffRow({
  row,
  eventContext,
  onChanged,
}: {
  row: HandoffRow;
  eventContext: SerializedEventContext | null;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lastMessage = row.last_messages?.[row.last_messages.length - 1];
  const lastMessagePreview = lastMessage?.body?.slice(0, 80) ?? null;
  const lastMessageDirection = lastMessage?.direction;

  const updateStatus = (newStatus: HandoffStatus) => {
    setError(null);
    startTransition(async () => {
      const result = await updateHandoffStatusAction({
        handoffId: row.id,
        newStatus,
        notes: null,
      });
      if (!result.ok) {
        setError(result.note ?? `No se pudo marcar como ${newStatus}.`);
      } else {
        onChanged();
      }
    });
  };

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
        <td className="px-4 py-3 align-top">
          <div className="flex items-start gap-2">
            <span
              className="h-8 w-8 rounded-full bg-brand-gradient text-white text-xs font-bold flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              {makeInitials(row.lead_name || row.lead_phone) || "?"}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">
                {row.lead_name || <span className="text-ink-muted">(sin nombre)</span>}
              </p>
              <p className="text-xs text-ink-muted font-mono">
                {row.lead_id ? row.lead_id.slice(0, 8) + "…" : "—"}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 align-top">
          <a
            href={`https://wa.me/${row.lead_phone.replace(/^\+/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-soft hover:text-brand-700 underline text-xs font-mono"
            title="Abrir chat en WhatsApp"
          >
            {row.lead_phone}
          </a>
          {row.lead_email && (
            <p className="text-xs text-ink-muted truncate max-w-[180px] mt-0.5">
              {row.lead_email}
            </p>
          )}
        </td>
        <td className="px-4 py-3 align-top max-w-[260px]">
          {lastMessagePreview ? (
            <div className="flex items-start gap-1.5">
              <span className="text-xs shrink-0" aria-hidden="true">
                {lastMessageDirection === "inbound" ? "👤" : "🤖"}
              </span>
              <p className="text-xs text-ink-soft line-clamp-2">
                {lastMessagePreview}
                {lastMessage && lastMessage.body.length > 80 ? "…" : ""}
              </p>
            </div>
          ) : (
            <span className="text-xs text-ink-muted">—</span>
          )}
          {row.last_messages && row.last_messages.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[10px] text-brand-700 font-semibold hover:underline"
            >
              {expanded
                ? "Ocultar conversación"
                : `Ver ${row.last_messages.length} mensaje${row.last_messages.length === 1 ? "" : "s"}`}
            </button>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          {eventContext ? (
            <div className="text-xs">
              <p className="text-ink-soft font-medium truncate max-w-[180px]">
                {eventContext.eventTitle ?? "(sin título)"}
              </p>
              {eventContext.startsAt && (
                <p className="text-ink-muted">
                  📅 {formatDate(eventContext.startsAt)}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs text-ink-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <Badge tone={statusTone[row.status]}>{statusLabel[row.status]}</Badge>
          {row.assigned_to && (
            <p className="text-[10px] text-ink-muted mt-1">
              👤 {row.assigned_to}
            </p>
          )}
        </td>
        <td className="px-4 py-3 align-top whitespace-nowrap">
          <p className="text-xs text-ink-soft">{formatDate(row.created_at)}</p>
          {row.contacted_at && (
            <p className="text-[10px] text-ink-muted mt-0.5">
              ✉️ {formatDate(row.contacted_at)}
            </p>
          )}
          {row.closed_at && (
            <p className="text-[10px] text-ink-muted mt-0.5">
              ✓ {formatDate(row.closed_at)}
            </p>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="flex flex-wrap justify-end gap-2">
            {row.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => updateStatus("contacted")}
              >
                {pending ? "..." : "Marcar contacted"}
              </Button>
            )}
            {row.status !== "closed" && (
              <Button
                size="sm"
                variant={row.status === "pending" ? "ghost" : "outline"}
                disabled={pending}
                onClick={() => updateStatus("closed")}
              >
                {pending ? "..." : "Marcar closed"}
              </Button>
            )}
          </div>
          {error && (
            <p className="text-[10px] text-red-600 mt-1 max-w-[160px] text-right">
              {error}
            </p>
          )}
        </td>
      </tr>

      {/* Fila expandida con la conversación completa */}
      {expanded && row.last_messages && row.last_messages.length > 0 && (
        <tr className="bg-slate-50/50">
          <td colSpan={7} className="px-6 py-4">
            <p className="text-xs font-bold uppercase text-ink-muted mb-3">
              Conversación ({row.last_messages.length} mensajes)
            </p>
            <div className="space-y-2 max-w-2xl">
              {row.last_messages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    "rounded-lg px-3 py-2 text-sm " +
                    (m.direction === "inbound"
                      ? "bg-sky-50 border border-sky-100"
                      : "bg-slate-100 border border-slate-200")
                  }
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-muted mb-1">
                    <span>{m.direction === "inbound" ? "👤 Lead" : "🤖 Bot"}</span>
                    {m.timestamp && (
                      <span>· {formatDate(m.timestamp)}</span>
                    )}
                  </div>
                  <p className="text-ink whitespace-pre-wrap break-words">
                    {m.body}
                  </p>
                </div>
              ))}
            </div>
            {row.notes && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-[10px] font-bold uppercase text-amber-800 mb-1">
                  📌 Notas admin
                </p>
                <p className="text-sm text-ink whitespace-pre-wrap">
                  {row.notes}
                </p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** Iniciales a partir de un nombre. Re-exportado para no implementar fallback local. */

