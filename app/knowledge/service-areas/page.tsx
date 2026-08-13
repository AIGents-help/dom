import type { Metadata } from "next";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Service Areas | Greater Philadelphia Drone Services",
  description:
    "Drone Operation Management serves commercial drone projects across Delaware County, Greater Philadelphia, and Southeastern Pennsylvania.",
  alternates: { canonical: "/knowledge/service-areas" },
};

export default function ServiceAreasPage() {
  const serviceAreaJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://droneopsman.com/#organization",
    name: domKnowledge.organization.name,
    areaServed: domKnowledge.serviceAreas.map((area) => ({
      "@type": "AdministrativeArea",
      name: area.name,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceAreaJsonLd) }}
      />
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Knowledge / Service Areas</p>
          <h1 className="heading-xl max-w-4xl">Commercial drone operations across the Greater Philadelphia region.</h1>
          <p className="body-muted mt-6 max-w-3xl text-lg">
            Mission availability depends on project scope, airspace, site access, safety conditions, and required deliverables. Broader projects can be evaluated individually.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {domKnowledge.serviceAreas.map((area) => (
            <article key={area.slug} id={area.slug} className="card scroll-mt-24 p-7">
              <p className="eyebrow mb-3">{area.region}</p>
              <h2 className="mb-3 text-xl font-semibold text-ink">{area.name}</h2>
              <p className="body-muted">{area.description}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
