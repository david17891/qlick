"use client";

import { useEffect, useMemo, useState } from "react";
import type { Event, EventStatus } from "@/types/events";
import { Card, Badge, Button, Input, Textarea, Field } from "@/components/ui";
import {
  createEvent,
  updateEvent,
  updateEventStatus,
  deleteEvent,
  cloneEvent,
  slugifyTitle,
  datetimeLocalToIso,
} from "@/lib/crm/ops-client";
import { ConfirmDeleteEventModal } from "./ConfirmDeleteEventModal";
import {
  PERSONALITY_PRESETS,
  PERSONALITY_CUSTOM_VALUE,
  matchPersonalityPreset,
  type PersonalityPreset,
} from "@/lib/events/bot-personality-templates";

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
  /** Duración en horas (decimal). Vacío = sin hora de fin. */
  durationHours: string;
  location: string;
  coverImageUrl: string;
  status: EventStatus;
  /** Fase 7b: reglas del bot para este evento. */
  botPersonality: string;
  botRulesText: string; // textarea: 1 regla por linea
}

function eventToForm(e: Event): FormState {
  // Calculamos duración = endsAt - startsAt en horas (decimal). "" si falta.
  let durationHours = "";
  if (e.endsAt && e.startsAt) {
    const start = Date.parse(e.startsAt);
    const end = Date.parse(e.endsAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const hours = (end - start) / (1000 * 60 * 60);
      // Quitar trailing zeros: 1.5 en vez de 1.50, 2 en vez de 2.0
      durationHours = Number(hours.toFixed(2)).toString();
    }
  }
  return {
    title: e.title ?? "",
    slug: e.slug ?? "",
    description: e.description ?? "",
    startsAtLocal: isoToLocalInput(e.startsAt),
    durationHours,
    location: e.location ?? "",
    coverImageUrl: e.coverImageUrl ?? "",
    status: e.status,
    botPersonality: e.eventRules?.personality ?? "",
    botRulesText: (e.eventRules?.rules ?? []).join("\n")
  };
}

function emptyForm(): FormState {
  return {
    title: "",
    slug: "",
    description: "",
    startsAtLocal: "",
    durationHours: "",
    location: "",
    coverImageUrl: "",
    status: "draft",
    botPersonality: "",
    botRulesText: ""
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
  onCloned,
  onArchived,
}: {
  mode: Mode;
  event?: Event | null;
  onClose: () => void;
  /** Notifica al padre tras un save o status change OK. */
  onSaved: (event: Event) => void;
  /** Notifica al padre tras un clone OK con el evento nuevo (Fase 5 Paquete D). */
  onCloned?: (clone: Event) => void;
  /**
   * Notifica al padre tras archivar un evento (Fase 5 Paquete D — Undo).
   * El padre usa esto para mostrar un toast con botón "Deshacer".
   */
  onArchived?: (event: Event) => void;
}) {
  const initial = useMemo<FormState>(
    () => (mode === "edit" && event ? eventToForm(event) : emptyForm()),
    [mode, event],
  );

  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [statusChanging, setStatusChanging] = useState<EventStatus | null>(null);
  /** Status pendiente de confirmar en modal. null = no hay modal abierto. */
  const [pendingStatusChange, setPendingStatusChange] = useState<EventStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** Errores de validación por campo (inline). Mostrados bajo cada <Field>. */
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  /** true = modal de confirmación de eliminación abierto. */
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Si cambia el evento/modo desde fuera, resetea el form — pero SOLO
  // si no hay cambios locales sin guardar. Si `prev !== initial`, el
  // usuario tocó algo, preservar (puede ser que un `router.refresh()`
  // del padre haya disparado este useEffect con un initial "fresco"
  // mientras el admin editaba). Fix 04 — 2026-07-04.
  useEffect(() => {
    setForm((prev) =>
      JSON.stringify(prev) === JSON.stringify(initial) ? initial : prev
    );
  }, [initial]);

  /** true si el form tiene cambios locales vs el initial hidratado.
   *  Se usa para señalar "tienes cambios sin guardar" en el botón Guardar.
   *  Fix 01 — 2026-07-04. */
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  );

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
      if (e.key === "Escape" && !saving && !statusChanging && !cloning) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, statusChanging, cloning]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    // Limpia el error del campo en cuanto el usuario empieza a corregirlo.
    setFieldErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validación inline por campo. Cada error se muestra bajo su Field
    // (con borde rojo + role="alert" para screen readers).
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) {
      errs.title = "El título es obligatorio.";
    }
    if (!form.startsAtLocal) {
      errs.startsAtLocal = "La fecha de inicio es obligatoria.";
    }
    if (mode === "create" && !form.slug.trim()) {
      errs.slug =
        "El slug es obligatorio (se autogenra del título, editalo si hace falta).";
    }
    // duración: si está, debe ser número positivo
    let durationParsed: number | null = null;
    const durStr = form.durationHours.trim();
    if (durStr) {
      const n = Number(durStr);
      if (!Number.isFinite(n) || n <= 0) {
        errs.durationHours = "La duración debe ser un número positivo (ej. 1, 1.5, 2).";
      } else {
        durationParsed = n;
      }
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    const rulesArr = form.botRulesText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Calculamos endsAt a partir de startsAt + durationHours. Si no hay
    // duración, no se envía endsAt (el evento queda sin hora de cierre).
    const startsAtIso = datetimeLocalToIso(form.startsAtLocal);
    let endsAtIso: string | undefined;
    if (durationParsed !== null) {
      const start = new Date(startsAtIso).getTime();
      const end = new Date(start + durationParsed * 60 * 60 * 1000).toISOString();
      endsAtIso = end;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createEvent({
          slug: form.slug.trim(),
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          location: form.location.trim() || undefined,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
          status: form.status,
          eventRules: {
            personality: form.botPersonality.trim(),
            rules: rulesArr
          }
        });
        setSuccess("Evento creado.");
        onSaved(created);
      } else if (event) {
        const updated = await updateEvent(event.id, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          startsAt: startsAtIso,
          endsAt: endsAtIso ?? null,
          location: form.location.trim() || undefined,
          eventRules: {
            personality: form.botPersonality.trim(),
            rules: rulesArr
          },
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
      // Si el destino es archived, notificamos al padre con el callback
      // dedicado (Fase 5 Paquete D — Undo). Si no, solo notificamos via
      // onSaved (refresh) y cerramos.
      if (newStatus === "archived" && onArchived) {
        onArchived(updated);
      } else {
        onSaved(updated);
      }
      // Notificamos al padre (router.refresh) Y cerramos el drawer en el mismo
      // tick. Hacer ambos juntos evita depender de timers que pueden perderse
      // cuando Next.js re-monta el componente durante el refresh.
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cambiando status.");
      setStatusChanging(null);
    }
  }

  /**
   * Abre el modal de confirmación para un cambio de status.
   * Acciones destructivas (archivar) o significativas (publicar) pasan por acá.
   */
  function requestStatusChange(s: EventStatus) {
    setError(null);
    setSuccess(null);
    setPendingStatusChange(s);
  }

  /** Ejecuta el PATCH confirmado en el modal. */
  async function confirmStatusChange() {
    if (!pendingStatusChange || !event) return;
    const s = pendingStatusChange;
    setPendingStatusChange(null);
    await handleStatusChange(s);
  }

  /**
   * Clona el evento actual (Fase 5 Paquete D).
   *
   * Crea un nuevo evento con slug único (`<slug>-copia` / `-copia-N`),
   * título con sufijo " (Copia)" y status='draft'. NO copia confirmados,
   * asistentes ni encuestas.
   *
   * Tras OK: notifica al padre con `onCloned(clone)` (que se usa para
   * mostrar el toast "Clonado — Abrir"), refresca la lista y cierra el
   * drawer. El clon queda en status='draft', el admin debe editarlo y
   * publicarlo explícitamente.
   */
  async function handleClone() {
    if (!event) return;
    setError(null);
    setSuccess(null);
    setCloning(true);
    try {
      const { event: clone } = await cloneEvent(event.id);
      if (onCloned) {
        onCloned(clone);
      } else {
        onSaved(clone);
      }
      // El padre hace router.refresh() via onSaved/onCloned. Cerramos
      // el drawer en el mismo tick para no depender de timers.
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo clonar: ${err.message}`
          : "No se pudo clonar el evento.",
      );
    } finally {
      setCloning(false);
    }
  }

  /**
   * Confirmación de eliminación (hard delete). Cascade borra todas las
   * dependencias (confirmations, attendees, surveys, lead_event_links).
   * NO reversible — el modal debe pedir confirmación al admin.
   */
  async function confirmDelete() {
    if (!event) return;
    setError(null);
    setSuccess(null);
    setDeleting(true);
    try {
      const note = await deleteEvent(event.id);
      setSuccess(note);
      // Notificar al padre (refresh) y cerrar el drawer en el mismo tick.
      onSaved(event);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo eliminar: ${err.message}`
          : "No se pudo eliminar el evento.",
      );
    } finally {
      setDeleting(false);
      setPendingDelete(false);
    }
  }

  const currentStatus: EventStatus = event?.status ?? form.status;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar drawer"
        onClick={() => !saving && !statusChanging && !cloning && onClose()}
        className="fixed inset-0 bg-ink/40 z-40 cursor-default"
      />
      {/* Drawer — envuelto en <form> para que `type="submit"` del botón
          Guardar funcione correctamente. Antes el form solo cubría los
          campos y el botón quedaba en el <footer> fuera del form, así
          que type="submit" no submiteaba nada y dependía de un cast
          (e as unknown as React.FormEvent) que no funcionaba. Fix 05 — 2026-07-04. */}
      <form onSubmit={handleSubmit} noValidate>
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
              <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-2">
                <span>/{event.slug}</span>
                {/* FIX 2026-07-05 (sesión David, ya-estas-registrado con
                    nombre duplicado): mostramos el short_code al lado del
                    slug en el header del drawer. Es la identidad canónica
                    que el bot y el staff usan para noambigüedad. Copiable
                    al click. */}
                {event.shortCode && (
                  <button
                    type="button"
                    title="Copiar código"
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard
                          .writeText(event.shortCode ?? "")
                          .catch(() => {});
                      }
                    }}
                    className="font-mono px-1.5 py-0.5 rounded bg-ink/5 hover:bg-ink/10 text-ink transition-colors"
                  >
                    {event.shortCode}
                  </button>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || !!statusChanging || cloning}
            className="rounded-lg px-3 py-1 text-sm text-ink-muted hover:bg-brand-50 disabled:opacity-50"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <Field label="Título" htmlFor="evt-title" error={fieldErrors.title} required>
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
              error={fieldErrors.slug}
              required
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
            <Field label="Inicio" htmlFor="evt-start" error={fieldErrors.startsAtLocal} required>
              <Input
                id="evt-start"
                type="datetime-local"
                value={form.startsAtLocal}
                onChange={(e) => set("startsAtLocal", e.target.value)}
                required
                disabled={saving}
              />
            </Field>
            <Field
              label="Duración (horas)"
              htmlFor="evt-duration"
              hint="Opcional. Decimal: 1, 1.5, 2, 3…"
              error={fieldErrors.durationHours}
            >
              <Input
                id="evt-duration"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.25"
                value={form.durationHours}
                onChange={(e) => set("durationHours", e.target.value)}
                placeholder="1.5"
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

          {/* ────── Reglas del bot (Fase 7b) ────── */}
          <fieldset className="border-t border-brand-100 pt-4 mt-2 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-brand-600 px-2">
              🤖 Reglas del bot
            </legend>
            <p className="text-xs text-ink-muted px-1">
              Personalidad y reglas que el bot sigue al responder preguntas
              sobre este evento. La <strong>description</strong> de arriba
              ya es el contexto principal; estas reglas afinan el tono y los
              límites.
            </p>
            {/* Banner si el evento aún no tiene reglas: ahorra confusión
                cuando el admin abre un evento viejo que nunca las tuvo. */}
            {!form.botPersonality.trim() && !form.botRulesText.trim() && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Este evento aún no tiene reglas del bot. Completá personalidad
                y reglas abajo para que responda con el tono correcto.
              </div>
            )}

            <PersonalitySelect
              value={form.botPersonality}
              onChange={(value, preset) => {
                // Si eligió un preset: pisamos personalidad (texto largo
                // del system prompt) Y prellenamos reglas con el template.
                // Si eligió Custom (freeform existente o vacío): mantenemos
                // personalidad tal cual y reglas tal cual.
                if (preset) {
                  setForm((p) => ({
                    ...p,
                    botPersonality: preset.personality,
                    botRulesText: preset.rules.join("\n")
                  }));
                } else {
                  set("botPersonality", value);
                }
              }}
              disabled={saving}
            />

            <Field
              label="Reglas (una por línea)"
              htmlFor="evt-bot-rules"
              hint="Lo que el bot DEBE o NO DEBE hacer. Editá libremente. Si inventar precios / fechas / cupos que no estén en la descripción del evento está explícitamente prohibido."
            >
              <Textarea
                id="evt-bot-rules"
                rows={8}
                value={form.botRulesText}
                onChange={(e) => set("botRulesText", e.target.value)}
                placeholder={
                  "Las reglas se prellenan al elegir una personalidad arriba.\n" +
                  "Editá las que necesites y guardá."
                }
                disabled={saving}
              />
            </Field>
          </fieldset>
        </div>

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
                  disabled={saving || !!statusChanging || !!pendingStatusChange || cloning}
                  onClick={() => requestStatusChange("published")}
                >
                  {statusChanging === "published" ? "…" : "Publicar"}
                </Button>
              )}
              {currentStatus === "published" && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={saving || !!statusChanging || !!pendingStatusChange || cloning}
                  onClick={() => requestStatusChange("draft")}
                >
                  {statusChanging === "draft" ? "…" : "Volver a borrador"}
                </Button>
              )}
              {currentStatus !== "archived" && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={saving || !!statusChanging || !!pendingStatusChange || cloning}
                  onClick={() => requestStatusChange("archived")}
                >
                  {statusChanging === "archived" ? "…" : "Archivar"}
                </Button>
              )}
              {currentStatus === "archived" && (
                <Button
                  size="sm"
                  variant="accent"
                  type="button"
                  disabled={saving || !!statusChanging || !!pendingStatusChange || cloning}
                  onClick={() => requestStatusChange("draft")}
                >
                  {statusChanging === "draft" ? "…" : "Reactivar"}
                </Button>
              )}
            </div>
          )}

          {/* Fila de acciones secundarias: Clonar (Fase 5 Paquete D) + Eliminar */}
          {mode === "edit" && event && (
            <div className="flex items-center justify-between border-t border-brand-100 pt-3">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={saving || !!statusChanging || !!pendingStatusChange || cloning || deleting}
                  onClick={handleClone}
                  aria-label="Clonar este evento (crea una copia en borrador)"
                >
                  {cloning ? "Clonando…" : "📋 Clonar evento"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={saving || !!statusChanging || !!pendingStatusChange || cloning || deleting}
                  onClick={() => setPendingDelete(true)}
                  aria-label="Eliminar este evento permanentemente"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  🗑️ Eliminar
                </Button>
              </div>
              <p className="text-[10px] text-ink-muted italic">
                Clonar queda en borrador · Eliminar es permanente.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving || !!statusChanging || cloning || deleting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !!statusChanging || cloning || deleting}
            >
              {saving ? "Guardando…" : mode === "create" ? "Crear evento" : isDirty ? "Guardar cambios •" : "Guardar cambios"}
            </Button>
          </div>
        </footer>
      </aside>
      </form>

      {/* Modal de confirmación para cambio de status */}
      {pendingStatusChange && (
        <StatusChangeConfirm
          currentStatus={currentStatus}
          newStatus={pendingStatusChange}
          eventTitle={form.title}
          onCancel={() => setPendingStatusChange(null)}
          onConfirm={confirmStatusChange}
          pending={!!statusChanging}
        />
      )}

      {/* Modal de confirmación para eliminación (hard delete, no reversible).
          Misma fricción alta (primeras 3 letras del título) que el modal
          de la card — componente compartido en `ConfirmDeleteEventModal.tsx`.
          Cuando el evento se está creando, `form.title` puede estar vacío:
          en ese caso el modal pide el título completo. */}
      {pendingDelete && (
        <ConfirmDeleteEventModal
          eventTitle={form.title}
          onCancel={() => setPendingDelete(false)}
          onConfirm={confirmDelete}
          pending={deleting}
        />
      )}
    </>
  );
}

/* ----------------------- Sub-componentes ----------------------- */

/**
 * Selector de personalidad del bot (Fase 7c, 2026-07-05).
 *
 * Modela los 4 presets de `bot-personality-templates.ts` como `<option>`
 * de un `<select>` + un sentinel "__custom__" para personalidades
 * freeform existentes (eventos viejos que tenían texto custom).
 *
 * Comportamiento:
 * - Si el `value` actual matchea un preset (por `value` corto o por
 *   `personality` completa), ese preset aparece seleccionado.
 * - Si no matchea pero tiene texto → opción "Personalizado (custom)"
 *   deshabilitada, para que el admin sepa que no es uno de los 4.
 * - Si está vacío → placeholder "Elegí una personalidad para empezar".
 *
 * onChange recibe el nuevo valor y el preset seleccionado (o undefined
 * si fue Custom). El padre decide qué hacer — típicamente si hay preset,
 * prellenar las reglas; si no, dejar libre.
 */
function PersonalitySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (newValue: string, preset: PersonalityPreset | undefined) => void;
  disabled?: boolean;
}) {
  const matched = matchPersonalityPreset(value);
  const isCustom = !matched && value.trim().length > 0;
  const selectValue = matched?.value ?? (isCustom ? PERSONALITY_CUSTOM_VALUE : "");

  return (
    <Field
      label="Personalidad"
      htmlFor="evt-bot-personality"
      hint="Elegí una para empezar. Las reglas se pre-llenan con defaults de venta; edítalas abajo."
    >
      <select
        id="evt-bot-personality"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === PERSONALITY_CUSTOM_VALUE) return; // opción disabled
          if (v === "") return; // placeholder
          const preset = PERSONALITY_PRESETS.find((p) => p.value === v);
          onChange(v, preset);
        }}
        disabled={disabled}
        className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <option value="" disabled>
          Elegí una personalidad…
        </option>
        {PERSONALITY_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.description}
          </option>
        ))}
        {isCustom && (
          <option value={PERSONALITY_CUSTOM_VALUE} disabled>
            Personalizado (custom) — elegí un preset para reemplazar
          </option>
        )}
      </select>
    </Field>
  );
}

/**
 * Modal de confirmación pequeño para cambios de status.
 * Overlay semitransparente encima del drawer; panel centrado con el copy
 * específico según el target (archivar/publicar/reactivar/borrador).
 */
function StatusChangeConfirm({
  currentStatus,
  newStatus,
  eventTitle,
  onCancel,
  onConfirm,
  pending,
}: {
  currentStatus: EventStatus;
  newStatus: EventStatus;
  eventTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { title, message, confirmLabel, tone } = (() => {
    switch (newStatus) {
      case "archived":
        return {
          title: "¿Archivar este evento?",
          message:
            "El evento dejará de ser visible públicamente. Los confirmados, asistentes y encuestas se conservan en la DB y puedes reactivarlo cuando quieras.",
          confirmLabel: "Sí, archivar",
          tone: "danger" as const,
        };
      case "published":
        return {
          title: "¿Publicar este evento?",
          message:
            "El evento será visible públicamente en /eventos/[slug]. Asegúrate de que los datos (título, fechas, ubicación, descripción) estén completos.",
          confirmLabel: "Sí, publicar",
          tone: "accent" as const,
        };
      case "draft":
        if (currentStatus === "archived") {
          return {
            title: "¿Reactivar este evento?",
            message:
              "El evento volverá a estado de borrador. No será visible públicamente hasta que lo publiques de nuevo.",
            confirmLabel: "Sí, reactivar",
            tone: "accent" as const,
          };
        }
        return {
          title: "¿Volver a borrador?",
          message:
            "El evento dejará de ser visible públicamente, pero los datos se conservan. Puedes publicarlo de nuevo cuando quieras.",
          confirmLabel: "Sí, volver a borrador",
          tone: "outline" as const,
        };
    }
  })();

  return (
    <>
      {/* Overlay encima del drawer (más opaco para destacar) */}
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={() => !pending && onCancel()}
        className="fixed inset-0 bg-ink/60 z-[60] cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 pointer-events-auto">
          <h3 className="text-lg font-bold text-ink mb-2">{title}</h3>
          <p className="text-sm text-ink-soft mb-1">
            Evento: <span className="font-semibold text-ink">{eventTitle || "(sin título)"}</span>
          </p>
          <p className="text-sm text-ink-soft mb-5">{message}</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button variant={tone} onClick={onConfirm} disabled={pending}>
              {pending ? "Aplicando…" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}