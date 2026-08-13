import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/pilot/", "/api/"],
    },
    sitemap: "https://droneopsman.com/sitemap.xml",
    host: "https://droneopsman.com",
  };
}
