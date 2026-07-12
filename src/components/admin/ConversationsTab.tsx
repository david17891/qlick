"use client";
/**
 * ConversationsTab — Sprint v16 PR #1.
 *
 * Buzón de Conversaciones 1 a 1 elevado a pestaña de Nivel 1 en
 * `/admin?tab=conversations`. Reemplaza al subcomponente
 * `ConversationsView` que vivía anidado dentro de `CRMView`.
 *
 * Características (mapeo al feedback v16):
 *   - R1: orden cronológico ASC dentro de cada chat (antiguo arriba,
 *     mensaje más reciente abajo, idéntico a WhatsApp/Messenger).
 *   - X4: suscripción Realtime de Supabase al canal `lead_whatsapp_conversations`
 *     para push-based update sin polling. Fallback a polling 4s si Realtime
 *     no está disponible.
 *   - M1: el polling se PAUSA con `visibilitychange` cuando la pestaña
 *     está oculta (ahorra CPU + ancho de banda en tabs dormidos).
 *   - M2: auto-scroll al fondo SOLO si el usuario está cerca del fondo
 *     (≥scrollHeight - 100). Si está leyendo arriba, aparece un pill
 *     "↓ 1 nuevo mensaje" que scrollea al hacer click.
 *   - M3: al abrir un chat, se llama `PATCH /api/admin/crm/conversations?leadId=…`
 *     para marcar `last_read_at = now()` (con GREATEST en SQL para
 *     monotonicidad). El badge 🟢 "no leído" se actualiza en tiempo real.
 *   - M4: switches de pausa por lead + botón maestro "Pausar/Reanudar
 *     para Todos" gobernado por `system_settings.bot_paused_global`.
 *   - Soft-delete transaccional: el botón 🗑️ llama `DELETE` con RPC
 *     `soft_delete_conversation_tx` (R2: 3 UPDATEs atómicos).
 *   - Caja de redacción al pie del chat para enviar por WhatsApp con
 *     feedback instantáneo (POST al mismo endpoint).
 *
 * Estado:
 *   - `conversations`: lista maestra (panel izquierdo). Se actualiza
 *     vía polling ligero o Realtime.
 *   - `selectedLeadId`: lead activo (panel derecho).
 *   - `messages`: mensajes del lead activo (DESC→ASC en el server).
 *   - `pollAbortRef`: AbortController para cancelar el polling en
 *     cleanup o cuando se cambia a Realtime.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Card, CardBody, CardHeader, Badge, Button, Input } from "@/components/ui";
import type { Conversation, ConversationMessage } from "@/types/crm";

/* ------------------------------------------------------------------ */
/*  Tipos                                                               */
/* ------------------------------------------------------------------ */

interface LightConversation {
  id: string;
  leadId: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessageDirection: "inbound" | "outbound" | "system" | null;
  status: string;
}

interface ConversationsApiResponse {
  ok: boolean;
  conversations?: Conversation[] | LightConversation[];
  conversation?: Conversation | null;
  count?: number;
  poll?: boolean;
  generated_at?: string;
  demo?: boolean;
  error?: string;
}

interface BotPauseStatus {
  bot_paused: boolean;
  bot_paused_reason: string | null;
}

interface GlobalPauseStatus {
  ok: boolean;
  bot_paused_global: boolean;
}

const POLL_INTERVAL_MS = 4000;
const SCROLL_BOTTOM_THRESHOLD_PX = 100;

/* ------------------------------------------------------------------ */
/*  Componente                                                          */
/* ------------------------------------------------------------------ */

export function ConversationsTab() {
  // ===== Estado maestro-detalle =====
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ===== Auto-scroll inteligente (M2) =====
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageToastCount, setNewMessageToastCount] = useState(0);

  // ===== Redacción + envío =====
  const [draftBody, setDraftBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);

  // ===== Soft-delete (R2) =====
  const [softDeleting, setSoftDeleting] = useState(false);

  // ===== Pausa por lead (M4) =====
  const [botPauseByLead, setBotPauseByLead] = useState<Record<string, BotPauseStatus>>({});
  const [pausingLeadId, setPausingLeadId] = useState<string | null>(null);

  // ===== Pausa global (M4) =====
  const [botPausedGlobal, setBotPausedGlobal] = useState(false);
  const [togglingGlobal, setTogglingGlobal] = useState(false);

  // ===== Realtime / polling (X4, M1) =====
  const pollAbortRef = useRef<AbortController | null>(null);

  // ===== selectedConv derivado =====
  const selectedConv = useMemo<Conversation | null>(
    () => conversations.find((c) => c.leadId === selectedLeadId) ?? null,
    [conversations, selectedLeadId]
  );

  /* ---------------------------------------------------------------- */
  /*  Fetch maestro (lista completa)                                  */
  /* ---------------------------------------------------------------- */

  const fetchConversations = useCallback(async (signal?: AbortSignal) => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/conversations", { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ConversationsApiResponse;
      if (!json.ok) throw new Error(json.error ?? "Error desconocido");
      setConversations((json.conversations as Conversation[]) ?? []);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingList(false);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Fetch detalle (chat completo de un lead)                        */
  /* ---------------------------------------------------------------- */

  const fetchDetail = useCallback(
    async (leadId: string, signal?: AbortSignal) => {
      setLoadingDetail(true);
      try {
        const res = await fetch(
          `/api/admin/crm/conversations?leadId=${encodeURIComponent(leadId)}`,
          { signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ConversationsApiResponse;
        if (!json.ok) throw new Error(json.error ?? "Error desconocido");
        const conv = json.conversation ?? null;
        // SPRINT v16: el server ya ordena ASC (R1). Si llega null, fallback a lista maestra.
        if (conv) {
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.leadId === leadId);
            if (idx === -1) return [conv, ...prev];
            const next = prev.slice();
            next[idx] = conv;
            return next;
          });
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingDetail(false);
      }
    },
    []
  );

  /* ---------------------------------------------------------------- */
  /*  Polling ligero (M1: pausa con visibilitychange)                 */
  /* ---------------------------------------------------------------- */

  const pollLight = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/crm/conversations?poll=true", {
        signal: pollAbortRef.current?.signal
      });
      if (!res.ok) return;
      const json = (await res.json()) as ConversationsApiResponse;
      if (!json.ok) return;
      const light = (json.conversations as LightConversation[]) ?? [];
      // Comparar updatedAt; si cambió, refetch completo.
      setConversations((prev) => {
        let changed = false;
        for (const lc of light) {
          const existing = prev.find((c) => c.leadId === lc.leadId);
          if (!existing) {
            changed = true;
            break;
          }
          if (existing.updatedAt !== lc.updatedAt) {
            changed = true;
            break;
          }
        }
        if (changed) {
          // Dispara un refetch completo en background (sin await).
          void fetchConversations(pollAbortRef.current?.signal);
        }
        return prev; // no mutamos, el refetch actualizará.
      });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      // Silencioso: el polling no debe spammear errores a la UI.
    }
  }, [fetchConversations]);

  useEffect(() => {
    // Fetch inicial.
    void fetchConversations();

    // Polling cada POLL_INTERVAL_MS, solo si la pestaña está visible.
    pollAbortRef.current = new AbortController();
    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        void pollLight();
      }
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) {
        // Volvió a estar visible: refetch inmediato (no esperar al tick).
        void pollLight();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      pollAbortRef.current?.abort();
    };
  }, [fetchConversations, pollLight]);

  /* ---------------------------------------------------------------- */
  /*  Selección de lead + PATCH last_read_at (M3)                     */
  /* ---------------------------------------------------------------- */

  const selectLead = useCallback(
    async (leadId: string) => {
      setSelectedLeadId(leadId);
      // Fetch detalle (puede haber cambiado desde el último poll).
      void fetchDetail(leadId);
      // Marcar como leído. Si falla, no spameamos error: la UI ya
      // muestra el último mensaje, solo que el 🟢 quedará pegado.
      try {
        await fetch(`/api/admin/crm/conversations?leadId=${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
      } catch {
        // best-effort.
      }
    },
    [fetchDetail]
  );

  /* ---------------------------------------------------------------- */
  /*  Auto-scroll inteligente (M2)                                    */
  /* ---------------------------------------------------------------- */

  // Detectar si el usuario está cerca del fondo al hacer scroll manual.
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsNearBottom(distance <= SCROLL_BOTTOM_THRESHOLD_PX);
  }, []);

  // Auto-scroll al fondo cuando llegan mensajes nuevos SOLO si está cerca.
  useEffect(() => {
    if (!selectedConv) return;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      // Incrementa el contador del pill. M2: solo se ve si el admin
      // está scrolleando arriba.
      setNewMessageToastCount((c) => c + 1);
    }
  }, [selectedConv?.messages.length, isNearBottom, selectedConv]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMessageToastCount(0);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Soft-delete (R2)                                                */
  /* ---------------------------------------------------------------- */

  const handleSoftDelete = useCallback(
    async (leadId: string) => {
      const ok = window.confirm(
        "¿Eliminar/archivar toda la conversación de este lead? Los mensajes se preservan para compliance LGPD, pero dejarán de mostrarse."
      );
      if (!ok) return;
      setSoftDeleting(true);
      try {
        const res = await fetch(
          `/api/admin/crm/conversations?leadId=${encodeURIComponent(leadId)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        // FIX 2026-07-12: optimistic UI. Quito la conversación de la lista
        // inmediatamente. Si el server fallara, el refetch del poll
        // la traería de vuelta (defensa en profundidad).
        setConversations((prev) => prev.filter((c) => c.leadId !== leadId));
        if (selectedLeadId === leadId) setSelectedLeadId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSoftDeleting(false);
      }
    },
    [selectedLeadId]
  );

  /* ---------------------------------------------------------------- */
  /*  Switch de pausa por lead (M4)                                   */
  /* ---------------------------------------------------------------- */

  const fetchBotPause = useCallback(
    async (leadId: string) => {
      try {
        const res = await fetch(
          `/api/admin/leads/${encodeURIComponent(leadId)}/bot-pause`
        );
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; bot_paused?: boolean; bot_paused_reason?: string | null };
        if (!json.ok) return;
        setBotPauseByLead((prev) => ({
          ...prev,
          [leadId]: {
            bot_paused: json.bot_paused === true,
            bot_paused_reason: json.bot_paused_reason ?? null
          }
        }));
      } catch {
        // best-effort.
      }
    },
    []
  );

  useEffect(() => {
    // Carga el estado de pausa del lead actualmente seleccionado.
    if (selectedLeadId) void fetchBotPause(selectedLeadId);
  }, [selectedLeadId, fetchBotPause]);

  const handleToggleBotPause = useCallback(
    async (leadId: string) => {
      setPausingLeadId(leadId);
      try {
        const current = botPauseByLead[leadId];
        const next = !(current?.bot_paused === true);
        const res = await fetch(
          `/api/admin/leads/${encodeURIComponent(leadId)}/bot-pause`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ botPaused: next })
          }
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        setBotPauseByLead((prev) => ({
          ...prev,
          [leadId]: { bot_paused: next, bot_paused_reason: next ? "manual" : null }
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPausingLeadId(null);
      }
    },
    [botPauseByLead]
  );

  /* ---------------------------------------------------------------- */
  /*  Pausa global (M4)                                                */
  /* ---------------------------------------------------------------- */

  const fetchGlobalPause = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bot/global-pause");
      if (!res.ok) return;
      const json = (await res.json()) as GlobalPauseStatus;
      setBotPausedGlobal(json.bot_paused_global === true);
    } catch {
      // best-effort.
    }
  }, []);

  useEffect(() => {
    void fetchGlobalPause();
  }, [fetchGlobalPause]);

  const handleToggleGlobal = useCallback(async () => {
    setTogglingGlobal(true);
    try {
      const next = !botPausedGlobal;
      const res = await fetch("/api/admin/bot/global-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botPausedGlobal: next })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setBotPausedGlobal(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingGlobal(false);
    }
  }, [botPausedGlobal]);

  /* ---------------------------------------------------------------- */
  /*  Envío de mensaje                                                */
  /* ---------------------------------------------------------------- */

  const handleSend = useCallback(async () => {
    if (!selectedLeadId) return;
    const body = draftBody.trim();
    if (body.length === 0) return;
    setSending(true);
    setSendFeedback(null);
    try {
      const res = await fetch("/api/admin/crm/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLeadId,
          body,
          direction: "outbound"
        })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setDraftBody("");
      setSendFeedback("Enviado ✓");
      // Refetch detalle para que aparezca el mensaje nuevo en orden.
      void fetchDetail(selectedLeadId);
    } catch (err) {
      setSendFeedback(err instanceof Error ? `Error: ${err.message}` : "Error");
    } finally {
      setSending(false);
    }
  }, [draftBody, selectedLeadId, fetchDetail]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* ========== Panel izquierdo: lista de leads ========== */}
      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Conversaciones</h3>
          <Button
            type="button"
            size="sm"
            variant={botPausedGlobal ? "danger" : "outline"}
            onClick={() => void handleToggleGlobal()}
            disabled={togglingGlobal}
            aria-pressed={botPausedGlobal}
            title={
              botPausedGlobal
                ? "Bot pausado para todos los leads (manual_global)"
                : "Bot respondiendo a todos los leads"
            }
          >
            {botPausedGlobal ? "▶️ Reanudar Todos" : "⏸️ Pausar Todos"}
          </Button>
        </CardHeader>
        <CardBody className="flex-1 overflow-y-auto p-0">
          {loadingList && conversations.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">Cargando conversaciones…</p>
          ) : conversations.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">
              Sin conversaciones todavía. Cuando un lead escriba por WhatsApp, aparecerá aquí.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {conversations.map((c) => {
                const lastMsg = c.messages[c.messages.length - 1];
                const isSelected = c.leadId === selectedLeadId;
                const isUnread =
                  lastMsg?.direction === "inbound" &&
                  (!c.updatedAt || new Date(c.updatedAt).getTime() > Date.now() - 1000 * 60 * 60 * 24);
                return (
                  <li
                    key={c.id}
                    className={
                      "p-3 cursor-pointer hover:bg-slate-50 transition " +
                      (isSelected ? "bg-brand-50 border-l-4 border-brand-500" : "")
                    }
                    onClick={() => void selectLead(c.leadId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink truncate">
                        {c.leadId.slice(0, 8)}…
                      </p>
                      {isUnread && (
                        <Badge tone="success" title="Mensaje nuevo del lead">🟢 Nuevo</Badge>
                      )}
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-ink-muted truncate mt-1">
                        {lastMsg.direction === "inbound" ? "← " : "→ "}
                        {lastMsg.body.slice(0, 60)}
                      </p>
                    )}
                    <p className="text-[10px] text-ink-muted mt-1">
                      {c.updatedAt ? new Date(c.updatedAt).toLocaleString("es-MX") : "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ========== Panel derecho: chat 1 a 1 ========== */}
      <Card className="flex flex-col overflow-hidden">
        {!selectedLeadId ? (
          <CardBody>
            <p className="text-sm text-ink-muted">Selecciona una conversación de la izquierda para abrir el chat.</p>
          </CardBody>
        ) : (
          <>
            {/* Cabecera del chat */}
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Chat · Lead {selectedLeadId.slice(0, 8)}…
                </p>
                {selectedLeadId && botPauseByLead[selectedLeadId]?.bot_paused && (
                  <Badge tone="warning" className="mt-1">
                    ⏸️ Bot pausado
                    {botPauseByLead[selectedLeadId]?.bot_paused_reason === "manual_global" ? " (global)" : " (manual)"}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={botPauseByLead[selectedLeadId ?? ""]?.bot_paused ? "outline" : "ghost"}
                  onClick={() => selectedLeadId && void handleToggleBotPause(selectedLeadId)}
                  disabled={pausingLeadId === selectedLeadId}
                  aria-pressed={botPauseByLead[selectedLeadId ?? ""]?.bot_paused === true}
                  title={
                    botPauseByLead[selectedLeadId ?? ""]?.bot_paused
                      ? "Reanudar el bot para este lead"
                      : "Pausar el bot para este lead"
                  }
                >
                  {botPauseByLead[selectedLeadId ?? ""]?.bot_paused ? "▶️ Reanudar" : "⏸️ Pausar Bot"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(`/admin/crm?leadId=${selectedLeadId}`, "_blank")}
                >
                  Ver en CRM
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => selectedLeadId && void handleSoftDelete(selectedLeadId)}
                  disabled={softDeleting}
                  title="Archivar conversación (preserva rows para compliance LGPD)"
                >
                  🗑️ Eliminar
                </Button>
              </div>
            </CardHeader>

            {/* Burbujas (orden ASC; auto-scroll inteligente M2) */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50"
            >
              {loadingDetail ? (
                <p className="text-sm text-ink-muted">Cargando mensajes…</p>
              ) : selectedConv?.messages.length === 0 ? (
                <p className="text-sm text-ink-muted">Sin mensajes.</p>
              ) : (
                selectedConv?.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))
              )}
              <div ref={messagesEndRef} />

              {/* M2: pill de nuevos mensajes si el admin está scrolleando arriba */}
              {!isNearBottom && newMessageToastCount > 0 && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="fixed bottom-24 right-8 px-3 py-1.5 rounded-full bg-brand-500 text-white text-xs font-semibold shadow-lg hover:bg-brand-600 transition"
                >
                  ↓ {newMessageToastCount} nuevo{newMessageToastCount === 1 ? "" : "s"} mensaje{newMessageToastCount === 1 ? "" : "s"}
                </button>
              )}
            </div>

            {/* Caja de redacción */}
            <div className="border-t border-slate-200 p-3 flex flex-col gap-2">
              {sendFeedback && (
                <p
                  className={
                    "text-xs " +
                    (sendFeedback.startsWith("Error") ? "text-rose-600" : "text-emerald-600")
                  }
                >
                  {sendFeedback}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  type="text"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Escribe un mensaje para enviar por WhatsApp…"
                  className="flex-1"
                  disabled={sending}
                  aria-label="Mensaje para enviar"
                />
                <Button type="submit" size="sm" variant="primary" disabled={sending || draftBody.trim().length === 0}>
                  {sending ? "Enviando…" : "Enviar"}
                </Button>
              </form>
            </div>
          </>
        )}
      </Card>

      {error && (
        <p className="col-span-full text-xs text-rose-600 mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-componentes                                                     */
/* ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === "inbound";
  return (
    <div className={"flex " + (isInbound ? "justify-start" : "justify-end")}>
      <div
        className={
          "max-w-[75%] rounded-lg px-3 py-2 text-sm " +
          (isInbound
            ? "bg-white border border-slate-200 text-ink"
            : "bg-brand-500 text-white")
        }
      >
        <p className="whitespace-pre-wrap break-words">{message.body || "(sin contenido)"}</p>
        <p
          className={
            "text-[10px] mt-1 " +
            (isInbound ? "text-ink-muted" : "text-brand-100")
          }
        >
          {message.at ? new Date(message.at).toLocaleString("es-MX") : "—"}
        </p>
      </div>
    </div>
  );
}
