import MissionRequestForm from "@/components/MissionRequestForm";
import { ShieldCheck, Clock, FileCheck, ArrowRight } from "lucide-react";

const signals = [
  { icon: Clock, title: "Fast review", copy: "Mission requests are reviewed quickly so constraints and next steps are clear." },
  { icon: ShieldCheck, title: "Compliance first", copy: "Airspace, operating limitations, risk, and mission requirements are checked before scheduling." },
  { icon: FileCheck, title: "Defined deliverables", copy: "The mission is scoped around the outputs you actually need, not generic flight time." },
];

export default function RequestMissionPage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[520px] overflow-hidden border-b border-white/10">
        <img src="/images/drone-operation-safety.png" alt="Professional drone operation being prepared for launch" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/78 to-[#07111c]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[520px] items-end py-16 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <p className="eyebrow mb-5">Request a Mission</p>
            <h1 className="text-5xl font-black leading-[.98] tracking-tight text-white sm:text-6xl lg:text-7xl">Start with the objective.<span className="block text-accent">DOM builds the operation.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">Tell us the site, the problem, and what you need delivered. DOM will scope the aircraft, airspace, capture plan, safety requirements, and data workflow around the mission.</p>
            <a href="/get-a-quote" className="mt-8 inline-flex items-center gap-2 text-sm font-black text-accent">Prefer instant pricing? Get a quote <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0E151E]">
        <div className="container-app grid gap-px md:grid-cols-3">
          {signals.map((item) => <div key={item.title} className="border-b border-white/10 px-6 py-8 md:border-b-0 md:border-r md:last:border-r-0"><item.icon className="h-6 w-6 text-accent" /><h2 className="mt-4 text-lg font-black text-white">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{item.copy}</p></div>)}
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[1fr_.42fr] lg:items-start">
          <div className="rounded-3xl border border-white/10 bg-[#111923] p-6 shadow-2xl lg:p-10">
            <div className="mb-8"><p className="eyebrow mb-3">Mission Intake</p><h2 className="text-3xl font-black text-white">Tell us what success looks like.</h2><p className="mt-3 max-w-2xl text-slate-400">The more context you provide, the faster DOM can determine the right mission plan and deliverables.</p></div>
            <MissionRequestForm />
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28">
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-7"><p className="text-xs font-black uppercase tracking-[.16em] text-accent">What happens next</p><ol className="mt-5 space-y-5 text-sm text-slate-300"><li><strong className="text-white">1. Scope review</strong><br/><span className="text-slate-400">We review location, airspace, objective, timing, and deliverables.</span></li><li><strong className="text-white">2. Mission plan</strong><br/><span className="text-slate-400">DOM determines aircraft, capture method, operating constraints, and data workflow.</span></li><li><strong className="text-white">3. Confirm & schedule</strong><br/><span className="text-slate-400">Once scope and pricing are accepted, the mission moves into operations.</span></li></ol></div>
            <div className="rounded-2xl border border-white/10 bg-[#111923] p-7"><h3 className="text-lg font-black text-white">Need immediate pricing?</h3><p className="mt-3 text-sm leading-6 text-slate-400">Use the automated quote workflow for a faster estimate before speaking with operations.</p><a href="/get-a-quote" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-accent">Get Instant Quote <ArrowRight className="h-4 w-4" /></a></div>
          </aside>
        </div>
      </section>
    </div>
  );
}
