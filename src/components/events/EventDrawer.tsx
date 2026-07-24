"use client";

import { useEffect, useMemo, useState } from "react";
import type { Event, EventStatus } from "@/types/events";
import { Card, Badge, Button, Input, Textarea, Field } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  CreditCard,
  Gift,
  Lightbulb,
  MapPin,
  Monitor,
  Shuffle,
  Trash2,
  Video,
  Wrench,
  X
} from "lucide-react";
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
import {
  buildEventRulesFromForm,
  parseReservationAmount,
  validateReservation,
  type FormEventRulesChanges,
} from "@/lib/events/event-rules-merge";

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

type EventFormat = "in_person" | "virtual" | "hybrid";
type EventStreamingProvider = "youtube_live" | "facebook_live" | "zoom" | "other";

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
  /**
   * Modalidad del evento (migration 20260707000000). Default `in_person`
   * para preservar el comportamiento legacy de todos los eventos
   * presenciales que ya están en producción.
   */
  format: EventFormat;
  /** Link de streaming (YouTube Live, Zoom, FB Live, etc.). Requerido si format != in_person. */
  streamingUrl: string;
  /** Provider declarado (analítica + hints en admin UI). */
  streamingProvider: EventStreamingProvider;
  /** Nota visible para el asistente (ej: "el link se abre 10 min antes"). */
  streamingAccessNote: string;
  /**
   * Precio de la entrada en MXN (migration 20260714230000). "" = sin
   * precio seteado (el server aplica 0 = gratis). El admin lo ve
   * en un fieldset "Pago" después de Modalidad y antes de Portada.
   */
  priceMXN: string;
  /**
   * Codigo de moneda ISO-4217. Default 'MXN'. Hoy no se permite
   * cambiar desde la UI (Qlick opera 100% en Mexico), pero el
   * campo existe para que el server sepa que el admin es consciente
   * de la moneda.
   */
  currency: string;
  /**
   * FIX 2026-07-18 (sprint Stripe Live prep): modo de Stripe para
   * este evento. Default "test" (sin cargo real). Solo el admin
   * puede setear "live" para hacer pruebas con dinero real.
   *
   * IMPORTANTE: "live" cobra dinero real a la tarjeta del cliente.
   * El admin debe confirmar que entiende esto antes de cambiarlo.
   * Se persiste en `event.event_rules.payment_mode` (Json libre).
   */
  paymentMode: "test" | "live";
  /**
   * FIX 2026-07-23 (sprint apartado CANACO): apartado para eventos
   * de pago. `reservationEnabled` activa la opción de pagar un
   * anticipo y liquidar el saldo después (en puerta o vía otro
   * medio). `reservationAmountMxn` es el monto del anticipo en MXN,
   * como string del input admin (lo parseamos al enviar). El saldo
   * siempre se calcula como `priceMXN - reservationAmountMxn` y NO
   * es editable (lo muestra el form como preview, no como input).
   *
   * Restricciones (validadas en el form + server):
   *   - priceMXN > 0 (sin apartado en eventos gratuitos)
   *   - 0 < reservationAmountMxn < priceMXN
   *   - max 2 decimales
   */
  reservationEnabled: boolean;
  reservationAmountMxn: string;
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
    botRulesText: (e.eventRules?.rules ?? []).join("\n"),
    // Streaming (migration 20260707000000). Defaults seguros:
    // in_person si no hay format legacy, provider=other si no estaba seteado.
    format: (e.format ?? "in_person") as EventFormat,
    streamingUrl: e.streamingUrl ?? "",
    streamingProvider: (e.streamingProvider ?? "other") as EventStreamingProvider,
    streamingAccessNote: e.streamingAccessNote ?? "",
    // Pago (migration 20260714230000). Si priceMXN es undefined o 0,
    // el input queda vacio (el admin ve "0" como default y entiende
    // que es gratis). Si es > 0, lo mostramos con 2 decimales para
    // que se vea como precio (ej. "499" o "499.50").
    priceMXN:
      typeof e.priceMXN === "number" && e.priceMXN > 0
        ? e.priceMXN.toString()
        : "",
    currency: e.currency ?? "MXN",
    // FIX 2026-07-18: leer payment_mode de event_rules (default test).
    paymentMode:
      e.eventRules?.payment_mode === "live" ? "live" : "test",
    // FIX 2026-07-23 (sprint apartado CANACO): hidratar apartado desde
    // event_rules.reservation_*. Si el evento ya tiene apartado
    // configurado, lo mostramos. Si no, los defaults (desactivado +
    // monto vacío) para que el admin pueda activarlo explícitamente.
    reservationEnabled: e.eventRules?.reservation_enabled === true,
    reservationAmountMxn:
      typeof e.eventRules?.reservation_amount_mxn === "number" &&
      e.eventRules.reservation_amount_mxn > 0
        ? e.eventRules.reservation_amount_mxn.toString()
        : "",
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
    botRulesText: "",
    // Default `in_person` para preservar eventos presenciales legacy
    // (todos los que ya están creados). El admin cambia a virtual/hybrid
    // explícitamente cuando configura un evento online.
    format: "in_person",
    streamingUrl: "",
    streamingProvider: "youtube_live",
    streamingAccessNote: "",
    // Pago (migration 20260714230000). Default vacio = el admin
    // debe escribir explicitamente "0" si quiere confirmar que es
    // gratis, o el numero si quiere cobrar. Currency default 'MXN'.
    priceMXN: "",
    currency: "MXN",
    // FIX 2026-07-18: default "test" (conservador). El admin debe
    // cambiar explicitamente a "live" para hacer pruebas con cargo
    // real. UI muestra confirmacion antes de guardar.
    paymentMode: "test",
    // FIX 2026-07-23: defaults neutros para apartado. El admin debe
    // activar el checkbox explicitamente. El monto queda vacio hasta
    // que lo escriba.
    reservationEnabled: false,
    reservationAmountMxn: "",
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

  // FIX 2026-07-23 (sprint apartado CANACO): derivado en tiempo real
  // del precio parseado y la validación del apartado. Se usa para
  // mostrar el saldo pendiente y los banners contextuales (cobro
  // activado, evento gratuito, etc.) sin recalcular en cada render
  // del JSX. La validación final se hace en `handleSubmit` con el
  // mismo helper — esto es solo para preview.
  const pricePreview = useMemo(() => {
    const raw = form.priceMXN.trim();
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [form.priceMXN]);

  const reservationPreview = useMemo(() => {
    const amount = parseReservationAmount(form.reservationAmountMxn);
    return validateReservation({
      priceMXN: pricePreview,
      enabled: form.reservationEnabled,
      amount: form.reservationEnabled ? amount : null,
    });
  }, [pricePreview, form.reservationEnabled, form.reservationAmountMxn]);

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
    // Precio: si viene algo, lo parseamos. Vacio o no numerico = 0.
    const priceRaw = form.priceMXN.trim();
    let priceParsed = 0;
    if (priceRaw) {
      const n = Number(priceRaw);
      if (!Number.isFinite(n) || n < 0) {
        errs.priceMXN = "El precio debe ser un número válido (0 o mayor).";
      } else {
        priceParsed = Math.max(0, n);
      }
    }
    // Apartado (FIX 2026-07-23 sprint CANACO). Lo validamos con el
    // helper puro `validateReservation` que centraliza las reglas de
    // negocio. El form manda el monto como string y el helper lo
    // parsea con `parseReservationAmount` (max 2 decimales, no
    // negativos, no NaN).
    const reservationAmountParsed = parseReservationAmount(
      form.reservationAmountMxn
    );
    const reservationValidation = validateReservation({
      priceMXN: priceParsed,
      enabled: form.reservationEnabled,
      amount: form.reservationEnabled ? reservationAmountParsed : null,
    });
    if (!reservationValidation.valid && reservationValidation.error) {
      errs.reservationAmountMxn = reservationValidation.error;
    }
    // Streaming (migration 20260707000000 + 20260707093000): el
    // streaming_url es OPCIONAL en TODAS las modalidades. El operador
    // puede crear el evento sin link y agregarlo días después desde
    // Edición (caso real: YouTube Live se agenda 1-2 días antes).
    // La validación acá NO bloquea — queda como campo libre.
    // Si queda vacío y el evento es virtual, se muestra "el link te lo
    // enviamos el día del evento" en bot/email/landing.
    void form.streamingUrl; // campo opcional, no se valida en esta capa
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

    // FIX 2026-07-23: construir el eventRules con el helper de merge
    // para preservar campos que el form no maneja (payment_mode,
    // reservation_*, balance_*, o cualquier key futura). El helper
    // también se encarga de validar el apartado + calcular el saldo.
    const mergeChanges: FormEventRulesChanges = {
      personality: form.botPersonality.trim(),
      rules: rulesArr,
      paymentMode: form.paymentMode,
      reservation: reservationValidation,
      reservationAmountParsed: form.reservationEnabled
        ? reservationAmountParsed
        : null,
    };
    const eventRulesForPayload = buildEventRulesFromForm({
      current: event?.eventRules ?? null,
      changes: mergeChanges,
    });

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
          // FIX 2026-07-23: pasamos el eventRules ya mergeado (con
          // payment_mode, reservation_*, etc.) en vez de armar uno
          // destructivo en el form.
          eventRules: eventRulesForPayload,
          // Streaming (migration 20260707000000). Solo mandamos si format
          // != in_person para no contaminar requests innecesariamente.
          format: form.format,
          streamingUrl: form.streamingUrl.trim() || undefined,
          streamingProvider: form.format !== "in_person" ? form.streamingProvider : undefined,
          streamingAccessNote:
            form.format !== "in_person" && form.streamingAccessNote.trim()
              ? form.streamingAccessNote.trim()
              : undefined,
          // Pago (migration 20260714230000). Ya parseado arriba.
          priceMXN: priceParsed,
          currency: form.currency.trim() || "MXN",
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
          // FIX 2026-07-23: pasamos el eventRules mergeado. El server
          // hace su propio merge por defense in depth (ver
          // `events-server.ts`), pero mandar el JSONB final ya
          // construido evita un roundtrip de SELECT adicional.
          eventRules: eventRulesForPayload,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
          // Streaming: mandamos siempre los nuevos valores para que cambiar
          // de in_person a virtual persista el link correctamente.
          format: form.format,
          streamingUrl: form.streamingUrl.trim() || null,
          streamingProvider: form.format !== "in_person" ? form.streamingProvider : null,
          streamingAccessNote:
            form.format !== "in_person" && form.streamingAccessNote.trim()
              ? form.streamingAccessNote.trim()
              : null,
          // Pago (migration 20260714230000). Ya parseado arriba.
          priceMXN: priceParsed,
          currency: form.currency.trim() || "MXN",
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
            <X className="h-5 w-5" />
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

          {/* ────── Modalidad + streaming (migration 20260707000000) ────── */}
          <fieldset className="border-t border-brand-100 pt-4 mt-2 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-brand-600 px-2">
              <LucideIcon icon={Video} size="sm" tone="inherit" className="inline mr-1" /> Modalidad y streaming
            </legend>
            <Field
              label="Modalidad"
              htmlFor="evt-format"
              hint="Define si los asistentes reciben QR (presencial), link streaming (virtual), o ambos (híbrido)."
            >
              <select
                id="evt-format"
                value={form.format}
                onChange={(e) => set("format", e.target.value as EventFormat)}
                disabled={saving}
                className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                <option value="in_person">Presencial (QR en puerta)</option>
                <option value="virtual">Virtual (link streaming)</option>
                <option value="hybrid">Híbrido (QR + link)</option>
              </select>
            </Field>

            {/* Campos streaming: SOLO visibles si format != in_person.
                Migration 20260707093000: streaming_url ahora es OPCIONAL.
                Puedes crearlo vacío y agregar el link el día del evento
                (caso real: YouTube Live se agenda 1-2 días antes). */}
            {form.format !== "in_person" && (
              <>
                <Field
                  label="Link de streaming"
                  htmlFor="evt-streaming-url"
                  hint="Opcional. Lo normal es definirlo días antes. Si aún no lo tienes, puedes crear el evento vacío y agregar el link el día del evento desde esta misma pantalla."
                  error={fieldErrors.streamingUrl}
                >
                  <Input
                    id="evt-streaming-url"
                    type="url"
                    value={form.streamingUrl}
                    onChange={(e) => set("streamingUrl", e.target.value)}
                    placeholder="https://youtu.be/XXXXXXX"
                    disabled={saving}
                  />
                </Field>

                <Field
                  label="Provider"
                  htmlFor="evt-streaming-provider"
                  hint="Para analítica + hints en el admin. Elige `Otro` si no está listado."
                >
                  <select
                    id="evt-streaming-provider"
                    value={form.streamingProvider}
                    onChange={(e) =>
                      set("streamingProvider", e.target.value as EventStreamingProvider)
                    }
                    disabled={saving}
                    className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="youtube_live">YouTube Live</option>
                    <option value="facebook_live">Facebook Live</option>
                    <option value="zoom">Zoom (Webinar / Meeting)</option>
                    <option value="other">Otro</option>
                  </select>
                </Field>

                <Field
                  label="Nota de acceso (opcional)"
                  htmlFor="evt-streaming-note"
                  hint="Visible para el asistente. Ej: 'El link se desbloquea 10 minutos antes del inicio'."
                >
                  <Textarea
                    id="evt-streaming-note"
                    rows={2}
                    value={form.streamingAccessNote}
                    onChange={(e) => set("streamingAccessNote", e.target.value)}
                    placeholder="El link se desbloquea 10 minutos antes del inicio."
                    disabled={saving}
                  />
                </Field>

                <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800 flex gap-2">
                  <LucideIcon icon={Lightbulb} size="sm" tone="brand" className="flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Tip Qlick:</strong> YouTube Live es gratis y de cero
                    fricción para el attendee. Configurá el stream como
                    &quot;Unlisted&quot; en YouTube Studio para que solo con el link
                    se pueda ver. <strong>Si aún no definiste el link, no es
                    problema:</strong> creá el evento vacío, guardá y agregá el
                    link cuando lo tengas (mismo formulario, en Edición).
                  </div>
                </div>
              </>
            )}
          </fieldset>

          {/* ────── Pago (migration 20260714230000) ────── */}
          <fieldset className="border-t border-brand-100 pt-4 mt-2 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-brand-600 px-2">
              <LucideIcon icon={CreditCard} size="sm" tone="inherit" className="inline mr-1" /> Pago
            </legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field
                  label="Precio (MXN)"
                  htmlFor="evt-price"
                  hint="0 o vacío = evento gratuito (no muestra checkout, va directo a confirmación). Cualquier valor > 0 activa el flow de Stripe / mock provider según NEXT_PUBLIC_PAYMENT_PROVIDER."
                  error={fieldErrors.priceMXN}
                >
                  <Input
                    id="evt-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.50"
                    value={form.priceMXN}
                    onChange={(e) => set("priceMXN", e.target.value)}
                    placeholder="0"
                    disabled={saving}
                  />
                </Field>
              </div>
              <Field
                label="Moneda"
                htmlFor="evt-currency"
                hint="Default MXN. Qlick opera solo en México por ahora."
              >
                <Input
                  id="evt-currency"
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="MXN"
                  maxLength={3}
                  disabled={saving}
                />
              </Field>
            </div>
            {/* Banner contextual según el valor: ayuda al admin a
                entender qué va a pasar al guardar. FIX 2026-07-23:
                usa `pricePreview` (memoizado arriba) en vez de recalcular
                `Number(form.priceMXN)` acá. */}
            {pricePreview > 0 ? (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex gap-2">
                <LucideIcon icon={CheckCircle} size="sm" tone="brand" className="flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Cobro activado:</strong> al guardar, el admin
                  del evento va a poder probar el checkout en{" "}
                  <code className="bg-emerald-100 px-1.5 py-0.5 rounded">
                    /pagar/{form.slug || "<slug>"}
                  </code>{" "}
                  con tarjeta test 4242 (si Stripe está activo) o el
                  simulador mock (si no).
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800 flex gap-2">
                <LucideIcon icon={Gift} size="sm" tone="brand" className="flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Evento gratuito:</strong> no se muestra checkout
                  al asistente. Va directo al form de confirmación.
                </div>
              </div>
            )}

            {/* ────── Apartado (FIX 2026-07-23 sprint CANACO) ──────
                Solo visible si el evento tiene precio > 0. Si es free,
                el apartado no aplica (el helper lo limpia al persistir).
                Muestra:
                - Checkbox "Permitir apartado" (reservaEnabled)
                - Input "Monto del apartado" (MXN, con validación inline)
                - Texto "Saldo pendiente: $X MXN" (preview, no editable)
                El saldo se calcula como pricePreview - amount y se
                actualiza en vivo a medida que el admin tipea. */}
            {pricePreview > 0 && (
              <fieldset className="border-t border-brand-100 pt-4 mt-2 space-y-3">
                <legend className="text-xs font-bold uppercase tracking-wider text-brand-600 px-2">
                  <LucideIcon icon={CreditCard} size="sm" tone="inherit" className="inline mr-1" /> Apartado
                </legend>
                <label className="flex items-start gap-3 rounded-xl border border-brand-100 bg-white px-4 py-3 cursor-pointer hover:border-brand-300 transition-colors">
                  <input
                    type="checkbox"
                    id="evt-reservation-enabled"
                    checked={form.reservationEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      set("reservationEnabled", next);
                      // Si el admin desactiva, limpiamos el monto
                      // inmediatamente para no dejar valores stale que
                      // sobrevivan un guardado accidental.
                      if (!next) set("reservationAmountMxn", "");
                    }}
                    disabled={saving}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-ink">
                      Permitir apartado
                    </div>
                    <div className="text-xs text-ink-muted">
                      El asistente paga un anticipo en línea y liquida el
                      saldo después (típicamente el día del evento, en
                      puerta o por transferencia).
                    </div>
                  </div>
                </label>

                {form.reservationEnabled && (
                  <div className="space-y-2">
                    <Field
                      label="Monto del apartado (MXN)"
                      htmlFor="evt-reservation-amount"
                      hint="Debe ser mayor que cero y menor que el precio total. Hasta 2 decimales."
                      error={fieldErrors.reservationAmountMxn}
                    >
                      <Input
                        id="evt-reservation-amount"
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={form.reservationAmountMxn}
                        onChange={(e) =>
                          set("reservationAmountMxn", e.target.value)
                        }
                        placeholder="500"
                        disabled={saving}
                      />
                    </Field>
                    {/* Preview del saldo: NO editable, se calcula como
                        pricePreview - amount. Si la validación falla
                        (ej. apartado >= total), mostramos el mensaje
                        del helper inline en rojo. */}
                    {reservationPreview.valid &&
                    reservationPreview.balance !== null ? (
                      <div
                        className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800 flex gap-2"
                        data-testid="reservation-balance-preview"
                      >
                        <LucideIcon
                          icon={CheckCircle}
                          size="sm"
                          tone="brand"
                          className="flex-shrink-0 mt-0.5"
                        />
                        <div>
                          <strong>Saldo pendiente:</strong>{" "}
                          ${reservationPreview.balance.toLocaleString("es-MX")}{" "}
                          {form.currency.trim() || "MXN"}. Se liquida el día
                          del evento.
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex gap-2">
                        <LucideIcon
                          icon={AlertTriangle}
                          size="sm"
                          tone="brand"
                          className="flex-shrink-0 mt-0.5"
                        />
                        <div>
                          {reservationPreview.error ??
                            "Indica el monto del apartado para ver el saldo."}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </fieldset>
            )}
          </fieldset>

          {/*
            FIX 2026-07-18 (sprint Stripe Live prep): selector de modo
            de pago (test | live). Default "test" (sin cargo real).
            "live" cobra dinero real a tarjeta y requiere que David
            haya agregado STRIPE_SECRET_KEY_LIVE y
            STRIPE_WEBHOOK_SECRET_LIVE en Vercel.

            Solo visible si el evento tiene precio > 0 (porque si es
            gratuito, no hay checkout y el modo es irrelevante).
            FIX 2026-07-23: usa `pricePreview` memoizado arriba.
          */}
          {pricePreview > 0 && (
            <fieldset className="border-t border-brand-100 pt-4 mt-2 space-y-3">
              <legend className="text-xs font-bold uppercase tracking-wider text-brand-600 px-2">
                Modo de Pago (Stripe)
              </legend>
                <Field
                  label="Modo de Stripe"
                  htmlFor="evt-payment-mode"
                  hint={
                    form.paymentMode === "live"
                      ? "⚠️ LIVE: cobra dinero real. Asegúrate de que esto es una prueba controlada."
                      : "Test: usa sk_test_*. Sin cargo real (tarjeta 4242 4242 4242 4242)."
                  }
                  error={fieldErrors.paymentMode}
                >
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 rounded-xl border border-brand-100 bg-white px-4 py-3 cursor-pointer hover:border-brand-300 transition-colors">
                      <input
                        type="radio"
                        name="paymentMode"
                        value="test"
                        checked={form.paymentMode === "test"}
                        onChange={() => set("paymentMode", "test")}
                        disabled={saving}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-ink">Test (por defecto)</div>
                        <div className="text-xs text-ink-muted">
                          Stripe en modo prueba. No cobra dinero real. Usa tarjeta
                          4242 4242 4242 4242.
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-brand-100 bg-white px-4 py-3 cursor-pointer hover:border-brand-300 transition-colors">
                      <input
                        type="radio"
                        name="paymentMode"
                        value="live"
                        checked={form.paymentMode === "live"}
                        onChange={() => set("paymentMode", "live")}
                        disabled={saving}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-ink flex items-center gap-2">
                          Live
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Cobra dinero real
                          </span>
                        </div>
                        <div className="text-xs text-ink-muted">
                          Stripe en modo real. El cliente paga con su tarjeta. Solo
                          usar para pruebas controladas (ej. compra de $10 MXN).
                        </div>
                      </div>
                    </label>
                  </div>
                </Field>
              </fieldset>
          )}

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

          {/* ────── Reglas del bot (Fase 7b) — sprint v15: acordeón colapsado ────── */}
          <details className="border-t border-brand-100 pt-4 mt-2 space-y-3">
            <summary className="text-xs font-bold uppercase tracking-wider text-brand-600 px-2 cursor-pointer list-none">
              <LucideIcon icon={Wrench} size="sm" tone="inherit" className="inline mr-1" /> Reglas Locales Específicas de este Evento (Opcional — Complementan
              la Torre de Control y están sujetas a las Reglas de Oro Globales)
            </summary>
            <p className="text-xs text-ink-muted px-1 pt-2">
              Personalidad y reglas que el bot sigue al responder preguntas
              sobre este evento. La <strong>description</strong> de arriba
              ya es el contexto principal; estas reglas locales son un
              <strong>complemento</strong> a las Reglas de Oro Globales que
              administras desde la Torre de Control. Las Reglas de Oro
              Globales prevalecen sobre estas locales si hay contradicción.
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
          </details>
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
                  {cloning ? "Clonando…" : "Clonar evento"}
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
                  <Trash2 className="h-4 w-4 mr-1 inline" /> Eliminar
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
 * - Si está vacío → placeholder "Elige una personalidad para empezar".
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
      hint="Elige una para empezar. Las reglas se pre-llenan con defaults de venta; edítalas abajo."
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
          Elige una personalidad…
        </option>
        {PERSONALITY_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.description}
          </option>
        ))}
        {isCustom && (
          <option value={PERSONALITY_CUSTOM_VALUE} disabled>
            Personalizado (custom) — elige un preset para reemplazar
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
