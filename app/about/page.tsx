import { Target, Eye, ShieldCheck, Users } from "lucide-react";

const values = [
  { icon: ShieldCheck, title: "Safety First", desc: "Every mission begins with a documented risk assessment and airspace review." },
  { icon: Target, title: "Precision Data", desc: "We deliver information built for engineering and analytical decision-making, not just imagery." },
  { icon: Eye, title: "Transparent Operations", desc: "Clients receive visibility into mission planning, status, and delivery documentation." },
  { icon: Users, title: "Partnership Approach", desc: "We operate as an extension of the client's team, not a one-off aerial vendor." },
];

export default function AboutPage() {
  return (
    <div className="bg-[#090f16] text-white">
      <section className="relative min-h-[560px] overflow-hidden border-b border-white/10">
        <img src="/images/city-night-aerial.jpg" alt="Aerial city operations at night" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090f16]/95 via-[#090f16]/78 to-[#090f16]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090f16] via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[560px] items-end py-20 lg:items-center">
          <div className="max-w-4xl">
            <p className="text-sm font-black uppercase tracking-[.22em] text-[#f26a1b]">About DOM</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[.98] tracking-tight md:text-7xl">Built to operate like a mission partner, not a guy with a drone.</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">Drone Operation Management brings structure, documentation, safety discipline, and data workflows to commercial aerial operations.</p>
          </div>
        </div>
      </section>

      <section className="container-app grid gap-12 py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-28">
        <div>
          <p className="text-sm font-black uppercase tracking-[.2em] text-[#f26a1b]">Why DOM Exists</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Aerial data should be reliable, repeatable, and useful.</h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">We exist to make aerial collection dependable for the organizations managing infrastructure, land, buildings, construction, and critical assets. Every engagement is treated as an operation: scoped, planned, executed, processed, and documented.</p>
          <p className="mt-5 text-lg leading-8 text-slate-400">That means the value of a DOM mission is not simply what the drone sees. It is the quality of the workflow around the flight and the usefulness of what the client receives afterward.</p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#111923] p-3 shadow-2xl">
          <img src="/images/construction-aerial.jpg" alt="Commercial site captured from the air" className="aspect-[4/3] w-full rounded-2xl object-cover" />
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0e151e]">
        <div className="container-app grid gap-8 py-16 md:grid-cols-2 lg:grid-cols-4">
          {values.map((value) => (
            <div key={value.title} className="rounded-2xl border border-white/10 bg-[#111923] p-7 transition hover:-translate-y-1 hover:border-[#f26a1b]/70 hover:shadow-2xl">
              <value.icon className="h-8 w-8 text-[#f26a1b]" />
              <h3 className="mt-5 text-xl font-black">{value.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{value.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-app grid gap-10 py-20 lg:grid-cols-2 lg:py-28">
        <div className="rounded-3xl border border-white/10 bg-[#111923] p-9 lg:p-12">
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#f26a1b]">Mission Lifecycle</p>
          <h2 className="mt-3 text-3xl font-black">How we operate</h2>
          <div className="mt-8 space-y-5">
            {["Mission intake & scoping", "Airspace, site & risk review", "Flight execution", "Data processing & QA", "Documented delivery"].map((item, index) => (
              <div key={item} className="flex items-center gap-4 border-b border-white/10 pb-5 last:border-0">
                <span className="text-2xl font-black text-[#f26a1b]">0{index + 1}</span>
                <span className="font-bold text-white">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-3xl border border-white/10 min-h-[480px]">
          <img src="/images/drone-operation-safety.png" alt="Professional drone field operation" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-8 lg:p-10">
            <p className="text-sm font-black uppercase tracking-[.18em] text-[#f26a1b]">Professional Operations</p>
            <h2 className="mt-3 text-3xl font-black">Nothing is informal.</h2>
            <p className="mt-3 max-w-xl text-slate-300">Consistency is what allows DOM to support recurring programs without sacrificing safety, documentation, or data quality.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
