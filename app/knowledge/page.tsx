import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Cpu, MapPinned } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Knowledge Catalog | Drone Operation Management",
  description: "Explore Drone Operation Management services, industries, equipment, service areas, deliverables, FAQs, and commercial drone terminology in one authoritative knowledge catalog.",
  alternates: { canonical: "/knowledge" },
};

const hubs = [
  { href: "/knowledge/faq", title: "Commercial Drone FAQ", description: "Buyer-focused answers about mapping, inspections, accuracy, construction progress, and deliverables.", icon: BookOpen },
  { href: "/knowledge/equipment", title: "Equipment", description: "Aircraft and the mission workflows they support.", icon: Cpu },
  { href: "/knowledge/service-areas", title: "Service Areas", description: "DOM's home-region coverage across Delaware County, Greater Philadelphia, and Southeastern Pennsylvania.", icon: MapPinned },
];

export default function KnowledgePage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[560px] overflow-hidden border-b border-white/10">
        <img src="/images/city-night-aerial.jpg" alt="Aerial city data and infrastructure context" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/78 to-[#07111c]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[560px] items-end py-16 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <p className="eyebrow mb-5">DOM Knowledge Catalog</p>
            <h1 className="text-5xl font-black leading-[.98] tracking-tight text-white sm:text-6xl lg:text-7xl">One source of truth.<span className="block text-accent">Everything DOM knows and delivers.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">Services, equipment, service areas, terminology, FAQs, deliverables, and operating context — organized for clients, search engines, and AI systems.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0E151E] py-16">
        <div className="container-app grid gap-5 md:grid-cols-3">
          {hubs.map((hub) => <Link key={hub.href} href={hub.href} className="group rounded-2xl border border-white/10 bg-[#111923] p-7 transition hover:-translate-y-1 hover:border-accent/60 hover:shadow-2xl"><hub.icon className="h-7 w-7 text-accent" /><h2 className="mt-5 text-2xl font-black text-white">{hub.title}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{hub.description}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-accent">Explore <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>)}
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mb-12 max-w-3xl"><p className="eyebrow mb-4">Capabilities</p><h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">What DOM actually does.</h2></div>
        <div className="grid gap-5 md:grid-cols-2">
          {domKnowledge.services.map((service, index) => <Link key={service.slug} href={`/services/${service.slug}`} className="group rounded-2xl border border-white/10 bg-[#111923] p-7 transition hover:border-accent/50"><p className="text-xs font-black tracking-[.16em] text-accent">0{index + 1}</p><h3 className="mt-3 text-2xl font-black text-white group-hover:text-accent">{service.name}</h3><p className="mt-3 leading-7 text-slate-400">{service.description}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-accent">Service details <ArrowRight className="h-4 w-4" /></span></Link>)}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0E151E] py-20">
        <div className="container-app grid gap-12 lg:grid-cols-2">
          <div><p className="eyebrow mb-4">Industries</p><h2 className="text-4xl font-black text-white">Where aerial intelligence creates value.</h2><div className="mt-8 flex flex-wrap gap-3">{domKnowledge.industries.map((industry) => <span key={industry} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">{industry}</span>)}</div></div>
          <div><p className="eyebrow mb-4">Deliverables</p><h2 className="text-4xl font-black text-white">What leaves the mission with you.</h2><div className="mt-8 grid gap-3 sm:grid-cols-2">{domKnowledge.deliverables.map((deliverable) => <div key={deliverable} className="rounded-xl border border-white/10 bg-[#111923] px-5 py-4 text-sm font-bold text-slate-300">{deliverable}</div>)}</div></div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mb-10 max-w-3xl"><p className="eyebrow mb-4">Terminology</p><h2 className="text-4xl font-black tracking-tight text-white">Know the language behind the mission.</h2></div>
        <div className="grid gap-5 md:grid-cols-2">{domKnowledge.glossary.map(([term, definition]) => <article key={term} className="rounded-2xl border border-white/10 bg-[#111923] p-7"><h3 className="text-xl font-black text-white">{term}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{definition}</p></article>)}</div>
      </section>

      <section className="border-t border-white/10 bg-[#0E151E] py-16">
        <div className="container-app flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black text-white">Need something translated into a real mission?</h2><p className="mt-3 max-w-2xl text-slate-400">Tell DOM what you need to inspect, map, document, measure, or monitor.</p></div><Link href="/request-mission" className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Request a Mission <ArrowRight className="h-4 w-4" /></Link></div>
      </section>
    </div>
  );
}
