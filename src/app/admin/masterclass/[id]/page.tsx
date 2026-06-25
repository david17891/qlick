import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import {
  getAdminMasterclassById,
  getRegistrationsByMasterclass,
} from "@/lib/masterclasses";
import { formatDate } from "@/lib/utils";
import { RegistrationActions } from "./RegistrationActions";

interface Props {
  params: { id: string };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  const masterclass = await getAdminMasterclassById(params.id);
  return {
    title: masterclass
      ? `${masterclass.title} · Admin · Qlick`
      : "Masterclass · Admin · Qlick",
    robots: { index: false, follow: false },
  };
}

export default async function AdminMasterclassDetailPage({ params }: Props) {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const masterclass = await getAdminMasterclassById(params.id);
  if (!masterclass) {
    notFound();
  }

  const registrations = await getRegistrationsByMasterclass(masterclass.id);

  const attended = registrations.filter(
    (r) => r.registration.attendanceStatus === "attended",
  ).length;
  const interested = registrations.filter(
    (r) => r.registration.commercialStatus === "interested",
  ).length;
  const converted = registrations.filter(
    (r) => r.registration.commercialStatus === "converted",
  ).length;

  const startsAtFormatted = masterclass.startsAt
    ? formatDate(masterclass.startsAt)
    : "Por confirmar";

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          {/* Breadcrumb */}
          <div className="mb-4 text-xs text-ink-muted flex items-center gap-2">
            <Link href="/admin/masterclass" className="hover:text-ink">
              ← Masterclasses
            </Link>
          </div>

          {/* Header */}
          <Card className="p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <Badge
                  tone={
                    masterclass.status === "published"
                      ? "success"
                      : masterclass.status === "draft"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {masterclass.status === "published"
                    ? "Publicada"
                    : masterclass.status === "draft"
                      ? "Borrador"
                      : "Archivada"}
                </Badge>
                <h1 className="text-2xl font-bold text-ink mt-2">
                  {masterclass.title}
                </h1>
                {masterclass.subtitle && (
                  <p className="text-ink-soft">{masterclass.subtitle}</p>
                )}
              </div>
              <Link
                href={`/masterclass/${masterclass.slug}`}
                target="_blank"
                className="text-xs text-brand-700 underline"
              >
                Ver landing pública ↗
              </Link>
            </div>
            <ul className="text-sm text-ink-soft grid sm:grid-cols-3 gap-2">
              <li>📅 {startsAtFormatted}</li>
              {masterclass.durationMinutes && (
                <li>⏱️ {masterclass.durationMinutes} min</li>
              )}
              {masterclass.instructorName && (
                <li>🎤 {masterclass.instructorName}</li>
              )}
            </ul>
            <div className="grid grid-cols-4 gap-3 mt-5 pt-5 border-t border-brand-100">
              <div>
                <p className="text-xs text-ink-muted">Registrados</p>
                <p className="text-2xl font-bold text-ink">
                  {registrations.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Asistieron</p>
                <p className="text-2xl font-bold text-emerald-700">{attended}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Interesados</p>
                <p className="text-2xl font-bold text-amber-700">{interested}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Convertidos</p>
                <p className="text-2xl font-bold text-brand-700">{converted}</p>
              </div>
            </div>
          </Card>

          {/* Lista de registrados */}
          <Card className="overflow-hidden">
            <div className="p-5 border-b border-brand-50">
              <h2 className="font-bold text-ink">Registrados</h2>
            </div>
            {registrations.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="Sin registros aún"
                  description="Comparte la landing para empezar a captar personas."
                />
              </div>
            ) : (
              <ul className="divide-y divide-brand-50">
                {registrations.map(({ registration, lead }) => (
                  <li key={registration.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="font-semibold text-ink">
                          {registration.name}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {registration.email}
                          {registration.phone && ` · ${registration.phone}`}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          <Badge tone="neutral">
                            Registro: {registration.registrationStatus}
                          </Badge>
                          <Badge tone="info">
                            Asistencia: {registration.attendanceStatus}
                          </Badge>
                          <Badge
                            tone={
                              registration.commercialStatus === "converted"
                                ? "success"
                                : registration.commercialStatus === "interested"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            Comercial: {registration.commercialStatus}
                          </Badge>
                          {lead && (
                            <Link
                              href={`/admin/crm?leadId=${lead.id}`}
                              className="text-brand-700 underline"
                            >
                              Ver lead en CRM →
                            </Link>
                          )}
                          {registration.phone && (
                            <a
                              href={`https://wa.me/${registration.phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 underline"
                            >
                              Abrir WhatsApp 💬
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-ink-muted mt-2">
                          Registrado: {formatDate(registration.registeredAt)}
                          {registration.attendedAt &&
                            ` · Asistió: ${formatDate(registration.attendedAt)}`}
                        </p>
                      </div>
                    </div>
                    <RegistrationActions
                      registrationId={registration.id}
                      currentAttendance={registration.attendanceStatus}
                      currentCommercial={registration.commercialStatus}
                      currentRegistration={registration.registrationStatus}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Container>
      </main>
      <Footer />
    </>
  );
}