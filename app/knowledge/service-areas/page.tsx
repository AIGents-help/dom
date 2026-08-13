import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Service Areas | Greater Philadelphia Drone Services",
  description: "Drone Operation Management serves commercial drone projects across Delaware County, Greater Philadelphia, and Southeastern Pennsylvania.",
  alternates: { canonical: "/knowledge/service-areas" },
};

export default function ServiceAreasPage() {
  const serviceAreaJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://droneopsman.com/#organization",
    name: domKnowledge.organization.name,
    areaServed: domKnowledge.serviceAreas.map((area) => ({ "@type": "AdministrativeArea", name: area.name })),
  };

  return (
    <div className="bg-background text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceAreaJsonLd) }} />
      <section className="relative min-h-[500px] overflow-hidden border-b border-white/10">
        <img src="/images/city-night-aerial.jpg" alt="Greater Philadelphia aerial operations service region" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/80 to-[#07111c]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[500px] items-end py-16 lg:items-center">
          <div className="max-w-4xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[.18em] text-white backdrop-blur"><MapPin className="h-4 w-4 text-accent" /> Knowledge / Service Areas</div>
            <h1 className="text-5xl font-black leading-[1] tracking-tight text-white sm:text-6xl">Based in Delaware County.<span className="block text-accent">Built to operate regionally.</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">DOM scopes commercial drone missions across the Greater Philadelphia and Southeastern Pennsylvania region based on project needs, airspace, site access, safety conditions, and deliverables.</p>
          </div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mb-12 max-w-3xl"><p className="eyebrow mb-4">Regional Coverage</p><h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">Where DOM is positioned to work.</h2></div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {domKnowledge.serviceAreas.map((area) => (
            <article key={area.slug} id={area.slug} className="group rounded-2xl border border-white/10 bg-[#111923] p-7 transition hover:-translate-y-1 hover:border-accent/50 scroll-mt-24">
              <MapPin className="h-6 w-6 text-accent" />
              <p className="mt-5 text-xs font-black uppercase tracking-[.16em] text-slate-500">{area.region}</p>
              <h2 className="mt-2 text-2xl font-black text-white">{area.name}</h2>
              <p className="mt-4 text-sm leading-6 text-slate-400">{area.description}</p>
              <Link href="/request-mission" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-accent">Check a site <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0E151E] py-16">
        <div className="container-app flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black text-white">Outside the core region?</h2><p className="mt-3 max-w-2xl text-slate-400">Broader assignments can be evaluated individually based on travel, regulatory, equipment, and project requirements.</p></div><Link href="/request-mission" className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Check Mission Availability <ArrowRight className="h-4 w-4" /></Link></div>
      </section>
    </div>
  );
}
