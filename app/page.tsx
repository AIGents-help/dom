import Link from "next/link";
import {
  Building2,
  Factory,
  Wheat,
  Flame,
  ShieldCheck,
  Radio,
  Map,
  Camera,
  Mountain,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Plane,
  FileBadge,
  Database,
} from "lucide-react";

const industries = [
  { icon: Factory, name: "Energy & Utilities", desc: "Transmission line, solar, and wind asset inspection." },
  { icon: Building2, name: "Construction", desc: "Site progress mapping, volumetrics, and stakeholder reporting." },
  { icon: Wheat, name: "Agriculture", desc: "Multispectral crop health and irrigation analysis." },
  { icon: Flame, name: "Public Safety", desc: "Emergency response, fire mapping, and search support." },
  { icon: Mountain, name: "Infrastructure", desc: "Bridge, tower, and rooftop structural assessment." },
  { icon: ShieldCheck, name: "Government", desc: "Compliant operations for municipal and federal contracts." },
];

const services = [
  { icon: Camera, name: "Aerial Cinematography", desc: "Cinema-grade aerial capture for commercial and marketing production." },
  { icon: Map, name: "Mapping & Surveying", desc: "Orthomosaic mapping, 3D modeling, and topographic survey data." },
  { icon: Radio, name: "Infrastructure Inspection", desc: "High-resolution inspection of towers, rooftops, and pipelines." },
  { icon: Database, name: "Data & Analytics", desc: "Processed deliverables: GIS layers, point clouds, and reports." },
  { icon: Plane, name: "BVLOS Operations", desc: "Beyond visual line of sight missions under FAA waiver." },
  { icon: ClipboardCheck, name: "Mission Documentation", desc: "Full flight logs, compliance records, and client reporting." },
];

const whyDom = [
  { title: "FAA Part 107 Certified Pilots", desc: "Every mission flown by licensed, insured remote pilots in command." },
  { title: "Enterprise-Grade Documentation", desc: "Mission logs, risk assessments, and deliverable chain-of-custody on every job." },
  { title: "Scalable Fleet Operations", desc: "From single-site inspections to multi-state mapping programs." },
  { title: "Data You Can Act On", desc: "Deliverables built for engineering, GIS, and decision-making teams." },
];

const workflow = [
  { step: "01", title: "Mission Request", desc: "Submit scope, location, and timeline through our intake form." },
  { step: "02", title: "Airspace & Risk Review", desc: "Our team confirms FAA authorization, airspace class, and site risk." },
  { step: "03", title: "Flight Operations", desc: "Certified pilots execute the mission with documented flight logs." },
  { step: "04", title: "Data Processing", desc: "Raw capture is processed into mapped, analyzed deliverables." },
  { step: "05", title: "Delivery & Reporting", desc: "Final assets and compliance documentation delivered to your team." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-grid-fade">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent,rgba(5,8,15,0.9))]" />
        <div className="container-app relative py-28 lg:py-40">
          <p className="eyebrow mb-5">FAA Part 107 Certified Commercial Operations</p>
          <h1 className="heading-xl max-w-4xl">
            Drone Operation <span className="text-accent">Management</span>
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            Commercial drone operations, aerial intelligence, and mission documentation.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link href="/request-mission" className="btn-primary">
              Request a Mission <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/services" className="btn-secondary">
              Explore Services
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-8 border-t border-border pt-10 sm:grid-cols-4">
            {[
              ["500+", "Missions Flown"],
              ["48", "States Authorized"],
              ["100%", "Part 107 Compliant"],
              ["24hr", "Avg. Response Time"],
            ].map(([stat, label]) => (
              <div key={label}>
                <p className="text-3xl font-bold text-white">{stat}</p>
                <p className="text-sm text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="section border-b border-border">
        <div className="container-app">
          <p className="eyebrow mb-3">Industries Served</p>
          <h2 className="heading-lg mb-12 max-w-2xl">
            Built for the teams operating critical assets.
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((ind) => (
              <div key={ind.name} className="card p-6">
                <ind.icon className="mb-4 h-7 w-7 text-accent" />
                <h3 className="mb-2 text-lg font-semibold text-white">{ind.name}</h3>
                <p className="text-sm text-slate-400">{ind.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Services */}
      <section className="section border-b border-border bg-surface/30">
        <div className="container-app">
          <p className="eyebrow mb-3">Core Services</p>
          <h2 className="heading-lg mb-12 max-w-2xl">
            End-to-end aerial operations, from flight to final deliverable.
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <div key={s.name} className="card p-6">
                <s.icon className="mb-4 h-7 w-7 text-accent" />
                <h3 className="mb-2 text-lg font-semibold text-white">{s.name}</h3>
                <p className="text-sm text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Link href="/services" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
              View all services <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why DOM */}
      <section className="section border-b border-border">
        <div className="container-app grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Why Drone Operation Management</p>
            <h2 className="heading-lg">
              Aerial operations run like an engineering discipline, not a hobby.
            </h2>
            <p className="body-muted mt-5">
              We operate as an extension of your operations and compliance teams — with the
              documentation, insurance, and risk processes that enterprise and government
              programs require.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {whyDom.map((w) => (
              <div key={w.title} className="flex gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-accent" />
                <div>
                  <h3 className="text-sm font-semibold text-white">{w.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAA Compliance */}
      <section className="section border-b border-border bg-surface/30">
        <div className="container-app grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">FAA Part 107 Compliance</p>
            <h2 className="heading-lg mb-5">
              Every mission flown within full federal regulatory compliance.
            </h2>
            <p className="body-muted mb-8">
              All flight operations are conducted by certified Remote Pilots in Command under
              FAA Part 107, with LAANC airspace authorization, registered aircraft, and
              comprehensive liability coverage on every job.
            </p>
            <Link href="/faa-compliance" className="btn-secondary">
              View Compliance Standards
            </Link>
          </div>
          <div className="card p-8">
            <FileBadge className="mb-4 h-8 w-8 text-accent" />
            <ul className="space-y-4 text-sm text-slate-300">
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 text-accent" /> Certified Remote Pilots in Command</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 text-accent" /> LAANC airspace authorization on every flight</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 text-accent" /> Registered, insured aircraft fleet</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 text-accent" /> Documented pre-flight risk assessments</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 text-accent" /> Waiver support for BVLOS & night operations</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Mission Workflow */}
      <section className="section border-b border-border">
        <div className="container-app">
          <p className="eyebrow mb-3">Mission Workflow</p>
          <h2 className="heading-lg mb-12 max-w-2xl">From request to delivered data.</h2>
          <div className="grid gap-8 lg:grid-cols-5">
            {workflow.map((w) => (
              <div key={w.step} className="relative">
                <span className="text-3xl font-bold text-accent/30">{w.step}</span>
                <h3 className="mt-3 text-base font-semibold text-white">{w.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section">
        <div className="container-app">
          <div className="card flex flex-col items-start justify-between gap-8 p-10 lg:flex-row lg:items-center lg:p-16">
            <div>
              <h2 className="heading-lg mb-3">Ready to launch your next mission?</h2>
              <p className="body-muted max-w-xl">
                Tell us about your project and our operations team will respond with scope,
                compliance status, and scheduling within one business day.
              </p>
            </div>
            <Link href="/request-mission" className="btn-primary whitespace-nowrap">
              Request a Mission <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
