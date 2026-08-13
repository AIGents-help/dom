import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FlaskConical, Database, Layers3 } from "lucide-react";
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
    <div className="bg-background text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative min-h-[560px] overflow-hidden border-b border-white/10">
        <img src="/images/construction-aerial.jpg" alt="Photogrammetry workflow validation evidence" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/96 via-[#07111c]/80 to-[#07111c]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[560px] items-end py-16 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[.18em] text-white backdrop-blur"><FlaskConical className="h-4 w-4 text-accent" /> {item.type}</div>
            <h1 className="text-5xl font-black leading-[1] tracking-tight text-white sm:text-6xl">{item.title}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{item.summary}</p>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0E151E]">
        <div className="container-app grid gap-px md:grid-cols-3">
          <div className="border-b border-white/10 px-6 py-8 md:border-b-0 md:border-r"><Database className="h-6 w-6 text-accent" /><p className="mt-4 text-xs font-black uppercase tracking-[.16em] text-slate-500">Source Dataset</p><p className="mt-2 text-lg font-black text-white">{item.source}</p></div>
          <div className="border-b border-white/10 px-6 py-8 md:border-b-0 md:border-r"><Layers3 className="h-6 w-6 text-accent" /><p className="mt-4 text-xs font-black uppercase tracking-[.16em] text-slate-500">Image Count</p><p className="mt-2 text-3xl font-black text-white">{item.imageCount}</p></div>
          <div className="px-6 py-8"><FlaskConical className="h-6 w-6 text-accent" /><p className="mt-4 text-xs font-black uppercase tracking-[.16em] text-slate-500">Classification</p><p className="mt-2 text-lg font-black text-white">{item.type}</p></div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow mb-4">Purpose</p>
            <h2 className="text-4xl font-black tracking-tight text-white">Why this validation exists.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">{item.purpose}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#111923] p-8 lg:p-10">
            <p className="eyebrow mb-5">Validated Workflow Elements</p>
            <div className="space-y-4">
              {item.deliverables.map((deliverable, index) => <div key={deliverable} className="flex gap-4 rounded-xl border border-white/10 bg-white/[.03] p-5"><span className="text-xs font-black tracking-[.16em] text-accent">0{index + 1}</span><span className="font-bold text-slate-200">{deliverable}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0E151E] py-20">
        <div className="container-app grid gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-4">Related DOM Services</p>
            <h2 className="text-3xl font-black text-white">Where this workflow connects to commercial work.</h2>
            <div className="mt-7 space-y-3">
              {item.services.map((serviceSlug) => {
                const service = domKnowledge.services.find((entry) => entry.slug === serviceSlug);
                return service ? <Link key={serviceSlug} href={`/services/${service.slug}`} className="group flex items-center justify-between rounded-xl border border-white/10 bg-[#111923] px-5 py-4 text-sm font-black text-white transition hover:border-accent/50"><span>{service.name}</span><ArrowRight className="h-4 w-4 text-accent transition group-hover:translate-x-1" /></Link> : null;
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-8">
            <p className="eyebrow mb-4">Disclosure</p>
            <h2 className="text-2xl font-black text-white">What this evidence does — and does not — prove.</h2>
            <p className="mt-4 leading-7 text-slate-400">{item.disclosure}</p>
          </div>
        </div>
      </section>

      <section className="container-app py-16 text-center lg:py-20">
        <h2 className="text-3xl font-black text-white lg:text-4xl">Need this workflow applied to a real site?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">DOM can scope the capture method, aircraft, processing path, and deliverables around your actual property or project.</p>
        <Link href="/request-mission" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Request a Mission <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>
  );
}
