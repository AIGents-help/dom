import Link from "next/link";
import {
  Camera, Map, Radio, Database, Plane, ClipboardCheck, ArrowRight, Thermometer, Boxes,
} from "lucide-react";

const services = [
  {
    icon: Camera,
    name: "Aerial Cinematography & Photography",
    desc: "Cinema-grade aerial video and photography for marketing, real estate, and corporate production. Shot by FAA-certified pilots with broadcast-ready equipment.",
    items: ["4K/6K cinema capture", "Real estate & commercial campaigns", "Event and facility coverage"],
  },
  {
    icon: Map,
    name: "Mapping & Surveying",
    desc: "High-accuracy orthomosaic mapping, topographic survey, and 3D modeling for engineering, planning, and land development teams.",
    items: ["Orthomosaic & DEM generation", "GCP-based survey accuracy", "Volumetric & stockpile measurement"],
  },
  {
    icon: Radio,
    name: "Infrastructure Inspection",
    desc: "Detailed visual inspection of towers, rooftops, pipelines, and transmission infrastructure to identify defects before they become failures.",
    items: ["Cell tower & utility inspection", "Roof and building envelope assessment", "Pipeline & corridor monitoring"],
  },
  {
    icon: Thermometer,
    name: "Thermal & Multispectral Imaging",
    desc: "Thermal and multispectral sensor data for energy audits, agricultural health, and solar panel diagnostics.",
    items: ["Solar panel thermal diagnostics", "Crop health (NDVI) analysis", "Building envelope heat-loss mapping"],
  },
  {
    icon: Database,
    name: "Data & Analytics Deliverables",
    desc: "Processed, decision-ready outputs — GIS layers, point clouds, and structured reports built for your engineering and planning workflows.",
    items: ["GIS-ready shapefiles & layers", "Point cloud & mesh exports", "Custom reporting dashboards"],
  },
  {
    icon: Plane,
    name: "BVLOS & Advanced Operations",
    desc: "Beyond visual line of sight missions conducted under FAA waiver for long-corridor inspection and large-area mapping programs.",
    items: ["FAA waiver-supported BVLOS flights", "Long-corridor pipeline & rail mapping", "Multi-site mapping programs"],
  },
  {
    icon: Boxes,
    name: "Construction Site Monitoring",
    desc: "Recurring aerial capture for progress tracking, stakeholder reporting, and as-built documentation throughout a project lifecycle.",
    items: ["Scheduled progress flights", "Time-lapse & comparison reporting", "As-built site documentation"],
  },
  {
    icon: ClipboardCheck,
    name: "Mission Documentation & Compliance",
    desc: "Full flight logs, risk assessments, and chain-of-custody documentation delivered alongside every mission's data.",
    items: ["Pre-flight risk assessments", "Flight logs & airspace authorization", "Compliance reporting packages"],
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Services</p>
          <h1 className="heading-xl max-w-3xl">
            Full-spectrum aerial operations for commercial and government programs.
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            From cinematic capture to BVLOS infrastructure mapping, every engagement is run with
            enterprise-grade planning, documentation, and FAA compliance.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app grid gap-8 lg:grid-cols-2">
          {services.map((s) => (
            <div key={s.name} className="card p-8">
              <s.icon className="mb-5 h-8 w-8 text-accent" />
              <h2 className="mb-3 text-xl font-semibold text-white">{s.name}</h2>
              <p className="body-muted mb-5">{s.desc}</p>
              <ul className="space-y-2 text-sm text-slate-300">
                {s.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent">—</span> {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="section border-t border-border">
        <div className="container-app">
          <div className="card flex flex-col items-start justify-between gap-8 p-10 lg:flex-row lg:items-center lg:p-16">
            <div>
              <h2 className="heading-lg mb-3">Not sure which service fits your project?</h2>
              <p className="body-muted max-w-xl">
                Submit a mission request and our operations team will scope the right service mix for your site and timeline.
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
