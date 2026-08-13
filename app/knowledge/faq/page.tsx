import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HelpCircle } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "Commercial Drone FAQ | Drone Operation Management",
  description: "Answers to common questions about DOM drone mapping, inspections, construction progress, photogrammetry, accuracy, and service coverage.",
  alternates: { canonical: "/knowledge/faq" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: domKnowledge.faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function FaqPage() {
  return (
    <div className="bg-background text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <section className="relative min-h-[460px] overflow-hidden border-b border-white/10">
        <img src="/images/city-night-aerial.jpg" alt="Aerial operations knowledge and planning context" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/96 via-[#07111c]/82 to-[#07111c]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[460px] items-end py-16 lg:items-center">
          <div className="max-w-4xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[.18em] text-white backdrop-blur"><HelpCircle className="h-4 w-4 text-accent" /> Knowledge / FAQ</div>
            <h1 className="text-5xl font-black leading-[1] tracking-tight text-white sm:text-6xl">Commercial drone questions.<span className="block text-accent">Clear answers.</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Practical answers about mapping, inspection, construction documentation, accuracy, deliverables, and where DOM operates.</p>
          </div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mx-auto max-w-5xl space-y-5">
          {domKnowledge.faqs.map((faq, index) => (
            <article key={faq.question} className="rounded-2xl border border-white/10 bg-[#111923] p-7 transition hover:border-accent/40 lg:p-8">
              <div className="flex gap-5"><span className="text-xs font-black tracking-[.16em] text-accent">0{index + 1}</span><div><h2 className="text-xl font-black text-white lg:text-2xl">{faq.question}</h2><p className="mt-4 leading-7 text-slate-400">{faq.answer}</p></div></div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0E151E] py-16">
        <div className="container-app flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black text-white">Still have a mission-specific question?</h2><p className="mt-3 max-w-2xl text-slate-400">Send DOM the site and objective. We can answer the question in the context of the actual operation.</p></div><Link href="/request-mission" className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Ask Through Mission Intake <ArrowRight className="h-4 w-4" /></Link></div>
      </section>
    </div>
  );
}
