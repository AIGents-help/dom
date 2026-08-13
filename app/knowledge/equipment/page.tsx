import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Cpu, Map, Boxes, Eye, Camera } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Drone Equipment | Drone Operation Management",
  description: "Explore the aircraft and mission uses represented in the Drone Operation Management knowledge catalog.",
  alternates: { canonical: "/knowledge/equipment" },
};

const useIcons: Record<string, typeof Map> = {
  Photogrammetry: Camera,
  "Orthomosaic mapping": Map,
  "3D reconstruction": Boxes,
  "Site documentation": Camera,
  "Visual inspection": Eye,
};

export default function EquipmentPage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[500px] overflow-hidden border-b border-white/10">
        <img src="/images/construction-aerial.jpg" alt="Enterprise drone aircraft supporting commercial mapping work" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/80 to-[#07111c]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[500px] items-end py-16 lg:items-center">
          <div className="max-w-4xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[.18em] text-white backdrop-blur"><Cpu className="h-4 w-4 text-accent" /> Knowledge / Equipment</div>
            <h1 className="text-5xl font-black leading-[1] tracking-tight text-white sm:text-6xl">Aircraft are tools.<span className="block text-accent">The mission decides the platform.</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">DOM documents the aircraft and the workflows they support so equipment is understood in the context of the actual commercial operation.</p>
          </div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="grid gap-8">
          {domKnowledge.equipment.map((item) => {
            const equipmentJsonLd = {
              "@context": "https://schema.org",
              "@type": "Product",
              name: item.name,
              category: item.category,
              description: `${item.category}. ${item.note}`,
              brand: { "@type": "Brand", name: "DJI" },
              isRelatedTo: item.uses,
            };

            return (
              <article key={item.slug} id={item.slug} className="overflow-hidden rounded-3xl border border-white/10 bg-[#111923] shadow-2xl scroll-mt-24">
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(equipmentJsonLd) }} />
                <div className="grid lg:grid-cols-[.95fr_1.05fr]">
                  <div className="relative min-h-[360px]"><img src="/images/construction-aerial.jpg" alt="Enterprise drone used in a mapping workflow" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#111923]/50 lg:bg-gradient-to-l" /></div>
                  <div className="p-8 lg:p-12">
                    <p className="eyebrow mb-4">{item.category}</p>
                    <h2 className="text-4xl font-black text-white">{item.name}</h2>
                    <p className="mt-4 leading-7 text-slate-400">{item.note}</p>
                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                      {item.uses.map((use) => { const Icon = useIcons[use] ?? Cpu; return <div key={use} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4"><Icon className="h-5 w-5 text-accent" /><span className="text-sm font-bold text-slate-200">{use}</span></div>; })}
                    </div>
                    <Link href="/request-mission" className="mt-8 inline-flex items-center gap-2 text-sm font-black text-accent">Scope a mission with this capability <ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
