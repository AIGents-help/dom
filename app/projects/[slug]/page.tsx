import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return domKnowledge.evidence.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = domKnowledge.evidence.find((entry) => entry.slug === slug);
  if (!item) return {};
  return {
    title: `${item.title} | DOM Evidence`,
    description: item.summary,
    alternates: { canonical: `/projects/${item.slug}` },
  };
}

export default async function ProjectEvidencePage({ params }: PageProps) {
  const { slug } = await params;
  const item = domKnowledge.evidence.find((entry) => entry.slug === slug);
  if (!item) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    description: item.summary,
    url: `https://droneopsman.com/projects/${item.slug}`,
    author: { "@id": "https://droneopsman.com/#organization" },
    publisher: { "@id": "https://droneopsman.com/#organization" },
    about: item.services.map((serviceSlug) => {
      const service = domKnowledge.services.find((entry) => entry.slug === serviceSlug);
      return service ? { "@type": "Service", name: service.name, url: `https://droneopsman.com/services/${service.slug}` } : serviceSlug;
    }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">{item.type}</p>
          <h1 className="heading-xl max-w-4xl">{item.title}</h1>
          <p className="body-muted mt-6 max-w-3xl text-lg">{item.summary}</p>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="heading-lg mb-5">Purpose</h2>
            <p className="body-muted text-lg">{item.purpose}</p>
          </div>
          <div className="card p-7">
            <p className="eyebrow mb-4">Evidence Facts</p>
            <dl className="space-y-4 text-sm">
              <div><dt className="font-semibold text-ink">Source dataset</dt><dd className="text-muted">{item.source}</dd></div>
              <div><dt className="font-semibold text-ink">Image count</dt><dd className="text-muted">{item.imageCount}</dd></div>
              <div><dt className="font-semibold text-ink">Classification</dt><dd className="text-muted">{item.type}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="heading-lg mb-6">Related DOM services</h2>
            <ul className="space-y-3">
              {item.services.map((serviceSlug) => {
                const service = domKnowledge.services.find((entry) => entry.slug === serviceSlug);
                return service ? <li key={serviceSlug}><Link className="font-semibold text-accent" href={`/services/${service.slug}`}>{service.name}</Link></li> : null;
              })}
            </ul>
          </div>
          <div>
            <h2 className="heading-lg mb-6">Validated workflow elements</h2>
            <ul className="space-y-3 text-ink">
              {item.deliverables.map((deliverable) => <li key={deliverable} className="flex gap-3"><span className="text-accent">—</span>{deliverable}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-app">
          <div className="card p-8">
            <p className="eyebrow mb-3">Disclosure</p>
            <p className="body-muted max-w-3xl">{item.disclosure}</p>
          </div>
          <div className="mt-8">
            <Link href="/request-mission" className="btn-primary">Request a Mission <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
