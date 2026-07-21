import Image from "next/image";
import Link from "next/link";
import { TemplateNav } from "@/components/web-templates/TemplateNav";
import { TemplateFooter } from "@/components/web-templates/TemplateFooter";
import { QlickBadge } from "@/components/web-templates/QlickBadge";

type RelatedPost = {
  title: string;
  href: string;
  image: string;
  imageAlt: string;
};

type BlogArticleLayoutProps = {
  brand: string;
  tagline?: string;
  title: string;
  date: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  content: string[];
  accentColor: string;
  backHref: string;
  backLabel: string;
  footerProps: {
    brand: string;
    tagline?: string;
    description: string;
    address?: string;
    phone?: string;
    email?: string;
    schedule?: string;
    socialLinks?: { label: string; href: string }[];
  };
  relatedPosts?: RelatedPost[];
};

/**
 * Layout compartido para artículos de blog en demos.
 * Server component puro: el blog no tiene estado interactivo.
 */
export function BlogArticleLayout({
  brand,
  tagline,
  title,
  date,
  excerpt,
  image,
  imageAlt,
  content,
  accentColor,
  backHref,
  backLabel,
  footerProps,
  relatedPosts = [],
}: BlogArticleLayoutProps) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <QlickBadge />
      <TemplateNav
        brand={brand}
        tagline={tagline}
        accentColor={accentColor}
        links={[{ label: backLabel, href: backHref }]}
        ctaLabel="Volver"
        ctaHref={backHref}
      />

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-semibold transition hover:opacity-80"
          style={{ color: accentColor }}
        >
          ← {backLabel}
        </Link>

        <div
          className="mt-6 inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
        >
          {date}
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold leading-[1.1] tracking-tight text-neutral-950 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-700">
          {excerpt}
        </p>

        <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl shadow-md">
          <Image
            src={image}
            alt={imageAlt}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>

        <div className="prose prose-neutral mt-10 max-w-none">
          {content.map((paragraph, i) => (
            <p
              key={i}
              className="mt-5 text-base leading-relaxed text-neutral-800 first:mt-0"
            >
              {paragraph}
            </p>
          ))}
        </div>

        <div
          className="mt-10 rounded-2xl border-l-4 bg-neutral-50 p-5 text-sm leading-relaxed text-neutral-700"
          style={{ borderLeftColor: accentColor }}
        >
          <strong>¿Te interesa este servicio?</strong> Escríbenos por WhatsApp y
          te respondemos hoy mismo.
        </div>
      </article>

      {relatedPosts.length > 0 ? (
        <section
          className="border-t border-neutral-200 bg-neutral-50 py-12 sm:py-16"
          aria-labelledby="related-heading"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2
              id="related-heading"
              className="font-display text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl"
            >
              Otros artículos
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {relatedPosts.map((post) => (
                <Link
                  key={post.href}
                  href={post.href}
                  className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-md"
                >
                  <div className="relative aspect-[16/9] w-full">
                    <Image
                      src={post.image}
                      alt={post.imageAlt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-base font-semibold leading-snug text-neutral-950">
                      {post.title}
                    </h3>
                    <div
                      className="mt-2 text-xs font-semibold"
                      style={{ color: accentColor }}
                    >
                      Leer artículo →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <TemplateFooter {...footerProps} accentColor={accentColor} />
    </div>
  );
}
