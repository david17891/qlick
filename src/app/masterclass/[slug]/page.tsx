import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasterclassView } from "./MasterclassView";
import { getPublishedMasterclassBySlug } from "@/lib/masterclasses";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Container, Badge } from "@/components/ui";

interface Props {
  params: { slug: string };
  searchParams?: { utm_source?: string; utm_campaign?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const masterclass = await getPublishedMasterclassBySlug(params.slug);
  if (!masterclass) {
    return {
      title: "Masterclass no encontrada · Qlick",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${masterclass.title} · Qlick`,
    description:
      masterclass.subtitle ??
      masterclass.description ??
      "Masterclass gratuita de Qlick Marketing Integral.",
    openGraph: {
      title: masterclass.title,
      description: masterclass.subtitle ?? masterclass.description ?? undefined,
      images: masterclass.coverImageUrl ? [masterclass.coverImageUrl] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function MasterclassPage({ params, searchParams }: Props) {
  const masterclass = await getPublishedMasterclassBySlug(params.slug);
  if (!masterclass) {
    notFound();
  }

  const utmSource = searchParams?.utm_source;
  const utmCampaign = searchParams?.utm_campaign;

  return (
    <main className="min-h-screen bg-brand-50/40 py-12 sm:py-16">
      <Container className="max-w-6xl">
        <div className="mb-8 flex items-center gap-3 text-xs text-ink-muted">
          <a href="/" className="hover:text-ink">Inicio</a>
          <span>/</span>
          <a href="/masterclass" className="hover:text-ink">Masterclasses</a>
          <span>/</span>
          <span className="text-ink-soft truncate">{masterclass.title}</span>
          {!isSupabaseConfigured() && (
            <Badge tone="warning" className="ml-auto">Modo demo</Badge>
          )}
        </div>
        <MasterclassView
          masterclass={masterclass}
          utmSource={utmSource}
          utmCampaign={utmCampaign}
        />
      </Container>
    </main>
  );
}