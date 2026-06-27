import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container } from "@/components/ui";
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

          <AdminEventosClient initialSummaries={summaries} />
        </Container>
      </main>
      <Footer />
    </>
  );
}