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
  image: string;
}> = {
  "aerial-photography": { headline: "Commercial aerial photography built around the mission, not just the shot.", intro: "DOM captures professional aerial imagery for commercial properties, facilities, marketing teams, project documentation, and stakeholder communication. Missions are planned around site access, airspace, safety, shot requirements, and the intended use of the imagery.", outcomes: ["Document a property, site, or facility from useful aerial perspectives", "Create marketing and stakeholder imagery", "Capture repeatable visual documentation over time"], deliverables: ["High-resolution aerial photography", "Aerial video clips", "Organized project imagery", "Mission documentation when required"], industries: ["Commercial Real Estate", "Construction", "Facilities & Asset Management", "Public Sector"], image: "/images/city-night-aerial.jpg" },
  "mapping-surveying": { headline: "Drone mapping and photogrammetry for measurable site intelligence.", intro: "DOM uses planned overlapping aerial imagery and photogrammetry workflows to create maps, models, point clouds, and measurement-ready site documentation. Capture settings and positioning workflows are selected according to the accuracy and intended use the project requires.", outcomes: ["Create a current aerial map of a site", "Build measurable 2D and 3D site records", "Support planning, documentation, quantity, and progress workflows"], deliverables: ["Orthomosaic maps", "3D models and meshes", "Point clouds", "Volumetric measurements", "GIS-ready outputs"], industries: ["Construction", "Engineering", "Land & Site Development", "Infrastructure"], image: "/images/construction-aerial.jpg" },
  "infrastructure-inspection": { headline: "Aerial inspection that puts high-resolution eyes on difficult assets.", intro: "DOM captures detailed visual data for roofs, building exteriors, towers, utilities, corridors, and other infrastructure where aerial access can improve documentation and reduce unnecessary exposure of personnel to difficult access areas.", outcomes: ["Document hard-to-view asset surfaces", "Create a repeatable visual condition record", "Support maintenance, engineering, and facility review workflows"], deliverables: ["High-resolution inspection imagery", "Organized asset documentation", "Annotated findings when scoped", "Structured mission reports"], industries: ["Infrastructure", "Utilities", "Energy", "Facilities & Asset Management", "Commercial Real Estate"], image: "/images/drone-operation-safety.png" },
  "thermal-multispectral": { headline: "Specialized aerial sensing when the mission requires more than visible imagery.", intro: "DOM scopes thermal and multispectral missions around the required sensor, target condition, environmental conditions, and intended analysis. These workflows are offered when the appropriate equipment and operating conditions support a meaningful result.", outcomes: ["Capture non-visible aerial sensor data", "Support targeted diagnostic or comparative analysis", "Add specialized data to broader inspection or mapping workflows"], deliverables: ["Thermal or multispectral imagery when scoped", "Organized sensor datasets", "Mission documentation", "Analysis-ready exports when applicable"], industries: ["Energy", "Utilities", "Facilities & Asset Management", "Land & Site Development"], image: "/images/solar-aerial.jpg" },
  "construction-monitoring": { headline: "Repeatable aerial construction records that show what changed and when.", intro: "DOM can perform recurring capture using consistent flight and documentation workflows so owners, contractors, and stakeholders can follow site progress across the project lifecycle.", outcomes: ["Track visible site progress over time", "Improve stakeholder reporting with current aerial context", "Create a documented visual record of project development"], deliverables: ["Progress aerial imagery", "Orthomosaic maps when scoped", "Comparison views", "3D site models when scoped", "Structured project documentation"], industries: ["Construction", "Engineering", "Land & Site Development", "Commercial Real Estate"], image: "/images/construction-aerial.jpg" },
  "data-analytics": { headline: "Turn aerial capture into outputs your team can actually use.", intro: "DOM processes mission data into organized, decision-ready deliverables selected for the client's workflow instead of treating raw imagery as the final product.", outcomes: ["Convert aerial imagery into structured project information", "Provide outputs compatible with mapping, engineering, and reporting workflows", "Create repeatable documentation for future comparison"], deliverables: ["GIS-ready data", "Point clouds", "3D meshes", "Orthomosaics", "Measurements", "Structured reports"], industries: ["Engineering", "Construction", "Infrastructure", "Facilities & Asset Management", "Public Sector"], image: "/images/city-night-aerial.jpg" },
  "mission-compliance": { headline: "Commercial drone missions managed as documented operations.", intro: "DOM treats each engagement as an operational workflow with mission intake, airspace and site review, risk considerations, flight execution, data handling, and delivery documentation appropriate to the project.", outcomes: ["Create a repeatable mission process", "Improve project visibility and documentation", "Support client compliance and recordkeeping requirements"], deliverables: ["Mission planning records", "Airspace and site review documentation", "Flight records", "Delivery documentation", "Structured mission reports"], industries: ["Public Sector", "Infrastructure", "Utilities", "Construction", "Energy"], image: "/images/drone-operation-safety.png" },
};

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return domKnowledge.services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = domKnowledge.services.find((item) => item.slug === slug);
  if (!service) return {};
  return { title: `${service.name} | Drone Operation Management`, description: service.description, alternates: { canonical: `/services/${service.slug}` } };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const service = domKnowledge.services.find((item) => item.slug === slug);
  const details = serviceDetails[slug];
  if (!service || !details) notFound();

  const serviceJsonLd = { "@context": "https://schema.org", "@type": "Service", "@id": `https://droneopsman.com/services/${service.slug}#service`, name: service.name, description: service.description, url: `https://droneopsman.com/services/${service.slug}`, provider: { "@id": "https://droneopsman.com/#organization" }, areaServed: domKnowledge.serviceAreas.map((area) => ({ "@type": "AdministrativeArea", name: area.name })), audience: details.industries.map((industry) => ({ "@type": "Audience", audienceType: industry })) };

  return (
    <div className="bg-[#090f16] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />

      <section className="relative min-h-[560px] overflow-hidden border-b border-white/10">
        <img src={details.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090f16]/95 via-[#090f16]/75 to-[#090f16]/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090f16] via-transparent to-transparent" />
        <div className="container-app relative flex min-h-[560px] items-end py-20 lg:items-center">
          <div className="max-w-4xl">
            <p className="text-sm font-black uppercase tracking-[.22em] text-[#f26a1b]">DOM Service</p>
            <h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight md:text-7xl">{service.name}</h1>
            <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-300">{details.headline}</p>
            <Link href="/request-mission" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Scope This Mission <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section className="container-app grid gap-12 py-20 lg:grid-cols-[1.15fr_.85fr] lg:items-start lg:py-28">
        <div>
          <p className="text-sm font-black uppercase tracking-[.2em] text-[#f26a1b]">What It Does</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">Turn the flight into something useful.</h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{details.intro}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#111923] p-8 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#f26a1b]">Common Applications</p>
          <ul className="mt-6 space-y-4">
            {details.industries.map((industry) => <li key={industry} className="flex gap-3 text-sm font-semibold text-white"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f26a1b]" />{industry}</li>)}
          </ul>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0e151e]">
        <div className="container-app grid gap-8 py-16 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-[#111923] p-8 lg:p-10">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#f26a1b]">Client Outcomes</p>
            <h2 className="mt-3 text-3xl font-black">What this helps you do</h2>
            <ul className="mt-7 space-y-5">{details.outcomes.map((item) => <li key={item} className="flex gap-4 text-slate-300"><span className="font-black text-[#f26a1b]">—</span>{item}</li>)}</ul>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#111923] p-8 lg:p-10">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#f26a1b]">Deliverables</p>
            <h2 className="mt-3 text-3xl font-black">What you can receive</h2>
            <ul className="mt-7 space-y-5">{details.deliverables.map((item) => <li key={item} className="flex gap-4 text-slate-300"><span className="font-black text-[#f26a1b]">—</span>{item}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="container-app py-16 lg:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111923] p-10 lg:p-14">
          <img src={details.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#111923] via-[#111923]/95 to-[#111923]/70" />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[.18em] text-[#f26a1b]">Mission Ready</p>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">Have a site, asset, or project that needs this?</h2>
              <p className="mt-4 text-slate-300">Tell DOM the location, objective, and output you need. We will scope the mission around the actual requirement.</p>
            </div>
            <Link href="/request-mission" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Request a Mission <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
