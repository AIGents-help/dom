import type { Metadata } from "next";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "Commercial Drone FAQ | Drone Operation Management",
  description:
    "Answers to common questions about DOM drone mapping, inspections, construction progress, photogrammetry, accuracy, and service coverage.",
  alternates: { canonical: "/knowledge/faq" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: domKnowledge.faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Knowledge / FAQ</p>
          <h1 className="heading-xl max-w-4xl">Commercial drone questions, answered clearly.</h1>
          <p className="body-muted mt-6 max-w-3xl text-lg">
            Practical answers about mapping, inspection, construction documentation, accuracy, deliverables, and where DOM operates.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app max-w-4xl space-y-6">
          {domKnowledge.faqs.map((faq) => (
            <article key={faq.question} className="card p-7">
              <h2 className="mb-3 text-xl font-semibold text-ink">{faq.question}</h2>
              <p className="body-muted">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
