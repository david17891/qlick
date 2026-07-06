import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge } from "@/components/ui";
import { Tooltip } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminEvents } from "@/lib/events";
import { AdminEventosClient } from "@/components/events/AdminEventosClient";

export const metadata: Metadata = {
  title: "Eventos · Admin · Qlick",
  description: "Gestión de eventos, confirmados, asistentes y encuestas.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminEventosListPage() {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const summaries = await getAdminEvents();
  const publishedCount = summaries.filter(
    (s) => s.event.status === "published",
  ).length;
  const draftCount = summaries.filter((s) => s.event.status === "draft").length;
  const archivedCount = summaries.filter(
    (s) => s.event.status === "archived",
  ).length;

  // ── Métricas globales agregadas (Fase 6 Hito C)
  const totalConfirmations = summaries.reduce(
    (acc, s) => acc + s.confirmationCount,
    0,
  );
  const totalAttendees = summaries.reduce((acc, s) => acc + s.attendeeCount, 0);
  const totalSurveys = summaries.reduce((acc, s) => acc + s.surveyCount, 0);
  const totalLeadsPromoted = summaries.reduce(
    (acc, s) => acc + s.leadsPromoted,
    0,
  );
  const totalUnmatched = summaries.reduce(
    (acc, s) => acc + s.surveyUnmatchedCount,
    0,
  );
  // Conversion global: solo sobre eventos PASADOS. Eventos próximos aún no
  // tienen leads promovidos (la encuesta no se ha hecho), así que incluirlos
  // distorsiona la métrica artificialmente hacia abajo.
  const now = new Date();
  const pastEventSummaries = summaries.filter(
    (s) => s.event.startsAt && new Date(s.event.startsAt) < now,
  );
  const pastConfirmations = pastEventSummaries.reduce(
    (acc, s) => acc + s.confirmationCount,
    0,
  );
  const pastLeadsPromoted = pastEventSummaries.reduce(
    (acc, s) => acc + s.leadsPromoted,
    0,
  );
  const globalConversion =
    pastConfirmations > 0
      ? Math.round((pastLeadsPromoted / pastConfirmations) * 100)
      : null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-4 text-xs text-ink-muted flex items-center gap-2">
            <Link href="/admin" className="hover:text-ink">
              ← Panel principal
            </Link>
          </div>
          <div className="mb-6">
            <p className="text-sm text-ink-muted">Admin · Eventos</p>
            <h1 className="text-3xl font-bold text-ink">Embudo de eventos</h1>
            <p className="text-ink-muted text-sm mt-1">
              {summaries.length} eventos · {publishedCount} publicados · {draftCount} en borrador · {archivedCount} archivados
            </p>
          </div>

          {/* Header con métricas globales (Fase 6 Hito C) */}
          <Card className="p-5 mb-6">
            <h2 className="text-xs font-bold uppercase text-brand-600 mb-3 tracking-wide">
              Métricas globales
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <GlobalStat
                icon="📋"
                label="Confirmados"
                value={totalConfirmations}
                hint="en todos los eventos"
                tooltip="Total de personas que confirmaron asistencia (vía Excel, form público o manual) en todos los eventos."
              />
              <GlobalStat
                icon="✅"
                label="Asistentes"
                value={totalAttendees}
                hint={`${totalConfirmations > 0 ? Math.round((totalAttendees / totalConfirmations) * 100) : 0}% de confirmados`}
                tooltip="Personas que efectivamente check-in en el evento. El % es sobre el total de confirmados."
                tone="emerald"
              />
              <GlobalStat
                icon="📝"
                label="Encuestas"
                value={totalSurveys}
                hint="completadas"
                tooltip="Respuestas de encuesta post-evento. Sin consentimiento comercial no se promueven a lead."
                tone="amber"
              />
              <GlobalStat
                icon="🧲"
                label="Leads promovidos"
                value={totalLeadsPromoted}
                hint="desde encuestas"
                tooltip="Leads generados automáticamente desde encuestas con consent=true + email/phone válido."
                tone="blue"
              />
              <GlobalStat
                icon="⚠️"
                label="Sin match"
                value={totalUnmatched}
                hint="encuestas sin consent"
                tooltip="Respuestas con interés comercial que NO se promovieron a lead (regla inquebrantable: sin consent no se contacta)."
                tone="neutral"
              />
              <GlobalStat
                icon="📈"
                label="Conversión"
                value={globalConversion === null ? "—" : `${globalConversion}%`}
                hint={`leads / confirmados (eventos pasados)`}
                tooltip="Porcentaje de confirmados en eventos PASADOS que terminaron como leads en el CRM. Eventos próximos se excluyen porque aún no tienen leads promovidos. Mide la eficiencia del funnel de eventos."
                tone="brand"
                highlight
                align="end"
              />
            </div>
          </Card>

          <AdminEventosClient initialSummaries={summaries} />
        </Container>
      </main>
      <Footer />
    </>
  );
}

/**
 * Stat card compacto con tooltip. Usado en el header de métricas globales.
 * Distinto de `Stat` interno de la página de detalle: este es más compacto
 * y está tipado para los 5 stat cards del header.
 */
function GlobalStat({
  icon,
  label,
  value,
  hint,
  tooltip,
  tone,
  highlight,
  align,
}: {
  icon: string;
  label: string;
  value: number | string;
  hint?: string;
  tooltip: string;
  tone?: "brand" | "emerald" | "amber" | "blue" | "neutral";
  highlight?: boolean;
  align?: "start" | "end";
}) {
  const toneClass: Record<NonNullable<typeof tone>, string> = {
    brand: "text-brand-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    neutral: "text-ink",
  };
  const labelColor = tone ? toneClass[tone] : "text-ink";
  return (
    <div
      className={
        "rounded-lg p-3 " +
        (highlight ? "bg-brand-50/70 ring-1 ring-brand-200" : "bg-white/50")
      }
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span aria-hidden="true">{icon}</span>
        <p className={"text-[10px] font-bold uppercase tracking-wide " + labelColor}>
          {label}
        </p>
        <Tooltip
          text={tooltip}
          tone={tone === "brand" ? "brand" : "muted"}
          align={align}
        />
      </div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="text-[10px] text-ink-muted mt-0.5">{hint}</p>}
    </div>
  );
}