import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, Button, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminEvents } from "@/lib/events";
import { formatDate } from "@/lib/utils";

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
  const draftCount = summaries.filter(
    (s) => s.event.status === "draft",
  ).length;
  const archivedCount = summaries.filter(
    (s) => s.event.status === "archived",
  ).length;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-6">
            <p className="text-sm text-ink-muted">Admin · Eventos</p>
            <h1 className="text-3xl font-bold text-ink">Embudo de eventos</h1>
            <p className="text-ink-muted text-sm mt-1">
              {summaries.length} eventos · {publishedCount} publicados · {draftCount} en borrador · {archivedCount} archivados
            </p>
          </div>

          {summaries.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="Aún no hay eventos"
                description="Crea el primer evento desde Supabase o usa el wizard de import para empezar a captar prospectos."
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summaries.map((s) => (
                <Card key={s.event.id} className="p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      tone={
                        s.event.status === "published"
                          ? "success"
                          : s.event.status === "draft"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {s.event.status === "published"
                        ? "Publicado"
                        : s.event.status === "draft"
                          ? "Borrador"
                          : "Archivado"}
                    </Badge>
                    <span className="text-xs text-ink-muted">
                      /{s.event.slug}
                    </span>
                  </div>
                  <h2 className="font-bold text-ink text-lg leading-tight mb-1">
                    {s.event.title}
                  </h2>
                  {s.event.description && (
                    <p className="text-sm text-ink-soft line-clamp-2 mb-3">
                      {s.event.description}
                    </p>
                  )}
                  <ul className="text-xs text-ink-muted space-y-0.5 mb-4">
                    <li>
                      📅 {formatDate(s.event.startsAt)}
                      {s.event.endsAt && (
                        <span className="text-ink-muted">
                          {" "}— {formatDate(s.event.endsAt)}
                        </span>
                      )}
                    </li>
                    {s.event.location && <li>📍 {s.event.location}</li>}
                  </ul>
                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <div className="rounded-lg bg-brand-50/60 px-2 py-2 text-center">
                      <p className="text-xs text-ink-muted">Confirmados</p>
                      <p className="text-lg font-bold text-ink">
                        {s.confirmationCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">
                      <p className="text-xs text-ink-muted">Asistentes</p>
                      <p className="text-lg font-bold text-emerald-700">
                        {s.attendeeCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-2 text-center">
                      <p className="text-xs text-ink-muted">Encuestas</p>
                      <p className="text-lg font-bold text-amber-700">
                        {s.surveyCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-blue-50 px-2 py-2 text-center">
                      <p className="text-xs text-ink-muted">Leads nuevos</p>
                      <p className="text-lg font-bold text-blue-700">
                        {s.leadsPromoted}
                      </p>
                    </div>
                  </div>
                  <Link href={`/admin/eventos/${s.event.id}`} className="mt-4">
                    <Button variant="outline" size="sm" className="w-full">
                      Ver detalle
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}
