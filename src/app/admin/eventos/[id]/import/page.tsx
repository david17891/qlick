import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";
import { ImportWizard } from "@/components/events/ImportWizard";

export const metadata: Metadata = {
  title: "Importar · Admin · Qlick",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function AdminEventImportPage({ params }: Props) {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const event = await getEventById(params.id);
  if (!event) {
    notFound();
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-4 text-xs text-ink-muted flex items-center gap-2">
            <Link href="/admin" className="hover:text-ink">
              ← Panel principal
            </Link>
            <span>·</span>
            <Link href="/admin/eventos" className="hover:text-ink">
              Eventos
            </Link>
            <span>·</span>
            <Link href={`/admin/eventos/${event.id}`} className="hover:text-ink">
              {event.title}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-ink mb-1">
            Importar datos de <span className="text-brand-700">{event.title}</span>
          </h1>
          <p className="text-sm text-ink-muted mb-6">
            Subí un .xlsx con confirmados, asistentes o encuestas. Te dejamos
            hacer un dry-run antes de tocar la base de datos.
          </p>

          <ImportWizard eventId={event.id} eventTitle={event.title} />
        </Container>
      </main>
      <Footer />
    </>
  );
}