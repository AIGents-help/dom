import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DOM OS — Drone Operation Management",
    short_name: "DOM OS",
    description: "Mission control, field workflow, safety, client delivery, and pilot operations.",
    start_url: "/pilot",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#172033",
    orientation: "any",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pilot Missions", short_name: "Missions", url: "/pilot", icons: [{ src: "/icon.png", sizes: "512x512" }] },
      { name: "DOM Admin", short_name: "Admin", url: "/admin/dashboard", icons: [{ src: "/icon.png", sizes: "512x512" }] },
    ],
  };
}
