import Link from "next/link";
import {
  Factory, Building2, Wheat, Flame, Mountain, ShieldCheck, Truck, Landmark, ArrowRight,
} from "lucide-react";

const industries = [
  { icon: Factory, name: "Energy & Utilities", image: "/images/solar-aerial.jpg", desc: "Transmission corridors, solar assets, utility infrastructure, and recurring inspection programs." },
  { icon: Building2, name: "Construction & Real Estate", image: "/images/construction-aerial.jpg", desc: "Progress documentation, site mapping, volumetrics, stakeholder reporting, and property intelligence." },
  { icon: Wheat, name: "Agriculture", image: "/images/solar-aerial.jpg", desc: "Aerial crop documentation, multispectral workflows, field monitoring, and large-acreage capture." },
  { icon: Flame, name: "Public Safety & Emergency Response", image: "/images/drone-operation-safety.png", desc: "Rapid aerial situational awareness, incident documentation, and post-event assessment support." },
  { icon: Mountain, name: "Infrastructure & Engineering", image: "/images/city-night-aerial.jpg", desc: "High-resolution documentation and mapping for bridges, towers, rooftops, facilities, and engineered assets." },
  { icon: ShieldCheck, name: "Government & Public Sector", image: "/images/drone-operation-safety.png", desc: "Documented commercial operations for municipalities, agencies, public assets, and compliance-driven programs." },
  { icon: Truck, name: "Logistics & Industrial Sites", image: "/images/construction-aerial.jpg", desc: "Large-site visibility, yard documentation, facility overviews, and repeatable operational monitoring." },
  { icon: Landmark, name: "Insurance & Risk Assessment", image: "/images/city-night-aerial.jpg", desc: "Property condition documentation and aerial evidence for underwriting, claims, and risk-review workflows." },
];

export default function IndustriesPage() {
  return (
    <div className="bg-[#090f16] text-white">
      <section className="relative min-h-[560px] overflow-hidden border-b border-white/10">
        <img src="/images/city-night-aerial.jpg" alt="Aerial view of commercial and infrastructure assets" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090f16]/95 via-[#090f16]/75 to-[#090f16]/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090f16] via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[560px] items-end py-20 lg:items-center">
          <div className="max-w-4xl">
            <p className="text-sm font-black uppercase tracking-[.22em] text-[#f26a1b]">Industries</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[.98] tracking-tight md:text-7xl">The assets change. The need for better information doesn&apos;t.</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">DOM supports organizations that need a clearer view of sites, infrastructure, property, and operations—without adding unnecessary risk or complexity.</p>
          </div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-[#f26a1b]">Where DOM Fits</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight md:text-5xl">Aerial operations built around real-world business problems.</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-slate-400">We scope the mission around the decision you need to make, the asset you need to understand, and the deliverable your team can actually use.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {industries.map((ind) => (
            <article key={ind.name} className="group relative min-h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[#111923] shadow-xl transition duration-300 hover:-translate-y-1 hover:border-[#f26a1b]/70 hover:shadow-2xl">
              <img src={ind.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <div className="inline-flex rounded-full border border-white/15 bg-black/30 p-2.5 backdrop-blur"><ind.icon className="h-5 w-5 text-[#f26a1b]" /></div>
                <h3 className="mt-4 text-2xl font-black leading-tight">{ind.name}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{ind.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0e151e]">
        <div className="container-app grid gap-8 py-14 md:grid-cols-4">
          {[
            ["CAPTURE", "See the site clearly"],
            ["MEASURE", "Create usable site data"],
            ["INSPECT", "Document asset condition"],
            ["REPORT", "Give teams decision-ready outputs"],
          ].map(([label, text]) => (
            <div key={label}>
              <p className="text-xs font-black tracking-[.2em] text-[#f26a1b]">{label}</p>
              <p className="mt-2 font-bold text-white">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-app py-16 lg:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111923] p-10 lg:p-14">
          <img src="/images/construction-aerial.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#111923] via-[#111923]/95 to-[#111923]/70" />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[.18em] text-[#f26a1b]">Custom Missions</p>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">Your industry is not the constraint. The mission objective is what matters.</h2>
              <p className="mt-4 max-w-2xl text-slate-300">If aerial data can reduce risk, improve visibility, document change, or create a better record of an asset, DOM can scope the operation around that need.</p>
            </div>
            <Link href="/request-mission" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Request a Mission <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
