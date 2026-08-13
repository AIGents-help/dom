import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

const serviceDetails: Record<string, {
  headline: string;
  intro: string;
  outcomes: string[];
  deliverables: string[];
  industries: string[];
}> = {
  "aerial-photography": {
    headline: "Commercial aerial photography built around the mission, not just the shot.",
    intro: "DOM captures professional aerial imagery for commercial properties, facilities, marketing teams, project documentation, and stakeholder communication. Missions are planned around site access, airspace, safety, shot requirements, and the intended use of the imagery.",
    outcomes: ["Document a property, site, or facility from useful aerial perspectives", "Create marketing and stakeholder imagery", "Capture repeatable visual documentation over time"],
    deliverables: ["High-resolution aerial photography", "Aerial video clips", "Organized project imagery", "Mission documentation when required"],
    industries: ["Commercial Real Estate", "Construction", "Facilities & Asset Management", "Public Sector"],
  },
  "mapping-surveying": {
    headline: "Drone mapping and photogrammetry for measurable site intelligence.",
    intro: "DOM uses planned overlapping aerial imagery and photogrammetry workflows to create maps, models, point clouds, and measurement-ready site documentation. Capture settings and positioning workflows are selected according to the accuracy and intended use the project requires.",
    outcomes: ["Create a current aerial map of a site", "Build measurable 2D and 3D site records", "Support planning, documentation, quantity, and progress workflows"],
    deliverables: ["Orthomosaic maps", "3D models and meshes", "Point clouds", "Volumetric measurements", "GIS-ready outputs"],
    industries: ["Construction", "Engineering", "Land & Site Development", "Infrastructure"],
  },
  "infrastructure-inspection": {
    headline: "Aerial inspection that puts high-resolution eyes on difficult assets.",
    intro: "DOM captures detailed visual data for roofs, building exteriors, towers, utilities, corridors, and other infrastructure where aerial access can improve documentation and reduce unnecessary exposure of personnel to difficult access areas.",
    outcomes: ["Document hard-to-view asset surfaces", "Create a repeatable visual condition record", "Support maintenance, engineering, and facility review workflows"],
    deliverables: ["High-resolution inspection imagery", "Organized asset documentation", "Annotated findings when scoped", "Structured mission reports"],
    industries: ["Infrastructure", "Utilities", "Energy", "Facilities & Asset Management", "Commercial Real Estate"],
  },
  "thermal-multispectral": {
    headline: "Specialized aerial sensing when the mission requires more than visible imagery.",
    intro: "DOM scopes thermal and multispectral missions around the required sensor, target condition, environmental conditions, and intended analysis. These workflows are offered when the appropriate equipment and operating conditions support a meaningful result.",
    outcomes: ["Capture non-visible aerial sensor data", "Support targeted diagnostic or comparative analysis", "Add specialized data to broader inspection or mapping workflows"],
    deliverables: ["Thermal or multispectral imagery when scoped", "Organized sensor datasets", "Mission documentation", "Analysis-ready exports when applicable"],
    industries: ["Energy", "Utilities", "Facilities & Asset Management", "Land & Site Development"],
  },
  "construction-monitoring": {
    headline: "Repeatable aerial construction records that show what changed and when.",
    intro: "DOM can perform recurring capture using consistent flight and documentation workflows so owners, contractors, and stakeholders can follow site progress across the project lifecycle.",
    outcomes: ["Track visible site progress over time", "Improve stakeholder reporting with current aerial context", "Create a documented visual record of project development"],
    deliverables: ["Progress aerial imagery", "Orthomosaic maps when scoped", "Comparison views", "3D site models when scoped", "Structured project documentation"],
    industries: ["Construction", "Engineering", "Land & Site Development", "Commercial Real Estate"],
  },
  "data-analytics": {
    headline: "Turn aerial capture into outputs your team can actually use.",
    intro: "DOM processes mission data into organized, decision-ready deliverables selected for the client's workflow instead of treating raw imagery as the final product.",
    outcomes: ["Convert aerial imagery into structured project information", "Provide outputs compatible with mapping, engineering, and reporting workflows", "Create repeatable documentation for future comparison"],
    deliverables: ["GIS-ready data", "Point clouds", "3D meshes", "Orthomosaics", "Measurements", "Structured reports"],
    industries: ["Engineering", "Construction", "Infrastructure", "Facilities & Asset Management", "Public Sector"],
  },
  "mission-compliance": {
    headline: "Commercial drone missions managed as documented operations.",
    intro: "DOM treats each engagement as an operational workflow with mission intake, airspace and site review, risk considerations, flight execution, data handling, and delivery documentation appropriate to the project.",
    outcomes: ["Create a repeatable mission process", "Improve project visibility and documentation", "Support client compliance and recordkeeping requirements"],
    deliverables: ["Mission planning records", "Airspace and site review documentation", "Flight records", "Delivery documentation", "Structured mission reports"],
    industries: ["Public Sector", "Infrastructure", "Utilities", "Construction", "Energy"],
  },
};

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return domKnowledge.services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = domKnowledge.services.find((item) => item.slug === slug);
  if (!service) return {};

  return {
    title: `${service.name} | Drone Operation Management`,
    description: service.description,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const service = domKnowledge.services.find((item) => item.slug === slug);
  const details = serviceDetails[slug];
  if (!service || !details) notFound();

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `https://droneopsman.com/services/${service.slug}#service`,
    name: service.name,
    description: service.description,
    url: `https://droneopsman.com/services/${service.slug}`,
    provider: { "@id": "https://droneopsman.com/#organization" },
    areaServed: domKnowledge.serviceAreas.map((area) => ({ "@type": "AdministrativeArea", name: area.name })),
    audience: details.industries.map((industry) => ({ "@type": "Audience", audienceType: industry })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">DOM Service</p>
          <h1 className="heading-xl max-w-4xl">{service.name}</h1>
          <p className="body-muted mt-6 max-w-3xl text-xl">{details.headline}</p>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app grid gap-12 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <h2 className="heading-lg mb-5">What this service does</h2>
            <p className="body-muted max-w-3xl text-lg">{details.intro}</p>
          </div>
          <div className="card p-7">
            <p className="eyebrow mb-4">Common Applications</p>
            <ul className="space-y-3">
              {details.industries.map((industry) => (
                <li key={industry} className="flex gap-3 text-sm text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{industry}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="heading-lg mb-6">What clients use it for</h2>
            <ul className="space-y-4">
              {details.outcomes.map((outcome) => (
                <li key={outcome} className="flex gap-3 text-ink"><span className="text-accent">—</span>{outcome}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="heading-lg mb-6">Typical deliverables</h2>
            <ul className="space-y-4">
              {details.deliverables.map((deliverable) => (
                <li key={deliverable} className="flex gap-3 text-ink"><span className="text-accent">—</span>{deliverable}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-app">
          <div className="card flex flex-col items-start justify-between gap-8 p-10 lg:flex-row lg:items-center lg:p-14">
            <div>
              <h2 className="heading-lg mb-3">Have a site or asset that needs this service?</h2>
              <p className="body-muted max-w-2xl">Tell DOM the location, objective, and deliverable you need. We will scope the mission around the actual project requirements.</p>
            </div>
            <Link href="/request-mission" className="btn-primary whitespace-nowrap">Request a Mission <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
