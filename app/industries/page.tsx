import Link from "next/link";
import {
  Factory, Building2, Wheat, Flame, Mountain, ShieldCheck, Truck, Landmark, ArrowRight,
} from "lucide-react";

const industries = [
  {
    icon: Factory,
    name: "Energy & Utilities",
    desc: "Transmission line corridors, solar farms, and wind turbine assets require recurring, high-precision inspection. We support utilities and energy operators with thermal diagnostics, corridor mapping, and compliance-ready documentation.",
  },
  {
    icon: Building2,
    name: "Construction & Real Estate",
    desc: "From groundbreak to handoff, scheduled aerial capture delivers progress documentation, volumetric tracking, and stakeholder-ready reporting for developers, GCs, and architecture firms.",
  },
  {
    icon: Wheat,
    name: "Agriculture",
    desc: "Multispectral and NDVI imaging helps agronomy teams identify crop stress, optimize irrigation, and quantify yield risk across large acreage with rapid turnaround.",
  },
  {
    icon: Flame,
    name: "Public Safety & Emergency Response",
    desc: "Rapid-deployment aerial support for fire mapping, search assistance, and post-incident assessment, coordinated directly with public safety agencies.",
  },
  {
    icon: Mountain,
    name: "Infrastructure & Engineering",
    desc: "Bridges, towers, dams, and rooftops assessed with high-resolution imagery and 3D modeling to support structural engineering and maintenance planning.",
  },
  {
    icon: ShieldCheck,
    name: "Government & Public Sector",
    desc: "Compliant, insured operations built to meet municipal and federal procurement standards, including full documentation for audit and oversight requirements.",
  },
  {
    icon: Truck,
    name: "Logistics & Industrial Sites",
    desc: "Yard inventory mapping, facility security overviews, and large-site monitoring for distribution and industrial operators.",
  },
  {
    icon: Landmark,
    name: "Insurance & Risk Assessment",
    desc: "Pre- and post-event property assessment for underwriting and claims teams, with documented imagery suitable for adjuster review.",
  },
];

export default function IndustriesPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Industries</p>
          <h1 className="heading-xl max-w-3xl">
            Trusted by the teams managing critical infrastructure and assets.
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            Drone Operation Management partners with enterprise, government, and industrial
            clients across sectors where data accuracy and compliance are non-negotiable.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app grid gap-8 lg:grid-cols-2">
          {industries.map((ind) => (
            <div key={ind.name} className="card p-8">
              <ind.icon className="mb-5 h-8 w-8 text-accent" />
              <h2 className="mb-3 text-xl font-semibold text-white">{ind.name}</h2>
              <p className="body-muted">{ind.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section border-t border-border">
        <div className="container-app">
          <div className="card flex flex-col items-start justify-between gap-8 p-10 lg:flex-row lg:items-center lg:p-16">
            <div>
              <h2 className="heading-lg mb-3">Don't see your industry listed?</h2>
              <p className="body-muted max-w-xl">
                We've supported custom mission types across dozens of verticals. Reach out and we'll scope a solution.
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
