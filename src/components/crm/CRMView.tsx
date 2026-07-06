"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Lead,
  SalesOwner,
  LeadStatus,
  LeadSource,
  LeadIntent,
  CRMOverview
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
  calculateConversionRate
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
  const [realLeads, setRealLeads] = useState<Lead[] | null>(null);
  const [realLeadsError, setRealLeadsError] = useState<string | null>(null);
  const [realOverview, setRealOverview] = useState<CRMOverview | null>(null);
  const [realOverviewError, setRealOverviewError] = useState<string | null>(null);
  const [realPendingTasks, setRealPendingTasks] = useState<PendingTasksSplitClient | null>(null);

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

  // Leads efectivos: reales si están cargados, null mientras cargan en modo real.
  const mockLeads = getLeads();
  const owners = getSalesOwners();
  // Overview: real si está cargado (incluso durante carga para no parpadear);
  // demo si no. La carga inicial en realMode muestra el overview demo brevemente.
  const mockOverview = getCRMOverview();
  const overview = realMode ? (realOverview ?? mockOverview) : mockOverview;
  const conversations = getConversations();
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
  const leads = realMode
    ? realLeads ?? []
    : mockLeads;
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
              <div key={stage.status} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-sm font-bold text-ink">{stage.label}</span>
                  <Badge tone={stage.tone}>{stage.leads.length}</Badge>
                </div>
                <div className="space-y-2">
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
        <LeadsTable leads={leads} owners={owners} onSelect={setSelectedLead} />
      )}

      {/* D. Conversaciones */}
      {section === "conversaciones" && (
        <ConversationsView conversations={conversations} leads={leads} owners={owners} onSelectLead={setSelectedLead} />
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
            setSelectedLead(updated);
          }}
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
  onClick
}: {
  lead: Lead;
  owners: SalesOwner[];
  onClick: () => void;
}) {
  const risk = calculateLeadResponseRisk(lead);
  const owner = owners.find((o) => o.id === lead.ownerId);
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl bg-white border border-brand-100 p-3 hover:shadow-md hover:border-brand-300 transition"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-semibold text-ink text-sm leading-tight">{lead.name}</p>
        <Badge tone={riskTone[risk.level]} title={risk.reasons.join(", ")}>
          {riskLabel[risk.level][0]}
        </Badge>
      </div>
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
    </button>
  );
}

function LeadsTable({
  leads,
  owners,
  onSelect
}: {
  leads: Lead[];
  owners: SalesOwner[];
  onSelect: (lead: Lead) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [source, setSource] = useState<LeadSource | "all">("all");
  const [course, setCourse] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [intent, setIntent] = useState<LeadIntent | "all">("all");
  const [eventFilter, setEventFilter] = useState<string>("all");

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

  const filtered = leads.filter((l) => {
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
  });

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
      </div>
      <p className="px-4 py-2 text-xs text-ink-muted bg-brand-50/30">
        {filtered.length} de {leads.length} leads
      </p>
      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
            <tr>
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
                <tr key={l.id} className="hover:bg-brand-50/30">
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
                    <Button size="sm" variant="outline" onClick={() => onSelect(l)}>
                      Ver detalle
                    </Button>
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
    </Card>
  );
}

function ConversationsView({
  conversations,
  leads,
  owners,
  onSelectLead
}: {
  conversations: ReturnType<typeof getConversations>;
  leads: Lead[];
  owners: SalesOwner[];
  onSelectLead: (lead: Lead) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    conversations[0]?.id ?? null
  );
  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const lead = active ? leads.find((l) => l.id === active.leadId) : undefined;
  const suggestions = lead ? getAISuggestionsForLead(lead.id) : [];

  if (!active) {
    return <EmptyState title="Sin conversaciones" description="No hay conversaciones demo todavía." />;
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Lista */}
      <Card className="p-2 lg:col-span-1 h-fit">
        <ul className="space-y-1">
          {conversations.map((c) => {
            const l = leads.find((x) => x.id === c.leadId);
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
                    <Badge tone="success">mock</Badge>
                  </div>
                  <p className="text-xs text-ink-muted line-clamp-1">
                    {c.summary ?? "Sin resumen"}
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
              WhatsApp · {active.summary ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={active.status === "escalated" ? "danger" : "info"}>
              {active.status}
            </Badge>
            {lead && (
              <Button size="sm" variant="outline" onClick={() => onSelectLead(lead)}>
                Ver lead
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2 mb-4">
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
              {m.aiSuggested && (
                <span className="block text-[10px] uppercase opacity-80 mb-0.5">
                  Sugerencia IA (demo)
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
          <div className="mt-auto rounded-xl border border-brand-100 p-3 bg-brand-50/30">
            <p className="text-xs font-bold uppercase text-brand-600 mb-1">
              Sugerencia IA (demo)
            </p>
            <p className="text-sm text-ink-soft">{suggestions[0].content}</p>
            <p className="text-xs text-ink-muted mt-1">
              Revisa antes de enviar. El agente IA no envía mensajes automáticamente.
            </p>
          </div>
        )}
        <p className="text-xs text-ink-muted mt-3">
          Conversaciones demo. No hay conexión a WhatsApp Business API todavía.
        </p>
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
