import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import { domKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "Drone Operation Management | Commercial Drone Operations & Aerial Intelligence",
  description:
    "Drone Operation Management delivers commercial drone operations, aerial intelligence, and mission documentation for enterprise, infrastructure, energy, construction, and public sector clients. FAA Part 107 certified.",
  metadataBase: new URL("https://droneopsman.com"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "Drone Operation Management",
    description:
      "Commercial drone operations, aerial intelligence, and mission documentation.",
    url: "https://droneopsman.com",
    siteName: "Drone Operation Management",
    type: "website",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://droneopsman.com/#organization",
  name: domKnowledge.organization.name,
  alternateName: domKnowledge.organization.alternateName,
  url: domKnowledge.organization.url,
  description: domKnowledge.organization.description,
  areaServed: domKnowledge.serviceAreas.map((area) => ({
    "@type": "AdministrativeArea",
    name: area.name,
  })),
  knowsAbout: [
    ...domKnowledge.industries,
    ...domKnowledge.deliverables,
    ...domKnowledge.equipment.flatMap((item) => [item.name, ...item.uses]),
    ...domKnowledge.glossary.map(([term]) => term),
  ],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Commercial Drone Services",
    itemListElement: domKnowledge.services.map((service) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        "@id": `https://droneopsman.com/services/${service.slug}#service`,
        name: service.name,
        description: service.description,
        provider: { "@id": "https://droneopsman.com/#organization" },
        areaServed: domKnowledge.serviceAreas.map((area) => area.name),
        url: `https://droneopsman.com/services/${service.slug}`,
      },
    })),
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-background font-sans antialiased">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <Navbar />
        <main id="main-content" className="flex-1" tabIndex={-1}>{children}</main>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
