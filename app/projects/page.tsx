import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Projects & Technical Demonstrations | Drone Operation Management",
  description: "Explore documented Drone Operation Management project evidence, technical demonstrations, workflows, and deliverable validation.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[520px] overflow-hidden border-b border-white/10">
        <img src="/images/construction-aerial.jpg" alt="Aerial mapping project evidence" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/78 to-[#07111c]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[520px] items-end py-16 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <p className="eyebrow mb-5">Projects & Evidence</p>
            <h1 className="text-5xl font-black leading-[.98] tracking-tight text-white sm:text-6xl lg:text-7xl">Show the work.<span className="block text-accent">Label the evidence clearly.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">DOM separates paid client work, DOM-flown demonstrations, and technical workflow validation so capability claims stay grounded in documented evidence.</p>
          </div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mb-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="eyebrow mb-4">Evidence Library</p><h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">Validated workflows and completed work.</h2></div><p className="max-w-xl text-sm leading-6 text-slate-400">This library will grow as DOM completes field missions, client projects, internal demonstrations, and software validations.</p></div>
        <div className="grid gap-6 lg:grid-cols-2">
          {domKnowledge.evidence.map((item) => (
            <article key={item.slug} className="group overflow-hidden rounded-3xl border border-white/10 bg-[#111923] shadow-xl transition hover:-translate-y-1 hover:border-accent/50 hover:shadow-2xl">
              <div className="relative h-64 overflow-hidden"><img src="/images/construction-aerial.jpg" alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#111923] via-transparent to-transparent" /><div className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs font-black uppercase tracking-[.16em] text-white backdrop-blur"><FlaskConical className="h-4 w-4 text-accent" />{item.type}</div></div>
              <div className="p-8"><h3 className="text-2xl font-black text-white">{item.title}</h3><p className="mt-4 leading-7 text-slate-400">{item.summary}</p><div className="mt-6 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm leading-6 text-slate-300"><strong className="text-white">Disclosure:</strong> {item.disclosure}</div><Link href={`/projects/${item.slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-black text-accent">View evidence <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
