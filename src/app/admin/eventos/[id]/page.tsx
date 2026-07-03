import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, EmptyState, SubmitButton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import {
  getEventById,
  getConfirmationsByEventId,
  getAttendeesByEventId,
  getUnmatchedAttendees,
  getSurveysByEventId,
  getUnmatchedConfirmations,
} from "@/lib/events";
import { getLeadsForEvent } from "@/lib/crm";
import { formatDate } from "@/lib/utils";
import { filterConfirmations, resolveConfirmationSource } from "@/lib/events/confirmation-filter";
import { PipelineColumn } from "./_components/PipelineColumn";
import { PipelineCard } from "./_components/PipelineCard";
import { markSurveyReviewedAction, unmarkSurveyReviewedAction, linkAttendeeToConfirmationAction, markWhatsAppStatusAction } from "./_actions";
import { WHATSAPP_STATUSES, WHATSAPP_STATUS_LABEL, WHATSAPP_STATUS_TONE, type WhatsAppStatus } from "@/lib/leads/whatsapp-status";
import { buildEventBroadcast } from "@/lib/contact/whatsapp";
import { buildDirectWhatsAppLink, buildLeadOutreachMessage } from "@/lib/contact/whatsapp";
import { calculateEventMetrics } from "@/lib/events/event-metrics";
import { CampaignsTab } from "./_components/CampaignsTab";
import { CheckInTab } from "./_components/CheckInTab";

interface Props {
  params: { id: string };
  searchParams: {
    tab?: string;
    /** Búsqueda por nombre/email/teléfono en Confirmados. */
    q?: string;
    /** Filtro por fuente de la confirmación. */
    source?: string;
    /** Vista activa: "tabs" (default) o "pipeline" (Kanban). */
    view?: string;
    /** Broadcast de WhatsApp abierto: "1" muestra el panel en Confirmados. */
    broadcast?: string;
    /** Período del dashboard de campañas Meta. */
    campaign_period?: string;
  };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  const event = await getEventById(params.id);
  return {
    title: event
      ? `${event.title} · Admin · Qlick`
      : "Evento · Admin · Qlick",
    robots: { index: false, follow: false },
  };
}

/**
 * Tabs disponibles en `/admin/eventos/[id]`. URL-driven (server-side,
 * sin JS adicional): el admin hace click en un pill y la URL cambia a
 * `?tab=<id>`. Default: "confirmations".
 *
 * Mantener en sync con los condicionales `{activeTab === "..." && ...}`
 * más abajo y con el array `tabs` que renderiza los pills.
 */
type EventDetailTab =
  | "confirmations"
  | "attendees"
  | "surveys"
  | "leads"
  | "campaigns"
  | "checkin";
const VALID_TABS: readonly EventDetailTab[] = [
  "confirmations",
  "attendees",
  "surveys",
  "leads",
  "campaigns",
  "checkin",
] as const;
const DEFAULT_TAB: EventDetailTab = "confirmations";

/**
 * Vistas disponibles: "tabs" (default, 4 secciones apiladas) o
 * "pipeline" (Kanban 5 columnas con cards por nivel del funnel).
 */
type EventDetailView = "tabs" | "pipeline";
const VALID_VIEWS: readonly EventDetailView[] = ["tabs", "pipeline"] as const;
const DEFAULT_VIEW: EventDetailView = "tabs";

const statusTone = {
  published: "success" as const,
  draft: "warning" as const,
  archived: "neutral" as const,
};

const statusLabel = {
  published: "Publicado",
  draft: "Borrador",
  archived: "Archivado",
};

export default async function AdminEventoDetailPage({
  params,
  searchParams,
}: Props) {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  // Resolver tab activo desde query string. Si llega un valor
  // desconocido (ej. ?tab=xyz), caemos al default para no romper la
  // página ni exponer un estado vacío raro.
  const requestedTab = searchParams.tab;
  const activeTab: EventDetailTab = (
    VALID_TABS as readonly string[]
  ).includes(requestedTab ?? "")
    ? (requestedTab as EventDetailTab)
    : DEFAULT_TAB;

  // Resolver vista activa (tabs vs pipeline). Default: tabs.
  const requestedView = searchParams.view;
  const activeView: EventDetailView = (
    VALID_VIEWS as readonly string[]
  ).includes(requestedView ?? "")
    ? (requestedView as EventDetailView)
    : DEFAULT_VIEW;

  // Filtros de Confirmados. Se aplican via `filterConfirmations`
  // (función pura en `src/lib/events/confirmation-filter.ts`,
  // testeada en `tests/confirmation-filter.test.mjs`).
  const rawSource = searchParams.source ?? "";
  const activeSource = resolveConfirmationSource(rawSource);
  const searchQuery = (searchParams.q ?? "").trim();

  /** Helper para construir URLs de tab preservando los filtros activos. */
  function tabHref(tabId: EventDetailTab): string {
    const queryParams = new URLSearchParams();
    queryParams.set("tab", tabId);
    if (searchQuery) queryParams.set("q", searchQuery);
    if (activeSource) queryParams.set("source", activeSource);
    return `/admin/eventos/${params.id}?${queryParams.toString()}`;
  }

  /** Helper para construir URLs de view (tabs/pipeline), preservando
   *  el tab activo y los filtros del modo tabs. */
  function viewHref(viewId: EventDetailView): string {
    const queryParams = new URLSearchParams();
    queryParams.set("view", viewId);
    if (viewId === "tabs") {
      // En modo tabs, preservamos el tab activo + filtros.
      queryParams.set("tab", activeTab);
      if (searchQuery) queryParams.set("q", searchQuery);
      if (activeSource) queryParams.set("source", activeSource);
    }
    return `/admin/eventos/${params.id}?${queryParams.toString()}`;
  }

  // Fetch del evento + 4 datasets en paralelo. El admin abre esta
  // página para ver "todo lo relacionado con este evento", así que
  // no tiene sentido hacer lazy loading por sección en MVP.
  const [
    event,
    confirmations,
    attendees,
    unmatchedAttendees,
    surveys,
    leadsWithLinks,
    unmatchedConfirmations,
  ] = await Promise.all([
    getEventById(params.id),
    getConfirmationsByEventId(params.id),
    getAttendeesByEventId(params.id),
    getUnmatchedAttendees(params.id),
    getSurveysByEventId(params.id),
    getLeadsForEvent(params.id),
    getUnmatchedConfirmations(params.id),
  ]);

  if (!event) {
    notFound();
  }

  // Conteos para el header.
  const confirmedCount = confirmations.length;
  const attendedCount = attendees.length;
  const unmatchedCount = unmatchedAttendees.length;
  const surveysCount = surveys.length;
  const surveysWithConsent = surveys.filter(
    (s) => s.consentToContact,
  ).length;
  const leadsPromoted = leadsWithLinks.length;

  // Metricas de conversion (Sub-bloque 1C). Calculadas en server-side,
  // no se rerenderizan con la interaccion del cliente.
  const metrics = calculateEventMetrics({
    event,
    confirmedCount,
    attendedCount,
    unmatchedCount,
    surveysCount,
    surveysWithConsent,
    leadsPromoted,
  });
  /** Formatea un rate o devuelve "—" si es null (sin datos). */
  const fmtRate = (r: number | null): string => (r === null ? "—" : `${r}%`);

  // Pills de tabs. Mismo patrón visual que `AdminView.tsx` (pills
  // redondos, activo lleno de brand, inactivos hover brand-50).
  const tabs: Array<{
    id: EventDetailTab;
    label: string;
    icon: string;
    count: number;
  }> = [
    { id: "confirmations", label: "Confirmados", icon: "📋", count: confirmedCount },
    { id: "attendees", label: "Asistentes", icon: "✅", count: attendedCount },
    { id: "surveys", label: "Encuestas", icon: "📝", count: surveysCount },
    { id: "leads", label: "Leads promovidos", icon: "🧲", count: leadsPromoted },
    { id: "campaigns", label: "Campañas", icon: "📣", count: 0 },
    { id: "checkin", label: "Check-in", icon: "📲", count: 0 },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          {/* Breadcrumb */}
          <div className="mb-4 text-xs text-ink-muted flex items-center justify-between gap-2">
            <Link href="/admin/eventos" className="hover:text-ink">
              ← Eventos
            </Link>
            <Link
              href={`/admin/eventos/${event.id}/import`}
              className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 font-semibold"
            >
              📥 Importar Excel
            </Link>
          </div>

          {/* Header con métricas */}
          <Card className="p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <Badge tone={statusTone[event.status]}>
                  {statusLabel[event.status]}
                </Badge>
                <h1 className="text-2xl font-bold text-ink mt-2">
                  {event.title}
                </h1>
                {event.description && (
                  <p className="text-ink-soft mt-1">{event.description}</p>
                )}
              </div>
              <span className="text-xs text-ink-muted">/{event.slug}</span>
            </div>
            <ul className="text-sm text-ink-soft grid sm:grid-cols-3 gap-2 mb-5">
              <li>📅 {formatDate(event.startsAt)}</li>
              {event.endsAt && <li>🕒 Hasta {formatDate(event.endsAt)}</li>}
              {event.location && <li>📍 {event.location}</li>}
            </ul>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-5 border-t border-brand-100">
              <Stat label="Confirmados" value={confirmedCount} tone="brand" />
              <Stat label="Asistentes" value={attendedCount} tone="emerald" />
              <Stat
                label="Encuestas c/ consent"
                value={surveysWithConsent}
                hint={`${surveysCount} totales`}
                tone="amber"
              />
              <Stat
                label="Leads nuevos"
                value={leadsPromoted}
                tone="blue"
              />
              <Stat
                label="Sin match"
                value={unmatchedCount}
                hint="vinieron sin confirmar"
                tone="neutral"
              />
            </div>
          </Card>

          {/* Sub-bloque 1C: Metricas de conversion del evento.
              Tasas reales del funnel (no counts): asistencia, consent,
              conversion a lead, overall. Si el denominador es 0,
              mostramos "—". */}
          <Card className="p-5 mb-6">
            <h2 className="text-sm font-bold uppercase text-brand-600 mb-3">
              Conversion del funnel
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-brand-50/50 p-3">
                <p className="text-[10px] uppercase text-ink-muted font-semibold">
                  Asistencia
                </p>
                <p className="text-2xl font-bold text-brand-700 mt-1">
                  {fmtRate(metrics.attendanceRate)}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">
                  {attendedCount} de {confirmedCount} confirmados
                </p>
              </div>
              <div className="rounded-xl bg-amber-50/50 p-3">
                <p className="text-[10px] uppercase text-ink-muted font-semibold">
                  Consent
                </p>
                <p className="text-2xl font-bold text-amber-700 mt-1">
                  {fmtRate(metrics.consentRate)}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">
                  {surveysWithConsent} de {surveysCount} encuestas
                </p>
              </div>
              <div className="rounded-xl bg-blue-50/50 p-3">
                <p className="text-[10px] uppercase text-ink-muted font-semibold">
                  A lead
                </p>
                <p className="text-2xl font-bold text-blue-700 mt-1">
                  {fmtRate(metrics.leadConversionRate)}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">
                  {leadsPromoted} de {surveysWithConsent} con consent
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50/50 p-3">
                <p className="text-[10px] uppercase text-ink-muted font-semibold">
                  Overall
                </p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  {fmtRate(metrics.overallConversionRate)}
                </p>
                <p className="text-[10px] text-ink-muted mt-0.5">
                  {leadsPromoted} de {confirmedCount} confirmados
                </p>
              </div>
            </div>
          </Card>

          {/* Toggle de vista: "Tabs" (lista con pills) o "Pipeline" (Kanban).
              URL-driven con ?view=tabs|pipeline. Default: tabs. */}
          <div className="flex items-center gap-1 mb-4 p-1 bg-brand-50/50 rounded-full w-fit" role="tablist" aria-label="Modo de vista">
            {(["tabs", "pipeline"] as const).map((v) => {
              const isActive = activeView === v;
              return (
                <Link
                  key={v}
                  href={viewHref(v)}
                  role="tab"
                  aria-selected={isActive}
                  className={
                    "px-4 py-1.5 rounded-full text-xs font-semibold transition " +
                    (isActive
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-ink-soft hover:text-ink")
                  }
                >
                  {v === "tabs" ? "📑 Vista tabs" : "🧩 Vista pipeline"}
                </Link>
              );
            })}
          </div>

          {/* Pills de tabs (URL-driven: ?tab=confirmations|attendance|surveys|leads).
              Server-side, sin JS: cada pill es un Link que cambia el search param. */}
          {activeView === "tabs" && (
            <div
              role="tablist"
              aria-label="Secciones del detalle del evento"
              className="flex flex-wrap items-center gap-2 mb-6 border-b border-brand-100 pb-3"
            >
            {tabs.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <Link
                  key={t.id}
                  href={tabHref(t.id)}
                  role="tab"
                  aria-selected={isActive}
                  scroll={false}
                  className={
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap " +
                    (isActive
                      ? "bg-brand-500 text-white"
                      : "text-ink-soft hover:bg-brand-50")
                  }
                >
                  <span aria-hidden="true">{t.icon}</span>
                  {t.label}
                  <span
                    className={
                      "ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs " +
                      (isActive
                        ? "bg-white/25 text-white"
                        : "bg-brand-50 text-brand-700")
                    }
                  >
                    {t.count}
                  </span>
                </Link>
              );
            })}
          </div>
          )}

          {/* Sección 1: Confirmados */}
          {activeTab === "confirmations" && (() => {
            // Filtrado via `filterConfirmations` (puro, testeado en
            // `tests/confirmation-filter.test.mjs`).
            const { filtered: filteredConfirmations, isFiltered } =
              filterConfirmations({
                confirmations,
                query: searchQuery,
                source: activeSource,
              });
            // Panel broadcast: ?broadcast=1 muestra la lista pre-armada
            // de links wa.me para mandar recordatorio a los confirmados.
            const showBroadcast = searchParams.broadcast === "1";
            const broadcast = buildEventBroadcast({
              confirmations: filteredConfirmations.map((c) => ({
                id: c.id,
                name: c.name,
                phoneNormalized: c.phoneNormalized,
                phoneRaw: c.phoneRaw,
              })),
              eventTitle: event.title,
              eventDate: formatDate(event.startsAt),
              eventLocation: event.location,
              eventUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/eventos/${event.slug}`,
            });
            return (
              <Section
                title="Confirmados"
                subtitle={
                  isFiltered
                    ? `Mostrando ${filteredConfirmations.length} de ${confirmedCount} confirmaciones con los filtros activos.`
                    : `${confirmedCount} personas dijeron que iban. Aún no sabemos si vinieron.`
                }
              >
                {/* Toolbar con accion de broadcast WhatsApp. */}
                <div className="p-5 border-b border-brand-50 flex flex-wrap items-center justify-between gap-3 bg-brand-50/20">
                  <p className="text-xs text-ink-muted">
                    Recordatorio masivo por WhatsApp a los confirmados con telefono.
                  </p>
                  {showBroadcast ? (
                    <Link
                      href={`/admin/eventos/${params.id}?tab=confirmations${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${activeSource ? `&source=${activeSource}` : ""}`}
                      scroll={false}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-brand-200 text-ink-soft hover:bg-brand-50 transition"
                    >
                      ← Volver a la lista
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/eventos/${params.id}?tab=confirmations&broadcast=1${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${activeSource ? `&source=${activeSource}` : ""}`}
                      scroll={false}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition shadow-sm"
                    >
                      📱 Generar broadcast de WhatsApp
                    </Link>
                  )}
                </div>

                {/* Panel broadcast: ?broadcast=1 muestra la lista pre-armada
                    de links wa.me. Solo si hay config (sales number) y al
                    menos un item/skipped. */}
                {showBroadcast && (
                  <div className="p-5 border-b border-brand-50 bg-emerald-50/40">
                    {!broadcast.configured ? (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                        <strong>Configuracion pendiente:</strong> define{" "}
                        <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">
                          NEXT_PUBLIC_WHATSAPP_SALES_NUMBER
                        </code>{" "}
                        en <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">.env.local</code>{" "}
                        para habilitar el broadcast. El resto del admin sigue funcionando.
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 p-3 rounded-lg bg-white border border-brand-200">
                          <p className="text-xs font-semibold text-ink-muted mb-1">
                            Vista previa del mensaje (se envia a todos):
                          </p>
                          <pre className="text-xs text-ink-soft whitespace-pre-wrap font-sans">
                            {broadcast.messagePreview}
                          </pre>
                        </div>
                        {broadcast.items.length === 0 ? (
                          <p className="text-sm text-ink-muted italic">
                            Ningun confirmado con telefono valido. Importá los telefonos o limpia los filtros.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {broadcast.items.map((item) => (
                              <li
                                key={item.confirmationId}
                                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-brand-100 bg-white"
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm text-ink truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-ink-muted">
                                    +{item.phone.slice(0, 2)} {item.phone.slice(2, 6)} {item.phone.slice(6, 10)}
                                  </p>
                                </div>
                                <a
                                  href={item.waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition shrink-0"
                                >
                                  📱 Abrir WhatsApp
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                        {broadcast.skipped.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-brand-100">
                            <p className="text-xs font-semibold text-ink-muted mb-2">
                              Sin telefono ({broadcast.skipped.length}):
                            </p>
                            <ul className="text-xs text-ink-muted space-y-1">
                              {broadcast.skipped.map((s) => (
                                <li key={s.confirmationId}>
                                  • {s.name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="mt-4 text-xs text-ink-muted">
                          Tip: hace click en cada "Abrir WhatsApp" para mandar el mensaje. WhatsApp Web
                          se abre en una pestana nueva. No automatiza envios masivos (eso requiere
                          WhatsApp Business API, Fase 6+).
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Form de filtros — GET, preserva `tab=confirmations` */}
                <form
                  method="GET"
                  action=""
                  className="p-5 border-b border-brand-50 flex flex-wrap gap-3 items-end bg-brand-50/30"
                  role="search"
                  aria-label="Filtrar confirmados"
                >
                  <input type="hidden" name="tab" value="confirmations" />
                  <div className="flex-1 min-w-[200px]">
                    <label
                      htmlFor="confirmations-q"
                      className="block text-xs font-semibold text-ink-muted mb-1"
                    >
                      Buscar
                    </label>
                    <input
                      id="confirmations-q"
                      name="q"
                      type="search"
                      defaultValue={searchQuery}
                      placeholder="Nombre, email o teléfono…"
                      className="w-full px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="confirmations-source"
                      className="block text-xs font-semibold text-ink-muted mb-1"
                    >
                      Fuente
                    </label>
                    <select
                      id="confirmations-source"
                      name="source"
                      defaultValue={activeSource}
                      className="px-3 py-2 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                    >
                      <option value="">Todas</option>
                      <option value="imported_excel">Importado Excel</option>
                      <option value="public_form">Formulario público</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:bg-brand-600 transition"
                  >
                    Aplicar
                  </button>
                  {isFiltered && (
                    <Link
                      href={`/admin/eventos/${params.id}?tab=confirmations`}
                      scroll={false}
                      className="px-4 py-2 text-ink-soft hover:text-ink text-sm underline self-center"
                    >
                      Limpiar filtros
                    </Link>
                  )}
                </form>

                {confirmations.length === 0 ? (
                  <EmptyState
                    icon="📭"
                    title="Aun no hay confirmados"
                    description="Importa el Excel de confirmados o comparte el link publico del evento para que la gente confirme."
                    action={
                      <div className="flex flex-wrap gap-2 justify-center">
                        <Link
                          href={`/admin/eventos/${event.id}/import`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition"
                        >
                          📥 Importar Excel
                        </Link>
                        <a
                          href={`/eventos/${event.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-brand-200 text-ink-soft hover:bg-brand-50 transition"
                        >
                          🔗 Ver link publico
                        </a>
                      </div>
                    }
                  />
                ) : filteredConfirmations.length === 0 ? (
                  <EmptyState
                    icon="🔍"
                    title="Sin resultados con esos filtros"
                    description="Proba quitar el filtro de fuente o limpiar la busqueda."
                  />
                ) : (
                  <Table headers={["Nombre", "Email", "Teléfono", "Fuente", "Confirmó"]}>
                    {filteredConfirmations.map((c) => (
                      <tr key={c.id} className="hover:bg-brand-50/30">
                        <td className="px-5 py-3 font-medium text-ink">{c.name}</td>
                        <td className="px-5 py-3 text-ink-muted">{c.email ?? "—"}</td>
                        <td className="px-5 py-3 text-ink-muted">
                          {c.phoneNormalized ?? c.phoneRaw ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone="neutral">{c.source}</Badge>
                        </td>
                        <td className="px-5 py-3 text-ink-muted text-xs">
                          {formatDate(c.confirmedAt)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Section>
            );
          })()}

          {/* Sección 2: Asistentes */}
          {activeTab === "attendees" && (
            <Section
              title="Asistentes"
              subtitle={`${attendedCount} check-ins registrados. ${unmatchedCount} vinieron sin confirmar antes (asistió "walk-in").`}
            >
            {attendees.length === 0 ? (
              <EmptyState
                icon="🚶"
                title="Aun no hay check-ins"
                description="Hace check-in desde el panel el dia del evento o importa el Excel de asistencia post-evento."
                action={
                  <Link
                    href={`/admin/eventos/${event.id}/import`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition"
                  >
                    📥 Importar Excel
                  </Link>
                }
              />
            ) : (
              <Table
                headers={["Nombre", "Email", "Teléfono", "Confirmación", "Check-in", "Match manual"]}
              >
                {attendees.map((a) => (
                  <tr key={a.id} className="hover:bg-brand-50/30">
                    <td className="px-5 py-3 font-medium text-ink">
                      {a.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-muted">{a.email ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-muted">
                      {a.phoneNormalized ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      {a.confirmationId ? (
                        <Badge tone="success">Matcheado</Badge>
                      ) : (
                        <Badge tone="warning">Sin match</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-muted text-xs">
                      {formatDate(a.checkedInAt)}
                      {a.checkedInBy && (
                        <span className="text-ink-muted">
                          {" "}por {a.checkedInBy}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {a.confirmationId ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : unmatchedConfirmations.length === 0 ? (
                        <span className="text-xs text-ink-muted italic">
                          Sin candidatos
                        </span>
                      ) : (
                        <form
                          action={linkAttendeeToConfirmationAction.bind(null, null)}
                          className="flex gap-1.5"
                        >
                          <input type="hidden" name="attendeeId" value={a.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <select
                            name="confirmationId"
                            required
                            className="text-xs border border-brand-200 rounded-md px-1.5 py-1 bg-white max-w-[180px]"
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Elegir…
                            </option>
                            {unmatchedConfirmations.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {c.email ? ` · ${c.email}` : ""}
                              </option>
                            ))}
                          </select>
                          <SubmitButton pendingLabel="Matcheando...">
                            Matchear
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
          )}

          {/* Sección 3: Encuestas */}
          {activeTab === "surveys" && (
            <Section
              title="Encuestas"
              subtitle={`${surveysCount} respuestas · ${surveysWithConsent} con consentimiento comercial · ${surveysCount - surveysWithConsent} sin consentimiento (visibilidad, no se promovieron a lead).`}
            >
            {surveys.length === 0 ? (
              <EmptyState
                icon="📭"
                title="Aun no hay encuestas"
                description="Cuando alguien complete la encuesta post-evento, va a aparecer aca. Las que tienen consent=true se promueven automaticamente a lead."
              />
            ) : (
              <Table
                headers={["Email", "Teléfono", "Consent", "Interés", "Promovido a lead", "Revisada"]}
              >
                {surveys.map((s) => (
                  <tr key={s.id} className="hover:bg-brand-50/30">
                    <td className="px-5 py-3 text-ink-muted">
                      {s.respondentEmail ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-muted">
                      {s.phoneNormalized ?? s.respondentPhone ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      {s.consentToContact ? (
                        <Badge tone="success">Sí</Badge>
                      ) : (
                        <Badge tone="danger">No</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-soft text-sm">
                      {s.commercialInterest ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {s.promotedToLeadId ? (
                        <span className="text-emerald-700 font-semibold">
                          ✓ {s.promotedAt && formatDate(s.promotedAt)}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {s.reviewedAt ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge tone="success">Revisada</Badge>
                          <span className="text-ink-muted text-[10px]">
                            {formatDate(s.reviewedAt)}
                            {s.reviewedBy && ` · ${s.reviewedBy}`}
                          </span>
                          <form action={unmarkSurveyReviewedAction.bind(null, null)} className="mt-1">
                            <input type="hidden" name="surveyId" value={s.id} />
                            <input type="hidden" name="eventId" value={event.id} />
                            <SubmitButton
                              variant="ghost"
                              size="sm"
                              pendingLabel="..."
                              className="text-[10px] text-ink-muted hover:text-ink underline !p-0 !bg-transparent"
                            >
                              des-marcar
                            </SubmitButton>
                          </form>
                        </div>
                      ) : (
                        <form action={markSurveyReviewedAction.bind(null, null)}>
                          <input type="hidden" name="surveyId" value={s.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <SubmitButton pendingLabel="Marcando...">
                            ✓ Marcar revisada
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
          )}

          {/* Sección 4: Leads promovidos */}
          {activeTab === "leads" && (
            <Section
              title="Leads promovidos desde este evento"
              subtitle={`${leadsPromoted} leads generados a partir de encuestas con consent o confirmados con datos.`}
            >
            {leadsWithLinks.length === 0 ? (
              <EmptyState
                icon="🧲"
                title="Aun no hay leads promovidos"
                description="Los leads se generan automaticamente cuando una encuesta tiene consent=true + email/phone. La automatizacion respeta la politica de PII del repo."
              />
            ) : (
              <ul className="divide-y divide-brand-50">
                {leadsWithLinks.map(({ lead, links }) => (
                  <li key={lead.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="font-semibold text-ink">{lead.name}</p>
                        <p className="text-sm text-ink-muted">
                          {lead.email}
                          {lead.phone && ` · ${lead.phone}`}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          <Badge tone="brand">
                            Status: {lead.status}
                          </Badge>
                          <Badge tone="neutral">
                            Source: {lead.source}
                          </Badge>
                          {links.map((l, i) => (
                            <Badge key={i} tone="info">
                              {l.linkType}
                            </Badge>
                          ))}
                          <Badge tone={WHATSAPP_STATUS_TONE[(lead.whatsappStatus ?? "no_contactado") as WhatsAppStatus]}>
                            💬 {WHATSAPP_STATUS_LABEL[(lead.whatsappStatus ?? "no_contactado") as WhatsAppStatus]}
                          </Badge>
                        </div>
                        {/* Bloque 2: form para cambiar estado de WhatsApp. */}
                        <form
                          action={markWhatsAppStatusAction.bind(null, null)}
                          className="flex gap-1.5 mt-1.5"
                        >
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <select
                            name="newStatus"
                            defaultValue={lead.whatsappStatus ?? "no_contactado"}
                            className="text-xs border border-brand-200 rounded-md px-1.5 py-1 bg-white"
                          >
                            {WHATSAPP_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {WHATSAPP_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <SubmitButton pendingLabel="...">Actualizar</SubmitButton>
                        </form>
                      </div>
                      <Link
                        href={`/admin?tab=crm&leadId=${lead.id}`}
                        className="text-brand-700 underline text-sm"
                      >
                        Ver lead en CRM →
                      </Link>
                      {(() => {
                        // Sub-bloque C base: link wa.me al numero del LEAD
                        // (no al de la empresa) con mensaje pre-armado.
                        const message = buildLeadOutreachMessage({
                          leadName: lead.name,
                          eventTitle: event.title,
                          commercialInterest: lead.courseOfInterest ?? undefined,
                        });
                        const link = buildDirectWhatsAppLink(lead.phone, message);
                        if (!link) return null;
                        return (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition"
                          >
                            📱 WhatsApp
                          </a>
                        );
                      })()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          )}

          {/* Sección 5: Campañas Meta (Fase 6 Hito C — solo lectura) */}
          {activeTab === "campaigns" && (
            <CampaignsTab
              eventId={event.id}
              period={searchParams.campaign_period}
            />
          )}

          {/* Sección 6: Check-in QR (Fase 6 Hito C) */}
          {activeTab === "checkin" && (
            <CheckInTab eventId={event.id} eventTitle={event.title} eventStartsAt={event.startsAt} />
          )}

          {/* Vista Pipeline (Kanban 5 columnas). Solo se renderiza cuando
              ?view=pipeline. Display-only por ahora: cada card muestra
              nombre, contacto, source y fecha. Las acciones por nivel
              (match manual, marcar revisada, WhatsApp) llegan en commits
              separados (Capa 3, Capa 4, Sub-bloque C). */}
          {activeView === "pipeline" && (
            <div
              className="grid gap-4 lg:grid-cols-5 md:grid-cols-3 sm:grid-cols-2 grid-cols-1"
              role="region"
              aria-label="Pipeline del evento"
            >
              {/* Columna 1: Confirmados */}
              <PipelineColumn
                icon="📋"
                title="Confirmados"
                count={confirmedCount}
                tone="brand"
              >
                {confirmations.length === 0 ? (
                  <p className="text-xs text-ink-muted italic text-center py-6 px-2">
                    Aun sin confirmados
                  </p>
                ) : (
                  confirmations.map((c) => (
                    <PipelineCard
                      key={c.id}
                      name={c.name}
                      email={c.email}
                      phone={c.phoneNormalized ?? c.phoneRaw}
                      source={c.source}
                      date={formatDate(c.confirmedAt)}
                    />
                  ))
                )}
              </PipelineColumn>

              {/* Columna 2: Asistentes */}
              <PipelineColumn
                icon="✅"
                title="Asistentes"
                count={attendedCount}
                tone="emerald"
              >
                {attendees.length === 0 ? (
                  <p className="text-xs text-ink-muted italic text-center py-6 px-2">
                    Aun sin check-ins
                  </p>
                ) : (
                  attendees.map((a) => (
                    <PipelineCard
                      key={a.id}
                      name={a.name ?? "Sin nombre"}
                      email={a.email}
                      phone={a.phoneNormalized}
                      source={a.source}
                      date={formatDate(a.checkedInAt)}
                    />
                  ))
                )}
              </PipelineColumn>

              {/* Columna 3: Encuestas */}
              <PipelineColumn
                icon="📝"
                title="Encuestas"
                count={surveysCount}
                tone="amber"
              >
                {surveys.length === 0 ? (
                  <p className="text-xs text-ink-muted italic text-center py-6 px-2">
                    Aun sin encuestas
                  </p>
                ) : (
                  surveys.map((s) => (
                    <PipelineCard
                      key={s.id}
                      name={s.respondentEmail ?? s.respondentPhone ?? "Anónimo"}
                      email={s.respondentEmail}
                      phone={s.phoneNormalized ?? s.respondentPhone}
                      source={s.consentToContact ? "consent sí" : "consent no"}
                      date={formatDate(s.submittedAt)}
                      reviewedAt={s.reviewedAt}
                      action={
                        !s.reviewedAt ? (
                          <form
                            action={markSurveyReviewedAction.bind(null, null)}
                            className="w-full"
                          >
                            <input type="hidden" name="surveyId" value={s.id} />
                            <input type="hidden" name="eventId" value={event.id} />
                            <button
                              type="submit"
                              className="w-full text-xs px-2 py-1 rounded-md bg-brand-500 text-white hover:bg-brand-600 transition font-semibold"
                            >
                              ✓ Marcar revisada
                            </button>
                          </form>
                        ) : null
                      }
                    />
                  ))
                )}
              </PipelineColumn>

              {/* Columna 4: Leads promovidos */}
              <PipelineColumn
                icon="🧲"
                title="Leads promovidos"
                count={leadsPromoted}
                tone="blue"
              >
                {leadsWithLinks.length === 0 ? (
                  <p className="text-xs text-ink-muted italic text-center py-6 px-2">
                    Aun sin leads
                  </p>
                ) : (
                  leadsWithLinks.map(({ lead, links }) => {
                    // Sub-bloque C base: link wa.me al numero del LEAD.
                    const message = buildLeadOutreachMessage({
                      leadName: lead.name,
                      eventTitle: event.title,
                      commercialInterest: lead.courseOfInterest ?? undefined,
                    });
                    const waLink = buildDirectWhatsAppLink(lead.phone, message);
                    const leadStatus = (lead.whatsappStatus ?? "no_contactado") as WhatsAppStatus;
                    return (
                      <PipelineCard
                        key={lead.id}
                        name={lead.name}
                        email={lead.email}
                        phone={lead.phone}
                        source={links[0]?.linkType ?? lead.source}
                        action={
                          <div className="flex flex-col gap-1.5">
                            <Badge tone={WHATSAPP_STATUS_TONE[leadStatus]}>
                              💬 {WHATSAPP_STATUS_LABEL[leadStatus]}
                            </Badge>
                            <form
                              action={markWhatsAppStatusAction.bind(null, null)}
                              className="flex gap-1"
                            >
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="eventId" value={event.id} />
                              <select
                                name="newStatus"
                                defaultValue={leadStatus}
                                className="text-xs border border-brand-200 rounded-md px-1 py-0.5 bg-white flex-1 min-w-0"
                              >
                                {WHATSAPP_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {WHATSAPP_STATUS_LABEL[s]}
                                  </option>
                                ))}
                              </select>
                              <SubmitButton
                                pendingLabel="..."
                                className="text-[10px] px-1.5 py-0.5"
                              >
                                ✓
                              </SubmitButton>
                            </form>
                            {waLink ? (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition"
                              >
                                📱 WhatsApp
                              </a>
                            ) : (
                              <p className="text-[10px] text-ink-muted text-center">
                                sin telefono
                              </p>
                            )}
                            <Link
                              href={`/admin?tab=crm&leadId=${lead.id}`}
                              className="text-[10px] text-brand-700 hover:underline text-center"
                            >
                              Ver en CRM →
                            </Link>
                          </div>
                        }
                      />
                    );
                  })
                )}
              </PipelineColumn>

              {/* Columna 5: Inscritos (futuro, sin server lib todavía) */}
              <PipelineColumn
                icon="🎓"
                title="Inscritos"
                count={0}
                tone="neutral"
              >
                <p className="text-xs text-ink-muted italic text-center py-6 px-2">
                  Fase 5+ — Inscritos a cursos
                </p>
              </PipelineColumn>
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-componentes locales (no se exportan; solo se usan acá)
// ─────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone: "brand" | "emerald" | "amber" | "blue" | "neutral";
}) {
  const colorClass: Record<typeof tone, string> = {
    brand: "text-brand-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    neutral: "text-ink",
  };
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-2xl font-bold ${colorClass[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden mb-6">
      <div className="p-5 border-b border-brand-50">
        <h2 className="font-bold text-ink">{title}</h2>
        <p className="text-xs text-ink-muted mt-1">{subtitle}</p>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left px-5 py-3 font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">{children}</tbody>
      </table>
    </div>
  );
}
