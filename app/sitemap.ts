import type { MetadataRoute } from "next";
import { domKnowledge } from "@/lib/knowledge";

const baseUrl = "https://droneopsman.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/about",
    "/services",
    "/industries",
    "/deliverables",
    "/knowledge",
    "/knowledge/faq",
    "/knowledge/equipment",
    "/knowledge/service-areas",
    "/faa-compliance",
    "/request-mission",
    "/get-a-quote",
  ];

  const knowledgeAnchors = [
    ...domKnowledge.services.map((service) => `/knowledge#${service.slug}`),
    ...domKnowledge.equipment.map((item) => `/knowledge/equipment#${item.slug}`),
    ...domKnowledge.serviceAreas.map((area) => `/knowledge/service-areas#${area.slug}`),
  ];

  return [...staticRoutes, ...knowledgeAnchors].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route.startsWith("/knowledge") ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/knowledge" ? 0.9 : route.startsWith("/knowledge") ? 0.85 : 0.8,
  }));
}
