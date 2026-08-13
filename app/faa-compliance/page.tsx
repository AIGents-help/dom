import Link from "next/link";
import { CheckCircle2, FileBadge, ShieldCheck, Radio, AlertTriangle, ArrowRight, Moon, Users } from "lucide-react";

const standards = [
  { icon: FileBadge, title: "Certified Remote Pilots", desc: "Commercial missions are assigned to pilots holding current FAA Part 107 Remote Pilot Certificates." },
  { icon: Radio, title: "Airspace Authorization", desc: "Controlled-airspace missions are reviewed for FAA authorization requirements, including LAANC where available." },
  { icon: ShieldCheck, title: "Aircraft & Insurance Records", desc: "Mission records can include aircraft registration, insurance, pilot credentials, and supporting operational documentation." },
  { icon: CheckCircle2, title: "Mission Risk Review", desc: "Site conditions, airspace, operating limitations, people, obstacles, weather, and mission objectives are reviewed before launch." },
];

const operationRules = [
  { icon: Moon, title: "Night Operations", copy: "Part 107 permits routine night operations when the rule's training, lighting, and other requirements are met. Controlled airspace still requires appropriate authorization." },
  { icon: Users, title: "Operations Over People", copy: "Certain operations over people and moving vehicles are permitted when the aircraft and operation meet the applicable Part 107 requirements." },
  { icon: Radio, title: "BVLOS & Other Advanced Operations", copy: "Operations outside standard Part 107 limits, including routine BVLOS, can require specific FAA approval or waiver authority before the mission is flown." },
];

export default function FaaCompliancePage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[560px] overflow-hidden border-b border-white/10">
        <img src="/images/drone-operation-safety.png" alt="Commercial drone operation with professional safety controls" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/82 to-[#07111c]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[560px] items-end py-16 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[.2em] text-white backdrop-blur"><ShieldCheck className="h-4 w-4 text-accent" /> FAA Compliance</div>
            <h1 className="text-5xl font-black leading-[.98] tracking-tight text-white sm:text-6xl lg:text-7xl">Compliance is part of the mission.<span className="block text-accent">Not paperwork after the fact.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">DOM builds airspace review, pilot credentials, operating limitations, risk controls, and mission documentation into the workflow before an aircraft leaves the ground.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0E151E]">
        <div className="container-app grid gap-px py-0 md:grid-cols-4">
          {standards.map((s) => <div key={s.title} className="border-b border-white/10 px-6 py-9 md:border-b-0 md:border-r md:last:border-r-0"><s.icon className="mb-4 h-6 w-6 text-accent" /><h2 className="text-lg font-black text-white">{s.title}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{s.desc}</p></div>)}
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow mb-4">Operational Boundaries</p>
            <h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">The rule changes with the mission.</h2>
            <p className="mt-5 text-base leading-7 text-slate-400">Night, controlled airspace, people, moving vehicles, and beyond-visual-line-of-sight operations each have their own conditions. DOM scopes the regulatory path before promising the flight.</p>
          </div>
          <div className="space-y-5">
            {operationRules.map((item, index) => <article key={item.title} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111923] p-7 transition hover:border-accent/50 lg:p-9"><div className="flex gap-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10"><item.icon className="h-6 w-6 text-accent" /></div><div><p className="text-xs font-black tracking-[.16em] text-accent">0{index + 1}</p><h3 className="mt-1 text-2xl font-black text-white">{item.title}</h3><p className="mt-3 leading-7 text-slate-400">{item.copy}</p></div></div></article>)}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0E151E] py-20">
        <div className="container-app grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
          <div>
            <p className="eyebrow mb-4">Mission Record</p>
            <h2 className="text-4xl font-black tracking-tight text-white">A professional operation should leave a professional paper trail.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">Depending on the mission scope, DOM can organize airspace records, pilot credentials, flight records, risk documentation, aircraft information, and deliverable records into a consistent project file.</p>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-8">
            <AlertTriangle className="h-7 w-7 text-accent" />
            <h3 className="mt-5 text-xl font-black text-white">Regulations change.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">DOM reviews current FAA requirements for the actual operation rather than relying on a static checklist. Final authority always comes from current FAA rules, authorizations, waivers, and operating conditions.</p>
          </div>
        </div>
      </section>

      <section className="container-app py-16 text-center lg:py-20">
        <h2 className="text-3xl font-black text-white lg:text-4xl">Have a mission with complicated airspace or operating requirements?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">Send the location and objective first. DOM can review the operational constraints before the project is scoped.</p>
        <Link href="/request-mission" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Request Mission Review <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>
  );
}
