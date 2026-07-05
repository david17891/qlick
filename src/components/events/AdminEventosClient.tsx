"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Event } from "@/types/events";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { EventDrawer } from "./EventDrawer";
import { ConfirmDeleteEventModal } from "./ConfirmDeleteEventModal";
import type { AdminEventSummary } from "@/lib/events/events-server";
import { updateEventStatus, deleteEvent } from "@/lib/crm/ops-client";

/**
 * Wrapper Client para /admin/eventos.
 *
 * Recibe los summaries (cargados server-side por el page.tsx) y maneja:
 * - Botón "Nuevo evento" que abre el drawer en modo create.
 * - Botones "Editar" / "Ver detalle" / "Clonar" en cada card.
 * - Drawer para editar/crear (con botón Clonar adentro).
 * - Toasts no-bloqueantes:
 *   - "Evento archivado — Deshacer" (5s auto-dismiss)
 *   - "Evento clonado — Abrir" (link al clon, no auto-dismiss)
 *
 * Tras cada save/clone/undo, llama router.refresh() para que el Server
 * Component padre recargue summaries y la UI se mantenga sincronizada con
 * la DB.
 */
export function AdminEventosClient({
  initialSummaries
}: {
  initialSummaries: AdminEventSummary[];
}) {
  const router = useRouter();
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
  const [drawerEvent, setDrawerEvent] = useState<Event | null>(null);
  /**
   * Evento pendiente de confirmación para eliminar (hard delete).
   * `null` = no hay modal abierto. La confirmación de fricción alta vive
   * en `ConfirmDeleteEventModal` (primeras 3 letras del título).
   */
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  /** true mientras el `deleteEvent` está en vuelo (spinner en el modal). */
  const [deleting, setDeleting] = useState(false);

  /** Toast genérico (success / info / undo). null = no toast visible. */
  const [toast, setToast] = useState<ToastState | null>(null);
  /** Ref al timeout del auto-dismiss del toast. */
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openCreate() {
    setDrawerEvent(null);
    setDrawerMode("create");
  }

  function openEdit(e: Event) {
    setDrawerEvent(e);
    setDrawerMode("edit");
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDrawerEvent(null);
  }

  function handleSaved() {
    router.refresh();
  }

  /**
   * Muestra un toast. Si `autoDismissMs` está definido, lo cierra después
   * de ese tiempo. Si el toast es reemplazado, cancela el timer anterior.
   */
  function showToast(t: ToastState) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(t);
    if (t.autoDismissMs) {
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, t.autoDismissMs);
    }
  }

  function dismissToast() {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }

  // Limpia el timer al desmontar el componente (defensa contra memory leak
  // si el admin navega fuera de /admin/eventos con un toast activo).
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  /**
   * Llamado por el drawer cuando un evento pasa a 'archived'.
   * Muestra un toast con botón "Deshacer" que vuelve a 'draft'.
   */
  function handleArchived(event: Event) {
    showToast({
      kind: "undo-archive",
      title: `“${event.title}” archivado`,
      actionLabel: "Deshacer",
      autoDismissMs: 5000,
      onAction: async () => {
        dismissToast();
        try {
          await updateEventStatus(event.id, "draft");
          router.refresh();
        } catch (err) {
          showToast({
            kind: "error",
            title: "No se pudo deshacer el archivado.",
            detail: err instanceof Error ? err.message : undefined,
          });
        }
      },
    });
  }

  /**
   * Llamado por el drawer cuando un evento es clonado OK.
   * Muestra un toast con link al clon (no auto-dismiss — el admin
   * decide cuándo cerrarlo).
   */
  function handleCloned(clone: Event) {
    router.refresh();
    showToast({
      kind: "info",
      title: `“${clone.title}” clonado en borrador.`,
      actionLabel: "Abrir clon",
      actionHref: `/admin/eventos/${clone.id}`,
      onAction: () => dismissToast(),
    });
  }

  /**
   * Hard delete del evento. Llamado desde el modal de confirmación
   * (botón "Sí, eliminar"). Cascade borra confirmaciones, asistentes,
   * encuestas y links asociados (event_delete audit log lo deja
   * trazado). NO reversible — el modal de confirmación ya pidió las
   * primeras 3 letras del título como fricción.
   */
  async function confirmDeleteEvent() {
    if (!eventToDelete) return;
    setDeleting(true);
    const target = eventToDelete;
    try {
      await deleteEvent(target.id);
      setEventToDelete(null);
      router.refresh();
      showToast({
        kind: "info",
        title: `“${target.title}” eliminado.`,
      });
    } catch (err) {
      showToast({
        kind: "error",
        title: "No se pudo eliminar el evento.",
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  if (initialSummaries.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-4">
          <Button onClick={openCreate}>+ Nuevo evento</Button>
        </div>
        <Card className="p-8">
          <EmptyState
            title="Aún no hay eventos"
            description="Crea el primer evento con el botón de arriba."
          />
        </Card>
        {drawerMode && (
          <EventDrawer
            mode={drawerMode}
            event={drawerEvent}
            onClose={closeDrawer}
            onSaved={handleSaved}
            onCloned={handleCloned}
            onArchived={handleArchived}
          />
        )}
        {eventToDelete && (
          <ConfirmDeleteEventModal
            eventTitle={eventToDelete.title}
            onCancel={() => setEventToDelete(null)}
            onConfirm={confirmDeleteEvent}
            pending={deleting}
          />
        )}
        {toast && <ToastView toast={toast} onDismiss={dismissToast} />}
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>+ Nuevo evento</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {initialSummaries.map((s) => (
          <Card key={s.event.id} className="!p-0 !overflow-hidden flex flex-col">
            {/*
              B-5 v2 (cierre en admin): cover visual siempre con gradiente
              de marca + título del evento, idéntico al patrón del catálogo
              público (`/eventos`). Consistente, no depende de assets
              externos. El campo `cover_image_url` en DB se conserva por
              compat. Ver `docs/OPEN_ITEMS.md` → B-5.
            */}
            <div className="relative w-full h-32 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-500 to-brand-400">
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 80%, white 0%, transparent 40%), radial-gradient(circle at 80% 20%, white 0%, transparent 35%)",
                }}
              />
              <div className="relative h-full flex items-end p-3">
                <h3 className="text-white font-bold text-sm leading-tight drop-shadow-md line-clamp-2">
                  {s.event.title}
                </h3>
              </div>
            </div>
            <div className="p-5 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-2">
                <Badge
                  tone={
                    s.event.status === "published"
                      ? "success"
                      : s.event.status === "draft"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {s.event.status === "published"
                    ? "Publicado"
                    : s.event.status === "draft"
                      ? "Borrador"
                      : "Archivado"}
                </Badge>
                <span className="text-xs text-ink-muted">/{s.event.slug}</span>
              </div>
              {/* El título ya está en el cover del card (gradient + h3).
                  No lo duplicamos acá. */}
              {s.event.description && (
                <p className="text-sm text-ink-soft line-clamp-2 mb-3">
                  {s.event.description}
                </p>
              )}
            <ul className="text-xs text-ink-muted space-y-0.5 mb-4">
              <li>
                📅 {formatDate(s.event.startsAt)}
                {s.event.endsAt && (
                  <span className="text-ink-muted">
                    {" "}— {formatDate(s.event.endsAt)}
                  </span>
                )}
              </li>
              {s.event.location && <li>📍 {s.event.location}</li>}
            </ul>
            <div className="grid grid-cols-2 gap-2 mt-auto">
              <div className="rounded-lg bg-brand-50/60 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Confirmados</p>
                <p className="text-lg font-bold text-ink">
                  {s.confirmationCount}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Asistentes</p>
                <p className="text-lg font-bold text-emerald-700">
                  {s.attendeeCount}
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Encuestas</p>
                <p className="text-lg font-bold text-amber-700">
                  {s.surveyCount}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 px-2 py-2 text-center">
                <p className="text-xs text-ink-muted">Leads nuevos</p>
                <p className="text-lg font-bold text-blue-700">
                  {s.leadsPromoted}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(s.event)}
              >
                Editar
              </Button>
              <Link href={`/admin/eventos/${s.event.id}`} className="contents">
                <Button variant="primary" size="sm">
                  Ver detalle
                </Button>
              </Link>
            </div>
            {/* Fila de acción destructiva: separada del grid primario para no
                competir visualmente con Editar/Ver detalle. Discovery ↑ vs
                dejarlo enterrado en el drawer. */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setEventToDelete(s.event)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 transition"
                title="Eliminar este evento (hard delete, no reversible)"
                aria-label={`Eliminar evento ${s.event.title}`}
              >
                🗑 Eliminar
              </button>
            </div>
            </div>
          </Card>
        ))}
      </div>
      {drawerMode && (
        <EventDrawer
          mode={drawerMode}
          event={drawerEvent}
          onClose={closeDrawer}
          onSaved={handleSaved}
          onCloned={handleCloned}
          onArchived={handleArchived}
        />
      )}
      {eventToDelete && (
        <ConfirmDeleteEventModal
          eventTitle={eventToDelete.title}
          onCancel={() => setEventToDelete(null)}
          onConfirm={confirmDeleteEvent}
          pending={deleting}
        />
      )}
      {toast && <ToastView toast={toast} onDismiss={dismissToast} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Toast (Fase 5 Paquete D)
// ─────────────────────────────────────────────────────────────

/**
 * Estado del toast no-bloqueante (Fase 5 Paquete D).
 *
 * Modelado como shape única con campos opcionales en vez de discriminated
 * union para que `showToast({...})` acepte tanto un undo-archive (con
 * autoDismissMs + onAction) como un error (sin acción). Cada variante
 * tiene su set de campos.
 *
 * - `undo-archive`: variante con botón "Deshacer" y auto-dismiss.
 *   actionLabel + onAction obligatorios.
 * - `info`: variante con link (ej: "Abrir clon"). actionHref + onAction.
 * - `error`: sin acción, solo el título + detail opcional.
 */
interface ToastState {
  kind: "undo-archive" | "info" | "error";
  title: string;
  /** Detalle secundario, solo usado en errores. */
  detail?: string;
  /** Label del botón de acción (undo-archive / info). */
  actionLabel?: string;
  /** Href del link (solo info). */
  actionHref?: string;
  /** Handler del botón/link (solo undo-archive / info). */
  onAction?: () => void;
  /** Si está definido, el toast se cierra solo después de N ms. */
  autoDismissMs?: number;
}

/**
 * Toast fijo bottom-right (no-bloqueante).
 * - undo-archive: variante con botón "Deshacer" y auto-dismiss en 5s.
 *   El usuario puede hacer click antes del auto-dismiss para volver a draft.
 * - info: variante con link externo (ej: "Abrir clon"). No auto-dismiss.
 * - error: variante sin acción, solo botón cerrar. No auto-dismiss.
 *
 * Accesibilidad: `role="status"` (live region polite) para undo/info,
 * `role="alert"` para error. `aria-live` correspondiente.
 */
function ToastView({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  // Para undo-archive mostramos una mini-barra de progreso del countdown
  // (decorativa — la lógica real está en el timer del padre).
  const isUndo = toast.kind === "undo-archive";
  const isError = toast.kind === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className="fixed bottom-6 right-6 z-[80] max-w-sm w-[calc(100vw-3rem)]"
    >
      <div
        className={
          "rounded-2xl shadow-2xl border p-4 pr-10 relative backdrop-blur " +
          (isError
            ? "bg-red-50/95 border-red-200 text-red-800"
            : "bg-white/95 border-brand-200 text-ink")
        }
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar notificación"
          className="absolute top-2 right-2 rounded-full w-7 h-7 flex items-center justify-center text-ink-muted hover:bg-brand-100"
        >
          ✕
        </button>

        <p className="text-sm font-semibold leading-snug pr-2">
          {toast.title}
        </p>

        {isError && toast.detail && (
          <p className="text-xs mt-1 opacity-80">{toast.detail}</p>
        )}

        {!isError && (
          <div className="mt-2 flex items-center gap-2">
            {toast.kind === "info" && toast.actionHref ? (
              <Link
                href={toast.actionHref}
                onClick={toast.onAction}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition"
              >
                {toast.actionLabel} →
              </Link>
            ) : (
              <button
                type="button"
                onClick={toast.onAction}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition"
              >
                ↶ {toast.actionLabel}
              </button>
            )}
            {isUndo && (
              <span className="text-[10px] text-ink-muted">
                Se cierra en 5s
              </span>
            )}
          </div>
        )}

        {isUndo && (
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 h-1 bg-brand-500 rounded-b-2xl toast-progress"
          />
        )}
      </div>
    </div>
  );
}