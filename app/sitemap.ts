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
    changeFrequency: route.startsWith("/knowledge") || route.startsWith("/services/") ? "weekly" : "monthly",
    priority:
      route === ""
        ? 1
        : route === "/knowledge" || route === "/services"
          ? 0.9
          : route.startsWith("/knowledge") || route.startsWith("/services/")
            ? 0.85
            : 0.8,
  }));
}
