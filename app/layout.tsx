import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Drone Operation Management | Commercial Drone Operations & Aerial Intelligence",
  description:
    "Drone Operation Management delivers commercial drone operations, aerial intelligence, and mission documentation for enterprise, infrastructure, energy, construction, and public sector clients. FAA Part 107 certified.",
  metadataBase: new URL("https://droneopsman.com"),
  openGraph: {
    title: "Drone Operation Management",
    description:
      "Commercial drone operations, aerial intelligence, and mission documentation.",
    url: "https://droneopsman.com",
    siteName: "Drone Operation Management",
    type: "website",
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
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
