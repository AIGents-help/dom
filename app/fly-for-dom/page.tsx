import { ShieldCheck, Wallet, Radar, FileCheck, Compass, Users, CreditCard, LayoutDashboard, ArrowRight, Plane } from "lucide-react";
import FlyForDomApplyForm from "@/components/FlyForDomApplyForm";

export const metadata = {
  title: "Fly for DOM | Drone Operation Management",
  description: "Commercial drone missions for Part 107 pilots — DOM brings the clients, airspace prep, and payment collection. You bring the aircraft and the discipline to fly to spec.",
};

const steps = [
  { n: "01", title: "Apply & verify", desc: "Submit your Part 107 certificate, insurance, and equipment. DOM verifies your credentials before any paid assignment." },
  { n: "02", title: "Get matched", desc: "DOM offers missions based on service area, aircraft, sensor capability, and mission requirements." },
  { n: "03", title: "Fly to standard", desc: "Mission specs, checklists, airspace requirements, and deliverable expectations are defined before launch." },
  { n: "04", title: "Deliver & get paid", desc: "Upload mission documentation and deliverables, clear QC, and receive payout without chasing client invoices." },
];

const brings = [
  { icon: Users, title: "Client sourcing", desc: "DOM finds and qualifies the clients so pilots can focus on operations." },
  { icon: Compass, title: "Airspace prep", desc: "Airspace class, authorization needs, and mission constraints are reviewed before assignment." },
  { icon: CreditCard, title: "Payment collection", desc: "DOM handles client quoting and payment collection before the mission is released." },
  { icon: FileCheck, title: "Mission standards", desc: "Reference SOPs, checklists, mission requirements, and delivery standards keep work consistent." },
  { icon: LayoutDashboard, title: "Pilot portal", desc: "Assignments, documents, deliverables, and payout history live in one operating dashboard." },
  { icon: ShieldCheck, title: "Credential tracking", desc: "Part 107 and insurance status stay attached to the pilot record." },
];

export default function FlyForDomPage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[620px] overflow-hidden border-b border-white/10">
        <img src="/images/city-night-aerial.jpg" alt="Commercial drone pilot operating in the field" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/80 to-[#07111c]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[620px] items-end py-16 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[.2em] text-white backdrop-blur"><Plane className="h-4 w-4 text-accent" /> Fly for DOM</div>
            <h1 className="text-5xl font-black leading-[.98] tracking-tight text-white sm:text-6xl lg:text-7xl">Fly the mission.<span className="block text-accent">DOM runs the operation.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">For disciplined Part 107 pilots who want commercial work without building a sales department, billing system, mission portal, and operating framework from scratch.</p>
            <div className="mt-9 flex flex-wrap gap-4">
              <a href="#apply" className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Apply to Fly <ArrowRight className="h-4 w-4" /></a>
              <a href="#how-it-works" className="rounded-lg border border-white/20 bg-white/5 px-7 py-4 text-sm font-bold text-white backdrop-blur transition hover:border-accent">See How It Works</a>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-white/10 bg-[#0E151E] py-20 lg:py-24">
        <div className="container-app">
          <div className="mb-12 max-w-3xl"><p className="eyebrow mb-4">Operating Model</p><h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">A commercial workflow, not a gig-board free-for-all.</h2></div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((s) => <article key={s.n} className="rounded-2xl border border-white/10 bg-[#111923] p-7"><p className="text-xs font-black tracking-[.18em] text-accent">{s.n}</p><h3 className="mt-4 text-xl font-black text-white">{s.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{s.desc}</p></article>)}
          </div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
          <div className="rounded-3xl border border-accent/30 bg-[linear-gradient(145deg,#171f29,#0d141c)] p-8 lg:p-10">
            <Wallet className="h-8 w-8 text-accent" />
            <p className="mt-6 text-xs font-black uppercase tracking-[.18em] text-slate-500">Pilot Economics</p>
            <p className="mt-3 text-5xl font-black text-white">80%</p>
            <p className="mt-2 text-lg font-bold text-white">of DOM-sourced mission revenue</p>
            <p className="mt-4 text-sm leading-6 text-slate-400">DOM sources the client, scopes and quotes the mission, collects payment, and manages the workflow. The assigned pilot flies and delivers to spec.</p>
            <div className="mt-8 border-t border-white/10 pt-6"><p className="text-xs font-black uppercase tracking-[.16em] text-accent">Self-Service Option</p><p className="mt-2 text-2xl font-black text-white">100% on missions you create</p><p className="mt-2 text-sm leading-6 text-slate-400">Approved self-service pilots can use the DOM operating platform for missions they originate themselves under the applicable subscription terms.</p></div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#111923] p-8 lg:p-10">
            <Radar className="h-8 w-8 text-accent" />
            <h2 className="mt-5 text-3xl font-black text-white">What DOM brings to the pilot.</h2>
            <div className="mt-8 grid gap-7 sm:grid-cols-2">
              {brings.map((b) => <div key={b.title} className="border-t border-white/10 pt-5"><b.icon className="h-5 w-5 text-accent" /><h3 className="mt-3 text-base font-black text-white">{b.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{b.desc}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0E151E] py-20">
        <div className="container-app">
          <div className="mb-10 max-w-3xl"><p className="eyebrow mb-4">Minimum Standard</p><h2 className="text-4xl font-black tracking-tight text-white">Bring credentials. Bring equipment. Bring discipline.</h2></div>
          <div className="grid gap-5 md:grid-cols-3">
            {[ ["FAA Part 107", "Current Remote Pilot Certificate in good standing."], ["Active Insurance", "Commercial liability coverage appropriate to the aircraft and operation."], ["Mission-Capable Equipment", "Aircraft and sensors appropriate to the work you accept."] ].map(([title,copy]) => <div key={title} className="rounded-2xl border border-white/10 bg-[#111923] p-7"><h3 className="text-xl font-black text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{copy}</p></div>)}
          </div>
        </div>
      </section>

      <section id="apply" className="container-app py-20 lg:py-28">
        <div className="mx-auto mb-10 max-w-3xl text-center"><p className="eyebrow mb-4">Pilot Application</p><h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">Ready to join the network?</h2><p className="mt-4 text-lg leading-8 text-slate-400">Submit your information below. DOM will review credentials and operating capability before any mission assignment.</p></div>
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#111923] p-6 shadow-2xl lg:p-10"><FlyForDomApplyForm /></div>
      </section>
    </div>
  );
}
