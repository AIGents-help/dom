import type { MetadataRoute } from "next";

const baseUrl = "https://droneopsman.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
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

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route.startsWith("/knowledge") ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/knowledge" ? 0.9 : route.startsWith("/knowledge") ? 0.85 : 0.8,
  }));
}
