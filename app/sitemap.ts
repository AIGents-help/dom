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
    "/faa-compliance",
    "/request-mission",
    "/get-a-quote",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/knowledge" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/knowledge" ? 0.9 : 0.8,
  }));
}
