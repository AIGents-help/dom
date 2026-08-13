import Link from "next/link";
import { ArrowRight, Map, Radio, Database, Camera, Thermometer, ClipboardCheck, ShieldCheck, CheckCircle2 } from "lucide-react";

const services = [
  { icon: Map, title: "Mapping & Surveying", copy: "Orthomosaics, 3D models, point clouds, and measurable site intelligence.", image: "/images/construction-aerial.jpg", href: "/services/mapping-surveying" },
  { icon: Radio, title: "Infrastructure Inspection", copy: "Detailed aerial inspection of roofs, towers, utilities, corridors, and difficult assets.", image: "/images/drone-operation-safety.png", href: "/services/infrastructure-inspection" },
  { icon: Database, title: "Data & Analytics", copy: "Processed outputs for GIS, engineering, reporting, and decision-making workflows.", image: "/images/city-night-aerial.jpg", href: "/services/data-analytics" },
  { icon: Camera, title: "Aerial Photography", copy: "Professional aerial imagery for commercial properties, facilities, marketing, and documentation.", image: "/images/city-night-aerial.jpg", href: "/services/aerial-photography" },
  { icon: Thermometer, title: "Thermal & Multispectral", copy: "Specialized sensor capture for energy, solar, agriculture, and building-envelope work.", image: "/images/solar-aerial.jpg", href: "/services/thermal-multispectral" },
  { icon: ClipboardCheck, title: "Mission Documentation", copy: "Structured mission planning, flight records, risk review, and delivery documentation.", image: "/images/drone-operation-safety.png", href: "/services/mission-compliance" },
];

const workflow = [
  ["01", "Mission Request", "Tell us the site, objective, timeline, and what you need delivered."],
  ["02", "Airspace & Risk", "DOM reviews airspace, site conditions, operating constraints, and mission requirements."],
  ["03", "Flight Operations", "The mission is executed to the planned capture and documentation standard."],
  ["04", "Processing", "Raw capture is processed into the maps, models, imagery, measurements, or reports required."],
  ["05", "Delivery", "Final assets and mission documentation are organized for the client workflow."],
];

export default function HomePage() {
  return (
    <div className="bg-background text-ink">
      <section className="relative min-h-[720px] overflow-hidden border-b border-white/10">
        <img src="/images/construction-aerial.jpg" alt="Commercial drone operation over a construction and development site" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/98 via-[#07111c]/82 to-[#07111c]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        <div className="container-app relative flex min-h-[720px] items-center py-20">
          <div className="grid w-full gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div className="max-w-4xl">
              <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[.2em] text-white backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-accent" /> FAA Part 107 Commercial UAS Operations
              </div>
              <h1 className="text-5xl font-black leading-[.95] tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl">
                Aerial missions.
                <span className="block text-accent">Run like operations.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 lg:text-xl">
                DOM turns drone flights into usable intelligence — mapping, inspections, imagery, models, measurements, and documented deliverables built around the actual mission objective.
              </p>
              <div className="mt-9 flex flex-wrap gap-4">
                <Link href="/request-mission" className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Request a Mission <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/services" className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur transition hover:border-accent/70 hover:bg-white/15">View Capabilities</Link>
              </div>
            </div>

            <div className="relative min-h-[450px] overflow-hidden rounded-3xl border border-white/10 bg-[#111923] shadow-2xl">
              <img src="/images/drone-operation-safety.png" alt="Professional drone operation safety perimeter" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
              <div className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/60 px-4 py-2 text-[10px] font-black uppercase tracking-[.18em] text-white backdrop-blur">Safety-First Field Operations</div>
              <div className="absolute inset-x-0 bottom-0 p-7">
                <h2 className="text-2xl font-black text-white">Professional work zones. Professional missions.</h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">Site control, mission planning, and operational documentation are treated as part of the service — not optional extras.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0E151E]">
        <div className="container-app grid grid-cols-2 gap-px sm:grid-cols-4">
          {[
            ["MAP", "Orthomosaics + 3D"],
            ["INSPECT", "Assets + Infrastructure"],
            ["DOCUMENT", "Progress + Compliance"],
            ["DELIVER", "Decision-Ready Data"],
          ].map(([label, value]) => (
            <div key={label} className="border-white/10 px-5 py-8 sm:border-l sm:first:border-l-0 lg:px-8">
              <p className="text-[11px] font-black tracking-[.22em] text-accent">{label}</p>
              <p className="mt-2 text-sm font-bold text-white/90 lg:text-base">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="eyebrow mb-4">Core Services</p>
            <h2 className="max-w-3xl text-4xl font-black tracking-tight text-white lg:text-5xl">From flight to final deliverable.</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-slate-400">DOM scopes the aircraft, capture plan, processing workflow, and outputs around what your team actually needs to know, prove, measure, inspect, or communicate.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <Link key={service.title} href={service.href} className="group relative min-h-[390px] overflow-hidden rounded-2xl border border-white/10 bg-[#111923] transition duration-300 hover:-translate-y-1 hover:border-accent/60 hover:shadow-2xl">
              <img src={service.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07111c] via-[#07111c]/60 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7">
                <service.icon className="mb-4 h-7 w-7 text-accent" />
                <h3 className="text-2xl font-black text-white">{service.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{service.copy}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-accent">Explore service <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0E151E] py-20 lg:py-28">
        <div className="container-app grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div className="relative min-h-[500px] overflow-hidden rounded-3xl border border-white/10">
            <img src="/images/city-night-aerial.jpg" alt="Aerial view representing commercial asset intelligence" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute bottom-0 p-7">
              <p className="text-xs font-black uppercase tracking-[.18em] text-accent">The DOM Difference</p>
              <p className="mt-2 text-2xl font-black text-white">Most operators fly a drone. DOM runs an operation.</p>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-4">Operating Model</p>
            <h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">The value is everything around the flight.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">Mission intake, airspace review, site risk, capture planning, flight records, processing, and final delivery all matter if the output needs to support real decisions.</p>
            <div className="mt-8 space-y-5">
              {[
                ["Structured intake", "Scope the objective, site, timeline, constraints, and intended deliverable."],
                ["Documented operations", "Airspace, pilot, aircraft, and mission records are organized around the engagement."],
                ["Tracked deliverables", "Raw capture becomes usable project assets instead of an unorganized file dump."],
                ["Repeatable workflows", "Recurring sites and programs can follow consistent capture and reporting standards."],
              ].map(([title, copy]) => (
                <div key={title} className="flex gap-4">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-accent" />
                  <div><h3 className="font-black text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{copy}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-app py-20 lg:py-28">
        <div className="mb-12">
          <p className="eyebrow mb-4">Mission Workflow</p>
          <h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">From request to delivered data.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {workflow.map(([n, title, copy]) => (
            <div key={n} className="rounded-2xl border border-white/10 bg-[#111923] p-6 transition hover:border-accent/50">
              <span className="text-xs font-black tracking-[.18em] text-accent">{n}</span>
              <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/10 py-20 lg:py-24">
        <img src="/images/solar-aerial.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07111c] via-[#07111c]/95 to-[#07111c]/70" />
        <div className="container-app relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-accent"><ShieldCheck className="h-4 w-4" /> FAA Part 107 Compliance</div>
            <h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">Professional operations start before takeoff.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">DOM reviews airspace, operational limitations, mission risk, and documentation requirements before the flight is scheduled.</p>
          </div>
          <Link href="/faa-compliance" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-7 py-4 text-sm font-black text-white backdrop-blur transition hover:border-accent/70">View Compliance Standards <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="container-app py-20 lg:py-24">
        <div className="rounded-3xl border border-accent/30 bg-[radial-gradient(circle_at_85%_15%,rgba(244,90,30,.18),transparent_35%),#111923] p-9 lg:p-14">
          <div className="flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <p className="eyebrow mb-4">Request a Mission</p>
              <h2 className="text-4xl font-black tracking-tight text-white lg:text-5xl">Tell us the asset. Tell us the objective.</h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">Send the site, scope, timeline, and desired output. DOM will determine the appropriate operational and data workflow.</p>
            </div>
            <Link href="/request-mission" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-7 py-4 text-sm font-black text-white transition hover:bg-accent-dim">Start a Mission Request <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
