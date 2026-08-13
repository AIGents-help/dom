import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Knowledge Catalog | Drone Operation Management",
  description:
    "Explore Drone Operation Management services, industries, equipment, service areas, deliverables, FAQs, and commercial drone terminology in one authoritative knowledge catalog.",
  alternates: { canonical: "/knowledge" },
};

const hubs = [
  {
    href: "/knowledge/faq",
    title: "Commercial Drone FAQ",
    description: "Buyer-focused answers about mapping, inspections, accuracy, construction progress, and deliverables.",
  },
  {
    href: "/knowledge/equipment",
    title: "Equipment",
    description: "Aircraft and the mission workflows they support.",
  },
  {
    href: "/knowledge/service-areas",
    title: "Service Areas",
    description: "DOM's home-region coverage across Delaware County, Greater Philadelphia, and Southeastern Pennsylvania.",
  },
];

export default function KnowledgePage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Knowledge Catalog</p>
          <h1 className="heading-xl max-w-4xl">The authoritative guide to what DOM does, serves, and delivers.</h1>
          <p className="body-muted mt-6 max-w-3xl text-lg">
            This catalog gives clients, search engines, and AI systems a clear source of truth for Drone Operation Management services, industries, equipment, service areas, deliverables, and operating terminology.
          </p>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app">
          <h2 className="heading-lg mb-8">Explore the DOM knowledge base</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {hubs.map((hub) => (
              <Link key={hub.href} href={hub.href} className="card group p-6">
                <h3 className="mb-2 text-lg font-semibold text-ink group-hover:text-accent">{hub.title}</h3>
                <p className="body-muted mb-4">{hub.description}</p>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">Explore <ArrowRight className="h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app">
          <h2 className="heading-lg mb-8">Services</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {domKnowledge.services.map((service) => (
              <article id={service.slug} key={service.slug} className="card scroll-mt-24 p-6">
                <h3 className="mb-2 text-lg font-semibold text-ink">{service.name}</h3>
                <p className="body-muted">{service.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="heading-lg mb-6">Industries</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {domKnowledge.industries.map((industry) => (
                <li key={industry} className="card px-5 py-4 text-sm font-medium text-ink">{industry}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="heading-lg mb-6">Common Deliverables</h2>
            <ul className="space-y-3">
              {domKnowledge.deliverables.map((deliverable) => (
                <li key={deliverable} className="flex gap-3 text-sm text-ink">
                  <span className="text-accent">—</span>{deliverable}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-app">
          <h2 className="heading-lg mb-8">Drone Operations Glossary</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {domKnowledge.glossary.map(([term, definition]) => (
              <article key={term} className="card p-6">
                <h3 className="mb-2 text-lg font-semibold text-ink">{term}</h3>
                <p className="body-muted">{definition}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section border-t border-border">
        <div className="container-app">
          <div className="card flex flex-col items-start justify-between gap-8 p-10 lg:flex-row lg:items-center">
            <div>
              <h2 className="heading-lg mb-3">Need a mission scoped for your site?</h2>
              <p className="body-muted max-w-2xl">Tell DOM what you need to inspect, map, document, measure, or monitor.</p>
            </div>
            <Link href="/request-mission" className="btn-primary whitespace-nowrap">Request a Mission <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
