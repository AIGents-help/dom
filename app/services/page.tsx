import Link from "next/link";
import {
  Camera, Map, Radio, Database, Plane, ClipboardCheck, ArrowRight, Thermometer, Boxes,
} from "lucide-react";

const services = [
  {
    icon: Camera,
    name: "Aerial Cinematography & Photography",
    href: "/services/aerial-photography",
    image: "/images/city-night-aerial.jpg",
    tag: "Visual Intelligence",
    desc: "Cinema-grade aerial video and photography for marketing, real estate, facilities, and corporate production.",
    items: ["4K/6K cinema capture", "Commercial campaigns", "Facility documentation"],
    featured: true,
  },
  {
    icon: Map,
    name: "Mapping & Surveying",
    href: "/services/mapping-surveying",
    image: "/images/construction-aerial.jpg",
    tag: "Precision Mapping",
    desc: "Orthomosaic mapping, 3D reconstruction, topographic capture, and measurable site intelligence.",
    items: ["Orthomosaic & DEM", "3D models & point clouds", "Volume measurement"],
    featured: true,
  },
  {
    icon: Radio,
    name: "Infrastructure Inspection",
    href: "/services/infrastructure-inspection",
    image: "/images/drone-operation-safety.png",
    tag: "Asset Intelligence",
    desc: "Detailed aerial inspection of rooftops, towers, utilities, corridors, and difficult-to-access assets.",
    items: ["Roof & facade inspection", "Utility documentation", "Corridor monitoring"],
  },
  {
    icon: Thermometer,
    name: "Thermal & Multispectral Imaging",
    href: "/services/thermal-multispectral",
    image: "/images/solar-aerial.jpg",
    tag: "Specialized Sensors",
    desc: "Thermal and multispectral data capture for energy, solar, agriculture, and building-envelope analysis.",
    items: ["Solar diagnostics", "Heat-loss mapping", "Multispectral capture"],
  },
  {
    icon: Boxes,
    name: "Construction Site Monitoring",
    href: "/services/construction-monitoring",
    image: "/images/construction-aerial.jpg",
    tag: "Progress Intelligence",
    desc: "Repeatable aerial capture for progress tracking, stakeholder reporting, and project documentation.",
    items: ["Recurring progress flights", "Comparison reporting", "As-built documentation"],
  },
  {
    icon: Database,
    name: "Data & Analytics Deliverables",
    href: "/services/data-analytics",
    image: "/images/city-night-aerial.jpg",
    tag: "Decision-Ready Data",
    desc: "Processed outputs built for engineering, GIS, planning, and executive decision-making workflows.",
    items: ["GIS-ready data", "Point cloud & mesh exports", "Structured reports"],
  },
  {
    icon: ClipboardCheck,
    name: "Mission Documentation & Compliance",
    href: "/services/mission-compliance",
    image: "/images/drone-operation-safety.png",
    tag: "Operational Control",
    desc: "Risk review, flight documentation, airspace records, and mission traceability from intake through delivery.",
    items: ["Risk assessments", "Flight & airspace records", "Compliance packages"],
  },
  {
    icon: Plane,
    name: "Advanced Operations",
    href: "/request-mission",
    image: "/images/solar-aerial.jpg",
    tag: "Custom Missions",
    desc: "Complex and multi-site operations scoped around regulatory, airspace, site, and client requirements.",
    items: ["Large-area programs", "Corridor missions", "Custom operating plans"],
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="relative min-h-[620px] overflow-hidden bg-[#081525] text-white">
        <img
          src="/images/construction-aerial.jpg"
          alt="Commercial drone mapping operation over a large site"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#071321]/95 via-[#071321]/75 to-[#071321]/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071321] via-transparent to-transparent" />

        <div className="container-app relative flex min-h-[620px] items-end py-20 lg:items-center lg:py-24">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#F45A1E]" />
              Commercial Aerial Operations
            </div>
            <h1 className="max-w-4xl text-5xl font-bold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
              We don&apos;t just fly drones.
              <span className="block text-[#F45A1E]">We build aerial intelligence.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/75 lg:text-xl">
              Capture. Measure. Inspect. Model. Document. DOM turns aerial operations into usable information for the people managing real assets, sites, and projects.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/request-mission" className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#D9480F]">
                Scope Your Mission <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/projects" className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">
                See Projects & Evidence
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0D1B2B] text-white">
        <div className="container-app grid grid-cols-2 gap-px sm:grid-cols-4">
          {[
            ["MAP", "Orthomosaics + 3D"],
            ["INSPECT", "Assets + Infrastructure"],
            ["DOCUMENT", "Progress + Compliance"],
            ["DELIVER", "Decision-Ready Data"],
          ].map(([label, value]) => (
            <div key={label} className="border-white/10 px-5 py-7 sm:border-l sm:first:border-l-0 lg:px-8">
              <p className="text-[11px] font-bold tracking-[0.22em] text-[#F45A1E]">{label}</p>
              <p className="mt-2 text-sm font-semibold text-white/90 lg:text-base">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#F5F7FA] py-20 lg:py-28">
        <div className="container-app">
          <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="eyebrow mb-4">Capabilities</p>
              <h2 className="max-w-3xl text-4xl font-bold tracking-tight text-ink lg:text-5xl">Choose the outcome. We build the mission around it.</h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-muted">Every engagement is scoped around what you need to know, prove, measure, inspect, or communicate—not around selling flight time.</p>
          </div>

          <div className="grid auto-rows-[420px] gap-5 lg:grid-cols-2">
            {services.map((s, index) => (
              <Link
                key={s.name}
                href={s.href}
                className={`group relative overflow-hidden rounded-2xl border border-black/5 bg-[#0B1827] shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${index < 2 ? "lg:min-h-[500px]" : ""}`}
              >
                <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#071321] via-[#071321]/65 to-[#071321]/10" />
                <div className="absolute inset-x-0 bottom-0 p-7 lg:p-9">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 backdrop-blur">
                      <s.icon className="h-3.5 w-3.5 text-[#F45A1E]" />
                      {s.tag}
                    </div>
                    <ArrowRight className="h-5 w-5 text-white/60 transition group-hover:translate-x-1 group-hover:text-[#F45A1E]" />
                  </div>
                  <h3 className="max-w-xl text-2xl font-bold tracking-tight text-white lg:text-3xl">{s.name}</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 lg:text-base">{s.desc}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {s.items.map((item) => (
                      <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur">{item}</span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#0B1827] py-20 text-white lg:py-24">
        <img src="/images/city-night-aerial.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1827] via-[#0B1827]/95 to-[#0B1827]/70" />
        <div className="container-app relative flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#F45A1E]">Mission First</p>
            <h2 className="text-4xl font-bold tracking-tight lg:text-5xl">Tell us what you need to know. We&apos;ll determine how to capture it.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">One site or fifty. One-time inspection or recurring program. DOM scopes the aircraft, capture plan, data workflow, and deliverables around the objective.</p>
          </div>
          <Link href="/request-mission" className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[#F45A1E] px-7 py-4 text-sm font-bold text-white transition hover:bg-[#D9480F]">
            Request a Mission <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
