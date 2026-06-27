import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import {
  getEventById,
  getConfirmationsByEventId,
  getAttendeesByEventId,
  getUnmatchedAttendees,
  getSurveysByEventId,
} from "@/lib/events";
import { getLeadsForEvent } from "@/lib/crm";
import { formatDate } from "@/lib/utils";

interface Props {
  params: { id: string };
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

export default async function AdminEventoDetailPage({ params }: Props) {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
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
  ] = await Promise.all([
    getEventById(params.id),
    getConfirmationsByEventId(params.id),
    getAttendeesByEventId(params.id),
    getUnmatchedAttendees(params.id),
    getSurveysByEventId(params.id),
    getLeadsForEvent(params.id),
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

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          {/* Breadcrumb */}
          <div className="mb-4 text-xs text-ink-muted flex items-center gap-2">
            <Link href="/admin/eventos" className="hover:text-ink">
              ← Eventos
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

          {/* Sección 1: Confirmados */}
          <Section
            title="Confirmados"
            subtitle={`${confirmedCount} personas dijeron que iban. Aún no sabemos si vinieron.`}
          >
            {confirmations.length === 0 ? (
              <EmptyState
                title="Sin confirmaciones aún"
                description="Importá el Excel de confirmados o usá el formulario público para empezar."
              />
            ) : (
              <Table headers={["Nombre", "Email", "Teléfono", "Fuente", "Confirmó"]}>
                {confirmations.map((c) => (
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

          {/* Sección 2: Asistentes */}
          <Section
            title="Asistentes"
            subtitle={`${attendedCount} check-ins registrados. ${unmatchedCount} vinieron sin confirmar antes (asistió "walk-in").`}
          >
            {attendees.length === 0 ? (
              <EmptyState
                title="Aún sin asistentes"
                description="Hacé check-in desde el panel el día del evento o importá el Excel de asistencia."
              />
            ) : (
              <Table
                headers={["Nombre", "Email", "Teléfono", "Confirmación", "Check-in"]}
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
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* Sección 3: Encuestas */}
          <Section
            title="Encuestas"
            subtitle={`${surveysCount} respuestas · ${surveysWithConsent} con consentimiento comercial · ${surveysCount - surveysWithConsent} sin consentimiento (visibilidad, no se promovieron a lead).`}
          >
            {surveys.length === 0 ? (
              <EmptyState
                title="Sin encuestas aún"
                description="Cuando alguien complete la encuesta post-evento, va a aparecer acá."
              />
            ) : (
              <Table
                headers={["Email", "Teléfono", "Consent", "Interés", "Promovido a lead"]}
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
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* Sección 4: Leads promovidos */}
          <Section
            title="Leads promovidos desde este evento"
            subtitle={`${leadsPromoted} leads generados a partir de encuestas con consent o confirmados con datos.`}
          >
            {leadsWithLinks.length === 0 ? (
              <EmptyState
                title="Sin leads aún"
                description="Los leads se generan automáticamente cuando una encuesta tiene consent=true + email/phone."
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
                        </div>
                      </div>
                      <Link
                        href={`/admin?tab=crm&leadId=${lead.id}`}
                        className="text-brand-700 underline text-sm"
                      >
                        Ver lead en CRM →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
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
