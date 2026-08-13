import type { Metadata } from "next";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "DOM Drone Equipment | Drone Operation Management",
  description:
    "Explore the aircraft and mission uses represented in the Drone Operation Management knowledge catalog.",
  alternates: { canonical: "/knowledge/equipment" },
};

export default function EquipmentPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Knowledge / Equipment</p>
          <h1 className="heading-xl max-w-4xl">Aircraft selected for commercial aerial data work.</h1>
          <p className="body-muted mt-6 max-w-3xl text-lg">
            DOM documents equipment as part of the mission context so clients and machine systems can understand which platforms support which workflows.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app grid gap-6 md:grid-cols-2">
          {domKnowledge.equipment.map((item) => {
            const equipmentJsonLd = {
              "@context": "https://schema.org",
              "@type": "Product",
              name: item.name,
              category: item.category,
              description: `${item.category}. ${item.note}`,
              brand: { "@type": "Brand", name: "DJI" },
              isRelatedTo: item.uses,
            };

            return (
              <article key={item.slug} id={item.slug} className="card scroll-mt-24 p-7">
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{ __html: JSON.stringify(equipmentJsonLd) }}
                />
                <p className="eyebrow mb-3">{item.category}</p>
                <h2 className="mb-4 text-2xl font-semibold text-ink">{item.name}</h2>
                <ul className="mb-5 space-y-2 text-sm text-ink">
                  {item.uses.map((use) => (
                    <li key={use} className="flex gap-2"><span className="text-accent">—</span>{use}</li>
                  ))}
                </ul>
                <p className="body-muted">{item.note}</p>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
