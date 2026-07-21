"use client";

import { useEffect, useState } from "react";
import type { Lead, LeadStatus, SalesOwner, Conversation, ConversationMessage } from "@/types";
import { Card, Badge, Button, Input, Textarea, Field, Spinner } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import { AlertTriangle, Archive, Bot, Calendar, Pause, Pencil, Trash2, X } from "lucide-react";
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
  patchLeadFields,
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
import { AIBotFeedbackSection } from "@/components/crm/AIBotFeedbackSection";

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
  onConversationDeleted,
  eventContext = null,
}: {
  lead: Lead;
  owners: SalesOwner[];
  onClose: () => void;
  /** true para activar operaciones reales contra la API (modo real). */
  realMode?: boolean;
  /** Callback cuando un PATCH actualiza el lead (p. ej. status). */
  onLeadChanged?: (lead: Lead) => void;
  /** Callback cuando se elimina la conversación del lead. */
  onConversationDeleted?: (leadId: string) => void;
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

  /**
   * FIX 2026-07-08 (sesión David "registrados sin nombre/correo/teléfono"):
   * Toggle de edición inline para los campos editables del lead
   * (name/email/phone). Modos:
   *   - `view`: muestra los datos como Info (default, sin form).
   *   - `edit`: muestra form con inputs editables + Save/Cancel.
   *
   * `editingFields` snapshot del state al abrir el form para detectar diff
   * y deshabilitar Save cuando no hay cambios.
   *
   * Optimistic update: si el server responde OK, `currentLead` ya tiene
   * los valores nuevos (seteamos abajo del response). Si falla, rollback
   * al snapshot original.
   */
  const [editFieldsMode, setEditFieldsMode] = useState<"view" | "edit">("view");
  const [editingFields, setEditingFields] = useState<{
    name: string;
    email: string;
    phone: string;
  }>({ name: "", email: "", phone: "" });
  const [editFieldsState, setEditFieldsState] = useState<OpStatus>("idle");
  const [editFieldsMsg, setEditFieldsMsg] = useState<string | null>(null);

  // --- Datos reales (solo se cargan en modo real) ---
  const [realNotes, setRealNotes] = useState<NoteView[] | null>(null);
  const [realTasks, setRealTasks] = useState<TaskView[] | null>(null);
  const [realInteractions, setRealInteractions] = useState<InteractionView[] | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  // FIX 2026-07-08 (sesión madrugada): toggle de "bot pausado para este
  // lead". Estado local (optimistic + rollback en error). La fuente de
  // verdad es la columna `leads.bot_paused` en DB; la API PATCH vive en
  // `/api/admin/leads/[id]/bot-pause`. El bot-engine chequea este flag
  // antes de procesar cada inbound.
  const [botPauseState, setBotPauseState] = useState<OpStatus>("idle");
  const [botPauseMsg, setBotPauseMsg] = useState<string | null>(null);
  /** Contexto del evento del que provino el lead (badge en el header).
   *  Cargado solo en modo real; null si el lead no tiene origen de evento. */
  const [fetchedEventContext, setFetchedEventContext] =
    useState<LeadEventContext | null>(null);

  // activeConversation es el estado unificado de la conversación (real o mock).
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [conversationState, setConversationState] = useState<OpStatus>("idle");
  const [conversationMsg, setConversationMsg] = useState<string | null>(null);
  const [newMessageBody, setNewMessageBody] = useState("");
  const [newMessageDirection, setNewMessageDirection] = useState<"inbound" | "outbound">("outbound");
  const [showConfirm, setShowConfirm] = useState(false);
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
    if (!realMode) {
      setActiveConversation(getLeadConversation(currentLead.id) ?? null);
      return;
    }
    let cancelled = false;
    setDataError(null);
    setRealNotes(null);
    setRealTasks(null);
    setRealInteractions(null);
    setFetchedEventContext(null);
    setActiveConversation(null);
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
        setActiveConversation(conv);
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
  // activeConversation es la fuente de verdad de la conversación cargada.
  const conversation = activeConversation;
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

  /**
   * FIX 2026-07-08: toggle "bot pausado para este lead".
   * - Solo funciona en modo real (la UI mock no tiene endpoint).
   * - Optimistic: actualiza el lead local al instante; rollback en error.
   * - Cuando está pausado, el bot NO responde nuevos mensajes de este
   *   contacto (los persiste igual con metadata bot_paused_skip=true).
   * - Otros leads siguen funcionando normal.
   */
  async function handleToggleBotPause() {
    if (botPauseState === "loading") return;
    if (!realMode) return;
    const prevPaused = currentLead.botPaused === true;
    const nextPaused = !prevPaused;
    const optimistic = {
      ...currentLead,
      botPaused: nextPaused,
      botPausedAt: nextPaused ? new Date().toISOString() : null,
    };
    setCurrentLead(optimistic);
    setBotPauseState("loading");
    setBotPauseMsg(null);
    try {
      const res = await fetch(
        `/api/admin/leads/${currentLead.id}/bot-pause`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botPaused: nextPaused }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        botPaused?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        // Rollback.
        setCurrentLead((c) => ({ ...c, botPaused: prevPaused }));
        setBotPauseState("error");
        setBotPauseMsg(data.error ?? `Error ${res.status}`);
        return;
      }
      setBotPauseState("success");
      setBotPauseMsg(nextPaused ? "Bot pausado." : "Bot reanudado.");
      setTimeout(() => setBotPauseState("idle"), 2500);
    } catch (err) {
      setCurrentLead((c) => ({ ...c, botPaused: prevPaused }));
      setBotPauseState("error");
      setBotPauseMsg(err instanceof Error ? err.message : "Error de red.");
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
      setActiveConversation(refetched);
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

  async function handleDeleteConversation() {
    if (deleteState === "loading") return;
    setDeleteState("loading");
    setConversationMsg(null);
    try {
      let deletedCount = activeConversation?.messages.length ?? 0;
      if (realMode) {
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
        deletedCount = data.deletedCount ?? deletedCount;
      }
      // Limpiar vista local.
      setActiveConversation(null);
      setDeleteState("success");
      setConversationMsg(
        `Conversación archivada (${deletedCount} mensaje${deletedCount === 1 ? "" : "s"}).`,
      );
      if (onConversationDeleted) {
        onConversationDeleted(currentLead.id);
      }
      setTimeout(() => {
        setDeleteState("idle");
        setShowConfirm(false);
      }, 2000);
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

  /**
   * FIX 2026-07-08: abre el form de edición de campos. Snapshot del state
   * actual del lead para que Cancel pueda restaurar y para detectar diff.
   */
  function handleEditFieldsOpen() {
    if (!realMode) return; // Solo en modo real (en demo no hay endpoint)
    setEditingFields({
      name: currentLead.name,
      email: currentLead.email,
      phone: currentLead.phone ?? "",
    });
    setEditFieldsMsg(null);
    setEditFieldsState("idle");
    setEditFieldsMode("edit");
  }

  function handleEditFieldsCancel() {
    setEditFieldsMode("view");
    setEditFieldsMsg(null);
    setEditFieldsState("idle");
  }

  /**
   * FIX 2026-07-08: persiste los cambios del form.
   * - Envía solo los campos que cambiaron (diff contra snapshot).
   * - Optimistic: actualiza `currentLead` al instante con los nuevos valores.
   * - Rollback si el server rechaza.
   * - Cierra el form en éxito.
   */
  async function handleSaveFields(e: React.FormEvent) {
    e.preventDefault();
    if (editFieldsState === "loading") return;
    const name = editingFields.name.trim();
    if (name.length === 0) {
      setEditFieldsState("error");
      setEditFieldsMsg("El nombre no puede estar vacío.");
      return;
    }
    if (name.length > 100) {
      setEditFieldsState("error");
      setEditFieldsMsg("El nombre no puede superar 100 caracteres.");
      return;
    }
    // Email opcional pero si viene, formato válido
    const emailTrim = editingFields.email.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setEditFieldsState("error");
      setEditFieldsMsg("Email con formato inválido.");
      return;
    }
    // Phone opcional pero si viene, formato E.164 (código de país + número)
    const phoneTrim = editingFields.phone.trim();
    if (phoneTrim && !/^\+\d{7,15}$/.test(phoneTrim.replace(/[\s\-()]/g, ""))) {
      setEditFieldsState("error");
      setEditFieldsMsg("Teléfono debe incluir código de país (ej. +52 686...).");
      return;
    }
    // Diff contra state actual: solo mandamos lo que cambió.
    const patch: { name?: string; email?: string; phone?: string } = {};
    if (name !== currentLead.name) patch.name = name;
    const nextEmail = emailTrim; // empty string = limpiar
    if (nextEmail !== (currentLead.email ?? "")) patch.email = nextEmail;
    const nextPhone = phoneTrim; // empty string = limpiar
    if (nextPhone !== (currentLead.phone ?? "")) patch.phone = nextPhone;
    if (Object.keys(patch).length === 0) {
      setEditFieldsState("success");
      setEditFieldsMsg("Sin cambios.");
      setTimeout(() => {
        setEditFieldsMode("view");
        setEditFieldsState("idle");
        setEditFieldsMsg(null);
      }, 1200);
      return;
    }

    // Snapshot para rollback.
    const snapshot = {
      name: currentLead.name,
      email: currentLead.email,
      phone: currentLead.phone,
    };
    // Optimistic: aplica ya al UI mientras el server confirma.
    // Lead.email es `string` (no `null`) según src/types/crm.ts; usamos
    // string vacío para "limpiar". Lead.phone es `string | undefined`.
    setCurrentLead((c) => ({
      ...c,
      name: patch.name ?? c.name,
      email:
        patch.email !== undefined
          ? patch.email
          : c.email,
      phone:
        patch.phone !== undefined
          ? patch.phone === ""
            ? undefined
            : patch.phone
          : c.phone,
    }));
    setEditFieldsState("loading");
    setEditFieldsMsg(null);
    try {
      const updated = await patchLeadFields(currentLead.id, patch);
      setCurrentLead(updated);
      onLeadChanged?.(updated);
      setEditFieldsState("success");
      setEditFieldsMsg("Datos actualizados.");
      setTimeout(() => {
        setEditFieldsMode("view");
        setEditFieldsState("idle");
        setEditFieldsMsg(null);
      }, 1500);
    } catch (err) {
      // Rollback al snapshot.
      setCurrentLead((c) => ({
        ...c,
        name: snapshot.name,
        email: snapshot.email,
        phone: snapshot.phone,
      }));
      setEditFieldsState("error");
      setEditFieldsMsg(
        err instanceof Error ? err.message : "No se pudieron guardar los cambios.",
      );
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
              {/* FIX 2026-07-08: badge visible del estado del bot
                  per-lead. Cuando está pausado, el bot NO responde
                  automáticamente este contacto. Sprint v15 PR #1: el badge
                  muestra la razón de la pausa (keyword / semantic / manual)
                  con color distinto. */}
              {realMode && currentLead.botPaused === true && (
                currentLead.botPausedReason === "keyword_escalation" ? (
                  <Badge tone="danger" title={`Pausa por palabra clave${currentLead.botPausedAt ? ` · ${new Date(currentLead.botPausedAt).toLocaleString("es-MX")}` : ""}`}>
                    <LucideIcon icon={AlertTriangle} size="xs" tone="inherit" className="inline mr-1" /> Pausa (Palabra Clave)
                  </Badge>
                ) : currentLead.botPausedReason === "ai_semantic_escalation" ? (
                  <Badge tone="warning" title={`Pausa por inferencia IA${currentLead.botPausedAt ? ` · ${new Date(currentLead.botPausedAt).toLocaleString("es-MX")}` : ""}`}>
                    <LucideIcon icon={Bot} size="xs" tone="inherit" className="inline mr-1" /> Pausa (Inferencia IA)
                  </Badge>
                ) : currentLead.botPausedReason === "manual" ? (
                  <Badge tone="info" title={`Pausa manual${currentLead.botPausedAt ? ` · ${new Date(currentLead.botPausedAt).toLocaleString("es-MX")}` : ""}`}>
                    <LucideIcon icon={Pause} size="xs" tone="inherit" className="inline mr-1" /> Pausa (Manual)
                  </Badge>
                ) : (
                  <Badge tone="warning" title={`Bot pausado${currentLead.botPausedAt ? ` · ${new Date(currentLead.botPausedAt).toLocaleString("es-MX")}` : ""}`}>
                    <LucideIcon icon={Bot} size="xs" tone="inherit" className="inline mr-1" /> bot en pausa
                  </Badge>
                )
              )}
            </div>
            <h2 className="text-xl font-bold text-ink truncate">{currentLead.name}</h2>
            <p className="text-sm text-ink-muted truncate">
              {currentLead.courseOfInterest ?? "Sin curso de interés"}
            </p>
            {/* FIX 2026-07-08: switch per-lead "Pausar bot". Solo en modo
                real (en demo no hay endpoint). Estado actual se ve en el
                badge del header. Click → optimistic update + PATCH. */}
            {realMode && (
              <div className="mt-2 inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleBotPause()}
                  disabled={botPauseState === "loading"}
                  aria-pressed={currentLead.botPaused === true}
                  aria-label={
                    currentLead.botPaused === true
                      ? "Reanudar bot para este lead"
                      : "Pausar bot para este lead"
                  }
                  title={
                    currentLead.botPaused === true
                      ? "Click para que el bot vuelva a responder a este lead"
                      : "Click para pausar el bot en este lead (los mensajes se guardan pero el bot no responde)"
                  }
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition disabled:opacity-50 " +
                    (currentLead.botPaused === true
                      ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100")
                  }
                >
                  <span aria-hidden="true">
                    {currentLead.botPaused === true ? "⏸" : "▶"}
                  </span>
                  {botPauseState === "loading"
                    ? "Guardando…"
                    : currentLead.botPaused === true
                      ? "Reanudar bot"
                      : "Pausar bot"}
                </button>
                {botPauseMsg && (
                  <span
                    className={
                      "text-[11px] " +
                      (botPauseState === "error"
                        ? "text-rose-700"
                        : "text-emerald-700")
                    }
                    role={botPauseState === "error" ? "alert" : "status"}
                  >
                    {botPauseMsg}
                  </span>
                )}
              </div>
            )}
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
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-brand-500 text-white">
                  <LucideIcon icon={Calendar} size="xs" tone="inherit" />
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
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Datos — FIX 2026-07-08: toggle view/edit para campos editables
              (name, email, phone). En modo edit: form con inputs + Save/Cancel.
              En modo view: layout en grilla como antes + botón "Editar". */}
          {editFieldsMode === "view" ? (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase text-brand-600">
                  Datos de contacto
                </h3>
                {realMode && (
                  <button
                    type="button"
                    onClick={handleEditFieldsOpen}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1"
                    aria-label="Editar nombre, email y teléfono"
                  >
                    <LucideIcon icon={Pencil} size="xs" tone="inherit" className="inline mr-1" /> Editar
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                {/* FIX 2026-07-08: resaltar visualmente cuando name/email son
                    placeholders legacy ("WhatsApp Lead", "wa.xxx@placeholder.local").
                    El admin ve de un vistazo qué leads quedaron con data incompleta
                    del bot viejo. */}
                <Info
                  label="Nombre"
                  value={currentLead.name}
                  isPlaceholder={
                    currentLead.name === "WhatsApp Lead" ||
                    currentLead.name.toLowerCase() === "asistente" ||
                    /^\s*$/.test(currentLead.name)
                  }
                />
                <Info
                  label="Email"
                  value={currentLead.email ?? "—"}
                  isPlaceholder={
                    !!currentLead.email?.startsWith("wa.") &&
                    currentLead.email.endsWith("@placeholder.local")
                  }
                />
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
              </div>
            </section>
          ) : (
            // Modo edit: form inline con los 3 campos editables.
            <section className="border border-brand-200 rounded-xl p-4 bg-brand-50/30">
              <h3 className="text-xs font-bold uppercase text-brand-600 mb-3">
                Editar datos de contacto
              </h3>
              <form onSubmit={handleSaveFields} noValidate className="space-y-3">
                <Field
                  label="Nombre"
                  error={
                    editFieldsState === "error" && editFieldsMsg?.toLowerCase().includes("nombre")
                      ? editFieldsMsg
                      : null
                  }
                  required
                >
                  <Input
                    value={editingFields.name}
                    onChange={(e) => {
                      setEditingFields((f) => ({ ...f, name: e.target.value }));
                      if (editFieldsState === "error") {
                        setEditFieldsState("idle");
                        setEditFieldsMsg(null);
                      }
                    }}
                    placeholder="Nombre y apellido"
                    className="w-full"
                    disabled={editFieldsState === "loading"}
                    autoFocus
                  />
                </Field>
                <Field
                  label="Email"
                  error={
                    editFieldsState === "error" && editFieldsMsg?.toLowerCase().includes("email")
                      ? editFieldsMsg
                      : null
                  }
                >
                  <Input
                    type="email"
                    value={editingFields.email}
                    onChange={(e) => {
                      setEditingFields((f) => ({ ...f, email: e.target.value }));
                      if (editFieldsState === "error") {
                        setEditFieldsState("idle");
                        setEditFieldsMsg(null);
                      }
                    }}
                    placeholder="email@ejemplo.com"
                    className="w-full"
                    disabled={editFieldsState === "loading"}
                  />
                </Field>
                <Field
                  label="Teléfono"
                  error={
                    editFieldsState === "error" && editFieldsMsg?.toLowerCase().includes("teléfono")
                      ? editFieldsMsg
                      : null
                  }
                >
                  <Input
                    type="tel"
                    value={editingFields.phone}
                    onChange={(e) => {
                      setEditingFields((f) => ({ ...f, phone: e.target.value }));
                      if (editFieldsState === "error") {
                        setEditFieldsState("idle");
                        setEditFieldsMsg(null);
                      }
                    }}
                    placeholder="+52 686 123 4567"
                    className="w-full"
                    disabled={editFieldsState === "loading"}
                  />
                </Field>
                {editFieldsMsg &&
                  editFieldsState !== "error" &&
                  !editFieldsMsg.toLowerCase().includes("nombre") &&
                  !editFieldsMsg.toLowerCase().includes("email") &&
                  !editFieldsMsg.toLowerCase().includes("teléfono") && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
                      {editFieldsMsg}
                    </p>
                  )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={editFieldsState === "loading"}
                  >
                    {editFieldsState === "loading" ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleEditFieldsCancel}
                    disabled={editFieldsState === "loading"}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </section>
          )}

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
                    : "Archivar"}
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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge tone={conversation.status === "escalated" ? "danger" : "info"}>
                    {conversation.status}
                  </Badge>
                  {conversation.summary && (
                    <span className="text-xs text-ink-muted">{conversation.summary}</span>
                  )}
                  <span className="ml-auto text-[10px] text-ink-muted whitespace-nowrap">
                    {conversation.messages.length} mensaje
                    {conversation.messages.length === 1 ? "" : "s"}
                  </span>
                  {conversation && conversation.messages.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setShowConfirm(true);
                      }}
                      disabled={deleteState === "loading" || conversationState === "loading"}
                      aria-label={`Eliminar la conversación completa del lead ${currentLead.name}`}
                      title="Soft delete: oculta los mensajes del CRM preservando el audit log (LGPD)"
                      className="text-xs"
                    >
                      <LucideIcon icon={Trash2} size="sm" tone="inherit" className="inline mr-1" /> Eliminar conversación
                    </Button>
                  )}
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
                  placeholder="Pega aquí el mensaje que llegó por WhatsApp/email/voz o que enviaste…"
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

            {/* FIX 2026-07-07 ~01:34 — soft-delete de toda la conversación.
                Botón ahora vive en el header de la sección (visible sin
                necesidad de expandir nada). La confirmación textual
                "ARCHIVAR" sigue siendo el guard anti-click-accidental,
                dentro del modal que se abre al click del botón. */}
            {showConfirm && conversation && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-archive-conv-title"
                onClick={() => deleteState !== "loading" && setShowConfirm(false)}
              >
                <div
                  className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2
                    id="bulk-archive-conv-title"
                    className="text-lg font-bold text-ink mb-1"
                  >
                    ¿Eliminar la conversación de {currentLead.name}?
                  </h2>
                  <p className="text-sm text-ink-muted mb-4">
                    Esto <strong>oculta</strong> los {conversation.messages.length}{" "}
                    mensaje{conversation.messages.length === 1 ? "" : "s"} de la
                    UI del CRM. Los rows siguen existiendo en la base de datos
                    (compliance LFPDPPP/LGPD) y el audit log registra tu
                    email.
                  </p>
                  {conversationMsg && (
                    <div
                      className={
                        "mb-4 p-3 rounded-lg border text-sm " +
                        (deleteState === "error"
                          ? "bg-rose-50 border-rose-200 text-rose-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700")
                      }
                      role="alert"
                    >
                      {conversationMsg}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowConfirm(false);
                      }}
                      disabled={deleteState === "loading"}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={handleDeleteConversation}
                      disabled={deleteState === "loading"}
                    >
                      {deleteState === "loading" ? "Eliminando…" : "Sí, eliminar"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* SPRINT v15 PR #1: feedback para el agente IA. Solo en modo real
              (en demo no hay reglas persistidas). Se monta debajo del
              historial de chat porque el contexto es "lo que acaba de pasar
              con este lead" → el operador educa al bot justo después de leer. */}
          {realMode && (
            <Section title="Educar al agente IA (Torre de Control)">
              <AIBotFeedbackSection
                eventScope={
                  (eventContext ?? fetchedEventContext)?.eventSlug ??
                  (eventContext ?? fetchedEventContext)?.eventId ??
                  undefined
                }
              />
            </Section>
          )}

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

/**
 * FIX 2026-07-08: helper `Info` extendido con `isPlaceholder`. Cuando es
 * true, el value se renderiza con tinte amber y badge "(placeholder)" para
 * que el admin identifique data legacy incompleta de un vistazo.
 */
function Info({
  label,
  value,
  isPlaceholder = false,
}: {
  label: string;
  value: string;
  isPlaceholder?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
      <p className={"flex items-center gap-1.5 " + (isPlaceholder ? "text-amber-700" : "text-ink")}>
        <span>{value}</span>
        {isPlaceholder && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"
            title="Dato placeholder heredado de bugs del bot. Editá para corregir."
          >
            placeholder
          </span>
        )}
      </p>
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
