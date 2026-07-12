"use client";
/**
 * Sprint v0.9.6 — BotSimulatorTab: Laboratorio IA / Simulador de WhatsApp.
 *
 * UI en pantalla dividida:
 *   - Izquierda: chat sandbox (burbujas, input con Enter, limpiar historial).
 *   - Derecha: panel de telemetría ("Rayos X del Cerebro") que se actualiza
 *     con cada respuesta del bot: modo, costo, tokens, intent, tools,
 *     reglas inyectadas, evento activo.
 *
 * Controles superiores:
 *   - Selector de Lead (Ficticio Sandbox / Lead del CRM).
 *   - Selector de Modo (Modo BD Actual / Override: Súper Ejecutivo, v2, v1).
 *   - Checkbox "Ignorar pausa per-lead".
 *
 * Aislamiento: este componente NUNCA toca Meta / Supabase directamente.
 * Toda la lógica de simulación pasa por `POST /api/admin/bot/simulate`,
 * que es el ÚNICO punto de contacto con el backend.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader, Button, Input, Badge } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Tipos espejo del endpoint (ver `src/lib/ai/simulator.ts`)            */
/* ------------------------------------------------------------------ */

type BotMode = "socratic_autopilot_v2" | "socratic_no_tools_v1" | "super_executive";

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
  super_executive: "🚀 Súper Ejecutivo"
};

const MODE_EMOJI: Record<BotMode, string> = {
  socratic_autopilot_v2: "🟢",
  socratic_no_tools_v1: "🔵",
  super_executive: "🚀"
};

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

  // Acumulador de telemetría (necesario para los "Rayos X").
  const [rulesOpen, setRulesOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  // Ref para auto-scroll del chat al último mensaje.
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [history]);

  const effectiveMode: BotMode = useMemo(() => {
    return modeChoice === "db" ? currentMode : modeChoice;
  }, [modeChoice, currentMode]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

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

      const payload = {
        message: trimmed,
        history: newHistory,
        modeOverride: modeChoice === "db" ? null : modeChoice,
        leadContext: useRealLead && realLeadId.trim() !== ""
          ? { leadId: realLeadId.trim() }
          : null,
        ignoreLeadPause
      };

      try {
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

        // Inyectar la respuesta del bot al historial para mantener el
        // contexto conversacional (es lo que se manda en la próxima
        // request como parte de `history`).
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
        setSessionTurns((t) => t + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [history, modeChoice, useRealLead, realLeadId, ignoreLeadPause, sending]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastResponse(null);
    setSessionCostCents(0);
    setSessionTurns(0);
    setError(null);
  }, []);

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

      {/* Controles superiores */}
      <Card>
        <CardBody className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            {/* Selector de Lead */}
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
                </optgroup>
              </select>
              {modeChoice !== "db" && (
                <p className="text-[10px] text-amber-700 italic">
                  ⚠️ Override: el simulador usará este modo aunque la DB diga otro. No se persiste.
                </p>
              )}
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
                <span className="text-xs">☑️ Ignorar pausa per-lead</span>
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
                  <p className="text-xs font-semibold text-ink-muted mb-1">
                    🎯 Intención & Herramientas
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
                  >
                    <p className="text-xs font-semibold text-ink-muted">
                      🧠 Reglas de Oro Inyectadas ({lastResponse.telemetry.injectedRules.length})
                    </p>
                    <span aria-hidden="true">{rulesOpen ? "▲" : "▼"}</span>
                  </button>
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
                  >
                    <p className="text-xs font-semibold text-ink-muted">
                      📅 Contexto de Evento Activo
                    </p>
                    <span aria-hidden="true">{eventOpen ? "▲" : "▼"}</span>
                  </button>
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
