"use client";
/**
 * BotConfigTab — Torre de Control del Bot de WhatsApp (sprint v15 PR #1).
 *
 * Single-file Client Component. Renderiza 2 sub-pestañas:
 *  1. ⚙️ Configuración & Reglas (sprint v15-v16): el contenido histórico
 *     (selector de modos, bloques, reglas, métricas, radar, controles).
 *  2. 🧪 Laboratorio (Simulador) (sprint v0.9.6): sub-componente
 *     `BotSimulatorTab` que renderiza un chat sandbox + telemetría.
 *
 * PR #1: el modo `super_executive` se renderiza como 🔒 Próximamente (no activable).
 * PR #2 habilitó el modo y el System Prompt correspondiente.
 * Sprint v0.9.6 agregó la sub-pestaña del Laboratorio.
 */

import { useState, useTransition, useEffect, useCallback } from "react";
import { Card, CardBody, CardHeader, Button, Badge, Input } from "@/components/ui";
import { BotSimulatorTab } from "@/components/admin/BotSimulatorTab";
import { ResetTestLeadButton } from "@/components/admin/ResetTestLeadButton";
import {
  createBotRuleAction,
  updateBotRuleAction,
  deleteBotRuleAction,
  toggleBotRuleAction,
  fetchActiveRulesAction,
  type BotRule,
  type BotRuleMetadata,
} from "@/lib/ai/ai-bot-rules-actions";

/* ------------------------------------------------------------------ */
/* Constantes y tipos                                                   */
/* ------------------------------------------------------------------ */

type BotMode =
  | "socratic_autopilot_v2"
  | "socratic_no_tools_v1"
  | "super_executive"
  | "human_first"
  // FIX 2026-07-19 (sprint bot v2): sync con BotGlobalMode.
  | "super_executive_v2";
// FIXME: SSOT vive en `src/lib/admin/system-settings-server.ts` (`BotGlobalMode`).
// Refactor pendiente: unificar en un solo archivo de types.

interface BlockToggle {
  key: keyof ContextBlocks;
  label: string;
  description: string;
}

interface ContextBlocks {
  uxHook: boolean;
  crmHistory: boolean;
  activeEvent: boolean;
  coursesCatalog: boolean;
  humanRules: boolean;
  semanticGuardrails: boolean;
}

const BLOCKS: BlockToggle[] = [
  {
    key: "uxHook",
    label: "🎯 Directiva UX Hook / Captura Inmediata",
    description: "Calidez y persuasión ética antes de pedir datos pesados.",
  },
  {
    key: "crmHistory",
    label: "🧲 Historial CRM (crmStage y VSL)",
    description: "Etapa del prospecto, masterclass vista, clics previos.",
  },
  {
    key: "activeEvent",
    label: "🎟️ Evento / Masterclass Activo",
    description: "Datos del próximo evento publicado.",
  },
  {
    key: "coursesCatalog",
    label: "📚 Catálogo de Cursos y Diplomados",
    description: "Cursos activos y condiciones comerciales oficiales.",
  },
  {
    key: "humanRules",
    label: "🧠 Reglas de Oro (ai_bot_rules)",
    description: "Top 8 instrucciones activas del equipo humano.",
  },
  {
    key: "semanticGuardrails",
    label: "🚨 Guardrails Semánticos de Escalación",
    description: "Detección de [[ESCALATE_HUMAN]] y derivación a humano.",
  },
];

const DEFAULT_BLOCKS: ContextBlocks = {
  uxHook: true,
  crmHistory: true,
  activeEvent: true,
  coursesCatalog: true,
  humanRules: true,
  semanticGuardrails: true,
};

interface BotStats {
  total_bot_messages_24h: number;
  total_bot_messages_7d: number;
  paused_leads_count: number;
  pause_reasons: {
    keyword_escalation: number;
    ai_semantic_escalation: number;
    manual: number;
  };
  bot_global_mode: string | null;
  bot_max_active_rules: number;
  // Sprint v16 PR #2.2 — Radar de Costos.
  bot_usage_today: {
    prompt_tokens: number;
    completion_tokens: number;
    call_count: number;
    estimated_cost_cents: number;
  } | null;
  bot_usage_projection_30d_cents: number;
  whatsapp_free_quota_used_30d: number;
  whatsapp_free_quota_total: number;
  whatsapp_free_quota_note: string;
  bot_paused_global: boolean;
  bot_daily_outbound_limit: number;
  bot_daily_outbound_count: number;
  generated_at: string;
}

/* ------------------------------------------------------------------ */
/* Componente                                                           */
/* ------------------------------------------------------------------ */

export function BotConfigTab() {
  const [mode, setMode] = useState<BotMode>("socratic_autopilot_v2");
  const [blocks, setBlocks] = useState<ContextBlocks>(DEFAULT_BLOCKS);
  const [rules, setRules] = useState<BotRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  // Sprint v16 PR #2.3: state de los controles de pausa global + kill-switch.
  const [togglingGlobalPause, setTogglingGlobalPause] = useState(false);
  // Sprint v16 Hotfix #3: mientras se persiste `onSelectMode` en
  // system_settings vía /api/admin/bot/mode, deshabilitamos los botones
  // para evitar doble click + rollback fantasma.
  const [modeSaving, setModeSaving] = useState(false);
  const [newRule, setNewRule] = useState<{
    instruction: string;
    priority: number;
    scope: string;
    discount_percent: string;
    valid_until: string;
  }>({
    instruction: "",
    priority: 5,
    scope: "global",
    discount_percent: "",
    valid_until: "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acordeonAbierto, setAcordeonAbierto] = useState(false);
  // Sprint v0.9.6 (Laboratorio IA): sub-pestañas dentro de BotConfigTab.
  // Default "config" para que既存体験 no cambie. La pestaña "simulator"
  // monta `BotSimulatorTab` (split view + telemetría).
  const [subtab, setSubtab] = useState<"config" | "simulator">("config");

  // Reglas: el form de nueva regla se gestiona vía server actions.
  // La lista de reglas se carga vía server action en PR #1 y se refresca
  // tras cada create/update/delete para mantener el estado sincronizado.
  const refreshRules = useCallback(() => {
    // En PR #1 la lista se recarga llamando a la action que devuelve las reglas activas.
    setRulesLoading(true);
    void fetchActiveRulesAction()
      .then((r) => setRules(r))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error al cargar reglas");
      })
      .finally(() => setRulesLoading(false));
  }, []);

  // Sprint v16 PR #2.3: handler para toggle del switch maestro global (M4).
  // FIX 2026-07-12: re-fetch inline (no llamar refreshStats por forward
  // reference). El componente se re-renderiza cuando setStats() corre.
  const handleToggleGlobalPause = useCallback(async () => {
    setTogglingGlobalPause(true);
    try {
      const res = await fetch("/api/admin/bot/global-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botPausedGlobal: !(stats?.bot_paused_global === true) })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // Refetch manual del stats para reflejar el nuevo estado.
      const r2 = await fetch("/api/admin/bot/stats", { cache: "no-store" });
      const j2 = (await r2.json()) as { ok: boolean; data?: BotStats; error?: string };
      if (j2.ok && j2.data) setStats(j2.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingGlobalPause(false);
    }
  }, [stats]);

  // Sprint v16 PR #2.3: handler para cambiar el límite diario.
  // FIX 2026-07-12 (auditoría v16 #A1): comparar valor previo antes
  // de POST. El input dispara onChange por cada keystroke; sin este
  // guard, teclear "100" hace 3 round-trips al server y 3 escrituras
  // en system_settings.
  //
  // FIX 2026-07-12 (auditoría v16 #A4): el endpoint /api/admin/bot/stats
  // se consulta tras el POST. Validamos 2xx inline (best-effort: si
  // falla el refresh, el siguiente poll reconcilia).
  const handleChangeDailyLimit = useCallback(
    async (newLimit: number) => {
      // A1: no-op si el valor no cambió.
      if (newLimit === stats?.bot_daily_outbound_limit) return;
      try {
        const r1 = await fetch("/api/admin/system-setting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "bot_daily_outbound_limit", value: newLimit })
        });
        if (!r1.ok) {
          const j = (await r1.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r1.status}`);
        }
        // Refetch inline.
        const r2 = await fetch("/api/admin/bot/stats", { cache: "no-store" });
        if (!r2.ok) return; // best-effort; el próximo poll reconcilia.
        const j2 = (await r2.json()) as { ok: boolean; data?: BotStats; error?: string };
        if (j2.ok && j2.data) setStats(j2.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [stats?.bot_daily_outbound_limit]
  );

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch("/api/admin/bot/stats", { cache: "no-store" });
      const j = (await r.json()) as { ok: boolean; data?: BotStats; error?: string };
      if (j.ok && j.data) {
        setStats(j.data);
        if (j.data.bot_global_mode) setMode(j.data.bot_global_mode as BotMode);
      } else {
        setError(j.error ?? "Error al cargar métricas.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const onToggleBlock = (key: keyof ContextBlocks) => {
    setBlocks((b) => ({ ...b, [key]: !b[key] }));
  };

  // Sprint v16 Hotfix #3 — persistencia real de la selección de modo.
  //
  // Antes (sprint v15 PR #1 / v16 PR #2): `onSelectMode` solo cambiaba el
  // estado local. El backend (provider deepseek) seguía leyendo el modo
  // viejo de system_settings hasta que el caché TTL 30s expirara. Eso es
  // exactamente el "medio segundo" en el que la UI y el backend desfasaban.
  //
  // Ahora: optimistic update + POST a `/api/admin/bot/mode` (endpoint
  // dedicado que la auditoría v16 R2 anticipaba) + refetch de stats para
  // reconciliar `bot_global_mode` con la SSOT. Si el POST falla → rollback
  // del modo local + mostrar el error. No-op si ya está activo.
  const onSelectMode = useCallback(
    async (m: BotMode) => {
      if (modeSaving) return; // evita doble click durante el POST
      if (m === mode) return; // no-op si ya es el modo activo
      const prev = mode;
      setMode(m); // optimistic
      setModeSaving(true);
      try {
        const r1 = await fetch("/api/admin/bot/mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: m })
        });
        if (!r1.ok) {
          const j = (await r1.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r1.status}`);
        }
        // Reconciliar con la SSOT: refetch de stats para que
        // `stats.bot_global_mode` refleje el valor persistido.
        const r2 = await fetch("/api/admin/bot/stats", { cache: "no-store" });
        if (r2.ok) {
          const j2 = (await r2.json()) as { ok: boolean; data?: BotStats; error?: string };
          if (j2.ok && j2.data) {
            setStats(j2.data);
            // Sincronización explícita: si la SSOT trae un valor distinto
            // al optimistic (carrera con otro admin), adoptamos el de DB.
            if (j2.data.bot_global_mode && j2.data.bot_global_mode !== m) {
              setMode(j2.data.bot_global_mode as BotMode);
            }
          }
        }
      } catch (err) {
        setMode(prev); // rollback: el modo local vuelve al valor anterior
        setError(
          err instanceof Error
            ? err.message
            : "Error al guardar modo en base de datos"
        );
      } finally {
        setModeSaving(false);
      }
    },
    [mode, modeSaving]
  );

  const onCreateRule = () => {
    setError(null);
    const instruction = newRule.instruction.trim();
    if (!instruction) {
      setError("La instrucción no puede estar vacía.");
      return;
    }
    const metadata: BotRuleMetadata = {};
    const dp = Number(newRule.discount_percent);
    if (newRule.discount_percent && Number.isFinite(dp) && dp > 0) {
      if (!newRule.valid_until) {
        setError("Para autorizar un descuento debes especificar la fecha de vigencia.");
        return;
      }
      metadata.discount_percent = dp;
      metadata.valid_until = newRule.valid_until;
    }
    startTransition(async () => {
      const res = await createBotRuleAction({
        scope: newRule.scope || "global",
        instruction,
        priority: newRule.priority,
        is_active: true,
        expires_at: null,
        metadata,
      });
      if (!res.ok) {
        setError(res.error ?? "Error al crear regla.");
        return;
      }
      setRules((rs) => [...rs, res.data as BotRule]);
      setShowNewRuleModal(false);
      setNewRule({
        instruction: "",
        priority: 5,
        scope: "global",
        discount_percent: "",
        valid_until: "",
      });
      refreshRules();
    });
  };

  const onToggleRule = (id: string, isActive: boolean) => {
    startTransition(async () => {
      const res = await toggleBotRuleAction(id, isActive);
      if (res.ok && res.data) {
        setRules((rs) => rs.map((r) => (r.id === id ? (res.data as BotRule) : r)));
      } else {
        setError(res.error ?? "Error al alternar regla.");
      }
    });
  };

  const onDeleteRule = (id: string) => {
    if (!window.confirm("¿Eliminar esta regla? Esta acción no se puede deshacer.")) return;
    startTransition(async () => {
      const res = await deleteBotRuleAction(id);
      if (res.ok) {
        setRules((rs) => rs.filter((r) => r.id !== id));
      } else {
        setError(res.error ?? "Error al eliminar regla.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Sprint v0.9.6: sub-navegación Configuración / Laboratorio. */}
      <div
        role="tablist"
        aria-label="Secciones de la Torre de Control"
        className="flex gap-2 border-b border-brand-100 pb-2"
      >
        <button
          role="tab"
          aria-selected={subtab === "config"}
          onClick={() => setSubtab("config")}
          className={
            "px-4 py-2 rounded-t-lg text-sm font-semibold transition " +
            (subtab === "config"
              ? "bg-brand-500 text-white"
              : "bg-brand-50 text-ink-soft hover:bg-brand-100")
          }
        >
          ⚙️ Configuración & Reglas
        </button>
        <button
          role="tab"
          aria-selected={subtab === "simulator"}
          onClick={() => setSubtab("simulator")}
          className={
            "px-4 py-2 rounded-t-lg text-sm font-semibold transition " +
            (subtab === "simulator"
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 text-ink-soft hover:bg-emerald-100")
          }
        >
          🧪 Laboratorio (Simulador)
        </button>
      </div>

      {subtab === "simulator" ? (
        <BotSimulatorTab currentMode={mode} />
      ) : (
        <>
      {/* 0. Reset Lead de Testing (sprint 2026-07-15) */}
      <ResetTestLeadButton />

      {/* 1. Selector de Modos */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-ink">Modo Global del Bot</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          {/*
            Sprint v16 Hotfix #3 — anti-flicker de carga.

            Antes: useState inicializaba `mode = "socratic_autopilot_v2"`
            por defecto y medio segundo después, cuando `fetchStats()`
            terminaba, saltaba a `stats.bot_global_mode`. Eso dibujaba un
            modo falso por ~500ms antes de sincronizar con la SSOT.

            Ahora: mientras `statsLoading === true && stats === null`
            (carga inicial sin respuesta aún), mostramos skeleton
            placeholder. Solo cuando llega la primera respuesta pintamos
            las 3 ModeTarjeta con el modo activo real. Después, los
            cambios de modo vía `onSelectMode` actualizan al instante
            (optimistic + POST + refetch).
          */}
          {statsLoading && !stats ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              <p className="text-sm text-ink-muted">
                Cargando configuración activa desde base de datos…
              </p>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-32 rounded-xl border border-slate-200 bg-slate-50 animate-pulse"
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <ModeTarjeta
                icon="🟢"
                titulo="Modo Socrático / Autopilot v2"
                descripcion="Flujo consultivo socrático e invocación automática de herramientas (extract-contact)."
                activo={mode === "socratic_autopilot_v2"}
                disabled={modeSaving}
                onClick={() => void onSelectMode("socratic_autopilot_v2")}
              />
              <ModeTarjeta
                icon="🔵"
                titulo="Modo Socrático sin Herramientas v1"
                descripcion="Modo LLM single-shot (deepseek_tools_enabled = false). Sin tool-calling."
                activo={mode === "socratic_no_tools_v1"}
                disabled={modeSaving}
                onClick={() => void onSelectMode("socratic_no_tools_v1")}
              />
              <ModeTarjeta
                icon="🚀"
                titulo="Agente Comercial Súper Ejecutivo"
                descripcion="Closer consultivo proactivo con Directiva UX Hook y escalación semántica."
                activo={mode === "super_executive"}
                disabled={modeSaving}
                badge="⚡ LISTO / ACTIVO"
                onClick={() => void onSelectMode("super_executive")}
              />
              <ModeTarjeta
                icon="🧪"
                titulo="Modo Estilo Humano (Conversacional Directo)"
                descripcion="El bot actúa como un humano conversando directamente de forma natural y fluida con el usuario. El LLM gestiona la conversación sin menús ni reglas rígidas."
                activo={mode === "human_first"}
                disabled={modeSaving}
                badge="🧪 EXPERIMENTO"
                onClick={() => void onSelectMode("human_first")}
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* 2. Toggles de Bloques de Contexto */}
      {/* FIX 2026-07-12 (Sprint v16 hotfix UI #7): banner de claridad
          para que el admin entienda que las Reglas de Oro y los
          Bloques de Contexto aplican a los 3 modos por igual. */}
      <div
        className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="note"
        aria-live="polite"
      >
        <p className="font-semibold mb-1">ℹ️ Las Reglas de Oro y Bloques de Contexto aplican por igual</p>
        <p>
          Estos ajustes alimentan a los 4 modos (Socrático v1, Socrático v2,
          Súper Ejecutivo y Human-First). Cambiar de modo NO desactiva las
          reglas ni los bloques que configures aquí.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-lg font-semibold text-ink">Bloques de Contexto</h2>
            <p className="text-xs text-ink-muted mt-1">
              Interruptores para los 6 módulos del prompt. Si los desactivas todos,
              entra el modo de emergencia: identidad Qlick + saludo inicial solo.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          {BLOCKS.map((b) => (
            <label
              key={b.key}
              className="flex items-start gap-3 p-3 rounded-lg border border-brand-100 hover:bg-brand-50/40 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={blocks[b.key]}
                onChange={() => onToggleBlock(b.key)}
                className="mt-1 h-4 w-4 accent-brand-500"
                aria-label={b.label}
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">{b.label}</div>
                <div className="text-xs text-ink-muted">{b.description}</div>
              </div>
            </label>
          ))}
        </CardBody>
      </Card>

      {/* 3. Reglas de Oro (CRUD) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Reglas de Oro (ai_bot_rules)</h2>
              <p className="text-xs text-ink-muted mt-1">
                Top {stats?.bot_max_active_rules ?? 8} por prioridad se inyectan al prompt del bot.
              </p>
            </div>
            <Button
              onClick={() => setShowNewRuleModal(true)}
              size="sm"
              disabled={pending}
            >
              + Nueva regla
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {rules.length === 0 ? (
            <p className="text-sm text-ink-muted py-4 text-center">
              Aún no hay reglas. Crea la primera con &quot;+ Nueva regla&quot;.
            </p>
          ) : (
            <>
            {/* FIX 2026-07-12 (hotfix UI #2.2): Guía Rápida colapsable
                arriba de la tabla. Antes había un banner ámbar del
                sprint v15 PR #1 (ya mergeado). Ahora la guía explica
                en lenguaje llano cómo funcionan las reglas. */}
            <details
              open
              className="mb-4 rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-sm text-ink-soft"
            >
              <summary className="cursor-pointer font-semibold text-ink">
                📚 Guía Rápida: Cómo usar las Reglas de Oro
              </summary>
              <div className="mt-3 space-y-3 leading-relaxed">
                <p>
                  Las <strong>Reglas de Oro</strong> son instrucciones que se
                  inyectan en el prompt del bot. Las top&nbsp;
                  {stats?.bot_max_active_rules ?? 8} por prioridad entran a
                  cada respuesta que el bot genera.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Prioridad (1-100):</strong> si dos reglas chocan,
                    gana la del número más alto. Ejemplo: una regla de
                    prioridad <code>100</code> siempre vence a una de{" "}
                    <code>10</code>. Las top&nbsp;
                    {stats?.bot_max_active_rules ?? 8} por puntaje se inyectan
                    al prompt en cada turno.
                  </li>
                  <li>
                    <strong>Alcance (Scope):</strong>{" "}
                    <code>global</code> aplica a todo el CRM, sin importar qué
                    curso o evento consulte el lead. Los scopes{" "}
                    <code>curso_&lt;slug&gt;</code> o{" "}
                    <code>evento_&lt;slug&gt;</code> se encienden solo cuando
                    el lead pregunta por ese ítem específico. Úsalo para
                    reglas de precio o vigencia de un solo producto.
                  </li>
                  <li>
                    <strong>Descuentos:</strong> el bot puede ofrecer una
                    promo temporal con los campos{" "}
                    <code>discount_percent</code> y <code>valid_until</code>.
                    Sirve para que el bot mencione una rebaja por tiempo
                    limitado sin violar los guardrails de precios
                    canónicos.
                  </li>
                </ul>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Ejemplos claros
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <strong>Prioridad 100 · Global:</strong>{" "}
                      <em>
                        &quot;Si preguntan por factura, decir que los precios
                        incluyen IVA y emitimos factura en 24h.&quot;
                      </em>
                    </li>
                    <li>
                      <strong>Prioridad 80 ·{" "}
                      <code>curso_marketing-avanzado</code>:</strong>{" "}
                      <em>
                        &quot;Si el lead pregunta por el curso de marketing
                        avanzado, menciona que el primer módulo es gratis
                        y el certificado es digital.&quot;
                      </em>
                    </li>
                    <li>
                      <strong>Prioridad 60 · Global:</strong>{" "}
                      <em>
                        &quot;Si dicen &apos;gracias&apos;, responde breve y
                        ofrece agendar una llamada con un humano.&quot;
                      </em>
                    </li>
                  </ul>
                </div>
              </div>
            </details>
            <table className="w-full text-sm">
              <thead className="text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Instrucción</th>
                  <th className="text-left px-3 py-2">Alcance</th>
                  <th className="text-left px-3 py-2">Prioridad</th>
                  <th className="text-left px-3 py-2"># Inyecciones</th>
                  <th className="text-left px-3 py-2">Activa</th>
                  <th className="text-left px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink max-w-md">
                      <div className="line-clamp-2">{r.instruction}</div>
                      {r.metadata.discount_percent !== undefined && (
                        <Badge tone="warning" className="mt-1">
                          {r.metadata.discount_percent}% OFF
                          {r.metadata.valid_until ? ` · hasta ${r.metadata.valid_until}` : ""}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{r.scope}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.priority}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.usage_count}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.is_active}
                        onChange={(e) => onToggleRule(r.id, e.target.checked)}
                        disabled={pending}
                        aria-label={`Activar regla ${r.id}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteRule(r.id)}
                        disabled={pending}
                      >
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </CardBody>
      </Card>

      {/* 4. Métricas en vivo */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Métricas de Seguridad (D-025)</h2>
            <Button variant="ghost" size="sm" onClick={refreshStats} disabled={statsLoading}>
              🔄 Refrescar
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {statsLoading && !stats ? (
            <p className="text-sm text-ink-muted">Cargando métricas...</p>
          ) : stats ? (
            <div className="grid gap-4 md:grid-cols-4">
              <TarjetaMetrica
                icono="💬"
                titulo="Mensajes Bot (24h)"
                valor={stats.total_bot_messages_24h}
              />
              <TarjetaMetrica
                icono="💬"
                titulo="Mensajes Bot (7d)"
                valor={stats.total_bot_messages_7d}
              />
              <TarjetaMetrica
                icono="⏸️"
                titulo="Leads en Pausa"
                valor={stats.paused_leads_count}
              />
              <TarjetaMetrica
                icono="🚨"
                titulo="Razones de Escalación"
                valor={
                  stats.pause_reasons.keyword_escalation +
                   stats.pause_reasons.ai_semantic_escalation +
                   stats.pause_reasons.manual
                 }
                 subtitulo={
                   <span className="text-xs text-ink-muted">
                     kw: {stats.pause_reasons.keyword_escalation} · sem:{" "}
                     {stats.pause_reasons.ai_semantic_escalation} · man:{" "}
                     {stats.pause_reasons.manual}
                   </span>
                 }
               />
             </div>
           ) : (
             <p className="text-sm text-ink-muted">Sin datos disponibles.</p>
           )}
        </CardBody>
      </Card>

      {/* Sprint v16 PR #2.3 — 💸 Radar de Costos y Presupuestos (En Vivo) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">
              💸 Radar de Costos y Presupuestos (En Vivo)
            </h2>
            <Button variant="ghost" size="sm" onClick={refreshStats} disabled={statsLoading}>
              🔄 Refrescar
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {statsLoading && !stats ? (
            <p className="text-sm text-ink-muted">Cargando costos…</p>
          ) : stats ? (
            <div className="space-y-4">
              {/* Bloque 1: DeepSeek V4 (tokens + costo) */}
              <div className="grid gap-3 md:grid-cols-3">
                <TarjetaMetrica
                  icono="🧠"
                  titulo="Tokens DeepSeek Hoy"
                  valor={
                    stats.bot_usage_today
                      ? (stats.bot_usage_today.prompt_tokens + stats.bot_usage_today.completion_tokens).toLocaleString("es-MX")
                      : 0
                  }
                  subtitulo={
                    <span className="text-xs text-ink-muted">
                      {stats.bot_usage_today?.call_count ?? 0} llamada{(stats.bot_usage_today?.call_count ?? 0) === 1 ? "" : "s"} (prompt + completion)
                    </span>
                  }
                />
                <TarjetaMetrica
                  icono="💵"
                  titulo="Costo IA (Hoy)"
                  valor={
                    stats.bot_usage_today
                      ? `$${(stats.bot_usage_today.estimated_cost_cents / 100).toFixed(2)} USD`
                      : "$0.00 USD"
                  }
                  subtitulo={
                    <span className="text-xs text-ink-muted">
                      Proyección 30d: ${(stats.bot_usage_projection_30d_cents / 100).toFixed(2)} USD
                    </span>
                  }
                />
                <TarjetaMetrica
                  icono="📨"
                  titulo="Outbound Hoy (Kill-Switch)"
                  valor={`${stats.bot_daily_outbound_count} / ${stats.bot_daily_outbound_limit}`}
                  subtitulo={
                    <span className="text-xs text-ink-muted">
                      {stats.bot_daily_outbound_count >= stats.bot_daily_outbound_limit
                        ? "🚨 Bloqueado (límite alcanzado)"
                        : `${stats.bot_daily_outbound_limit - stats.bot_daily_outbound_count} disponibles hoy`}
                    </span>
                  }
                />
              </div>

              {/* Bloque 2: Cupo Meta (R3: disclaimer rolling 30d) */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-ink mb-1">
                  📊 Cupo Gratuito Meta (Mensual)
                </p>
                <p className="text-xs text-ink-muted mb-2 italic">
                  {stats.whatsapp_free_quota_note}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold text-ink">
                    ≈ {stats.whatsapp_free_quota_used_30d} / {stats.whatsapp_free_quota_total}
                  </p>
                  <Badge
                    tone={
                      stats.whatsapp_free_quota_used_30d / stats.whatsapp_free_quota_total > 0.8
                        ? "warning"
                        : "info"
                    }
                  >
                    {Math.round(
                      (stats.whatsapp_free_quota_used_30d / stats.whatsapp_free_quota_total) * 100
                    )}
                    % usado
                  </Badge>
                </div>
                {/* Barra de progreso simple */}
                <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={
                      "h-full transition-all " +
                      (stats.whatsapp_free_quota_used_30d / stats.whatsapp_free_quota_total > 0.8
                        ? "bg-amber-500"
                        : "bg-emerald-500")
                    }
                    style={{
                      width:
                        Math.min(
                          100,
                          (stats.whatsapp_free_quota_used_30d / stats.whatsapp_free_quota_total) * 100
                        ) + "%"
                    }}
                  />
                </div>
              </div>

              {/* Bloque 3: Controles del Kill-Switch y pausa global (inline). */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-ink">⚙️ Controles Operativos</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {/* Botón maestro de pausa global (M4). */}
                  <div className="rounded border border-slate-200 p-3 space-y-1">
                    <p className="text-xs font-semibold text-ink">⏸️ Pausar Bot para Todos</p>
                    <p className="text-[10px] text-ink-muted">
                      Precedencia sobre per-lead. Útil como safety net.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant={stats.bot_paused_global ? "danger" : "outline"}
                      disabled={togglingGlobalPause}
                      onClick={() => void handleToggleGlobalPause()}
                      aria-pressed={stats.bot_paused_global}
                      className="mt-1 w-full"
                    >
                      {stats.bot_paused_global
                        ? "▶️ Reanudar para Todos"
                        : "⏸️ Pausar para Todos"}
                    </Button>
                  </div>
                  {/* Kill-Switch: límite diario de outbound. */}
                  <div className="rounded border border-slate-200 p-3 space-y-1">
                    <p className="text-xs font-semibold text-ink">
                      🚦 Tope Diario ({stats.bot_daily_outbound_count}/{stats.bot_daily_outbound_limit})
                    </p>
                    <p className="text-[10px] text-ink-muted">
                      Protege de cobros sorpresivos. Default 50/día en pruebas.
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={10000}
                        defaultValue={stats.bot_daily_outbound_limit}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n >= 0) void handleChangeDailyLimit(n);
                        }}
                        className="w-full"
                      />
                      {/* FIX 2026-07-12 (hotfix UI #2.4): botón rápido
                          para subir a 500 en sesiones de prueba
                          intensivas. Evita teclear 500 manualmente.
                          A1 de PR #18 ya es no-op si el valor no
                          cambió, así que es seguro darle click si
                          el actual ya es 500. */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleChangeDailyLimit(500)}
                        disabled={statsLoading}
                        title="Subir el tope a 500 envíos rolling 24h (modo pruebas intensivas)"
                      >
                        ⚡ Subir a 500 (Pruebas)
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Sin datos disponibles.</p>
          )}
        </CardBody>
      </Card>

      {/* 5. Acordeón Detalles Técnicos */}
      <Card>
        <button
          onClick={() => setAcordeonAbierto((v) => !v)}
          className="w-full px-6 py-4 text-left flex items-center justify-between"
          aria-expanded={acordeonAbierto}
        >
          <span className="text-lg font-semibold text-ink">
            ℹ️ Detalles Técnicos y Cadena de Resolución del Motor
          </span>
          <span aria-hidden="true">{acordeonAbierto ? "▲" : "▼"}</span>
        </button>
        {acordeonAbierto && (
          <CardBody className="space-y-3 text-sm text-ink-soft">
            <p>
              <strong>Resolución del modo (orden de prioridad):</strong>{" "}
              DB <code>system_settings.bot_global_mode</code> → env var{" "}
              <code>DEEPSEEK_TOOLS_ENABLED</code> → default OFF.
            </p>
            <p>
              <strong>Modo actual:</strong>{" "}
              <Badge tone="info">{stats?.bot_global_mode ?? "?"}</Badge>
            </p>
            <p>
              <strong>Top N reglas inyectadas:</strong>{" "}
              {stats?.bot_max_active_rules ?? 8}.
            </p>
            <p>
              <strong>Plan de rollback:</strong> cambiar el modo desde la
              tarjeta superior. No requiere redeploy ni git revert.
            </p>
            <p>
              <strong>Caché de lectura:</strong> 30s in-memory en el proceso del
              provider. Un toggle se ve reflejado en el siguiente turno del bot
              (no requiere redeploy).
            </p>
          </CardBody>
        )}
      </Card>

      {/* Modal: Nueva Regla */}
      {showNewRuleModal && (
        <ModalNuevaRegla
          newRule={newRule}
          setNewRule={setNewRule}
          onClose={() => setShowNewRuleModal(false)}
          onSubmit={onCreateRule}
          pending={pending}
          error={error}
        />
      )}

      {error && !showNewRuleModal && (
        <div className="fixed bottom-4 right-4 max-w-sm bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-componentes                                                       */
/* ------------------------------------------------------------------ */

function ModeTarjeta(props: {
  icon: string;
  titulo: string;
  descripcion: string;
  activo: boolean;
  disabled: boolean;
  badge?: string;
  onClick: () => void;
}) {
  const { icon, titulo, descripcion, activo, disabled, badge, onClick } = props;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "text-left p-4 rounded-xl border-2 transition " +
        (activo
          ? // FIX 2026-07-12 (hotfix UI #2.3): alto contraste cuando
            // está activo. Antes el estilo era casi idéntico al
            // inactivo, confundiendo al admin. Ahora border emerald
            // sólido + ring + sombra.
            "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/40 shadow-md"
          : disabled
            ? "border-slate-200 bg-slate-50/40 cursor-not-allowed opacity-60"
            : "border-brand-100 hover:border-brand-300 hover:bg-brand-50/40")
      }
      aria-pressed={activo}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xl">{icon}</span>
        {badge && <Badge tone="warning">{badge}</Badge>}
      </div>
      {/* FIX 2026-07-12 (hotfix UI #2.3): badge explícito de estado
          arriba del título. El admin sabe en un vistazo cuál es el
          modo en operación vs cuál está disponible para click. */}
      {activo ? (
        <Badge tone="success" className="mb-2 font-bold">
          🟢 MODO ACTUALMENTE EN OPERACIÓN
        </Badge>
      ) : (
        <Badge tone="neutral" className="mb-2">
          ⚪ Clic para Activar
        </Badge>
      )}
      <div className="font-semibold text-ink">{titulo}</div>
      <div className="text-xs text-ink-muted mt-1">{descripcion}</div>
    </button>
  );
}

function TarjetaMetrica(props: {
  icono: string;
  titulo: string;
  // Sprint v16 PR #2.3: aceptar string | number (las nuevas tarjetas
  // muestran "$0.14 USD" y "X / Y", no solo counts).
  valor: string | number;
  subtitulo?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-brand-100 p-4">
      <div className="text-2xl mb-1">{props.icono}</div>
      <div className="text-xs text-ink-muted uppercase tracking-wide">{props.titulo}</div>
      <div className="text-2xl font-bold text-ink mt-1">{props.valor.toLocaleString("es-MX")}</div>
      {props.subtitulo && <div className="mt-2">{props.subtitulo}</div>}
    </div>
  );
}

function ModalNuevaRegla(props: {
  newRule: {
    instruction: string;
    priority: number;
    scope: string;
    discount_percent: string;
    valid_until: string;
  };
  setNewRule: React.Dispatch<
    React.SetStateAction<{
      instruction: string;
      priority: number;
      scope: string;
      discount_percent: string;
      valid_until: string;
    }>
  >;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
}) {
  const { newRule, setNewRule, onClose, onSubmit, pending, error } = props;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold text-ink mb-3">Nueva Regla de Oro</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink-muted">Instrucción</label>
            <textarea
              className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
              rows={3}
              value={newRule.instruction}
              onChange={(e) => setNewRule({ ...newRule, instruction: e.target.value })}
              placeholder="Ej: Si preguntan por descuento, ofrece 20% hasta el viernes."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-muted">Alcance</label>
              <select
                className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
                value={newRule.scope}
                onChange={(e) => setNewRule({ ...newRule, scope: e.target.value })}
              >
                <option value="global">global</option>
                <option value="event:default">event:default</option>
                <option value="course:default">course:default</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-muted">Prioridad (0-10)</label>
              <input
                type="number"
                min={0}
                max={10}
                className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
                value={newRule.priority}
                onChange={(e) =>
                  setNewRule({ ...newRule, priority: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-muted">
                Descuento % (opcional)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
                value={newRule.discount_percent}
                onChange={(e) =>
                  setNewRule({ ...newRule, discount_percent: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-muted">
                Vigente hasta {newRule.discount_percent ? "(requerido)" : ""}
              </label>
              <input
                type="date"
                className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
                value={newRule.valid_until}
                onChange={(e) => setNewRule({ ...newRule, valid_until: e.target.value })}
                required={Boolean(newRule.discount_percent)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? "Guardando..." : "Guardar regla"}
          </Button>
        </div>
      </div>
    </div>
  );
}
