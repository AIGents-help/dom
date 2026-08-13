import PublicQuoteWizard from "@/components/PublicQuoteWizard";
import { ShieldCheck, Clock, FileCheck, ArrowRight, MapPin } from "lucide-react";

const signals = [
  { icon: MapPin, title: "Site-aware", copy: "Start with the actual location so airspace and mission context can be evaluated." },
  { icon: Clock, title: "Fast estimate", copy: "Build a preliminary mission price without waiting for a manual callback." },
  { icon: FileCheck, title: "Ops-reviewed", copy: "Final scheduling still passes through DOM operations before the aircraft launches." },
];

export default function GetAQuotePage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[500px] overflow-hidden border-b border-white/10">
        <img src="/images/construction-aerial.jpg" alt="Aerial site used for commercial drone mission planning" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/95 via-[#07111c]/78 to-[#07111c]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[500px] items-end py-16 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <p className="eyebrow mb-5">Instant Quote</p>
            <h1 className="text-5xl font-black leading-[.98] tracking-tight text-white sm:text-6xl lg:text-7xl">Price the mission.<span className="block text-accent">Start with the site.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">Enter your location and project scope to build a preliminary mission estimate and surface airspace considerations before scheduling.</p>
            <a href="/request-mission" className="mt-8 inline-flex items-center gap-2 text-sm font-black text-accent">Need a custom scope instead? Request a mission <ArrowRight className="h-4 w-4" /></a>
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
            <div className="mb-8"><p className="eyebrow mb-3">Quote Builder</p><h2 className="text-3xl font-black text-white">Build the mission estimate.</h2><p className="mt-3 max-w-2xl text-slate-400">Use the wizard below to define location, mission type, timing, and scope.</p></div>
            <PublicQuoteWizard />
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28">
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-7"><ShieldCheck className="h-7 w-7 text-accent" /><h3 className="mt-5 text-xl font-black text-white">Estimate first. Operations approval second.</h3><p className="mt-3 text-sm leading-6 text-slate-400">Automated pricing speeds up the front end, but DOM still reviews site conditions, airspace, mission requirements, and scheduling before confirming the operation.</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#111923] p-7"><h3 className="text-lg font-black text-white">Project too unusual for the wizard?</h3><p className="mt-3 text-sm leading-6 text-slate-400">Send the mission objective directly and DOM can scope a custom capture and deliverable plan.</p><a href="/request-mission" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-accent">Request Custom Mission <ArrowRight className="h-4 w-4" /></a></div>
          </aside>
        </div>
      </section>
    </div>
  );
}
