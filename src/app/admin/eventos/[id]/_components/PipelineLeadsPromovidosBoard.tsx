/**
 * PipelineLeadsPromovidosBoard — wrapper cliente para la columna
 * "Leads promovidos" del pipeline view (`?view=pipeline`).
 *
 * Agrega selección múltiple + bulk archive usando el endpoint ya
 * existente `/api/admin/leads/bulk` (que llama a `bulkUpdateLeads`
 * con `action='archive'`, soft delete con optimistic locking y audit
 * log por fila).
 *
 * Patrón de UI:
 *  - Toggle "Modo selección" en el header de la columna.
 *  - Checkbox por tarjeta (visible solo en modo selección).
 *  - Barra flotante fija abajo con conteo + botones.
 *  - Modal de confirmación con input textual "ARCHIVAR N" (mismo
 *    patrón que el resto del proyecto para bulk delete, ej. empleados).
 *  - Toast de feedback con auto-dismiss 5s, accesible (aria-live).
 *
 * Server actions que siguen siendo server (del _actions.ts del admin):
 *  - `markWhatsAppStatusAction` se pasa como prop desde page.tsx (que
 *    sigue siendo server component). El form dentro del `action` slot
 *    sigue funcionando igual.
 *
 * FIX 2026-07-06 ~19:00 David pidió selección múltiple para archivar
 * masivamente sin abrir el drawer uno por uno.
 */

"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { PipelineCard } from "./PipelineCard";
import { WHATSAPP_STATUSES, WHATSAPP_STATUS_LABEL, WHATSAPP_STATUS_TONE, type WhatsAppStatus } from "@/lib/leads/whatsapp-status";

/** Forma serializada del lead para pasar del server al client. Cada
 *  campo nullable se normaliza con `?? null` en page.tsx para que el
 *  shape sea estable al cruzar el límite server→client (Next.js no
 *  acepta `undefined` en props serializadas; `null` sí). */
export interface SerializedLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  score: number | null;
  qualification: string | null;
  whatsappStatus: string | null;
  /** wa.me link pre-armado (computado server-side para no tirar del
   *  helper de WhatsApp desde el cliente). null si no hay teléfono. */
  waLink: string | null;
}

interface Props {
  leads: SerializedLead[];
  /** Server action para el form de status WhatsApp (del _actions.ts).
   *  Ya viene pre-bindeada con `.bind(null, null)` desde page.tsx (server),
   *  por eso solo recibe el `FormData` del submit del form. */
  markWhatsAppStatusAction: (
    formData: FormData,
  ) => Promise<{ ok: boolean; note?: string }>;
  eventId: string;
}

/** Tonos válidos para el Badge (subset que usa esta pantalla). */
type BulkTone = "brand" | "emerald" | "amber" | "blue" | "neutral";

export function PipelineLeadsPromovidosBoard({
  leads,
  markWhatsAppStatusAction,
  eventId,
}: Props) {
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalLeads = leads.length;

  if (totalLeads === 0) {
    // Si no hay leads promovidos, no renderizamos nada — la PipelineColumn
    // padre ya muestra "Aun sin leads" en su propio empty state.
    return null;
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () =>
    setSelectedIds(new Set(leads.map((l) => l.id)));

  const clearSelection = () => setSelectedIds(new Set());

  const exitSelectionMode = () => {
    setSelectionMode(false);
    clearSelection();
    setShowConfirm(false);
    setConfirmText("");
    setError(null);
  };

  const handleArchive = async () => {
    setError(null);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ids, action: "archive" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        succeeded?: number;
        conflicted?: number;
        failed?: number;
        error?: string;
        note?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Error del servidor (HTTP ${res.status}).`);
        return;
      }
      const parts: string[] = [];
      const okN = data.succeeded ?? 0;
      const conN = data.conflicted ?? 0;
      const failN = data.failed ?? 0;
      if (okN > 0) parts.push(`${okN} archivado${okN === 1 ? "" : "s"}`);
      if (conN > 0) parts.push(`${conN} con conflicto`);
      if (failN > 0) parts.push(`${failN} con error`);
      setFeedback(parts.length > 0 ? parts.join(" · ") : "Operación completada");
      clearSelection();
      setShowConfirm(false);
      setConfirmText("");
      // Refetch server-side para reflejar los archivados (desaparecen del
      // listado "new|contacted" del pipeline por status='archived').
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Error de red al archivar.",
      );
    }
  };

  const confirmPhrase = `ARCHIVAR ${selectedIds.size}`;
  const confirmValid =
    confirmText.trim().toUpperCase() === confirmPhrase && selectedIds.size > 0;

  return (
    <>
      {/* Toolbar superior con toggle de modo selección */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() =>
            selectionMode ? exitSelectionMode() : setSelectionMode(true)
          }
          aria-pressed={selectionMode}
          className={
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold transition " +
            (selectionMode
              ? "bg-brand-700 text-white hover:bg-brand-800"
              : "border border-brand-200 text-ink-soft hover:bg-brand-50")
          }
        >
          {selectionMode ? "✓ Modo selección activo" : "☐ Modo selección"}
        </button>
        {selectionMode && (
          <>
            <button
              type="button"
              onClick={selectAll}
              className="text-brand-700 hover:underline font-semibold"
              disabled={isPending}
            >
              Seleccionar todos ({totalLeads})
            </button>
            {selectedIds.size === totalLeads && totalLeads > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-ink-soft hover:text-ink underline"
                disabled={isPending}
              >
                Limpiar
              </button>
            )}
            {selectedIds.size > 0 && (
              <span className="text-ink-muted">
                · <strong>{selectedIds.size}</strong> seleccionado
                {selectedIds.size === 1 ? "" : "s"}
              </span>
            )}
          </>
        )}
      </div>

      {/* Tarjetas de leads */}
      <div className="space-y-2">
        {leads.map((lead) => {
          const isSelected = selectedIds.has(lead.id);
          const leadStatus = ((lead.whatsappStatus ?? "no_contactado") as WhatsAppStatus);
          const whatsappTone =
            WHATSAPP_STATUS_TONE[leadStatus] as BulkTone;
          return (
            <PipelineCard
              key={lead.id}
              name={lead.name}
              email={lead.email}
              phone={lead.phone}
              source={lead.source}
              score={lead.score ?? null}
              qualification={lead.qualification ?? null}
              selectable={
                selectionMode
                  ? {
                      id: lead.id,
                      selected: isSelected,
                      onToggle: () => toggleSelect(lead.id),
                    }
                  : undefined
              }
              action={
                <div className="flex flex-col gap-1.5">
                  <Badge tone={whatsappBadgeToneToUi(whatsappTone)}>
                    💬 {WHATSAPP_STATUS_LABEL[leadStatus]}
                  </Badge>
                  <form
                    action={markWhatsAppStatusAction}
                    className="flex gap-1"
                  >
                    <input
                      type="hidden"
                      name="leadId"
                      value={lead.id}
                    />
                    <input
                      type="hidden"
                      name="eventId"
                      value={eventId}
                    />
                    <select
                      name="newStatus"
                      defaultValue={leadStatus}
                      className="text-xs border border-brand-200 rounded-md px-1 py-0.5 bg-white flex-1 min-w-0"
                      disabled={selectionMode || isPending}
                    >
                      {WHATSAPP_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {WHATSAPP_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={selectionMode || isPending}
                      className="text-[10px] px-1.5 py-0.5 bg-brand-500 text-white rounded font-semibold hover:bg-brand-600 transition disabled:opacity-50"
                    >
                      ✓
                    </button>
                  </form>
                  {lead.waLink ? (
                    <a
                      href={lead.waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition"
                    >
                      📱 WhatsApp
                    </a>
                  ) : (
                    <p className="text-[10px] text-ink-muted text-center">
                      sin teléfono
                    </p>
                  )}
                  <Link
                    href={`/admin?tab=crm&leadId=${lead.id}`}
                    className="text-[10px] text-brand-700 hover:underline text-center"
                  >
                    Ver en CRM →
                  </Link>
                </div>
              }
            />
          );
        })}
      </div>

      {/* Barra flotante fija abajo cuando hay >0 seleccionados */}
      {selectionMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 bg-white border border-brand-200 rounded-full shadow-lg max-w-[95vw]"
          role="region"
          aria-label="Acciones en bloque sobre leads seleccionados"
        >
          <span className="text-xs sm:text-sm font-semibold text-ink whitespace-nowrap">
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 mr-1 rounded-full bg-brand-100 text-brand-700 text-xs">
              {selectedIds.size}
            </span>
            seleccionado{selectedIds.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isPending}
            className="text-xs sm:text-sm text-ink-soft hover:text-ink underline whitespace-nowrap disabled:opacity-50"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition whitespace-nowrap disabled:opacity-50"
          >
            🗄️ Archivar {selectedIds.size}
          </button>
          <button
            type="button"
            onClick={exitSelectionMode}
            disabled={isPending}
            className="text-ink-muted hover:text-ink p-1 disabled:opacity-50"
            aria-label="Salir de modo selección"
            title="Salir de modo selección"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal de confirmación con input textual "ARCHIVAR N" */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-archive-title"
          onClick={() => !isPending && setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="bulk-archive-title"
              className="text-lg font-bold text-ink mb-1"
            >
              ¿Archivar {selectedIds.size} lead
              {selectedIds.size === 1 ? "" : "s"}?
            </h2>
            <p className="text-sm text-ink-muted mb-4">
              Cambia su <code>status</code> a{" "}
              <code className="text-rose-700 font-bold">archived</code>. El row{" "}
              <strong>no</strong> se borra (compliance LFPDPPP/LGPD); se conserva
              el <code>lead_consent_log</code> y el audit log registra el
              evento con tu email.
            </p>
            <p className="text-sm text-ink-soft mb-2">
              Para confirmar, escribe{" "}
              <code className="bg-brand-50 px-1.5 py-0.5 rounded text-xs font-bold text-brand-700">
                {confirmPhrase}
              </code>{" "}
              abajo:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 mb-3 font-mono"
              placeholder={confirmPhrase}
              autoFocus
              disabled={isPending}
              aria-label="Frase de confirmación"
            />
            {error && (
              <div
                className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"
                role="alert"
              >
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                  setError(null);
                }}
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold text-ink-soft hover:text-ink border border-brand-200 rounded-lg transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={!confirmValid || isPending}
                className={
                  "px-4 py-2 text-sm font-semibold rounded-lg text-white transition " +
                  (confirmValid && !isPending
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-rose-300 cursor-not-allowed")
                }
              >
                {isPending ? "Archivando..." : `Archivar ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de feedback (auto-dismiss 5s, role=status para SR) */}
      {feedback && (
        <FeedbackToast message={feedback} onClose={() => setFeedback(null)} />
      )}
    </>
  );
}

/** Adapta el `tone` interno de `WHATSAPP_STATUS_TONE` al type del Badge del UI. */
function whatsappBadgeToneToUi(
  tone: BulkTone,
): "brand" | "neutral" | "success" | "warning" {
  // El type de Badge que exporta @/components/ui acepta
  // brand | accent | neutral | success | warning | danger | info.
  // Mapeamos emerald → success, amber → warning, los demás quedan 1:1
  // (brand y neutral son los únicos que usamos acá además de emerald/amber).
  if (tone === "emerald") return "success";
  if (tone === "amber") return "warning";
  if (tone === "blue") return "neutral"; // `blue` no existe en Badge tones
  if (tone === "brand") return "brand";
  return "neutral";
}

function FeedbackToast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-40 px-4 sm:px-5 py-2.5 sm:py-3 bg-emerald-600 text-white rounded-lg shadow-lg flex items-center gap-2 max-w-[calc(100vw-2rem)]"
    >
      <span aria-hidden="true">✓</span>
      <span className="text-xs sm:text-sm font-semibold break-words">
        {message}
      </span>
      <button
        onClick={onClose}
        className="ml-2 text-emerald-100 hover:text-white shrink-0"
        aria-label="Cerrar notificación"
      >
        ✕
      </button>
    </div>
  );
}
