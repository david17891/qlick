"use client";

/**
 * StaffLinksPanel — UI admin para gestionar links de staff del scanner.
 *
 * Sección del CheckInTab. Permite:
 *   - Crear link nuevo (label opcional + editable validUntil).
 *   - Listar links activos con stats de uso + URL copiable.
 *   - Listar links revocados (collapsed).
 *   - Revocar link (con razón opcional).
 *
 * **Server-only data flow:**
 *   - Los links vienen como prop (server component los carga via action).
 *   - Las acciones (create, revoke) son server actions que hacen
 *     `revalidatePath` → la próxima vez que el server re-renderice, la
 *     lista se actualiza.
 *
 * **UX:**
 *   - El default de `validUntil` es `eventStartsAt + 4h` (configurable
 *     por el admin con un datetime-local input).
 *   - "Copiar URL" usa `navigator.clipboard.writeText` con fallback a
 *     `window.prompt` (Safari iOS safe).
 *   - El countdown "Vence en X" se actualiza cada minuto via useEffect.
 */

import { useState, useTransition, useMemo, useEffect } from "react";
import {
  createStaffLinkAction,
  revokeStaffLinkAction,
} from "../_staff-link-actions";
import { type StaffLinkWithUrl } from "../_staff-link-helpers";

interface Props {
  eventId: string;
  eventTitle: string;
  /** ISO pre-calculado en server: event.starts_at + 4h. */
  defaultValidUntilIso: string;
  /** ISO pre-calculado para el input datetime-local (YYYY-MM-DDTHH:mm). */
  defaultValidUntilLocal: string;
  /** Links activos + revocados (con URL pre-calculada). */
  links: StaffLinkWithUrl[];
}

export function StaffLinksPanel({
  eventId,
  eventTitle,
  defaultValidUntilIso,
  defaultValidUntilLocal,
  links,
}: Props) {
  const [isPendingCreate, startTransitionCreate] = useTransition();
  const [createNote, setCreateNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeLinks = useMemo(
    () => links.filter((l) => !l.revokedAt),
    [links],
  );
  const revokedLinks = useMemo(
    () => links.filter((l) => l.revokedAt),
    [links],
  );

  function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateNote(null);
    setCreatedUrl(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set("eventId", eventId);
    // Si el usuario no edito el default, no mandamos validUntil → action
    // calcula el default del server.
    const validUntilRaw = fd.get("validUntil");
    if (
      typeof validUntilRaw === "string" &&
      validUntilRaw === defaultValidUntilLocal
    ) {
      fd.delete("validUntil");
    }
    startTransitionCreate(async () => {
      const result = await createStaffLinkAction(null, fd);
      setCreateNote({ ok: result.ok, msg: result.note });
      if (result.ok && result.url) {
        setCreatedUrl(result.url);
        form.reset();
      }
    });
  }

  function onRevoke(linkId: string) {
    setPendingRevokeId(linkId);
    const fd = new FormData();
    fd.set("linkId", linkId);
    fd.set("eventId", eventId);
    if (revokeReason.trim()) fd.set("reason", revokeReason.trim());
    startTransitionCreate(async () => {
      const result = await revokeStaffLinkAction(null, fd);
      setCreateNote({ ok: result.ok, msg: result.note });
      setPendingRevokeId(null);
      setRevokeReason("");
    });
  }

  async function onCopy(url: string, linkId: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback Safari iOS: prompt al usuario.
      window.prompt("Copia este link:", url);
    }
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 space-y-3">
      <h3 className="text-xs font-bold uppercase text-brand-600">
        🎫 Links de scanner para staff
      </h3>
      <p className="text-xs text-ink-muted">
        Genera links temporales que el staff abre en su celular para
        escanear QRs en puerta. Sin login, vencen automáticamente.
        <br />
        <span className="text-[10px] text-ink-muted/80">
          Evento: <strong>{eventTitle}</strong>
        </span>
      </p>

      {/* Form de crear */}
      <form
        onSubmit={onCreate}
        className="flex flex-wrap items-end gap-3 bg-white rounded-lg p-3 border border-brand-100"
      >
        <div className="flex-1 min-w-[160px]">
          <label
            htmlFor="staff-label"
            className="block text-xs font-semibold text-ink-muted mb-1"
          >
            Etiqueta (opcional)
          </label>
          <input
            id="staff-label"
            name="label"
            type="text"
            placeholder='Ej. "Entrada principal"'
            maxLength={60}
            className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
        <div className="min-w-[200px]">
          <label
            htmlFor="staff-valid-until"
            className="block text-xs font-semibold text-ink-muted mb-1"
          >
            Vence el
          </label>
          <input
            id="staff-valid-until"
            name="validUntil"
            type="datetime-local"
            defaultValue={defaultValidUntilLocal}
            className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
        <button
          type="submit"
          disabled={isPendingCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-violet-500 text-white hover:bg-violet-600 transition disabled:opacity-50"
        >
          {isPendingCreate ? "Creando…" : "🎫 Crear link"}
        </button>
      </form>
      <p className="text-[10px] text-ink-muted">
        Default: {formatLocalDateTime(defaultValidUntilIso)} (evento +
        4h). Si quieres que expire antes, edita el campo.
      </p>

      {createNote && (
        <p
          className={`text-xs ${createNote.ok ? "text-emerald-700" : "text-rose-700"}`}
        >
          {createNote.ok ? "✓" : "✗"} {createNote.msg}
        </p>
      )}
      {createdUrl && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-xs font-bold text-emerald-800 mb-1">
            ✓ Link creado. Copialo y mándaselo al staff:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-2 py-1 rounded border border-emerald-100 break-all">
              {createdUrl}
            </code>
            <button
              type="button"
              onClick={() => onCopy(createdUrl, "new")}
              className="text-xs px-3 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600"
            >
              {copiedId === "new" ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {/* Lista de links activos */}
      {activeLinks.length > 0 && (
        <div className="bg-white rounded-lg p-3 border border-brand-100 space-y-2">
          <h4 className="text-xs font-semibold text-ink-muted">
            Links activos ({activeLinks.length})
          </h4>
          <ul className="divide-y divide-brand-50">
            {activeLinks.map((link) => (
              <li key={link.id} className="py-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {link.label ?? "Sin etiqueta"}
                    </p>
                    <p className="text-[10px] text-ink-muted">
                      Creado por {link.createdBy} ·{" "}
                      {link.useCount} uso{link.useCount === 1 ? "" : "s"}
                      {link.lastUsedAt && (
                        <>
                          {" "}
                          · último{" "}
                          {formatLocalDateTime(link.lastUsedAt)}
                        </>
                      )}
                    </p>
                    <p className="text-[10px] text-ink-muted">
                      Vence: {formatLocalDateTime(link.validUntil)}
                      <Countdown to={link.validUntil} />
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onCopy(link.url, link.id)}
                      className="text-xs px-2 py-1 rounded bg-brand-100 text-brand-700 hover:bg-brand-200"
                    >
                      {copiedId === link.id ? "¡Copiado!" : "Copiar URL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevoke(link.id)}
                      disabled={pendingRevokeId === link.id}
                      className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-50"
                    >
                      {pendingRevokeId === link.id ? "…" : "Revocar"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {pendingRevokeId && (
            <div className="pt-2 border-t border-brand-50">
              <label
                htmlFor="revoke-reason"
                className="block text-xs font-semibold text-ink-muted mb-1"
              >
                Razón de revocación (opcional, antes de confirmar)
              </label>
              <input
                id="revoke-reason"
                type="text"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder='Ej. "Se filtró en WhatsApp"'
                className="w-full px-2 py-1 border border-brand-200 rounded text-xs"
              />
            </div>
          )}
        </div>
      )}

      {/* Links revocados (collapsed) */}
      {revokedLinks.length > 0 && (
        <div className="bg-rose-50/50 rounded-lg p-3 border border-rose-100">
          <button
            type="button"
            onClick={() => setShowRevoked((v) => !v)}
            className="text-xs font-semibold text-rose-700 hover:underline"
          >
            {showRevoked ? "▼" : "▶"} Links revocados ({revokedLinks.length})
          </button>
          {showRevoked && (
            <ul className="mt-2 space-y-1 text-xs text-ink-muted">
              {revokedLinks.map((link) => (
                <li key={link.id}>
                  <span className="font-semibold">{link.label ?? "Sin etiqueta"}</span>{" "}
                  · revocado el {formatLocalDateTime(link.revokedAt!)}
                  {link.revokeReason && (
                    <span className="italic"> · "{link.revokeReason}"</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatLocalDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const target = new Date(to).getTime();
  const diffMs = target - now;
  if (diffMs <= 0) {
    return <span className="text-rose-600"> (expirado)</span>;
  }
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return <span className="text-ink-muted"> (en {days}d {hours % 24}h)</span>;
  }
  return <span className="text-ink-muted"> (en {hours}h {mins}m)</span>;
}