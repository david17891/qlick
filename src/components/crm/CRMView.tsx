"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Lead,
  SalesOwner,
  LeadStatus,
  LeadSource,
  LeadIntent,
  CRMOverview,
  Conversation
} from "@/types";
import { Container, Card, Badge, Button, Input, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/dashboard";
import {
  getLeads,
  getSalesOwners,
  getCRMOverview,
  getConversations,
  getUpcomingCRMTasks,
  getOverdueCRMTasks,
  getWhatsAppProviders
} from "@/lib/crm/crm-service";
import {
  getPipelineStages,
  calculateConversionRate,
  PIPELINE_ORDER
} from "@/lib/crm/pipeline-utils";
import {
  leadStatusLabel,
  statusTone,
  leadSourceLabel,
  leadIntentLabel,
  intentTone,
  calculateLeadResponseRisk,
  riskTone,
  riskLabel,
  qualificationLabel,
  qualificationTone
} from "@/lib/crm/lead-utils";
import {
  getAIAgentProfile,
  getAISuggestionsForLead
} from "@/lib/crm/agent-utils";
import {
  getAppointments,
  getUpcomingAppointments,
  appointmentTypeLabel,
  appointmentStatusLabel,
  appointmentStatusTone
} from "@/lib/crm/appointments";
import {
  fetchPendingCRMTasks,
  patchLeadStatus,
  archiveLeadClient,
  type PendingTasksSplitClient
} from "@/lib/crm/ops-client";
import type { CrmTaskRow } from "@/lib/crm/crm-rows";
import { getWhatsAppConfigStatus } from "@/lib/contact/whatsapp";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { formatDate, formatMXN, initials } from "@/lib/utils";

type Section =
  | "resumen"
  | "pipeline"
  | "leads"
  | "conversaciones"
  | "calendario"
  | "agente"
  | "whatsapp";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "resumen", label: "Resumen", icon: "📊" },
  { id: "pipeline", label: "Pipeline", icon: "🧩" },
  { id: "leads", label: "Leads", icon: "👤" },
  { id: "conversaciones", label: "Conversaciones", icon: "💬" },
  { id: "calendario", label: "Calendario", icon: "📅" },
  { id: "agente", label: "Agente IA", icon: "🤖" },
  { id: "whatsapp", label: "WhatsApp", icon: "💚" }
];

/**
 * Vista completa del CRM. Se integra como una sub-pestaña dentro del admin.
 *
 * Todo es demo/mock: lectura de datos ficticios y acciones que no persisten.
 * Las etiquetas "demo" son explícitas en cada sección crítica.
 */
export function CRMView({ initialLeadId }: { initialLeadId?: string } = {}) {
  const [section, setSection] = useState<Section>("resumen");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Modo real vs demo: en modo real hacemos fetch de los leads reales desde
  // la API admin (protegida). En demo usamos los mocks.
  const realMode = isSupabaseConfigured();
  const mockLeads = getLeads();

  const [realLeads, setRealLeads] = useState<Lead[] | null>(null);
  const [realLeadsError, setRealLeadsError] = useState<string | null>(null);
  const [realOverview, setRealOverview] = useState<CRMOverview | null>(null);
  const [realOverviewError, setRealOverviewError] = useState<string | null>(null);
  // Inteligencia comercial (Fase 3): LVR, SLA Overdue, Heat Distribution,
  // Hot Desatendidos. Misma forma que el endpoint /api/admin/crm/overview.
  const [realIntelligence, setRealIntelligence] = useState<unknown | null>(null);
  const [realPendingTasks, setRealPendingTasks] = useState<PendingTasksSplitClient | null>(null);
  const [realConversations, setRealConversations] = useState<Conversation[] | null>(null);

  // Estados locales para la interactividad dinâmica.
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deletedLeadConversations, setDeletedLeadConversations] = useState<Set<string>>(new Set());
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  useEffect(() => {
    if (!realMode) {
      setLeads(mockLeads);
    }
  }, [realMode, mockLeads]);

  useEffect(() => {
    if (realLeads) {
      setLeads(realLeads);
    }
  }, [realLeads]);

  async function handleMoveLead(leadId: string, newStatus: LeadStatus) {
    const originalLeads = leads;
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)),
    );

    if (realMode) {
      try {
        const updatedLead = await patchLeadStatus(leadId, newStatus);
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? updatedLead : l)),
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al cambiar de etapa.");
        setLeads(originalLeads);
      }
    }
  }

  async function handleArchiveLead(leadId: string) {
    const originalLeads = leads;
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: "archived" as LeadStatus } : l)),
    );

    if (realMode) {
      try {
        const updatedLead = await archiveLeadClient(leadId);
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? updatedLead : l)),
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al archivar lead.");
        setLeads(originalLeads);
      }
    }
  }

  async function handleDeleteConversation(leadId: string) {
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta conversación? Esto ocultará todos sus mensajes.")) return;
    try {
      if (realMode) {
        const res = await fetch(`/api/admin/crm/conversations?leadId=${encodeURIComponent(leadId)}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          alert(data.error ?? "No se pudo eliminar la conversación.");
          return;
        }
      }
      setDeletedLeadConversations((prev) => {
        const next = new Set(prev);
        next.add(leadId);
        return next;
      });
    } catch (err) {
      alert("Error de red al eliminar la conversación.");
    }
  }

  // Deep-link desde /admin?leadId=... (usado por el funnel de eventos).
  // Cuando los leads reales terminen de cargar, abre el drawer del lead
  // correspondiente si su id coincide con initialLeadId.
  useEffect(() => {
    if (!initialLeadId || !realLeads) return;
    const found = realLeads.find((l) => l.id === initialLeadId);
    if (found) setSelectedLead(found);
  }, [initialLeadId, realLeads]);

  useEffect(() => {
    if (!realMode) return;
    let cancelled = false;
    setRealLeadsError(null);
    fetch("/api/admin/leads", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          // Sin sesión admin: no mostramos datos reales. El middleware redirige
          // a /admin/login en /admin, pero este componente puede montarse antes.
          if (!cancelled) setRealLeads(null);
          return null;
        }
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && data?.ok) {
            setRealLeads(data.leads ?? []);
          } else {
            setRealLeads(null);
            setRealLeadsError(data?.error ?? "No se pudieron cargar los leads.");
          }
        }
        return null;
      })
      .catch(() => {
        if (!cancelled) setRealLeadsError("Error de red al cargar leads.");
      });
    return () => {
      cancelled = true;
    };
  }, [realMode]);

  // Overview real: calcula métricas sobre los leads reales (vía API admin).
  useEffect(() => {
    if (!realMode) return;
    let cancelled = false;
    setRealOverviewError(null);
    fetch("/api/admin/crm/overview", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setRealOverview(null);
          return null;
        }
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && data?.ok && data.overview) {
            setRealOverview(data.overview as CRMOverview);
            // Fase 3: la inteligencia viene en el mismo payload.
            if (data.intelligence) {
              setRealIntelligence(data.intelligence);
            }
          } else if (data?.demo) {
            // Servidor en modo demo: el cliente debe usar el overview mock.
            setRealOverview(null);
          } else {
            setRealOverview(null);
            setRealOverviewError(
              data?.error ?? "No se pudo cargar el overview.",
            );
          }
        }
        return null;
      })
      .catch(() => {
        if (!cancelled) setRealOverviewError("Error de red al cargar overview.");
      });
    return () => {
      cancelled = true;
    };
  }, [realMode]);

  // Tareas pendientes reales: partición vencidas/próximas para el Calendario.
  useEffect(() => {
    if (!realMode) return;
    let cancelled = false;
    fetchPendingCRMTasks()
      .then((split) => {
        if (!cancelled) setRealPendingTasks(split);
      })
      .catch(() => {
        if (!cancelled) setRealPendingTasks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [realMode, selectedLead]);

  // Conversaciones reales: las que el bot WhatsApp intercambió + interacciones
  // manuales del equipo comercial. Server-side lee de lead_whatsapp_conversations
  // y lead_interactions. Refresca cada vez que cambia el lead seleccionado.
  useEffect(() => {
    if (!realMode) return;
    let cancelled = false;
    setRealConversations(null); // loading state
    fetch("/api/admin/crm/conversations", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setRealConversations([]);
          return null;
        }
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && data?.ok && Array.isArray(data.conversations)) {
            setRealConversations(data.conversations as Conversation[]);
          } else {
            setRealConversations([]);
          }
        }
        return null;
      })
      .catch(() => {
        if (!cancelled) setRealConversations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [realMode, selectedLead]);

  const owners = getSalesOwners();
  // Overview: real si está cargado (incluso durante carga para no parpadear);
  // demo si no. La carga inicial en realMode muestra el overview demo brevemente.
  const mockOverview = getCRMOverview();
  const overview = realMode ? (realOverview ?? mockOverview) : mockOverview;
  const conversations = useMemo(() => {
    const raw = realMode
      ? (realConversations ?? [])
      : getConversations();
    return raw.filter((c) => !deletedLeadConversations.has(c.leadId));
  }, [realMode, realConversations, deletedLeadConversations]);
  const upcomingTasks = getUpcomingCRMTasks();
  const overdueTasks = getOverdueCRMTasks();
  const appts = getAppointments();
  const upcomingAppts = getUpcomingAppointments();
  const profile = getAIAgentProfile();
  const waProviders = getWhatsAppProviders();

  // Tareas pendientes: split entre datos reales y mock.
  // En modo real, si la red falla devolvemos listas vacías para no mostrar
  // datos ficticios junto a datos reales.
  // En modo demo, mapeamos CRMTask (mock camelCase) → CrmTaskRow (snake_case
  // de Supabase) para reusar el mismo sub-componente CalendarTaskRow.
  const pendingTasks: PendingTasksSplitClient = realMode
    ? realPendingTasks ?? { overdue: [], upcoming: [] }
    : {
        overdue: overdueTasks.map(mockTaskToRow),
        upcoming: upcomingTasks.map(mockTaskToRow),
      };

  // En modo real: si realLeads está null (cargando o sin sesión), mostramos
  // estado de carga. Si está cargado (incluso vacío), lo usamos.
  const loadingReal = realMode && realLeads === null && !realLeadsError;
  const stages = getPipelineStages(leads);

  return (
    <div className="space-y-6">
      {/* Banner modo real / demo */}
      {realMode ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <strong>CRM en modo real.</strong> Leads leídos desde Supabase.{" "}
          {loadingReal && "Cargando…"}
          {realLeadsError && (
            <span className="text-red-700"> {realLeadsError}</span>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>CRM en modo demo.</strong> Los datos son ficticios y las acciones no se
          persisten. En producción se conecta a Supabase y a WhatsApp oficial.
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b border-brand-100 pb-3 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={
              "px-3 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap " +
              (section === s.id
                ? "bg-brand-500 text-white"
                : "text-ink-soft hover:bg-brand-50")
            }
          >
            <span className="mr-1">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* A. Resumen */}
      {section === "resumen" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Leads totales" value={overview.totalLeads} hint="en el CRM" icon="👤" />
            <StatCard label="Nuevos" value={overview.newLeads} hint="sin contactar" icon="✨" tone="accent" />
            <StatCard label="Contactados" value={overview.contactedLeads} icon="📞" tone="neutral" />
            <StatCard label="Pagos pendientes" value={overview.paymentPending} hint="requieren acción" icon="💳" tone="neutral" />
            <StatCard label="Inscritos" value={overview.enrolled} icon="🎓" />
            <StatCard label="Alumnos activos" value={overview.activeStudents} icon="📚" />
            <StatCard label="Conversión (simulada)" value={`${overview.conversionRate}%`} hint="ganados / activos" icon="📈" tone="accent" />
            <StatCard label="Seguimientos vencidos" value={overview.overdueFollowUps} hint="tareas atrasadas" icon="⚠️" tone="neutral" />
          </div>

          {/* Fase 3 — Inteligencia comercial: LVR, SLA, Heat, Hot Desatendidos */}
          {realIntelligence ? (
            <IntelligenceCards intelligence={realIntelligence as {
              lvrPercentage: number | null;
              lvrCurrentWeek: number;
              lvrPreviousWeek: number;
              slaOverdueCount: number;
              heat: { hot: number; warm: number; cold: number; total: number; hotPercentage: number };
              hotDesatendidos: Array<{
                id: string;
                name: string;
                score: number | null;
                qualification: string | null;
                status: string;
                phone: string | null;
                lastInteractionAt: string | null;
                hoursSinceLastContact: number | null;
              }>;
            }} />
          ) : (
            <Card className="p-5">
              <p className="text-sm text-ink-muted">
                Métricas inteligentes (LVR, SLA, Heat) disponibles solo con Supabase
                configurado en modo real.
              </p>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="font-bold text-ink mb-3">Citas próximas</h3>
            {upcomingAppts.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin citas próximas.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcomingAppts.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex justify-between">
                    <span className="text-ink-soft">{a.title}</span>
                    <span className="text-xs text-ink-muted">{formatDate(a.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* B. Pipeline */}
      {section === "pipeline" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {stages.map((stage) => (
              <div
                key={stage.status}
                className={
                  "w-72 shrink-0 p-2 rounded-xl transition-all duration-200 " +
                  (dragOverStage === stage.status ? "bg-brand-50 border border-dashed border-brand-400" : "bg-transparent")
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== stage.status) {
                    setDragOverStage(stage.status);
                  }
                }}
                onDragLeave={() => {
                  setDragOverStage(null);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  const leadId = e.dataTransfer.getData("leadId");
                  if (leadId) {
                    handleMoveLead(leadId, stage.status);
                  }
                }}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-sm font-bold text-ink">{stage.label}</span>
                  <Badge tone={stage.tone}>{stage.leads.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[250px]">
                  {stage.leads.length === 0 ? (
                    <p className="text-xs text-ink-muted italic px-1 py-4 text-center border border-dashed border-brand-100 rounded-xl">
                      Vacío
                    </p>
                  ) : (
                    stage.leads.map((lead) => (
                      <PipelineCard
                        key={lead.id}
                        lead={lead}
                        owners={owners}
                        onClick={() => setSelectedLead(lead)}
                        onMoveLead={handleMoveLead}
                        onArchiveLead={handleArchiveLead}
                        onDeleteConversation={handleDeleteConversation}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* C. Leads */}
      {section === "leads" && (
        <LeadsTable
          leads={leads}
          owners={owners}
          onSelect={setSelectedLead}
          onMoveLead={handleMoveLead}
          onArchiveLead={handleArchiveLead}
          onDeleteConversation={handleDeleteConversation}
        />
      )}

      {/* D. Conversaciones */}
      {section === "conversaciones" && (
        <ConversationsView
          conversations={conversations}
          leads={leads}
          owners={owners}
          onSelectLead={setSelectedLead}
          onDeleteConversation={handleDeleteConversation}
        />
      )}

      {/* E. Calendario */}
      {section === "calendario" && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-ink">Próximas citas</h3>
              <Badge tone="info">{upcomingAppts.length} agendadas</Badge>
            </div>
            {upcomingAppts.length === 0 ? (
              <EmptyState title="Sin citas próximas" description="Agenda llamadas o sesiones demo desde el detalle de un lead." />
            ) : (
              <ul className="divide-y divide-brand-50">
                {upcomingAppts.map((a) => {
                  const lead = leads.find((l) => l.id === a.leadId);
                  return (
                    <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{a.title}</p>
                        <p className="text-xs text-ink-muted">
                          {appointmentTypeLabel[a.type]} · {a.mode} ·{" "}
                          {lead ? lead.name : "General"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={appointmentStatusTone[a.status]}>
                          {appointmentStatusLabel[a.status]}
                        </Badge>
                        <span className="text-xs text-ink-muted">
                          {formatDate(a.startsAt)} · {a.durationMinutes} min
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Tareas vencidas (crm_tasks con due_at < hoy) */}
          {pendingTasks.overdue.length > 0 && (
            <Card className="p-5 border-red-200 bg-red-50/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-ink">Tareas vencidas</h3>
                <Badge tone="danger">{pendingTasks.overdue.length} atrasadas</Badge>
              </div>
              <ul className="divide-y divide-red-100">
                {pendingTasks.overdue.map((t) => (
                  <CalendarTaskRow
                    key={t.id}
                    task={t}
                    leads={leads}
                    overdue
                    onSelectLead={setSelectedLead}
                  />
                ))}
              </ul>
            </Card>
          )}

          {/* Tareas próximas (crm_tasks con due_at >= hoy o sin fecha) */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-ink">Tareas de seguimiento</h3>
              <Badge tone="neutral">{pendingTasks.upcoming.length} pendientes</Badge>
            </div>
            {pendingTasks.upcoming.length === 0 ? (
              <EmptyState
                title="Sin tareas pendientes"
                description="Crea tareas desde el detalle de un lead para verlas acá."
              />
            ) : (
              <ul className="divide-y divide-brand-50">
                {pendingTasks.upcoming.map((t) => (
                  <CalendarTaskRow
                    key={t.id}
                    task={t}
                    leads={leads}
                    overdue={false}
                    onSelectLead={setSelectedLead}
                  />
                ))}
              </ul>
            )}
          </Card>

          <p className="text-xs text-ink-muted">
            Citas sincronizan con Google Calendar en una fase posterior (campo
            <code className="mx-1 px-1 rounded bg-brand-50">externalCalendarId</code>
            ya queda listo). Las tareas viven en <code className="mx-1 px-1 rounded bg-brand-50">crm_tasks</code> y
            se crean desde el drawer del lead.
          </p>
        </div>
      )}

      {/* F. Agente IA */}
      {section === "agente" && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-ink">Agente IA — {profile.name}</h3>
              <Badge tone="warning">demo · sin API</Badge>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <Field label="Negocio" value={profile.businessName} />
              <Field label="Tono" value={profile.tone} />
              <Field label="Horario" value={profile.businessHours} />
              <Field label="Mensaje de respaldo" value={profile.fallbackMessage} />
            </div>
            <p className="mt-3 text-sm text-ink-soft">{profile.businessDescription}</p>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h4 className="font-bold text-ink mb-2">Cursos/servicios que conoce</h4>
              <ul className="space-y-1 text-sm text-ink-soft">
                {profile.servicesOrCourses.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h4 className="font-bold text-ink mb-2">Reglas de escalamiento</h4>
              <ul className="space-y-1 text-sm text-ink-soft">
                {profile.escalationRules.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h4 className="font-bold text-ink mb-2 text-emerald-700">Acciones permitidas</h4>
              <ul className="space-y-1 text-sm text-ink-soft">
                {profile.allowedActions.map((a) => (
                  <li key={a}>✓ {a}</li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h4 className="font-bold text-ink mb-2 text-red-700">Acciones prohibidas</h4>
              <ul className="space-y-1 text-sm text-ink-soft">
                {profile.forbiddenActions.map((a) => (
                  <li key={a}>✗ {a}</li>
                ))}
              </ul>
            </Card>
          </div>
          <p className="text-xs text-ink-muted">
            Agente IA demo, sin conexión a API. Las sugerencias siempre pasan por revisión
            humana antes de enviarse por WhatsApp. Ver docs/AI_AGENT_GUARDRAILS.md.
          </p>
        </div>
      )}

      {/* G. WhatsApp */}
      {section === "whatsapp" && (
        <WhatsAppConfigView providers={waProviders} />
      )}

      {/* Drawer de detalle */}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          owners={owners}
          realMode={realMode}
          onLeadChanged={(updated) => {
            // Refresca la fila en la lista real y mantiene el drawer en sincronía.
            setRealLeads((prev) =>
              prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev,
            );
            setLeads((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p)),
            );
            setSelectedLead(updated);
          }}
          onConversationDeleted={handleDeleteConversation}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  );
}

/* ----------------------- Sub-componentes ----------------------- */

/**
 * Adapta el CRMTask del mock (camelCase) al shape de crm_tasks en Supabase
 * (snake_case). Usado solo en modo demo para alimentar el Calendario con
 * datos ficticios. El `lead_id` del mock es opcional; en Supabase es NOT NULL,
 * por lo que se usa string vacío cuando no hay lead asociado.
 */
function mockTaskToRow(t: import("@/types").CRMTask): CrmTaskRow {
  return {
    id: t.id,
    lead_id: t.leadId ?? "",
    title: t.title,
    description: t.description ?? null,
    due_at: t.dueAt,
    status: t.done ? "completed" : "pending",
    completed_at: t.done ? t.dueAt : null,
    created_by_email: "demo@qlick.mx",
    created_at: t.createdAt,
    priority: null,
  };
}

/**
 * Fila de tarea en el Calendario del CRM. Muestra título, lead (clickeable →
 * abre drawer) y fecha de vencimiento coloreada según overdue.
 */
function CalendarTaskRow({
  task,
  leads,
  overdue,
  onSelectLead
}: {
  task: CrmTaskRow;
  leads: Lead[];
  overdue: boolean;
  onSelectLead: (lead: Lead) => void;
}) {
  const lead = task.lead_id ? leads.find((l) => l.id === task.lead_id) ?? null : null;
  const dueLabel = task.due_at ? formatDate(task.due_at) : "Sin fecha";
  return (
    <li className="py-3 flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => lead && onSelectLead(lead)}
        disabled={!lead}
        className={
          "min-w-0 text-left flex-1 " +
          (lead ? "hover:opacity-80 cursor-pointer" : "cursor-default")
        }
        title={lead ? `Ver lead ${lead.name}` : "Lead no encontrado"}
      >
        <p className="font-semibold text-ink">{task.title}</p>
        <p className="text-xs text-ink-muted">
          {lead ? lead.name : "Lead no encontrado"} ·{" "}
          {task.created_by_email ?? "sistema"}
        </p>
        {task.description && (
          <p className="text-xs text-ink-soft mt-1 line-clamp-2">{task.description}</p>
        )}
      </button>
      <div className="flex items-center gap-2">
        <Badge tone={overdue ? "danger" : task.due_at ? "info" : "neutral"}>
          {dueLabel}
        </Badge>
      </div>
    </li>
  );
}

function PipelineCard({
  lead,
  owners,
  onClick,
  onMoveLead,
  onArchiveLead,
  onDeleteConversation,
}: {
  lead: Lead;
  owners: SalesOwner[];
  onClick: () => void;
  onMoveLead?: (leadId: string, newStatus: LeadStatus) => void;
  onArchiveLead?: (leadId: string) => void;
  onDeleteConversation?: (leadId: string) => void;
}) {
  const risk = calculateLeadResponseRisk(lead);
  const owner = owners.find((o) => o.id === lead.ownerId);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("leadId", lead.id);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="w-full text-left rounded-xl bg-white border border-brand-100 p-3 hover:shadow-md hover:border-brand-300 transition cursor-grab active:cursor-grabbing relative"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <button
          type="button"
          onClick={onClick}
          className="font-semibold text-ink text-sm leading-tight hover:text-brand-600 hover:underline text-left flex-1 font-bold"
        >
          {lead.name}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Badge tone={riskTone[risk.level]} title={risk.reasons.join(", ")}>
            {riskLabel[risk.level][0]}
          </Badge>
          <LeadActionsMenu
            lead={lead}
            onMoveLead={onMoveLead}
            onArchiveLead={onArchiveLead}
            onDeleteConversation={onDeleteConversation}
          />
        </div>
      </div>
      <div onClick={onClick} className="cursor-pointer">
        <p className="text-xs text-ink-muted mb-2 line-clamp-1">
          {lead.courseOfInterest ?? "Sin curso"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Badge tone={intentTone[lead.intent]}>{leadIntentLabel[lead.intent]}</Badge>
          <Badge tone="neutral">{leadSourceLabel[lead.source]}</Badge>
        </div>
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{owner ? owner.initials : "—"}</span>
          <span>{lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : ""}</span>
        </div>
      </div>
    </div>
  );
}

function LeadsTable({
  leads,
  owners,
  onSelect,
  onMoveLead,
  onArchiveLead,
  onDeleteConversation,
}: {
  leads: Lead[];
  owners: SalesOwner[];
  onSelect: (lead: Lead) => void;
  onMoveLead?: (leadId: string, newStatus: LeadStatus) => void;
  onArchiveLead?: (leadId: string) => void;
  onDeleteConversation?: (leadId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [source, setSource] = useState<LeadSource | "all">("all");
  const [course, setCourse] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [intent, setIntent] = useState<LeadIntent | "all">("all");
  const [eventFilter, setEventFilter] = useState<string>("all");

  // Memoizar `filtered` (declarado antes del bulk state para que
  // `allVisibleSelected` lo pueda usar sin TDZ).
  const filtered = useMemo(() => leads.filter((l) => {
    if (status !== "all" && l.status !== status) return false;
    if (source !== "all" && l.source !== source) return false;
    if (course !== "all" && l.courseOfInterest !== course) return false;
    if (ownerFilter !== "all" && l.ownerId !== ownerFilter) return false;
    if (intent !== "all" && l.intent !== intent) return false;
    if (eventFilter !== "all") {
      const tagPrefix = `event:${eventFilter}`;
      const matchesEvent = l.tags?.some((tag) => tag.startsWith(tagPrefix)) ?? false;
      if (!matchesEvent) return false;
    }
    if (q.trim()) {
      const hay = `${l.name} ${l.email} ${l.phone ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [leads, status, source, course, ownerFilter, intent, eventFilter, q]);

  // =========================================================================
  // FASE 1 CRM — Bulk select + Bulk bar + Export CSV
  // =========================================================================
  // selectedIds: Set de lead IDs seleccionados. Solo se mantienen IDs que
  // están en `leads` (el padre los refresca). El reset on filter change
  // (ver useEffect abajo) previene bulk archive accidental sobre leads
  // ocultos por el filtro.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset de selección cuando CUALQUIER filtro cambia. Esto es OBLIGATORIO
  // por seguridad: si el admin seleccionó 10 leads con filtro "Todos" y
  // luego cambia a "Contactados" (visibles 3), sin reset los 7 ocultos
  // también se archivarían al disparar bulk action. Ver peer review R7.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [q, status, source, course, ownerFilter, intent, eventFilter]);

  // Estado del modal de confirmación (type-the-word ARCHIVAR N).
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmArchiveText, setConfirmArchiveText] = useState("");

  // Resultado del último bulk (para mostrar feedback al admin).
  const [bulkFeedback, setBulkFeedback] = useState<
    | null
    | {
        kind: "running";
      }
    | {
        kind: "done";
        succeeded: number;
        conflicted: number;
        failed: number;
        note?: string;
      }
    | {
        kind: "error";
        message: string;
      }
  >(null);

  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((l) => selectedIds.has(l.id));
  const someVisibleSelected =
    filtered.length > 0 &&
    filtered.some((l) => selectedIds.has(l.id)) &&
    !allVisibleSelected;

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        // Deseleccionar todos los visibles.
        filtered.forEach((l) => next.delete(l.id));
      } else {
        // Seleccionar todos los visibles.
        filtered.forEach((l) => next.add(l.id));
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function executeBulkArchive() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkFeedback({ kind: "running" });
    try {
      const res = await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ids, action: "archive" }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        succeeded: number;
        conflicted: number;
        failed: number;
        note?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setBulkFeedback({
          kind: "error",
          message: data.error ?? data.note ?? `HTTP ${res.status}`,
        });
        return;
      }
      setBulkFeedback({
        kind: "done",
        succeeded: data.succeeded,
        conflicted: data.conflicted,
        failed: data.failed,
        note: data.note,
      });
      setSelectedIds(new Set());
      setConfirmArchiveOpen(false);
      setConfirmArchiveText("");
    } catch (err) {
      setBulkFeedback({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function exportCsv() {
    // Por Fase 1 exportamos TODOS los leads con consentimiento.
    // El admin es responsable de aplicar filtros adicionales desde el
    // Dashboard de Supabase si los necesita. Server-side paginación +
    // filtros del export endpoint es trabajo de Fase 2.
    window.location.href = "/api/admin/leads/export";
  }

  const courses = useMemo(
    () => Array.from(new Set(leads.map((l) => l.courseOfInterest).filter(Boolean))) as string[],
    [leads]
  );

  const events = useMemo(() => {
    const slugs = new Set<string>();
    leads.forEach((l) => {
      if (l.tags) {
        l.tags.forEach((tag) => {
          if (tag.startsWith("event:")) {
            const parts = tag.split(":");
            if (parts[1]) {
              slugs.add(parts[1]);
            }
          }
        });
      }
    });
    return Array.from(slugs).sort();
  }, [leads]);

  const formatEventSlug = (slug: string): string => {
    return slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <Card className="overflow-hidden">
      {/* Filtros */}
      <div className="p-4 border-b border-brand-50 grid sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <Input
          placeholder="Buscar..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="lg:col-span-2"
        />
        <Select value={status} onChange={(v) => setStatus(v as LeadStatus | "all")} options={statusOptions()} />
        <Select value={source} onChange={(v) => setSource(v as LeadSource)} options={sourceOptions()} />
        <Select
          value={eventFilter}
          onChange={setEventFilter}
          options={[{ value: "all", label: "Todos los eventos" }, ...events.map((e) => ({ value: e, label: formatEventSlug(e) }))]}
        />
        <Select
          value={course}
          onChange={setCourse}
          options={[{ value: "all", label: "Todos los cursos" }, ...courses.map((c) => ({ value: c, label: c }))]}
        />
        <Select
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={[{ value: "all", label: "Responsables" }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
        />
        <Select
          value={intent}
          onChange={(v) => setIntent(v as LeadIntent | "all")}
          options={[{ value: "all", label: "Toda intención" }, ...intentOptions()]}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={exportCsv}
          title="Descarga todos los leads con consentimiento a CSV"
        >
          📥 Exportar CSV
        </Button>
      </div>
      {/* Bulk Action Bar — visible solo cuando hay selección */}
      {selectedIds.size > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-brand-50 border-b border-brand-100"
          role="region"
          aria-label="Acciones en masa"
        >
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-ink">
              {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} seleccionado{selectedIds.size === 1 ? "" : "s"}
            </span>
            {selectedIds.size !== filtered.length && (
              <span className="text-xs text-ink-muted">
                ({filtered.length} visible{filtered.length === 1 ? "" : "s"})
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkFeedback?.kind === "running"}
            >
              Limpiar selección
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirmArchiveOpen(true)}
              disabled={bulkFeedback?.kind === "running"}
            >
              🗄️ Archivar Seleccionados
            </Button>
          </div>
        </div>
      )}
      {/* Feedback del último bulk */}
      {bulkFeedback && bulkFeedback.kind !== "running" && (
        <div
          className={
            "px-4 py-2 text-xs " +
            (bulkFeedback.kind === "error"
              ? "bg-rose-50 text-rose-800"
              : "bg-emerald-50 text-emerald-800")
          }
          role={bulkFeedback.kind === "error" ? "alert" : "status"}
        >
          {bulkFeedback.kind === "error"
            ? `Error: ${bulkFeedback.message}`
            : `Archivado OK: ${bulkFeedback.succeeded} | Conflictos: ${bulkFeedback.conflicted} | Fallos: ${bulkFeedback.failed}${bulkFeedback.note ? ` (${bulkFeedback.note})` : ""}`}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setBulkFeedback(null)}
          >
            cerrar
          </button>
        </div>
      )}
      <p className="px-4 py-2 text-xs text-ink-muted bg-brand-50/30">
        {filtered.length} de {leads.length} leads
      </p>
      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-semibold w-10">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los leads visibles"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  className="h-4 w-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 font-semibold">Lead</th>
              <th className="text-left px-4 py-3 font-semibold">Curso</th>
              <th className="text-left px-4 py-3 font-semibold">Estado</th>
              <th className="text-left px-4 py-3 font-semibold">Intención</th>
              <th className="text-left px-4 py-3 font-semibold">Responsable</th>
              <th className="text-left px-4 py-3 font-semibold">Riesgo</th>
              <th className="text-right px-4 py-3 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {filtered.map((l) => {
              const risk = calculateLeadResponseRisk(l);
              const owner = owners.find((o) => o.id === l.ownerId);
              return (
                <tr
                  key={l.id}
                  className={
                    "hover:bg-brand-50/30 " +
                    (selectedIds.has(l.id) ? "bg-brand-50/50 " : "")
                  }
                >
                  <td className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar a ${l.name}`}
                      checked={selectedIds.has(l.id)}
                      onChange={() => toggleOne(l.id)}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded-full bg-brand-gradient text-white text-[10px] font-bold flex items-center justify-center">
                        {initials(l.name)}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-ink">{l.name}</p>
                          {l.tags?.filter(t => t.startsWith("event:")).map(tag => {
                            const eventSlug = tag.split(":")[1];
                            if (!eventSlug) return null;
                            return (
                              <Badge key={tag} tone="info" className="text-[8px] tracking-wide px-1 py-0 uppercase">
                                🎟️ {formatEventSlug(eventSlug)}
                              </Badge>
                            );
                          })}
                        </div>
                        <p className="text-xs text-ink-muted">{l.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{l.courseOfInterest ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <Badge tone={statusTone[l.status]}>{leadStatusLabel[l.status]}</Badge>
                      {/* feat/funnel-survey-scoring: badge de qualification
                          aparece cuando el lead lleno la encuesta post-evento. */}
                      {l.qualification && typeof l.score === "number" && (
                        <Badge
                          tone={qualificationTone[l.qualification]}
                          title={`Score ${l.score}/100`}
                        >
                          🌡 {qualificationLabel[l.qualification]}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={intentTone[l.intent]}>{leadIntentLabel[l.intent]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {owner ? owner.initials : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={riskTone[risk.level]}>{riskLabel[risk.level]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => onSelect(l)}>
                        Ver detalle
                      </Button>
                      <LeadActionsMenu
                        lead={l}
                        onMoveLead={onMoveLead}
                        onArchiveLead={onArchiveLead}
                        onDeleteConversation={onDeleteConversation}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8">
            <EmptyState title="Sin leads" description="Ajusta los filtros o agrega leads nuevos." />
          </div>
        )}
      </div>
      {/* Modal de confirmación type-the-word (peer review R13) */}
      {confirmArchiveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-archive-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 id="confirm-archive-title" className="text-lg font-bold text-ink mb-2">
              ⚠️ Archivar {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}
            </h2>
            <p className="text-sm text-ink-soft mb-4">
              Esta acción cambia el status de los leads seleccionados a{" "}
              <strong>archived</strong>. NO se borran de la base de datos, pero
              dejarán de aparecer en el CRM activo. La prueba de consentimiento
              (LGPD/LFPDPPP) se preserva.
            </p>
            <p className="text-sm text-ink-soft mb-2">
              Para confirmar, escribe exactamente{" "}
              <code className="px-2 py-1 bg-brand-50 rounded text-ink font-mono">
                ARCHIVAR {selectedIds.size}
              </code>
              :
            </p>
            <input
              type="text"
              value={confirmArchiveText}
              onChange={(e) => setConfirmArchiveText(e.target.value)}
              placeholder={`ARCHIVAR ${selectedIds.size}`}
              className="w-full px-3 py-2 border border-brand-100 rounded mb-4 font-mono text-sm"
              autoFocus
              aria-label="Confirmación type-the-word"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmArchiveOpen(false);
                  setConfirmArchiveText("");
                }}
                disabled={bulkFeedback?.kind === "running"}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={executeBulkArchive}
                disabled={
                  confirmArchiveText.trim() !== `ARCHIVAR ${selectedIds.size}` ||
                  bulkFeedback?.kind === "running"
                }
              >
                {bulkFeedback?.kind === "running"
                  ? "Archivando..."
                  : "Confirmar archivado"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "ahora";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * IntelligenceCards — panel de métricas inteligentes (Fase 3).
 *
 * Renderiza:
 * - 3 stat cards: LVR, SLA Overdue, Heat (hot%)
 * - Panel "Acciones Recomendadas para Hoy" con los top 5 leads hot
 *   desatendidos. Cada item tiene botón "💚 Abrir WhatsApp" (wa.me)
 *   y "📅 Agendar Seguimiento".
 */
interface IntelligenceShape {
  lvrPercentage: number | null;
  lvrCurrentWeek: number;
  lvrPreviousWeek: number;
  slaOverdueCount: number;
  heat: {
    hot: number;
    warm: number;
    cold: number;
    total: number;
    hotPercentage: number;
  };
  hotDesatendidos: Array<{
    id: string;
    name: string;
    score: number | null;
    qualification: string | null;
    status: string;
    phone: string | null;
    lastInteractionAt: string | null;
    hoursSinceLastContact: number | null;
  }>;
}

function IntelligenceCards({
  intelligence,
}: {
  intelligence: IntelligenceShape;
}) {
  // Build wa.me link for a hot lead. Solo si tiene phone.
  const waMeLink = (phone: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 8) return null;
    return `https://wa.me/${digits}`;
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {/* LVR */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">
                Velocidad de Leads
              </p>
              <p className="text-3xl font-bold text-ink mt-1">
                {intelligence.lvrPercentage === null
                  ? "—"
                  : `${intelligence.lvrPercentage >= 0 ? "+" : ""}${Math.round(intelligence.lvrPercentage)}%`}
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                {intelligence.lvrCurrentWeek} esta semana · {intelligence.lvrPreviousWeek} la anterior
              </p>
            </div>
            <span
              className={
                "text-2xl " +
                (intelligence.lvrPercentage === null
                  ? ""
                  : intelligence.lvrPercentage >= 0
                  ? "text-emerald-500"
                  : "text-rose-500")
              }
            >
              {intelligence.lvrPercentage === null
                ? "📊"
                : intelligence.lvrPercentage >= 0
                ? "📈"
                : "📉"}
            </span>
          </div>
        </Card>

        {/* SLA Overdue */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">
                Leads Desatendidos (SLA &gt; 48h)
              </p>
              <p
                className={
                  "text-3xl font-bold mt-1 " +
                  (intelligence.slaOverdueCount > 0
                    ? "text-rose-600"
                    : "text-ink")
                }
              >
                {intelligence.slaOverdueCount}
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                Sin contacto en 48h y sin tarea pendiente
              </p>
            </div>
            <span className="text-2xl">⚠️</span>
          </div>
        </Card>

        {/* Heat */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">
                Calor del Pipeline
              </p>
              <p className="text-3xl font-bold text-orange-600 mt-1">
                {intelligence.heat.total === 0
                  ? "—"
                  : `${Math.round(intelligence.heat.hotPercentage)}% hot`}
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                🔥 {intelligence.heat.hot} · 🌡 {intelligence.heat.warm} · ❄️{" "}
                {intelligence.heat.cold}
              </p>
            </div>
            <span className="text-2xl">🌡️</span>
          </div>
        </Card>
      </div>

      {/* Acciones Recomendadas para Hoy — top 5 Hot Desatendidos */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-ink">
            🎯 Acciones Recomendadas para Hoy
          </h3>
          <span className="text-xs text-ink-muted">
            Top {Math.min(5, intelligence.hotDesatendidos.length)} leads Hot
            desatendidos
          </span>
        </div>
        {intelligence.hotDesatendidos.length === 0 ? (
          <p className="text-sm text-ink-muted">
            🎉 No hay leads Hot desatendidos. Todo bajo control.
          </p>
        ) : (
          <ul className="space-y-3">
            {intelligence.hotDesatendidos.map((l) => {
              const link = waMeLink(l.phone);
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-orange-200 bg-orange-50/30"
                >
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{l.name}</span>
                      {typeof l.score === "number" && (
                        <span className="text-[10px] font-bold uppercase bg-orange-500 text-white px-1.5 py-0.5 rounded">
                          🔥 {l.score}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      {l.status} ·{" "}
                      {l.hoursSinceLastContact === null
                        ? "sin contacto"
                        : `último contacto hace ${Math.round(l.hoursSinceLastContact)} h`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition"
                      >
                        💚 Abrir WhatsApp
                      </a>
                    ) : (
                      <span className="text-xs text-ink-muted">sin teléfono</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Hook para abrir el drawer del lead con foco en
                        // crear tarea. Por ahora solo lo abre.
                        window.dispatchEvent(
                          new CustomEvent("qlick:schedule-followup", {
                            detail: { leadId: l.id },
                          }),
                        );
                      }}
                    >
                      📅 Agendar Seguimiento
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function ConversationsView({
  conversations,
  leads,
  owners,
  onSelectLead,
  onDeleteConversation,
}: {
  conversations: Conversation[];
  leads: Lead[];
  owners: SalesOwner[];
  onSelectLead: (lead: Lead) => void;
  onDeleteConversation?: (leadId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    conversations[0]?.id ?? null
  );
  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const lead = active ? leads.find((l) => l.id === active.leadId) : undefined;

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (isConfirmingDelete) {
      const t = setTimeout(() => setIsConfirmingDelete(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isConfirmingDelete]);

  // Si la conversación activa es eliminada, cambiar a la primera de la lista.
  useEffect(() => {
    if (activeId && !conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0]?.id ?? null);
    }
  }, [conversations, activeId]);

  // Sugerencias IA: si hay lead, intentar cargar las dinámicas vía API
  // real (Fase 3). Si falla o Supabase no está, caer al mock fallback.
  const [aiSuggestions, setAiSuggestions] = useState<Array<{
    intent: string;
    label: string;
    angle: string;
    message: string;
    whatsappUrl: string;
  }> | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const leadId = lead?.id;
    if (!leadId) {
      setAiSuggestions(null);
      return;
    }
    let cancelled = false;
    setAiError(null);
    fetch(`/api/admin/crm/ai-suggestions?leadId=${encodeURIComponent(leadId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && data?.ok && Array.isArray(data.suggestions)) {
          setAiSuggestions(data.suggestions);
        } else if (!cancelled) {
          setAiSuggestions([]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAiSuggestions([]);
          setAiError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lead?.id]);

  // Resolver lista de sugerencias a renderizar.
  // Si tenemos AI real, usamos eso. Si no, fallback al mock.
  const realSuggestions = aiSuggestions ?? [];
  const mockSuggestions = lead
    ? getAISuggestionsForLead(lead.id).map((s) => ({
        intent: s.type,
        label: "Demo",
        angle: "",
        message: s.content,
        whatsappUrl: "",
      }))
    : [];
  const suggestions =
    realSuggestions.length > 0
      ? realSuggestions
      : aiSuggestions === null
      ? mockSuggestions
      : [];

  if (!active) {
    return (
      <EmptyState
        title="Sin conversaciones"
        description="Cuando un lead escriba por WhatsApp o se registre una interacción manual, aparecerá aquí."
      />
    );
  }

  // Calcular tiempo desde el último mensaje (relativo, en español).
  const lastMessage = active.messages[0];
  const lastRelative = formatRelativeTime(lastMessage?.at);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Lista */}
      <Card className="p-2 lg:col-span-1 h-fit">
        <ul className="space-y-1">
          {conversations.map((c) => {
            const l = leads.find((x) => x.id === c.leadId);
            const cLastMsg = c.messages[0];
            const cLastRel = formatRelativeTime(cLastMsg?.at);
            return (
              <li key={c.id}>
                <button
                  onClick={() => setActiveId(c.id)}
                  className={
                    "w-full text-left rounded-lg px-3 py-2 transition " +
                    (c.id === active.id ? "bg-brand-50" : "hover:bg-brand-50/50")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink text-sm">
                      {l?.name ?? "Lead"}
                    </span>
                    <span className="text-[10px] text-ink-muted">{cLastRel}</span>
                  </div>
                  <p className="text-xs text-ink-muted line-clamp-1">
                    {cLastMsg?.body ?? c.summary ?? "Sin mensajes"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Panel de mensajes */}
      <Card className="p-4 lg:col-span-2 flex flex-col">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-brand-50">
          <div>
            <p className="font-bold text-ink">{lead?.name ?? "Lead"}</p>
            <p className="text-xs text-ink-muted">
              {active.channel === "whatsapp" ? "WhatsApp" : active.channel}
              {lastRelative ? ` · Último mensaje ${lastRelative}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              tone={
                active.status === "waiting_reply"
                  ? "warning"
                  : active.status === "escalated"
                  ? "danger"
                  : active.status === "resolved"
                  ? "neutral"
                  : "info"
              }
            >
              {active.status === "waiting_reply"
                ? "Esperando respuesta"
                : active.status === "open"
                ? "Abierta"
                : active.status === "resolved"
                ? "Resuelta"
                : "Escalada"}
            </Badge>
            {lead && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => onSelectLead(lead)}>
                  Ver lead
                </Button>
                {isConfirmingDelete ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      onDeleteConversation?.(lead.id);
                      setIsConfirmingDelete(false);
                    }}
                    className="animate-pulse"
                  >
                    ⚠️ ¿Confirmar?
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsConfirmingDelete(true)}
                    title="Eliminar conversación"
                  >
                    🗑️ Eliminar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2 mb-4 max-h-[420px] overflow-y-auto">
          {active.messages.map((m) => (
            <div
              key={m.id}
              className={
                "max-w-[80%] rounded-2xl px-3 py-2 text-sm " +
                (m.direction === "inbound"
                  ? "bg-brand-50 text-ink-soft"
                  : "bg-brand-500 text-white ml-auto")
              }
            >
              {m.author && (
                <span className="block text-[10px] uppercase opacity-70 mb-0.5">
                  {m.author}
                </span>
              )}
              {m.body}
              <span className="block text-[10px] opacity-60 mt-1">
                {formatDate(m.at)}
              </span>
            </div>
          ))}
        </div>

        {suggestions.length > 0 && (
          <div className="mt-auto space-y-2">
            <p className="text-xs font-bold uppercase text-brand-600">
              🤖 Sugerencias del Agente IA ({suggestions.length})
            </p>
            {suggestions.map((s, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-brand-100 p-3 bg-brand-50/30"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase text-brand-700">
                    {s.label}
                  </span>
                  {s.angle && (
                    <span className="text-[10px] text-ink-muted italic">
                      {s.angle}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-soft whitespace-pre-wrap">
                  {s.message}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {s.whatsappUrl ? (
                    <a
                      href={s.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition"
                    >
                      💚 Enviar por WhatsApp
                    </a>
                  ) : (
                    <span className="text-[10px] text-ink-muted">
                      sin teléfono
                    </span>
                  )}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-ink-muted pt-1">
              Revisa antes de enviar. El agente IA no envía mensajes
              automáticamente.
            </p>
            {aiError && (
              <p className="text-[10px] text-rose-600">
                ⚠️ AI endpoint: {aiError} (mostrando sugerencias demo).
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function WhatsAppConfigView({
  providers
}: {
  providers: ReturnType<typeof getWhatsAppProviders>;
}) {
  const [config, setConfig] = useState<ReturnType<typeof getWhatsAppConfigStatus> | null>(null);

  // Resolver config en cliente (env públicas).
  useEffect(() => {
    setConfig(getWhatsAppConfigStatus());
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-ink">Estado actual</h3>
          <Badge tone={config?.anyConfigured ? "success" : "warning"}>
            {config?.anyConfigured ? "Parcialmente configurado" : "Sin configurar"}
          </Badge>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <ConfigRow
            label="Número de ventas"
            ok={config?.salesNumber ?? false}
            varName="NEXT_PUBLIC_WHATSAPP_SALES_NUMBER"
          />
          <ConfigRow
            label="Número de soporte"
            ok={config?.supportNumber ?? false}
            varName="NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER"
          />
          <ConfigRow
            label="Grupo de alumnos"
            ok={config?.groupUrl ?? false}
            varName="NEXT_PUBLIC_WHATSAPP_GROUP_URL"
          />
        </div>
        <p className="text-xs text-ink-muted mt-3">
          Modo actual: WhatsApp manual (wa.me, click-to-chat). Los botones se habilitan
          solos al definir las variables en .env.local. No se inventan números.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="font-bold text-ink mb-3">Proveedores de WhatsApp</h3>
        <ul className="space-y-3">
          {providers.map((p) => (
            <li key={p.name} className="rounded-xl border border-brand-100 p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-ink">{p.displayName}</p>
                <div className="flex gap-2">
                  {p.active && <Badge tone="success">Activo</Badge>}
                  {p.stub && <Badge tone="neutral">Stub</Badge>}
                  {!p.active && !p.stub && <Badge tone="neutral">Inactivo</Badge>}
                </div>
              </div>
              <p className="text-xs font-semibold uppercase text-brand-600 mb-1">
                Requisitos
              </p>
              <ul className="text-sm text-ink-soft space-y-0.5 mb-2">
                {p.requirements.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
              {p.coexistenceNotes && (
                <p className="text-xs text-ink-muted">
                  <strong>Coexistencia:</strong> {p.coexistenceNotes}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-ink-muted">
        Para mensajería outbound automatizada y plantillas se necesita la Cloud API
        oficial o un BSP. Ver docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md.
      </p>
    </div>
  );
}

/* ----------------------- Helpers UI ----------------------- */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  );
}

function ConfigRow({
  label,
  ok,
  varName
}: {
  label: string;
  ok: boolean;
  varName: string;
}) {
  return (
    <div className="rounded-lg border border-brand-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-ink-muted">{label}</span>
        <Badge tone={ok ? "success" : "warning"}>{ok ? "OK" : "Falta"}</Badge>
      </div>
      <p className="text-xs text-ink-muted mt-1 font-mono">{varName}</p>
    </div>
  );
}

type Option = { value: string; label: string };

function Select({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-brand-100 bg-white px-3 py-3 text-sm text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function statusOptions(): Option[] {
  return [
    { value: "all", label: "Todas las etapas" },
    ...Object.entries(leadStatusLabel).map(([value, label]) => ({ value, label }))
  ];
}

function sourceOptions(): Option[] {
  return [
    { value: "all", label: "Todas las fuentes" },
    ...Object.entries(leadSourceLabel).map(([value, label]) => ({ value, label }))
  ];
}

function intentOptions(): Option[] {
  return Object.entries(leadIntentLabel).map(([value, label]) => ({ value, label }));
}

/* ----------------------- LeadActionsMenu Component ----------------------- */

function LeadActionsMenu({
  lead,
  onMoveLead,
  onArchiveLead,
  onDeleteConversation,
}: {
  lead: Lead;
  onMoveLead?: (leadId: string, newStatus: LeadStatus) => void;
  onArchiveLead?: (leadId: string) => void;
  onDeleteConversation?: (leadId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="p-1.5 rounded-lg border border-brand-200 text-ink-muted hover:bg-brand-50 hover:text-brand-600 transition text-xs flex items-center justify-center bg-white"
        title="Acciones rápidas"
      >
        ⚙️
      </button>
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
            }}
          />
          <div className="absolute right-0 top-8 w-48 bg-white border border-brand-100 rounded-lg shadow-lg z-30 p-1 text-xs text-left">
            <p className="font-semibold text-ink-muted px-2 py-1 border-b border-brand-50">Mover a:</p>
            {PIPELINE_ORDER.filter(s => s !== lead.status).map(status => (
              <button
                key={status}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveLead?.(lead.id, status);
                  setShowMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-brand-50 rounded text-ink-soft transition font-medium"
              >
                ➡️ {leadStatusLabel[status]}
              </button>
            ))}
            <div className="border-t border-brand-50 my-1"></div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`¿Archivar a ${lead.name}? El lead no se borra físicamente.`)) {
                  onArchiveLead?.(lead.id);
                }
                setShowMenu(false);
              }}
              className="w-full text-left px-2 py-1.5 hover:bg-red-50 text-red-600 rounded font-semibold transition"
            >
              📥 Archivar lead
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation?.(lead.id);
                setShowMenu(false);
              }}
              className="w-full text-left px-2 py-1.5 hover:bg-red-50 text-red-600 rounded font-semibold transition"
            >
              💬 Eliminar conversación
            </button>
          </div>
        </>
      )}
    </div>
  );
}
