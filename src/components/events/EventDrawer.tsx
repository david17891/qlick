"use client";

import { useEffect, useMemo, useState } from "react";
import type { Event, EventStatus } from "@/types/events";
import { Card, Badge, Button, Input, Textarea, Field } from "@/components/ui";
import {
  createEvent,
  updateEvent,
  updateEventStatus,
  slugifyTitle,
  datetimeLocalToIso,
} from "@/lib/crm/ops-client";

/**
 * Drawer (panel lateral) para crear o editar un evento del admin.
 *
 * Modos:
 * - `mode="create"`: form vacío + campo slug visible (autogenerado del título
 *   si el admin lo deja vacío). Default status = 'draft'.
 * - `mode="edit"`: form prellenado con el evento. Slug NO editable (rompería
 *   URLs). Botones extra: Publicar / Volver a borrador / Archivar / Reactivar.
 *
 * Tras submit OK, llama `onSaved(event)` para que el padre refresque la lista
 * con `router.refresh()` y/o actualice el state local.
 */

type Mode = "create" | "edit";

interface FormState {
  title: string;
  slug: string;
  description: string;
  startsAtLocal: string; // YYYY-MM-DDTHH:mm (datetime-local)
  endsAtLocal: string;
  location: string;
  coverImageUrl: string;
  status: EventStatus;
}

function eventToForm(e: Event): FormState {
  return {
    title: e.title ?? "",
    slug: e.slug ?? "",
    description: e.description ?? "",
    startsAtLocal: isoToLocalInput(e.startsAt),
    endsAtLocal: e.endsAt ? isoToLocalInput(e.endsAt) : "",
    location: e.location ?? "",
    coverImageUrl: e.coverImageUrl ?? "",
    status: e.status,
  };
}

function emptyForm(): FormState {
  return {
    title: "",
    slug: "",
    description: "",
    startsAtLocal: "",
    endsAtLocal: "",
    location: "",
    coverImageUrl: "",
    status: "draft",
  };
}

/** ISO string → "YYYY-MM-DDTHH:mm" para <input type="datetime-local">. */
function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export function EventDrawer({
  mode,
  event,
  onClose,
  onSaved,
}: {
  mode: Mode;
  event?: Event | null;
  onClose: () => void;
  /** Notifica al padre tras un save o status change OK. */
  onSaved: (event: Event) => void;
}) {
  const initial = useMemo<FormState>(
    () => (mode === "edit" && event ? eventToForm(event) : emptyForm()),
    [mode, event],
  );

  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [statusChanging, setStatusChanging] = useState<EventStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Si cambia el evento/modo desde fuera, resetea el form.
  useEffect(() => setForm(initial), [initial]);

  // Auto-genera slug del título en modo create si el admin lo deja vacío.
  useEffect(() => {
    if (mode !== "create") return;
    setForm((prev) => {
      if (prev.slug && prev.slug !== slugifyTitle(prev.title)) return prev;
      return { ...prev, slug: slugifyTitle(prev.title) };
    });
  }, [form.title, mode]);

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !statusChanging) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, statusChanging]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    if (!form.startsAtLocal) {
      setError("La fecha de inicio es obligatoria.");
      return;
    }
    if (mode === "create" && !form.slug.trim()) {
      setError("El slug es obligatorio (se autogenra del título, editalo si hace falta).");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createEvent({
          slug: form.slug.trim(),
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          startsAt: datetimeLocalToIso(form.startsAtLocal),
          endsAt: form.endsAtLocal
            ? datetimeLocalToIso(form.endsAtLocal)
            : undefined,
          location: form.location.trim() || undefined,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
          status: form.status,
        });
        setSuccess("Evento creado.");
        onSaved(created);
      } else if (event) {
        const updated = await updateEvent(event.id, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          startsAt: datetimeLocalToIso(form.startsAtLocal),
          endsAt: form.endsAtLocal
            ? datetimeLocalToIso(form.endsAtLocal)
            : undefined,
          location: form.location.trim() || undefined,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
        });
        setSuccess("Cambios guardados.");
        onSaved(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando el evento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(newStatus: EventStatus) {
    if (!event) return;
    setError(null);
    setSuccess(null);
    setStatusChanging(newStatus);
    try {
      const updated = await updateEventStatus(event.id, newStatus);
      // Notificamos al padre (router.refresh) Y cerramos el drawer en el mismo
      // tick. Hacer ambos juntos evita depender de timers que pueden perderse
      // cuando Next.js re-monta el componente durante el refresh.
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cambiando status.");
      setStatusChanging(null);
    }
  }

  const currentStatus: EventStatus = event?.status ?? form.status;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar drawer"
        onClick={() => !saving && !statusChanging && onClose()}
        className="fixed inset-0 bg-ink/40 z-40 cursor-default"
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-brand-100 px-6 py-4">
          <div>
            <p className="text-xs text-ink-muted">
              {mode === "create" ? "Nuevo evento" : "Editar evento"}
            </p>
            <h2 className="text-xl font-bold text-ink">
              {mode === "create" ? "Crear evento" : form.title || "Sin título"}
            </h2>
            {mode === "edit" && event && (
              <p className="text-xs text-ink-muted mt-0.5">/{event.slug}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || !!statusChanging}
            className="rounded-lg px-3 py-1 text-sm text-ink-muted hover:bg-brand-50 disabled:opacity-50"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <Field label="Título" htmlFor="evt-title">
            <Input
              id="evt-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ej. Taller de Marketing Digital"
              required
              disabled={saving}
            />
          </Field>

          {mode === "create" && (
            <Field
              label="Slug (URL)"
              htmlFor="evt-slug"
              hint="Solo letras, números y guiones. Se autogenra del título."
            >
              <Input
                id="evt-slug"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="taller-marketing-digital"
                required
                disabled={saving}
              />
            </Field>
          )}

          <Field label="Descripción" htmlFor="evt-desc">
            <Textarea
              id="evt-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Resumen del evento, agenda, qué se lleva el asistente…"
              disabled={saving}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio" htmlFor="evt-start">
              <Input
                id="evt-start"
                type="datetime-local"
                value={form.startsAtLocal}
                onChange={(e) => set("startsAtLocal", e.target.value)}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Fin (opcional)" htmlFor="evt-end">
              <Input
                id="evt-end"
                type="datetime-local"
                value={form.endsAtLocal}
                onChange={(e) => set("endsAtLocal", e.target.value)}
                disabled={saving}
              />
            </Field>
          </div>

          <Field label="Ubicación" htmlFor="evt-loc" hint="Lugar físico o link de Zoom/Meet.">
            <Input
              id="evt-loc"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Mexicali, BC · o https://zoom.us/…"
              disabled={saving}
            />
          </Field>

          <Field label="Imagen de portada (URL)" htmlFor="evt-cover" hint="Opcional. Se mostrará en la card del admin.">
            <Input
              id="evt-cover"
              type="url"
              value={form.coverImageUrl}
              onChange={(e) => set("coverImageUrl", e.target.value)}
              placeholder="https://…"
              disabled={saving}
            />
          </Field>

          {mode === "create" && (
            <Field label="Status inicial" htmlFor="evt-status">
              <select
                id="evt-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value as EventStatus)}
                disabled={saving}
                className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                <option value="draft">Borrador (no visible al público)</option>
                <option value="published">Publicado (visible al público)</option>
              </select>
            </Field>
          )}
        </form>

        <footer className="border-t border-brand-100 px-6 py-4 flex flex-col gap-3 bg-brand-50/30">
          {/* Acciones de status en modo edit */}
          {mode === "edit" && event && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-muted">Status actual:</span>
              <Badge
                tone={
                  currentStatus === "published"
                    ? "success"
                    : currentStatus === "draft"
                      ? "warning"
                      : "neutral"
                }
              >
                {currentStatus === "published"
                  ? "Publicado"
                  : currentStatus === "draft"
                    ? "Borrador"
                    : "Archivado"}
              </Badge>
              <div className="flex-1" />
              {currentStatus !== "published" && (
                <Button
                  size="sm"
                  variant="accent"
                  type="button"
                  disabled={saving || !!statusChanging}
                  onClick={() => handleStatusChange("published")}
                >
                  {statusChanging === "published" ? "…" : "Publicar"}
                </Button>
              )}
              {currentStatus === "published" && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={saving || !!statusChanging}
                  onClick={() => handleStatusChange("draft")}
                >
                  {statusChanging === "draft" ? "…" : "Volver a borrador"}
                </Button>
              )}
              {currentStatus !== "archived" && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={saving || !!statusChanging}
                  onClick={() => handleStatusChange("archived")}
                >
                  {statusChanging === "archived" ? "…" : "Archivar"}
                </Button>
              )}
              {currentStatus === "archived" && (
                <Button
                  size="sm"
                  variant="accent"
                  type="button"
                  disabled={saving || !!statusChanging}
                  onClick={() => handleStatusChange("draft")}
                >
                  {statusChanging === "draft" ? "…" : "Reactivar"}
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving || !!statusChanging}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
              disabled={saving || !!statusChanging}
            >
              {saving ? "Guardando…" : mode === "create" ? "Crear evento" : "Guardar cambios"}
            </Button>
          </div>
        </footer>
      </aside>
    </>
  );
}