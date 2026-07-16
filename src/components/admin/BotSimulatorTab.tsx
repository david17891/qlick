"use client";
/**
 * Sprint v0.9.6 — BotSimulatorTab: Laboratorio IA / Simulador de WhatsApp.
 * Sprint v0.9.x PR #3 — Modo "Real" con personas sintéticas.
 *
 * UI en pantalla dividida:
 *   - Izquierda: chat sandbox (burbujas, input con Enter, limpiar historial).
 *   - Derecha: panel de telemetría ("Rayos X del Cerebro") que se actualiza
 *     con cada respuesta del bot: modo, costo, tokens, intent, tools,
 *     reglas inyectadas, evento activo.
 *
 * Controles superiores:
 *   - Selector de Modo de Simulación: Sandbox (solo LLM, no toca nada) vs
 *     Real (ejecuta el flow completo contra un lead sintético).
 *   - Si Real: lista de personas sintéticas, botón "Crear nueva", banner
 *     de seguridad con auto-timeout (30 min).
 *   - Selector de Lead (Ficticio Sandbox / Lead del CRM).
 *   - Selector de Modo del Bot (Modo BD Actual / Override).
 *   - Checkbox "Ignorar pausa per-lead".
 *
 * Aislamiento: este componente NUNCA toca Meta / Supabase directamente.
 * Toda la lógica de simulación pasa por:
 *   - `POST /api/admin/bot/simulate` (Sandbox, solo LLM)
 *   - `POST /api/admin/bot/simulate/real` (Real, flow completo)
 *   - `POST /api/admin/bot/synthetic-leads` (crear persona)
 *   - `GET  /api/admin/bot/synthetic-leads` (listar)
 *   - `DELETE /api/admin/bot/synthetic-leads` (limpiar)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader, Button, Input, Badge } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Tipos espejo del endpoint (ver `src/lib/ai/simulator.ts`)            */
/* ------------------------------------------------------------------ */

type BotMode = "socratic_autopilot_v2" | "socratic_no_tools_v1" | "super_executive" | "human_first";
// FIXME: SSOT vive en `src/lib/admin/system-settings-server.ts` (`BotGlobalMode`).
// Refactor pendiente: unificar en un solo archivo de types.

interface SimulateHistoryMessage {
  direction: "inbound" | "outbound";
  body: string;
  timestamp?: string;
}

interface InjectedRule {
  instruction: string;
  priority: number;
  scope: string;
}

interface SimulateTelemetry {
  modeUsed: BotMode;
  intent: string;
  toolsCalled: string[];
  injectedRules: InjectedRule[];
  eventContext: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostCents: number;
    model: string;
  };
}

interface SimulateResponse {
  ok: boolean;
  reply: string;
  telemetry: SimulateTelemetry;
  note?: string;
}

interface BotSimulatorTabProps {
  /** Modo actual persistido en DB. Lo pasamos desde BotConfigTab para mostrar
   *  el default en el selector. */
  currentMode: BotMode;
}

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const MODE_LABELS: Record<BotMode, string> = {
  socratic_autopilot_v2: "Socrático v2 (tools)",
  socratic_no_tools_v1: "Socrático v1 (sin tools)",
  super_executive: "🚀 Súper Ejecutivo",
  // Sprint v0.9.x PR #1: 4to modo opt-in `human_first` (LLM-first total).
  // Aparece en el selector del simulador y en la UI de telemetría.
  human_first: "🧪 Estilo Humano (Conversacional)"
};

const MODE_EMOJI: Record<BotMode, string> = {
  socratic_autopilot_v2: "🟢",
  socratic_no_tools_v1: "🔵",
  super_executive: "🚀",
  human_first: "🧪"
};

/* ------------------------------------------------------------------ */
/*  Sprint v0.9.x PR #3: tipos espejo del endpoint de sintéticos       */
/* ------------------------------------------------------------------ */

interface SyntheticLeadSummary {
  id: string;
  phoneNormalized: string;
  name: string;
  email: string;
  createdAt: string;
  createdBy: string;
  sessionId: string | null;
}

/** Modo de simulación: Sandbox (solo LLM) o Real (flow completo). */
type SimulationMode = "sandbox" | "real";

/** Auto-timeout del modo Real: 30 min desde que se activa. */
const REAL_MODE_TIMEOUT_MS = 30 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export function BotSimulatorTab({ currentMode }: BotSimulatorTabProps) {
  // Historial efímero en memoria (NO se persiste en ningún lado).
  const [history, setHistory] = useState<SimulateHistoryMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastResponse, setLastResponse] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Costo acumulado en la sesión (en cents USD).
  const [sessionCostCents, setSessionCostCents] = useState(0);
  const [sessionTurns, setSessionTurns] = useState(0);

  // Controles superiores.
  const [modeChoice, setModeChoice] = useState<"db" | BotMode>("db");
  const [useRealLead, setUseRealLead] = useState(false);
  const [realLeadId, setRealLeadId] = useState<string>("");
  const [ignoreLeadPause, setIgnoreLeadPause] = useState(false);
  // Sprint v0.9.7 (Switch Flash/Pro): default = default BD (Flash con
  // escalación automática). "flash" fuerza deepseek-chat. "pro" fuerza
  // deepseek-reasoner. El simulador propaga este valor al AgentContext.
  const [tierChoice, setTierChoice] = useState<"default" | "flash" | "pro">(
    "default"
  );

  // Sprint v0.9.x PR #3: modo Real con personas sintéticas.
  const [simulationMode, setSimulationMode] = useState<SimulationMode>("sandbox");
  const [syntheticLeads, setSyntheticLeads] = useState<SyntheticLeadSummary[]>([]);
  const [selectedSyntheticLeadId, setSelectedSyntheticLeadId] = useState<string>("");
  // Timestamp (ms) en que se activó el modo Real. Si pasan 30 min sin
  // actividad, auto-desconectamos para evitar dejar el modo peligroso
  // activo por accidente.
  const [realModeStartedAt, setRealModeStartedAt] = useState<number | null>(null);
  const [creatingSynthetic, setCreatingSynthetic] = useState(false);
  const [cleaningSynthetic, setCleaningSynthetic] = useState(false);

  // Acumulador de telemetría (necesario para los "Rayos X").
  const [rulesOpen, setRulesOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  // Ref para auto-scroll del chat al último mensaje.
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // FIX auditoría 2026-07-14: AbortController para cancelar fetches en
  // unmount, evitando el warning de React "state update on unmounted
  // component". También para el setInterval del auto-timeout.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Sprint v0.9.x PR #3: carga la lista de leads sintéticos desde el
   * endpoint. Si la lista está vacía, el admin debe crear uno.
   * Declarado ANTES de los useEffect que lo usan para evitar
   * "used before declaration" de TS.
   *
   * FIX auditoría 2026-07-14: usa AbortController para cancelar el
   * fetch si el componente se desmonta durante el await.
   */
  const loadSyntheticLeads = useCallback(async () => {
    const controller = new AbortController();
    try {
      const r = await fetch("/api/admin/bot/synthetic-leads", {
        cache: "no-store",
        signal: controller.signal
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { ok: boolean; leads?: SyntheticLeadSummary[]; error?: string };
      if (mountedRef.current && j.ok && j.leads) {
        setSyntheticLeads(j.leads);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (mountedRef.current) {
        setError(
          `No se pudo cargar leads sintéticos: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [history]);

  // Sprint v0.9.x PR #3: cuando se activa el modo Real, cargar la lista
  // de leads sintéticos. Al desactivar, limpiar el seleccionado.
  useEffect(() => {
    if (simulationMode === "real") {
      void loadSyntheticLeads();
      setRealModeStartedAt(Date.now());
    } else {
      setSelectedSyntheticLeadId("");
      setRealModeStartedAt(null);
    }
  }, [simulationMode, loadSyntheticLeads]);

  // Sprint v0.9.x PR #3: auto-timeout del modo Real (30 min sin actividad).
  // Si pasaron 30 min desde `realModeStartedAt`, desconectamos el modo.
  // FIX auditoría 2026-07-14: usa `mountedRef` para evitar setState en
  // componente desmontado (warning de React).
  useEffect(() => {
    if (simulationMode !== "real" || realModeStartedAt === null) return;
    const interval = setInterval(() => {
      if (!mountedRef.current) return;
      if (Date.now() - realModeStartedAt > REAL_MODE_TIMEOUT_MS) {
        setSimulationMode("sandbox");
        setError(
          "Modo Real auto-desconectado por inactividad (30 min). Vuelve a activarlo para continuar."
        );
      }
    }, 60_000); // chequeo cada minuto
    return () => clearInterval(interval);
  }, [simulationMode, realModeStartedAt]);

  /**
   * Sprint v0.9.x PR #3: carga la lista de leads sintéticos desde el
   * endpoint. Si la lista está vacía, el admin debe crear uno.
   * (Declarado arriba, antes de los useEffect que lo usan.)
   */

  const effectiveMode: BotMode = useMemo(() => {
    return modeChoice === "db" ? currentMode : modeChoice;
  }, [modeChoice, currentMode]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      // Sprint v0.9.x PR #3: en modo Real, requerimos un leadId seleccionado.
      if (simulationMode === "real" && !selectedSyntheticLeadId) {
        setError(
          "Modo Real: selecciona una persona sintética o crea una nueva antes de mandar mensajes."
        );
        return;
      }

      const userMsg: SimulateHistoryMessage = {
        direction: "inbound",
        body: trimmed,
        timestamp: new Date().toISOString()
      };
      const newHistory = [...history, userMsg];
      setHistory(newHistory);
      setInput("");
      setSending(true);
      setError(null);

      try {
        if (simulationMode === "real") {
          // Modo Real: ejecutar el flow completo contra el lead sintético.
          // FIX 2026-07-14: este path NO usa `lastResponse` (SimulateResponse)
          // porque el endpoint Real devuelve un shape distinto (SimulateRealResponse).
          // Mostramos un output sintético en el chat con el preview del bot.
          const r = await fetch("/api/admin/bot/simulate/real", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId: selectedSyntheticLeadId,
              body: trimmed
            })
          });
          if (!r.ok) {
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? `HTTP ${r.status}`);
          }
          const result = (await r.json()) as {
            ok: boolean;
            botResult: {
              intent: string | null;
              responseKind: string;
              responsePreview: string | null;
              note: string;
            };
            providerAttempt: { attempted: boolean; errorMessage: string | null };
            latencyMs: number;
          };
          // Mostrar el preview en el chat como si fuera respuesta del bot.
          const preview = result.botResult.responsePreview ??
            `(intent=${result.botResult.intent ?? "?"}, responseKind=${result.botResult.responseKind})`;
          setHistory((h) => [
            ...h,
            {
              direction: "outbound",
              body: preview,
              timestamp: new Date().toISOString()
            }
          ]);
          // Construir un SimulateResponse mínimo para la telemetría.
          setLastResponse({
            ok: result.ok && result.botResult.responseKind !== "none",
            reply: preview,
            telemetry: {
              modeUsed: effectiveMode,
              intent: result.botResult.intent ?? "?",
              toolsCalled: [],
              injectedRules: [],
              eventContext: null,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                estimatedCostCents: 0,
                model: "real-mode"
              }
            },
            note: `Modo Real · intent=${result.botResult.intent ?? "?"} · ${result.latencyMs}ms · provider ${result.providerAttempt.errorMessage ? "falló (esperado)" : "OK"}`
          });
        } else {
          // Modo Sandbox: solo LLM con system prompt override.
          const payload = {
            message: trimmed,
            history: newHistory,
            modeOverride: modeChoice === "db" ? null : modeChoice,
            leadContext: useRealLead && realLeadId.trim() !== ""
              ? { leadId: realLeadId.trim() }
              : null,
            ignoreLeadPause,
            tierOverride: tierChoice === "default" ? null : tierChoice
          };
          const r = await fetch("/api/admin/bot/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (!r.ok) {
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? `HTTP ${r.status}`);
          }
          const result = (await r.json()) as SimulateResponse;
          setLastResponse(result);
          if (result.ok && result.reply) {
            setHistory((h) => [
              ...h,
              {
                direction: "outbound",
                body: result.reply,
                timestamp: new Date().toISOString()
              }
            ]);
          }
          setSessionCostCents((c) => c + (result.telemetry.usage.estimatedCostCents ?? 0));
        }
        setSessionTurns((t) => t + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [
      history,
      modeChoice,
      useRealLead,
      realLeadId,
      ignoreLeadPause,
      tierChoice,
      sending,
      simulationMode,
      selectedSyntheticLeadId,
      effectiveMode
    ]
  );

  /**
   * Sprint v0.9.x PR #3: crea un lead sintético y lo selecciona.
   */
  const createSyntheticLeadAndSelect = useCallback(async () => {
    setCreatingSynthetic(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/bot/synthetic-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as { ok: boolean; lead?: SyntheticLeadSummary };
      if (j.ok && j.lead) {
        setSyntheticLeads((prev) => [j.lead!, ...prev]);
        setSelectedSyntheticLeadId(j.lead!.id);
      }
    } catch (err) {
      setError(
        `No se pudo crear el lead sintético: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setCreatingSynthetic(false);
    }
  }, []);

  /**
   * Sprint v0.9.x PR #3: borra TODOS los leads sintéticos. Requiere
   * doble confirmación (handled por el browser confirm()).
   */
  const cleanAllSyntheticLeads = useCallback(async () => {
    if (
      !window.confirm(
        "¿Borrar TODAS las personas sintéticas? Esto eliminará todos los leads de prueba y sus conversaciones (cascade). No se puede deshacer."
      )
    ) {
      return;
    }
    setCleaningSynthetic(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/bot/synthetic-leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true })
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as {
        ok: boolean;
        deletedLeads: number;
        deletedConversations: number;
        note?: string;
      };
      setSyntheticLeads([]);
      setSelectedSyntheticLeadId("");
      // Mostrar feedback breve como "error" positivo (color distinto
      // sería ideal, pero el sistema actual usa `error` para feedback).
      setError(
        `✅ Limpieza OK: ${j.deletedLeads} leads + ${j.deletedConversations} conversations borradas.`
      );
    } catch (err) {
      setError(
        `No se pudo limpiar: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setCleaningSynthetic(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastResponse(null);
    setSessionCostCents(0);
    setSessionTurns(0);
    setError(null);
  }, []);

  /**
   * Sprint v0.12: reset del contexto de un lead real (por phone).
   * Útil para que David pruebe el bot con su número entre sesiones
   * sin que el contexto (wizard state, lead_profile.summary) se acumule.
   * POST /api/admin/bot/reset-lead con { phone }.
   */
  const [resetPhone, setResetPhone] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const resetLeadContext = useCallback(async () => {
    const phone = resetPhone.trim();
    if (!phone) {
      setResetResult("⚠️ Ingresa un phone (ej. +526532935492)");
      return;
    }
    if (!window.confirm(`¿Olvidar el contexto del lead con phone ${phone}? El siguiente mensaje se trata como conversación nueva.`)) {
      return;
    }
    setResetting(true);
    setResetResult(null);
    try {
      const r = await fetch("/api/admin/bot/reset-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; cleared?: { outbounds: number; profiles: number; attendees: number } };
      if (j.ok) {
        const c = j.cleared ?? { outbounds: 0, profiles: 0, attendees: 0 };
        setResetResult(`✓ Contexto limpiado. Wizard state: ${c.outbounds} outbound${c.outbounds === 1 ? "" : "s"}, lead_profile: ${c.profiles}, attendees: ${c.attendees}.`);
      } else {
        setResetResult(`✗ Error: ${j.error ?? "desconocido"}`);
      }
    } catch (err) {
      setResetResult(`✗ Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResetting(false);
    }
  }, [resetPhone]);

  return (
    <div className="space-y-4">
      {/* Cabecera con garantías + acumulado de sesión */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="font-semibold mb-1">🧪 Laboratorio IA — Sandbox seguro</p>
        <p>
          Cero llamadas a Meta Cloud API · Cero escrituras en leads / conversaciones /
          contadores. Solo consume tokens del LLM (costo mostrado abajo en tiempo real).
        </p>
        {sessionTurns > 0 && (
          <p className="mt-2 text-xs font-mono">
            Sesión actual: <strong>{sessionTurns}</strong> turno{sessionTurns === 1 ? "" : "s"} ·
            Costo acumulado: <strong>${(sessionCostCents / 100).toFixed(4)} USD</strong>
          </p>
        )}
      </div>

      {/* Sprint v0.12: Reset del contexto de un lead (por phone).
          Útil para probar el bot con un número real entre sesiones. */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold">🔄 Olvidar contexto de un lead (por phone)</p>
        </div>
        <p className="text-xs mb-2">
          Limpia el wizard state del último outbound, el summary de
          lead_profile, y opcionalmente los event_attendees. El
          siguiente mensaje del phone se trata como conversación nueva.
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="tel"
            value={resetPhone}
            onChange={(e) => setResetPhone(e.target.value)}
            placeholder="+526532935492"
            disabled={resetting}
            className="flex-1 p-2 border border-amber-200 rounded-md text-sm font-mono"
          />
          <Button
            type="button"
            onClick={() => void resetLeadContext()}
            disabled={resetting || !resetPhone.trim()}
            className="text-sm px-3 py-2 bg-amber-600 text-white rounded"
          >
            {resetting ? "⏳" : "🔄"} Olvidar
          </Button>
        </div>
        {resetResult && (
          <p
            className={
              "text-xs mt-2 font-mono whitespace-pre-wrap " +
              (resetResult.startsWith("✓")
                ? "text-emerald-700"
                : resetResult.startsWith("⚠")
                ? "text-amber-700"
                : "text-red-700")
            }
          >
            {resetResult}
          </p>
        )}
      </div>

      {/* Controles superiores */}
      <Card>
        <CardBody className="space-y-3">
          {/* Sprint v0.9.x PR #3: selector de Modo de Simulación + panel Real */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink-muted">
              🧪 Modo de Simulación
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setSimulationMode("sandbox")}
                disabled={sending}
                className={
                  simulationMode === "sandbox"
                    ? "flex-1 bg-brand-500 text-white"
                    : "flex-1 bg-white border border-brand-200 text-ink"
                }
                aria-pressed={simulationMode === "sandbox"}
              >
                ⚡ Sandbox (solo LLM)
              </Button>
              <Button
                type="button"
                onClick={() => setSimulationMode("real")}
                disabled={sending}
                className={
                  simulationMode === "real"
                    ? "flex-1 bg-red-600 text-white"
                    : "flex-1 bg-white border border-red-200 text-red-700"
                }
                aria-pressed={simulationMode === "real"}
              >
                🔴 Real (flow completo)
              </Button>
            </div>
            {simulationMode === "real" && (
              <div
                className="rounded-lg border-2 border-red-500 bg-red-50 p-3 text-sm"
                role="alert"
              >
                <p className="font-bold text-red-800">
                  ⚠️ MODO REAL ACTIVO
                </p>
                <p className="text-red-700 mt-1">
                  Los mensajes se ejecutan contra el bot-engine completo
                  contra una persona sintética (marcada con{" "}
                  <code className="bg-white px-1 rounded">
                    simulation_source=&quot;admin_lab&quot;
                  </code>
                  ). El phone no existe en Meta, así que el provider
                  outbound fallará (esperado). Auto-desconexión: 30 min sin
                  actividad.
                </p>
              </div>
            )}
            {simulationMode === "real" && (
              <div className="space-y-2 border border-red-100 rounded-lg p-3 bg-red-50/30">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink-muted">
                    Personas sintéticas ({syntheticLeads.length})
                  </label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      onClick={() => void createSyntheticLeadAndSelect()}
                      disabled={creatingSynthetic || sending}
                      className="text-xs px-2 py-1 bg-brand-500 text-white rounded"
                    >
                      {creatingSynthetic ? "⏳" : "➕"} Crear
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void cleanAllSyntheticLeads()}
                      disabled={
                        cleaningSynthetic ||
                        sending ||
                        syntheticLeads.length === 0
                      }
                      className="text-xs px-2 py-1 bg-red-600 text-white rounded"
                    >
                      {cleaningSynthetic ? "⏳" : "🗑️"} Limpiar todo
                    </Button>
                  </div>
                </div>
                {syntheticLeads.length === 0 ? (
                  <p className="text-xs text-ink-muted italic">
                    No hay personas sintéticas. Crea una para empezar.
                  </p>
                ) : (
                  <select
                    className="w-full p-2 border border-red-200 rounded-md text-xs"
                    value={selectedSyntheticLeadId}
                    onChange={(e) =>
                      setSelectedSyntheticLeadId(e.target.value)
                    }
                    disabled={sending}
                  >
                    <option value="">— Selecciona una persona —</option>
                    {syntheticLeads.map((sl) => (
                      <option key={sl.id} value={sl.id}>
                        {sl.name} · {sl.phoneNormalized} ·{" "}
                        {sl.createdBy}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {/* Selector de Motor IA (Sprint v0.9.7 Switch Flash/Pro) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-muted">👤 Lead</label>
              <select
                className="w-full p-2 border border-brand-200 rounded-md text-sm"
                value={useRealLead ? "real" : "ficticio"}
                onChange={(e) => setUseRealLead(e.target.value === "real")}
                disabled={sending}
              >
                <option value="ficticio">⚡ Lead Ficticio Sandbox</option>
                <option value="real">Lead del CRM (UUID)</option>
              </select>
              {useRealLead && (
                <Input
                  type="text"
                  placeholder="UUID del lead (ej. 36249ecd-...)"
                  value={realLeadId}
                  onChange={(e) => setRealLeadId(e.target.value)}
                  disabled={sending}
                  className="text-xs font-mono"
                />
              )}
            </div>

            {/* Selector de Modo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-muted">🎛️ Modo del Bot</label>
              <select
                className="w-full p-2 border border-brand-200 rounded-md text-sm"
                value={modeChoice}
                onChange={(e) => setModeChoice(e.target.value as "db" | BotMode)}
                disabled={sending}
              >
                <option value="db">📡 Modo BD Actual ({MODE_EMOJI[currentMode]} {MODE_LABELS[currentMode]})</option>
                <optgroup label="Override temporal (no persiste)">
                  <option value="super_executive">🚀 Súper Ejecutivo (override)</option>
                  <option value="socratic_autopilot_v2">🟢 Socrático v2 (override)</option>
                  <option value="socratic_no_tools_v1">🔵 Socrático v1 (override)</option>
                  <option value="human_first">🧪 Estilo Humano (override)</option>
                </optgroup>
              </select>
              {modeChoice !== "db" && (
                <p className="text-[10px] text-amber-700 italic">
                  ⚠️ Override: el simulador usará este modo aunque la DB diga otro. No se persiste.
                </p>
              )}
            </div>

            {/* Selector de Motor IA (Sprint v0.9.7 Switch Flash/Pro) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-muted">⚡ Motor IA</label>
              <select
                className="w-full p-2 border border-brand-200 rounded-md text-sm"
                value={tierChoice}
                onChange={(e) =>
                  setTierChoice(e.target.value as "default" | "flash" | "pro")
                }
                disabled={sending}
              >
                <option value="default">📡 Default BD (Flash + escalación Pro)</option>
                <option value="flash">⚡ Flash (rápido · deepseek-chat)</option>
                <option value="pro">🧠 Pro (deep reasoning · deepseek-reasoner)</option>
              </select>
              <p className="text-[10px] text-ink-muted italic">
                {tierChoice === "default"
                  ? "Flash por defecto; escala a Pro si falla o la confianza es < 70%."
                  : tierChoice === "flash"
                    ? "Fuerza Flash (<1.5s, 4x más barato). Útil para tests de latencia."
                    : "Fuerza Pro (~6s, baja tolerancia a error). Útil para prompts complejos."}
              </p>
            </div>

            {/* Toggle pausa */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-muted">⚙️ Controles</label>
              <label className="flex items-center gap-2 p-2 border border-brand-100 rounded-md cursor-pointer hover:bg-brand-50/40">
                <input
                  type="checkbox"
                  checked={ignoreLeadPause}
                  onChange={(e) => setIgnoreLeadPause(e.target.checked)}
                  disabled={sending}
                  className="h-4 w-4 accent-brand-500"
                />
                <span className="text-xs" title="Si la casilla 'Ignorar pausa' está activa, el simulador responderá aunque en producción el lead tenga el bot pausado.">
                  ☑️ Ignorar pausa per-lead
                </span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                disabled={sending || history.length === 0}
                className="w-full"
              >
                🧹 Limpiar historial
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Split view */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ====== Columna izquierda: Chat Sandbox ====== */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-ink">💬 Chat Sandbox</h2>
            <p className="text-xs text-ink-muted mt-1">
              {MODE_EMOJI[effectiveMode]} Modo activo: {MODE_LABELS[effectiveMode]}
              {" · "}
              {history.filter((m) => m.direction === "inbound").length} mensaje(s) enviado(s)
            </p>
          </CardHeader>
          <CardBody>
            <div
              ref={chatScrollRef}
              className="h-80 overflow-y-auto rounded-lg border border-brand-100 bg-slate-50/40 p-3 space-y-2"
              aria-live="polite"
            >
              {history.length === 0 ? (
                <p className="text-sm text-ink-muted text-center py-8">
                  Aún no hay mensajes. Escribe algo abajo para empezar.
                </p>
              ) : (
                history.map((m, i) => (
                  <div
                    key={i}
                    className={
                      "flex " + (m.direction === "inbound" ? "justify-end" : "justify-start")
                    }
                  >
                    <div
                      className={
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm " +
                        (m.direction === "inbound"
                          ? "bg-brand-500 text-white rounded-br-sm"
                          : "bg-white border border-brand-200 text-ink rounded-bl-sm")
                      }
                    >
                      <div className="text-[10px] uppercase tracking-wide mb-1 opacity-75">
                        {m.direction === "inbound" ? "Tú" : "Bot"}
                      </div>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-brand-200 rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-ink-muted">
                    <span className="animate-pulse">● ● ●</span> pensando…
                  </div>
                </div>
              )}
            </div>

            {/* Input + botón enviar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="mt-3 flex gap-2"
            >
              <Input
                type="text"
                placeholder="Escribe un mensaje como si fueras el lead…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                className="flex-1"
                aria-label="Mensaje para el simulador"
              />
              <Button type="submit" disabled={sending || !input.trim()}>
                {sending ? "⏳" : "📤"} Enviar
              </Button>
            </form>

            {error && (
              <p className="mt-2 text-xs text-red-700" role="alert">
                ❌ {error}
              </p>
            )}
          </CardBody>
        </Card>

        {/* ====== Columna derecha: Telemetría "Rayos X" ====== */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-ink">🧠 Rayos X del Cerebro</h2>
            <p className="text-xs text-ink-muted mt-1">
              Telemetría del último turno (modo, costo, intención, herramientas, contexto).
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            {!lastResponse ? (
              <p className="text-sm text-ink-muted text-center py-8">
                Envía un mensaje para ver la telemetría del turno.
              </p>
            ) : (
              <>
                {/* Modo + Costo + Tokens */}
                <div className="rounded-lg border border-brand-100 p-3 bg-brand-50/30">
                  <p className="text-xs font-semibold text-ink-muted mb-1">
                    🟢 Modo y Costo
                  </p>
                  <p className="text-sm">
                    <Badge tone="success" className="mr-2 font-bold">
                      {MODE_EMOJI[lastResponse.telemetry.modeUsed]}{" "}
                      {MODE_LABELS[lastResponse.telemetry.modeUsed]}
                    </Badge>
                  </p>
                  <p className="text-xs font-mono text-ink-muted mt-2">
                    Tokens: <strong>{lastResponse.telemetry.usage.promptTokens}</strong> prompt
                    {" / "}
                    <strong>{lastResponse.telemetry.usage.completionTokens}</strong> completion
                    {" / "}
                    <strong>{lastResponse.telemetry.usage.totalTokens}</strong> total
                  </p>
                  <p className="text-xs font-mono text-ink-muted">
                    Costo del turno:{" "}
                    <strong>
                      ${(lastResponse.telemetry.usage.estimatedCostCents / 100).toFixed(5)} USD
                    </strong>
                    {" · "}
                    modelo: <code>{lastResponse.telemetry.usage.model}</code>
                  </p>
                </div>

                {/* Intención + Tools */}
                <div className="rounded-lg border border-brand-100 p-3">
                  <p
                    className="text-xs font-semibold text-ink-muted mb-1"
                    title="Clasificación semántica del mensaje (ej. pregunta general, intento de inscripción o escalación) + funciones internas consultadas por el modelo (ej. extract-contact para guardar datos)."
                  >
                    🎯 Intención &amp; Herramientas ℹ️
                  </p>
                  <p className="text-[10px] text-ink-muted italic mb-1">
                    Clasificación semántica del mensaje + funciones internas consultadas por el modelo (ej. <code>extract-contact</code>).
                  </p>
                  <p className="text-sm">
                    Intent: <code className="bg-slate-100 px-1 rounded">{lastResponse.telemetry.intent}</code>
                  </p>
                  <p className="text-sm mt-1">
                    Tools:{" "}
                    {lastResponse.telemetry.toolsCalled.length === 0 ? (
                      <span className="text-ink-muted italic">(ninguna)</span>
                    ) : (
                      lastResponse.telemetry.toolsCalled.map((t) => (
                        <Badge key={t} tone="info" className="mr-1">
                          {t}
                        </Badge>
                      ))
                    )}
                  </p>
                </div>

                {/* Reglas de Oro inyectadas */}
                <div className="rounded-lg border border-brand-100 p-3">
                  <button
                    onClick={() => setRulesOpen((v) => !v)}
                    className="w-full text-left flex items-center justify-between"
                    aria-expanded={rulesOpen}
                    title="Directivas de máxima prioridad (ai_bot_rules) que el bot obedeció en este turno. Top N por puntaje se inyectan al prompt."
                  >
                    <p className="text-xs font-semibold text-ink-muted">
                      🧠 Reglas de Oro Inyectadas ({lastResponse.telemetry.injectedRules.length}) ℹ️
                    </p>
                    <span aria-hidden="true">{rulesOpen ? "▲" : "▼"}</span>
                  </button>
                  <p className="text-[10px] text-ink-muted italic mt-1">
                    Directivas de máxima prioridad (<code>ai_bot_rules</code>) que el bot obedeció en este turno.
                  </p>
                  {rulesOpen && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {lastResponse.telemetry.injectedRules.length === 0 ? (
                        <li className="text-ink-muted italic">
                          (ninguna regla activa; el bot responde sin Reglas de Oro)
                        </li>
                      ) : (
                        lastResponse.telemetry.injectedRules.map((r, i) => (
                          <li
                            key={i}
                            className="border-l-2 border-brand-300 pl-2 text-ink-soft"
                          >
                            <span className="font-mono text-[10px] text-ink-muted">
                              [{r.priority}] {r.scope}
                            </span>
                            <br />
                            {r.instruction}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>

                {/* Evento activo */}
                <div className="rounded-lg border border-brand-100 p-3">
                  <button
                    onClick={() => setEventOpen((v) => !v)}
                    className="w-full text-left flex items-center justify-between"
                    aria-expanded={eventOpen}
                    title="Masterclass o Taller cargado desde BD sobre el cual la IA calculó su respuesta y precios. Solo eventos que inician en el futuro o hace menos de 6h (margen de gracia)."
                  >
                    <p className="text-xs font-semibold text-ink-muted">
                      📅 Contexto de Evento Activo ℹ️
                    </p>
                    <span aria-hidden="true">{eventOpen ? "▲" : "▼"}</span>
                  </button>
                  <p className="text-[10px] text-ink-muted italic mt-1">
                    Masterclass o Taller cargado desde BD sobre el cual la IA calculó su respuesta y precios.
                  </p>
                  {eventOpen && (
                    <div className="mt-2 text-xs">
                      {lastResponse.telemetry.eventContext ? (
                        <p>
                          <strong>Evento:</strong> {lastResponse.telemetry.eventContext}
                        </p>
                      ) : (
                        <p className="text-ink-muted italic">
                          (ninguno — la simulación corre sin contexto de evento)
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Note técnico */}
                {lastResponse.note && (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] font-mono text-ink-muted">
                    <summary className="cursor-pointer">🔧 Debug note del provider</summary>
                    <pre className="mt-1 whitespace-pre-wrap">{lastResponse.note}</pre>
                  </details>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
