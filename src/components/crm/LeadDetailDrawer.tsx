"use client";

import { useEffect, useState } from "react";
import type { Lead, LeadStatus, SalesOwner, Conversation, ConversationMessage } from "@/types";
import { Card, Badge, Button, Input, Textarea, Field, Spinner } from "@/components/ui";
import {
  leadStatusLabel,
  statusTone,
  leadSourceLabel,
  leadIntentLabel,
  intentTone,
  calculateLeadResponseRisk,
  riskTone,
  riskLabel
} from "@/lib/crm/lead-utils";
import { getLeadInteractions, getLeadNotes } from "@/lib/crm/crm-service";
import {
  getLeadConversation,
  changeLeadStatus
} from "@/lib/crm/crm-service";
import { getAppointmentsForLead } from "@/lib/crm/appointments";
import { getAISuggestionsForLead, getAgentReplyTemplate } from "@/lib/crm/agent-utils";
import { getWhatsAppConfigStatus } from "@/lib/contact/whatsapp";
import {
  patchLeadStatus,
  archiveLeadClient,
  fetchLeadNotes,
  createLeadNote,
  fetchLeadTasks,
  createLeadTask,
  fetchEventContext,
  fetchLeadInteractions,
  createLeadInteraction,
  type OpStatus
} from "@/lib/crm/ops-client";
import {
  mapNoteRow,
  mapTaskRow,
  mapInteractionRow,
  type NoteView,
  type TaskView,
  type InteractionView
} from "@/lib/crm/rows-mapper";
import type { LeadEventContext } from "@/lib/crm";
import { formatDate, formatMXN } from "@/lib/utils";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";

/**
 * Drawer (panel lateral) con el detalle completo de un lead.
 *
 * Muestra datos, historial, conversación, sugerencias IA y citas.
 *
 * Modos (v0.5.0):
 * - `realMode`: las operaciones (cambiar etapa, crear nota, crear tarea) llaman
 *   a las APIs reales `/api/admin/leads/[id]/*` y las notas/tareas se leen de la
 *   BD. Cada acción tiene estados loading/success/error.
 * - Demo (default): conserva el comportamiento mock original (acciones que no
 *   persisten + datos ficticios). Las secciones puramente demo (conversación IA,
 *   sugerencias, citas) se mantienen en ambos modos.
 *
 * `onLeadChanged` notifica al padre (CRMView) cuando un PATCH actualiza el lead,
 * para refrescar la fila en la tabla/pipeline sin refetch completo.
 *
 * Los botones de WhatsApp usan WhatsAppButton (wa.me si hay número configurado,
 * "próximamente" si no).
 */
export function LeadDetailDrawer({
  lead,
  owners,
  onClose,
  realMode = false,
  onLeadChanged,
  eventContext = null,
}: {
  lead: Lead;
  owners: SalesOwner[];
  onClose: () => void;
  /** true para activar operaciones reales contra la API (modo real). */
  realMode?: boolean;
  /** Callback cuando un PATCH actualiza el lead (p. ej. status). */
  onLeadChanged?: (lead: Lead) => void;
  /** Si el lead viene de un evento, contexto del mismo (evento + survey).
   *  `null` o `undefined` si el lead no tiene origen de evento. */
  eventContext?: LeadEventContext | null;
}) {
  // Estado local del lead: en modo real puede cambiar al hacer PATCH.
  const [currentLead, setCurrentLead] = useState<Lead>(lead);
  useEffect(() => setCurrentLead(lead), [lead]);

  // --- Estado de operaciones (máquina idle/loading/success/error) ---
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [statusState, setStatusState] = useState<OpStatus>("idle");
  const [archiveState, setArchiveState] = useState<OpStatus>("idle");
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteState, setNoteState] = useState<OpStatus>("idle");
  const [noteMsg, setNoteMsg] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueAt: "" });
  const [taskState, setTaskState] = useState<OpStatus>("idle");
  const [taskMsg, setTaskMsg] = useState<string | null>(null);
  const [interactionForm, setInteractionForm] = useState<{
    summary: string;
    channel: "whatsapp" | "email" | "phone" | "form" | "system";
    direction: "inbound" | "outbound" | "system";
  }>({ summary: "", channel: "whatsapp", direction: "outbound" });
  const [interactionState, setInteractionState] = useState<OpStatus>("idle");
  const [interactionMsg, setInteractionMsg] = useState<string | null>(null);

  // --- Datos reales (solo se cargan en modo real) ---
  const [realNotes, setRealNotes] = useState<NoteView[] | null>(null);
  const [realTasks, setRealTasks] = useState<TaskView[] | null>(null);
  const [realInteractions, setRealInteractions] = useState<InteractionView[] | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  /** Contexto del evento del que provino el lead (badge en el header).
   *  Cargado solo en modo real; null si el lead no tiene origen de evento. */
  const [fetchedEventContext, setFetchedEventContext] =
    useState<LeadEventContext | null>(null);

  // FIX 2026-07-06 (conversaciones v2) — datos reales del chat en el
  // panel admin. Antes era MOCK (`getLeadConversation`).
  // `realConversation` viene de `lead_whatsapp_conversations` +
  // `lead_interactions` (ver `conversations-server.ts`). Soft-deleted
  // excluidos automáticamente desde la query.
  const [realConversation, setRealConversation] = useState<Conversation | null>(null);
  const [conversationState, setConversationState] = useState<OpStatus>("idle");
  const [conversationMsg, setConversationMsg] = useState<string | null>(null);
  const [newMessageBody, setNewMessageBody] = useState("");
  const [newMessageDirection, setNewMessageDirection] = useState<"inbound" | "outbound">("outbound");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteState, setDeleteState] = useState<OpStatus>("idle");

  // Cerrar con tecla Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cargar notas y tareas reales al abrir el drawer (modo real).
  useEffect(() => {
    if (!realMode) return;
    let cancelled = false;
    setDataError(null);
    setRealNotes(null);
    setRealTasks(null);
    setRealInteractions(null);
    setFetchedEventContext(null);
    setRealConversation(null);
    Promise.all([
      fetchLeadNotes(currentLead.id),
      fetchLeadTasks(currentLead.id),
      fetchLeadInteractions(currentLead.id),
      fetchEventContext(currentLead.id),
      fetch(`/api/admin/crm/conversations?leadId=${encodeURIComponent(currentLead.id)}`, {
        cache: "no-store",
      })
        .then(async (r) => {
          if (!r.ok) return null;
          return ((await r.json()) as { conversation: Conversation | null }).conversation;
        })
        .catch(() => null),
    ])
      .then(([n, t, ints, ec, conv]) => {
        if (cancelled) return;
        setRealNotes(n.map(mapNoteRow));
        setRealTasks(t.map(mapTaskRow));
        setRealInteractions(ints.map(mapInteractionRow));
        setFetchedEventContext(ec);
        setRealConversation(conv);
      })
      .catch((err) => {
        if (!cancelled) setDataError(err instanceof Error ? err.message : "Error cargando datos.");
      });
    return () => {
      cancelled = true;
    };
  }, [realMode, currentLead.id]);

  const risk = calculateLeadResponseRisk(currentLead);
  const interactions = getLeadInteractions(currentLead.id);
  // FIX 2026-07-06 (conversaciones v2) — en modo real, usar
  // `realConversation` (cargado vía fetch a
  // `/api/admin/crm/conversations?leadId=X`). En demo mode, fallback
  // al mock local para no romper el modo demo.
  const conversation = realMode ? realConversation : getLeadConversation(currentLead.id);
  const suggestions = getAISuggestionsForLead(currentLead.id);
  const appts = getAppointmentsForLead(currentLead.id);
  const owner = owners.find((o) => o.id === currentLead.ownerId);
  const waConfigured = getWhatsAppConfigStatus().anyConfigured;

  // Notas efectivas: reales (modo real) o mock (demo).
  const notes = realMode
    ? (realNotes ?? []).map((n) => ({ id: n.id, body: n.body, author: n.authorEmail, createdAt: n.createdAt }))
    : getLeadNotes(currentLead.id);

  function handleStatusChange(next: LeadStatus, label: string) {
    // Demo: mock sin persistencia.
    const res = changeLeadStatus(currentLead.id, next);
    setStatusNote(`${label}: ${res.note}`);
  }

  // Real: PATCH contra la API.
  async function handleRealStatusChange(next: LeadStatus) {
    if (statusState === "loading") return;
    const prevStatus = currentLead.status;
    // Optimistic: actualiza el lead local al instante.
    const optimistic = { ...currentLead, status: next };
    setCurrentLead(optimistic);
    setStatusState("loading");
    setStatusMsg(null);
    try {
      const updated = await patchLeadStatus(currentLead.id, next);
      setCurrentLead(updated);
      onLeadChanged?.(updated);
      setStatusState("success");
      setStatusMsg(`Etapa actualizada a "${leadStatusLabel[updated.status]}".`);
      setTimeout(() => setStatusState("idle"), 2500);
    } catch (err) {
      // Revierte al status previo.
      setCurrentLead((c) => ({ ...c, status: prevStatus }));
      setStatusState("error");
      setStatusMsg(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  /**
   * Archiva el lead actual (soft delete). Confirmación nativa vía
   * window.confirm. Llama a `archiveLeadClient` que pega contra
   * `DELETE /api/admin/leads/[id]`. El endpoint hace optimistic lock.
   */
  async function handleArchive() {
    if (archiveState === "loading") return;
    if (currentLead.status === "archived") {
      setArchiveState("error");
      setArchiveMsg("Este lead ya está archivado.");
      return;
    }
    const ok = window.confirm(
      `¿Archivar a ${currentLead.name}? El lead NO se borra, solo cambia su status a "archived". El consentimiento (LGPD) se preserva.`,
    );
    if (!ok) return;
    const prevStatus = currentLead.status;
    const optimistic = { ...currentLead, status: "archived" as LeadStatus };
    setCurrentLead(optimistic);
    setArchiveState("loading");
    setArchiveMsg(null);
    try {
      const updated = await archiveLeadClient(currentLead.id);
      setCurrentLead(updated);
      onLeadChanged?.(updated);
      setArchiveState("success");
      setArchiveMsg("Lead archivado.");
      setTimeout(() => setArchiveState("idle"), 2500);
    } catch (err) {
      setCurrentLead((c) => ({ ...c, status: prevStatus }));
      setArchiveState("error");
      setArchiveMsg(err instanceof Error ? err.message : "No se pudo archivar.");
    }
  }

  // FIX 2026-07-06 (conversaciones v2) — registra un mensaje de texto
  // manual en la conversación del lead. FIX 2026-07-06 — el admin
  // tipea el body, elige dirección (inbound = el lead habló;
  // outbound = admin respondió), submit → POST al endpoint. El
  // server inserta en `lead_whatsapp_conversations` y devuelve el id.
  async function handleAppendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (conversationState === "loading") return;
    const text = newMessageBody.trim();
    if (!text) {
      setConversationState("error");
      setConversationMsg("El mensaje no puede estar vacío.");
      return;
    }
    if (text.length > 4000) {
      setConversationState("error");
      setConversationMsg("Máximo 4000 caracteres.");
      return;
    }
    setConversationState("loading");
    setConversationMsg(null);
    try {
      const res = await fetch("/api/admin/crm/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: currentLead.id,
          body: text,
          direction: newMessageDirection,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        note?: string;
        messageId?: string;
      };
      if (!res.ok || !data.ok) {
        setConversationState("error");
        setConversationMsg(data.note ?? `Error ${res.status}`);
        return;
      }
      // Refetch la conversación entera para mostrar el nuevo mensaje
      // (mantenemos server-side como source of truth).
      const refetch = await fetch(
        `/api/admin/crm/conversations?leadId=${encodeURIComponent(currentLead.id)}`,
        { cache: "no-store" },
      );
      const refetched = refetch.ok
        ? ((await refetch.json()) as { conversation: Conversation | null }).conversation
        : null;
      setRealConversation(refetched);
      setNewMessageBody("");
      setConversationState("success");
      setConversationMsg("Mensaje registrado.");
      setTimeout(() => setConversationState("idle"), 2500);
    } catch (err) {
      setConversationState("error");
      setConversationMsg(
        err instanceof Error ? err.message : "No se pudo registrar el mensaje.",
      );
    }
  }

  // FIX 2026-07-06 (conversaciones v2) — soft-delete de toda la
  // conversación. Confirmación textual "ARCHIVAR" (mismo patrón que
  // el resto del proyecto para bulk delete).
  async function handleDeleteConversation() {
    if (deleteState === "loading") return;
    const expected = "ARCHIVAR";
    if (deleteConfirmText.trim().toUpperCase() !== expected) {
      setConversationState("error");
      setConversationMsg(`Escribí ${expected} para confirmar.`);
      return;
    }
    setDeleteState("loading");
    setConversationMsg(null);
    try {
      const res = await fetch(
        `/api/admin/crm/conversations?leadId=${encodeURIComponent(currentLead.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "admin_delete_from_drawer" }),
        },
      );
      const data = (await res.json()) as {
        ok: boolean;
        deletedCount?: number;
        note?: string;
      };
      if (!res.ok || !data.ok) {
        setDeleteState("error");
        setConversationMsg(data.note ?? `Error ${res.status}`);
        return;
      }
      // Limpiar vista local.
      setRealConversation(null);
      setDeleteState("success");
      setConversationMsg(
        `Conversación archivada (${data.deletedCount ?? 0} mensaje${data.deletedCount === 1 ? "" : "s"}).`,
      );
      setDeleteConfirmText("");
      setTimeout(() => setDeleteState("idle"), 3000);
    } catch (err) {
      setDeleteState("error");
      setConversationMsg(
        err instanceof Error ? err.message : "No se pudo archivar la conversación.",
      );
    }
  }

  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    if (noteState === "loading") return;
    const text = noteText.trim();
    if (!text) {
      setNoteState("error");
      setNoteMsg("La nota no puede estar vacía.");
      return;
    }
    setNoteState("loading");
    setNoteMsg(null);
    try {
      const row = await createLeadNote(currentLead.id, text);
      setRealNotes((prev) => [mapNoteRow(row), ...(prev ?? [])]);
      setNoteText("");
      setNoteState("idle");
    } catch (err) {
      setNoteState("error");
      setNoteMsg(err instanceof Error ? err.message : "No se pudo guardar la nota.");
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (taskState === "loading") return;
    const title = taskForm.title.trim();
    if (!title) {
      setTaskState("error");
      setTaskMsg("El título es obligatorio.");
      return;
    }
    setTaskState("loading");
    setTaskMsg(null);
    try {
      const row = await createLeadTask(currentLead.id, {
        title,
        description: taskForm.description.trim() || undefined,
        dueAt: taskForm.dueAt || undefined,
      });
      setRealTasks((prev) => [mapTaskRow(row), ...(prev ?? [])]);
      setTaskForm({ title: "", description: "", dueAt: "" });
      setTaskState("idle");
    } catch (err) {
      setTaskState("error");
      setTaskMsg(err instanceof Error ? err.message : "No se pudo crear la tarea.");
    }
  }

  async function handleCreateInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (interactionState === "loading") return;
    const summary = interactionForm.summary.trim();
    if (!summary) {
      setInteractionState("error");
      setInteractionMsg("El resumen es obligatorio.");
      return;
    }
    setInteractionState("loading");
    setInteractionMsg(null);
    try {
      // El server devuelve la lista actualizada; evitamos un fetch extra.
      const updated = await createLeadInteraction(currentLead.id, {
        summary,
        channel: interactionForm.channel,
        direction: interactionForm.direction,
      });
      setRealInteractions(updated.map(mapInteractionRow));
      setInteractionForm({ summary: "", channel: "whatsapp", direction: "outbound" });
      setInteractionState("success");
      setInteractionMsg("Contacto registrado.");
      setTimeout(() => setInteractionState("idle"), 2000);
    } catch (err) {
      setInteractionState("error");
      setInteractionMsg(err instanceof Error ? err.message : "No se pudo registrar el contacto.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        className="relative h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
        role="dialog"
        aria-label={`Detalle de ${currentLead.name}`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-brand-100 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge tone={statusTone[currentLead.status]}>{leadStatusLabel[currentLead.status]}</Badge>
              <Badge tone={riskTone[risk.level]} title={risk.reasons.join(", ")}>
                Riesgo {riskLabel[risk.level].toLowerCase()}
              </Badge>
              {realMode ? (
                <Badge tone="success">en vivo</Badge>
              ) : (
                <Badge tone="warning">demo</Badge>
              )}
            </div>
            <h2 className="text-xl font-bold text-ink truncate">{currentLead.name}</h2>
            <p className="text-sm text-ink-muted truncate">
              {currentLead.courseOfInterest ?? "Sin curso de interés"}
            </p>
            {/*
              Badge de origen del evento (Sub-bloque B de Fase 4). Solo se
              muestra si el lead tiene un link a un evento en
              lead_event_links. Da contexto inmediato: "este lead viene del
              evento X, su interés comercial era Y". El admin no tiene
              que abrir otra pestaña para saberlo.
            */}
            {/*
              Badge de origen del evento (Sub-bloque B de Fase 4). Solo se
              muestra si el lead tiene un link a un evento en
              lead_event_links. Da contexto inmediato: "este lead viene del
              evento X, su interés comercial era Y". El admin no tiene
              que abrir otra pestaña para saberlo.

              Precedence: la prop `eventContext` (que el padre, CRMView,
              puede pre-cargar) gana sobre el fetch interno en realMode.
              Si la prop es `null` y el padre no la proveyó, usamos el
              resultado del fetch interno (realMode) o nada (demo).
            */}
            {(eventContext ?? fetchedEventContext) && (
              <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs bg-brand-50 border border-brand-200 rounded-full pl-1.5 pr-3 py-1 max-w-full">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-brand-500 text-white text-[10px]">
                  📅
                </span>
                <span className="font-semibold text-brand-800 truncate">
                  De: {(eventContext ?? fetchedEventContext)!.eventTitle}
                </span>
                {(eventContext ?? fetchedEventContext)!.linkType === "survey" &&
                  (eventContext ?? fetchedEventContext)!.commercialInterest && (
                    <span className="text-ink-muted truncate">
                      · Interés:{" "}
                      {(eventContext ?? fetchedEventContext)!.commercialInterest}
                    </span>
                  )}
                {(eventContext ?? fetchedEventContext)!.linkType !== "survey" && (
                  <span className="text-ink-muted">
                    ·{" "}
                    {(eventContext ?? fetchedEventContext)!.linkType === "confirmation"
                      ? "confirmó"
                      : "asistió"}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 h-9 w-9 rounded-full hover:bg-brand-50 text-ink-muted text-xl flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Datos */}
          <section className="grid sm:grid-cols-2 gap-3 text-sm">
            <Info label="Email" value={currentLead.email} />
            <Info label="Teléfono" value={currentLead.phone ?? "—"} />
            <Info label="Fuente" value={leadSourceLabel[currentLead.source]} />
            <Info label="Intención" value={leadIntentLabel[currentLead.intent]} />
            <Info
              label="Responsable"
              value={owner ? `${owner.name}` : "Sin asignar"}
            />
            <Info
              label="Próximo seguimiento"
              value={currentLead.nextFollowUpAt ? formatDate(currentLead.nextFollowUpAt) : "—"}
            />
            {currentLead.estimatedValueMXN !== undefined && currentLead.estimatedValueMXN > 0 && (
              <Info label="Valor estimado" value={formatMXN(currentLead.estimatedValueMXN)} />
            )}
            <Info
              label="Consentimiento"
              value={currentLead.consentToContact ? "Sí" : "No"}
            />
          </section>

          {currentLead.summary && (
            <p className="text-sm text-ink-soft bg-brand-50/50 rounded-xl p-3">
              {currentLead.summary}
            </p>
          )}

          {/* Riesgo detallado */}
          <Card className="p-4">
            <h3 className="text-sm font-bold text-ink mb-2">Riesgo de respuesta</h3>
            <ul className="space-y-1 text-xs text-ink-muted">
              {risk.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </Card>

          {/* Acciones WhatsApp */}
          <section>
            <h3 className="text-sm font-bold uppercase text-brand-600 mb-2">
              Acciones de WhatsApp
            </h3>
            <div className="flex flex-wrap gap-2">
              <WhatsAppButton intent="course_interest" name={currentLead.name} courseTitle={currentLead.courseOfInterest} customMessage={getAgentReplyTemplate(currentLead.intent, currentLead)} size="sm" variant="accent" label="Información" />
              <WhatsAppButton intent="enroll" name={currentLead.name} courseTitle={currentLead.courseOfInterest} size="sm" variant="accent" label="Inscripción" />
              <WhatsAppButton intent="payment_reminder" name={currentLead.name} courseTitle={currentLead.courseOfInterest} size="sm" variant="accent" label="Pago pendiente" />
              <WhatsAppButton intent="follow_up" name={currentLead.name} courseTitle={currentLead.courseOfInterest} size="sm" variant="accent" label="Seguimiento" />
              <WhatsAppButton intent="group" size="sm" variant="accent" label="Grupo" />
              <WhatsAppButton intent="support" size="sm" variant="accent" label="Soporte" />
            </div>
            {!waConfigured && (
              <p className="mt-2 text-xs text-ink-muted">
                Configura NEXT_PUBLIC_WHATSAPP_SALES_NUMBER para habilitar los botones.
              </p>
            )}
          </section>

          {/* Cambiar etapa */}
          {realMode ? (
            <section>
              <h3 className="text-sm font-bold uppercase text-brand-600 mb-2">
                Cambiar etapa
              </h3>
              {dataError && (
                <p className="mb-2 text-xs text-red-700 bg-red-50 rounded-lg p-2">
                  {dataError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={currentLead.status}
                  onChange={(e) => handleRealStatusChange(e.target.value as LeadStatus)}
                  disabled={statusState === "loading"}
                  className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-50"
                >
                  {Object.entries(leadStatusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {statusState === "loading" && <Spinner className="h-4 w-4" />}
                {statusState === "success" && <Badge tone="success">guardado</Badge>}
                <Button
                  size="sm"
                  variant={currentLead.status === "archived" ? "outline" : "danger"}
                  onClick={handleArchive}
                  disabled={archiveState === "loading" || currentLead.status === "archived"}
                  title="Archivar este lead (soft delete)"
                >
                  {archiveState === "loading"
                    ? "Archivando..."
                    : currentLead.status === "archived"
                    ? "Archivado"
                    : "🗄️ Archivar"}
                </Button>
              </div>
              {archiveState === "error" && archiveMsg && (
                <p className="mt-2 text-xs text-red-700 bg-red-50 rounded-lg p-2">
                  {archiveMsg}
                </p>
              )}
              {archiveState === "success" && archiveMsg && (
                <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
                  {archiveMsg}
                </p>
              )}
              {statusState === "error" && statusMsg && (
                <p className="mt-2 text-xs text-red-700 bg-red-50 rounded-lg p-2">
                  {statusMsg}
                </p>
              )}
              {statusState === "success" && statusMsg && (
                <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
                  {statusMsg}
                </p>
              )}
            </section>
          ) : (
            <section>
              <h3 className="text-sm font-bold uppercase text-brand-600 mb-2">
                Cambiar etapa (demo)
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleStatusChange("contacted", "Marcar contactado")}>
                  Contactado
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange("payment_pending", "Pago pendiente")}>
                  Pago pendiente
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange("enrolled", "Inscrito")}>
                  Inscrito
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleStatusChange("lost", "Perdido")}>
                  Perdido
                </Button>
              </div>
              {statusNote && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                  {statusNote}
                </p>
              )}
              <p className="mt-2 text-xs text-ink-muted">
                Acción demo: el cambio no se persiste. En producción se guarda y dispara notificaciones.
              </p>
            </section>
          )}

          {/* Historial de interacciones (modo real: persistido; demo: mock). */}
          {realMode ? (
            <Section title="Historial de contactos">
              {realInteractions === null ? (
                <Spinner className="h-4 w-4" />
              ) : realInteractions.length === 0 ? (
                <Empty text="Sin contactos registrados." />
              ) : (
                <ul className="space-y-3">
                  {realInteractions.map((it) => (
                    <li key={it.id} className="text-sm border border-brand-100 rounded-lg p-3 bg-white">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone={interactionTone(it.direction)}>
                          {interactionDirectionLabel(it.direction)}
                        </Badge>
                        <Badge tone="neutral">{interactionChannelLabel(it.channel)}</Badge>
                        <span className="text-xs text-ink-muted">
                          {formatDate(it.createdAt)}
                        </span>
                      </div>
                      <p className="text-ink-soft">{it.summary}</p>
                      <p className="text-xs text-ink-muted mt-1">— {it.authorEmail}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={handleCreateInteraction} noValidate className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-muted flex items-center gap-1">
                    Canal
                    <select
                      value={interactionForm.channel}
                      onChange={(e) =>
                        setInteractionForm((f) => ({
                          ...f,
                          channel: e.target.value as typeof f.channel,
                        }))
                      }
                      className="rounded-lg border border-brand-100 bg-white px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand-400"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="phone">Llamada</option>
                      <option value="form">Formulario</option>
                      <option value="system">Sistema</option>
                    </select>
                  </label>
                  <label className="text-xs text-ink-muted flex items-center gap-1">
                    Dirección
                    <select
                      value={interactionForm.direction}
                      onChange={(e) =>
                        setInteractionForm((f) => ({
                          ...f,
                          direction: e.target.value as typeof f.direction,
                        }))
                      }
                      className="rounded-lg border border-brand-100 bg-white px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand-400"
                    >
                      <option value="outbound">Saliente (yo lo contacté)</option>
                      <option value="inbound">Entrante (me contactó)</option>
                      <option value="system">Sistema</option>
                    </select>
                  </label>
                </div>
                <Field
                  label="Resumen del contacto"
                  error={interactionState === "error" ? interactionMsg : null}
                  required
                >
                  <Textarea
                    value={interactionForm.summary}
                    onChange={(e) => {
                      setInteractionForm((f) => ({ ...f, summary: e.target.value }));
                      if (interactionState === "error") {
                        setInteractionState("idle");
                        setInteractionMsg(null);
                      }
                    }}
                    placeholder="Resumen del contacto (ej. 'Confirmó inscripción, manda liga de pago')…"
                    rows={2}
                    className="w-full"
                  />
                </Field>
                {interactionState === "success" && interactionMsg && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
                    {interactionMsg}
                  </p>
                )}
                <Button type="submit" size="sm" disabled={interactionState === "loading"}>
                  {interactionState === "loading" ? "Registrando…" : "Registrar contacto"}
                </Button>
              </form>
            </Section>
          ) : (
            <Section title="Historial de interacciones (demo)">
              {interactions.length === 0 ? (
                <Empty text="Sin interacciones registradas." />
              ) : (
                <ul className="space-y-3">
                  {interactions.map((it) => (
                    <li key={it.id} className="text-sm">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge tone={it.direction === "inbound" ? "info" : "brand"}>
                          {it.direction === "inbound" ? "Entrante" : "Saliente"}
                        </Badge>
                        <span className="text-xs text-ink-muted">
                          {channelLabel(it.channel)} · {formatDate(it.at)}
                        </span>
                      </div>
                      <p className="text-ink-soft">{it.content}</p>
                      {it.author && (
                        <p className="text-xs text-ink-muted">— {it.author}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* Notas */}
          {realMode ? (
            <Section title="Notas internas">
              {realNotes === null ? (
                <Spinner className="h-4 w-4" />
              ) : realNotes.length === 0 ? (
                <Empty text="Sin notas." />
              ) : (
                <ul className="space-y-2">
                  {realNotes.map((n) => (
                    <li key={n.id} className="text-sm bg-brand-50/40 rounded-lg p-3">
                      <p className="text-ink-soft">{n.body}</p>
                      <p className="text-xs text-ink-muted mt-1">
                        {n.authorEmail} · {formatDate(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={handleCreateNote} noValidate className="mt-3 space-y-2">
                <Field
                  label="Nota interna"
                  error={noteState === "error" ? noteMsg : null}
                  required
                >
                  <Textarea
                    value={noteText}
                    onChange={(e) => {
                      setNoteText(e.target.value);
                      if (noteState === "error") {
                        setNoteState("idle");
                        setNoteMsg(null);
                      }
                    }}
                    placeholder="Escribe una nota interna…"
                    rows={2}
                    className="w-full"
                  />
                </Field>
                <Button type="submit" size="sm" disabled={noteState === "loading"}>
                  {noteState === "loading" ? "Guardando…" : "Agregar nota"}
                </Button>
              </form>
            </Section>
          ) : (
            <Section title="Notas internas (demo)">
              {notes.length === 0 ? (
                <Empty text="Sin notas." />
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="text-sm bg-brand-50/40 rounded-lg p-3">
                      <p className="text-ink-soft">{n.body}</p>
                      <p className="text-xs text-ink-muted mt-1">
                        {n.author} · {formatDate(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* Tareas (solo modo real) */}
          {realMode && (
            <Section title="Tareas de seguimiento">
              {realTasks === null ? (
                <Spinner className="h-4 w-4" />
              ) : realTasks.length === 0 ? (
                <Empty text="Sin tareas." />
              ) : (
                <ul className="space-y-2">
                  {realTasks.map((t) => (
                    <li key={t.id} className="text-sm border border-brand-100 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge tone={t.status === "completed" ? "success" : t.status === "cancelled" ? "neutral" : "warning"}>
                          {t.status === "completed" ? "completada" : t.status === "cancelled" ? "cancelada" : "pendiente"}
                        </Badge>
                        {t.dueAt && (
                          <span className="text-xs text-ink-muted">vence {formatDate(t.dueAt)}</span>
                        )}
                      </div>
                      <p className="text-ink-soft font-medium">{t.title}</p>
                      {t.description && <p className="text-xs text-ink-muted mt-0.5">{t.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={handleCreateTask} noValidate className="mt-3 space-y-2">
                <Field
                  label="Título"
                  error={taskState === "error" ? taskMsg : null}
                  required
                >
                  <Input
                    value={taskForm.title}
                    onChange={(e) => {
                      setTaskForm((f) => ({ ...f, title: e.target.value }));
                      if (taskState === "error") {
                        setTaskState("idle");
                        setTaskMsg(null);
                      }
                    }}
                    placeholder="Título de la tarea"
                    className="w-full"
                  />
                </Field>
                <Field label="Descripción (opcional)">
                  <Textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Detalles de la tarea…"
                    rows={2}
                    className="w-full"
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-muted flex items-center gap-1">
                    Vence
                    <input
                      type="date"
                      value={taskForm.dueAt}
                      onChange={(e) => setTaskForm((f) => ({ ...f, dueAt: e.target.value }))}
                      className="rounded-lg border border-brand-100 bg-white px-2 py-1 text-sm text-ink focus:outline-none focus:border-brand-400"
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={taskState === "loading"}>
                    {taskState === "loading" ? "Creando…" : "Crear tarea"}
                  </Button>
                </div>
              </form>
            </Section>
          )}

          {/* Conversación — FIX 2026-07-06 (conversaciones v2).
              Modo real: muestra conversación de DB (lead_whatsapp_conversations)
              con form para registrar mensajes manuales + botón archivar.
              Modo demo: comportamiento idéntico al viejo (mock local). */}
          <Section
            title={`Conversación${realMode ? "" : " (WhatsApp · demo)"}`}
          >
            {!conversation ? (
              <Empty text={realMode ? "Sin conversación registrada. Anotá el primer mensaje abajo." : "Sin conversación registrada."} />
            ) : (
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={conversation.status === "escalated" ? "danger" : "info"}>
                    {conversation.status}
                  </Badge>
                  {conversation.summary && (
                    <span className="text-xs text-ink-muted">{conversation.summary}</span>
                  )}
                  <span className="ml-auto text-[10px] text-ink-muted">
                    {conversation.messages.length} mensaje
                    {conversation.messages.length === 1 ? "" : "s"}
                  </span>
                </div>
                {conversation.messages.map((m: ConversationMessage) => (
                  <div
                    key={m.id}
                    className={
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm " +
                      (m.direction === "inbound"
                        ? "bg-brand-50 text-ink-soft"
                        : "bg-brand-500 text-white ml-auto")
                    }
                  >
                    {m.aiSuggested && (
                      <span className="block text-[10px] uppercase opacity-80 mb-0.5">
                        Sugerencia IA (demo)
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={
                        "mt-1 text-[10px] " +
                        (m.direction === "inbound" ? "text-ink-muted" : "text-white/70")
                      }
                    >
                      {m.author !== "Lead" && m.author !== "Qlick" ? `${m.author} · ` : ""}
                      {new Date(m.at).toLocaleString("es-MX")}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* FIX 2026-07-06 — form para registrar mensajes manuales.
                Solo visible en modo real (en demo no hay endpoint POST). */}
            {realMode && (
              <form
                onSubmit={handleAppendMessage}
                noValidate
                className="mt-2 space-y-2 border-t border-brand-100 pt-3"
              >
                <p className="text-[10px] uppercase font-semibold text-ink-muted">
                  Registrar mensaje manual
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-muted flex items-center gap-1">
                    Dirección
                    <select
                      value={newMessageDirection}
                      onChange={(e) =>
                        setNewMessageDirection(
                          e.target.value as "inbound" | "outbound",
                        )
                      }
                      className="rounded-lg border border-brand-200 bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand-400"
                    >
                      <option value="outbound">outbound (yo respondí)</option>
                      <option value="inbound">inbound (él/ella escribió)</option>
                    </select>
                  </label>
                  <span className="ml-auto text-[10px] text-ink-muted">
                    Solo texto (≤4000 chars)
                  </span>
                </div>
                <Textarea
                  value={newMessageBody}
                  onChange={(e) => setNewMessageBody(e.target.value)}
                  placeholder="Pega aquí el mensaje que llegó por WhatsApp/email/voz o que vos enviaste…"
                  rows={3}
                  className="w-full"
                  disabled={conversationState === "loading" || deleteState === "loading"}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      conversationState === "loading" ||
                      deleteState === "loading" ||
                      newMessageBody.trim().length === 0
                    }
                  >
                    {conversationState === "loading"
                      ? "Registrando…"
                      : "Registrar mensaje"}
                  </Button>
                  {conversationMsg && (
                    <span
                      className={
                        "text-xs " +
                        (conversationState === "error"
                          ? "text-rose-700"
                          : "text-emerald-700")
                      }
                      role={conversationState === "error" ? "alert" : "status"}
                    >
                      {conversationMsg}
                    </span>
                  )}
                </div>
              </form>
            )}

            {/* FIX 2026-07-06 — soft-delete de toda la conversación.
                Confirmación textual "ARCHIVAR" (mismo patrón canónico). */}
            {realMode && conversation && conversation.messages.length > 0 && (
              <details className="mt-3 border-t border-brand-100 pt-3 text-xs">
                <summary className="cursor-pointer text-ink-muted hover:text-ink select-none font-semibold">
                  ⚠️ Archivar conversación completa
                </summary>
                <div className="mt-2 space-y-2 p-3 rounded-lg bg-rose-50 border border-rose-200">
                  <p className="text-rose-800">
                    Esto <strong>oculta</strong> los {conversation.messages.length}{" "}
                    mensaje{conversation.messages.length === 1 ? "" : "s"} del
                    CRM. Los rows siguen existiendo (compliance LGPD) y el
                    audit log registra tu email.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder='Escribí "ARCHIVAR" para confirmar'
                      className="flex-1 min-w-[180px] rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-rose-400"
                      disabled={deleteState === "loading"}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={handleDeleteConversation}
                      disabled={
                        deleteState === "loading" ||
                        conversationState === "loading" ||
                        deleteConfirmText.trim().toUpperCase() !== "ARCHIVAR"
                      }
                    >
                      {deleteState === "loading"
                        ? "Archivando…"
                        : "Archivar conversación"}
                    </Button>
                  </div>
                </div>
              </details>
            )}
          </Section>

          {/* Sugerencias IA */}
          <Section title="Sugerencias del agente IA (demo)">
            {suggestions.length === 0 ? (
              <Empty text="Sin sugerencias." />
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.id} className="text-sm border border-brand-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="brand">{s.type.replace(/_/g, " ")}</Badge>
                      {s.needsReview && <Badge tone="warning">requiere revisión</Badge>}
                      <span className="text-xs text-ink-muted">
                        confianza {Math.round(s.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-ink-soft">{s.content}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              Agente IA demo, sin conexión a API. Las sugerencias son mock y siempre pasan por revisión humana.
            </p>
          </Section>

          {/* Citas */}
          <Section title="Citas relacionadas">
            {appts.length === 0 ? (
              <Empty text="Sin citas." />
            ) : (
              <ul className="space-y-2">
                {appts.map((a) => (
                  <li key={a.id} className="text-sm flex justify-between gap-2">
                    <span className="text-ink-soft">{a.title}</span>
                    <span className="text-xs text-ink-muted">{formatDate(a.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </aside>
    </div>
  );
}

/* ----------------------- Helpers de presentación ----------------------- */

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase text-brand-600 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-ink-muted italic">{text}</p>;
}

function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    whatsapp: "WhatsApp",
    email: "Email",
    call: "Llamada",
    form: "Formulario",
    internal_note: "Nota interna",
    ai_suggestion: "IA",
    system: "Sistema"
  };
  return map[channel] ?? channel;
}

/** Labels para los enums de DB lead_interactions (Bloque 2E). */
function interactionChannelLabel(channel: string): string {
  const map: Record<string, string> = {
    whatsapp: "WhatsApp",
    email: "Email",
    phone: "Llamada",
    form: "Formulario",
    system: "Sistema"
  };
  return map[channel] ?? channel;
}

function interactionDirectionLabel(direction: string): string {
  const map: Record<string, string> = {
    inbound: "Entrante",
    outbound: "Saliente",
    system: "Sistema"
  };
  return map[direction] ?? direction;
}

/** Tone del badge según dirección. */
type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
function interactionTone(direction: string): Tone {
  if (direction === "inbound") return "info";
  if (direction === "outbound") return "brand";
  return "neutral";
}
