import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, Button, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminMasterclasses } from "@/lib/masterclasses";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Masterclasses · Admin · Qlick",
  description: "Gestión de masterclasses y registrados.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminMasterclassListPage() {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const summaries = await getAdminMasterclasses();
  const publishedCount = summaries.filter(
    (s) => s.masterclass.status === "published",
  ).length;
  const draftCount = summaries.filter(
    (s) => s.masterclass.status === "draft",
  ).length;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-6">
            <p className="text-sm text-ink-muted">Admin · Masterclasses</p>
            <h1 className="text-3xl font-bold text-ink">Embudo de masterclasses</h1>
            <p className="text-ink-muted text-sm mt-1">
              {summaries.length} masterclasses · {publishedCount} publicadas · {draftCount} en borrador
            </p>
          </div>

          {summaries.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="Aún no hay masterclasses"
                description="Crea la primera masterclass desde Supabase para empezar a captar leads."
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summaries.map((s) => (
                <Card key={s.masterclass.id} className="p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      tone={
                        s.masterclass.status === "published"
                          ? "success"
                          : s.masterclass.status === "draft"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {s.masterclass.status === "published"
                        ? "Publicada"
                        : s.masterclass.status === "draft"
                          ? "Borrador"
                          : "Archivada"}
                    </Badge>
                    <span className="text-xs text-ink-muted">
                      /{s.masterclass.slug}
                    </span>
                  </div>
                  <h2 className="font-bold text-ink text-lg leading-tight mb-1">
                    {s.masterclass.title}
                  </h2>
                  {s.masterclass.subtitle && (
                    <p className="text-sm text-ink-soft line-clamp-2 mb-3">
                      {s.masterclass.subtitle}
                    </p>
                  )}
                  <ul className="text-xs text-ink-muted space-y-0.5 mb-4">
                    <li>
                      📅 {s.masterclass.startsAt ? formatDate(s.masterclass.startsAt) : "Por confirmar"}
                    </li>
                    {s.masterclass.durationMinutes && (
                      <li>⏱️ {s.masterclass.durationMinutes} min</li>
                    )}
                  </ul>
                  <div className="grid grid-cols-3 gap-2 mt-auto">
                    <div className="rounded-lg bg-brand-50/60 px-2 py-2 text-center">
                      <p className="text-xs text-ink-muted">Registros</p>
                      <p className="text-lg font-bold text-ink">
                        {s.registrationCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">
                      <p className="text-xs text-ink-muted">Asistieron</p>
                      <p className="text-lg font-bold text-emerald-700">
                        {s.attendedCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-2 text-center">
                      <p className="text-xs text-ink-muted">Interesados</p>
                      <p className="text-lg font-bold text-amber-700">
                        {s.interestedCount}
                      </p>
                    </div>
                  </div>
                  <Link href={`/admin/masterclass/${s.masterclass.id}`} className="mt-4">
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