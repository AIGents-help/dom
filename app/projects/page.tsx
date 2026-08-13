import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Projects & Technical Demonstrations | Drone Operation Management",
  description: "Explore documented Drone Operation Management project evidence, technical demonstrations, workflows, and deliverable validation.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Evidence</p>
          <h1 className="heading-xl max-w-4xl">Projects, technical demonstrations, and validated workflows.</h1>
          <p className="body-muted mt-6 max-w-3xl text-lg">
            DOM publishes project evidence with clear labels so clients and search systems can distinguish client work, internal validation, and technical demonstrations.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app grid gap-8 lg:grid-cols-2">
          {domKnowledge.evidence.map((item) => (
            <article key={item.slug} className="card p-8">
              <p className="eyebrow mb-3">{item.type}</p>
              <h2 className="mb-4 text-2xl font-semibold text-ink">{item.title}</h2>
              <p className="body-muted mb-5">{item.summary}</p>
              <p className="mb-6 text-sm text-muted"><strong className="text-ink">Disclosure:</strong> {item.disclosure}</p>
              <Link href={`/projects/${item.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
                View evidence <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
