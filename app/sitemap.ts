import type { MetadataRoute } from "next";
import { domKnowledge } from "@/lib/knowledge";

const baseUrl = "https://droneopsman.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/about",
    "/services",
    ...domKnowledge.services.map((service) => `/services/${service.slug}`),
    "/industries",
    "/deliverables",
    "/projects",
    ...domKnowledge.evidence.map((item) => `/projects/${item.slug}`),
    "/knowledge",
    "/knowledge/faq",
    "/knowledge/equipment",
    "/knowledge/service-areas",
    "/faa-compliance",
    "/request-mission",
    "/get-a-quote",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency:
      route.startsWith("/knowledge") || route.startsWith("/services/") || route.startsWith("/projects")
        ? "weekly"
        : "monthly",
    priority:
      route === ""
        ? 1
        : route === "/knowledge" || route === "/services" || route === "/projects"
          ? 0.9
          : route.startsWith("/knowledge") || route.startsWith("/services/") || route.startsWith("/projects/")
            ? 0.85
            : 0.8,
  }));
}
