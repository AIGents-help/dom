"use client";

import { useState } from "react";
import SopViewer from "@/components/SopViewer";

// Pilot > Resources — curated external links (static, free for everyone)
// plus DB-backed training tutorials (components/PilotResources tab). Free
// tutorials always render; premium ones are gated server-side in
// /api/pilot/me (locked: true, body_md omitted) behind the existing $99/mo
// self-service subscription — not a new per-tutorial purchase flow.

const V = { surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D", telemetry: "#4FD1C5" };
const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };

export interface Tutorial {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  is_premium: boolean;
  version: number;
  locked: boolean;
  body_md: string | null;
}

interface ResourceLink {
  name: string;
  desc: string;
  url: string;
}

const SECTIONS: { title: string; links: ResourceLink[] }[] = [
  {
    title: "FAA & Airspace",
    links: [
      { name: "FAA Part 107 Hub", desc: "Remote pilot certification requirements, testing, and recurrent training.", url: "https://www.faa.gov/uas/commercial_operators" },
      { name: "FAADroneZone / LAANC", desc: "Register aircraft and request controlled-airspace authorization.", url: "https://faadronezone.faa.gov" },
      { name: "TFR Lookup", desc: "Check active temporary flight restrictions before you fly.", url: "https://tfr.faa.gov" },
      { name: "Airman Certificate Lookup", desc: "Verify a Part 107 remote pilot certificate.", url: "https://amsrvs.registry.faa.gov/airmeninquiry" },
    ],
  },
  {
    title: "Flight Planning",
    links: [
      { name: "SkyVector", desc: "Free VFR sectional charts — check airspace class and obstacles at any site.", url: "https://skyvector.com" },
      { name: "B4UFLY", desc: "FAA's mobile app for real-time airspace advisories.", url: "https://www.faa.gov/uas/getting_started/b4ufly" },
    ],
  },
  {
    title: "Insurance Partners",
    links: [
      { name: "SkyWatch.AI", desc: "On-demand and annual drone liability insurance for commercial pilots.", url: "https://www.skywatch.ai" },
      { name: "Thimble", desc: "Short-term and monthly commercial drone insurance.", url: "https://www.thimble.com/drone-insurance" },
      { name: "Avionics Insurance", desc: "Full-coverage aviation and drone liability policies.", url: "https://www.avionicsinsurance.com" },
    ],
  },
  {
    title: "Document Templates",
    links: [
      { name: "Property Access & Site Authorization Waiver", desc: "Get signed permission from a property owner before you fly.", url: "/templates/property-access-waiver.html" },
      { name: "Model & Image Release Form", desc: "Use when captured imagery includes identifiable people.", url: "/templates/model-image-release.html" },
      { name: "Mission Service Agreement", desc: "A fill-in scope/price/deliverables cover sheet for a client.", url: "/templates/service-agreement.html" },
    ],
  },
];

export default function PilotResources({ tutorials }: { tutorials: Tutorial[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {tutorials.length > 0 && (
        <div style={panelStyle}>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
            Training &amp; Tutorials
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {tutorials.map((t) => {
              const open = expanded === t.id;
              return (
                <div key={t.id} style={{ border: `1px solid ${V.line}`, borderRadius: 8, background: t.locked ? "rgba(90,102,120,.06)" : "transparent" }}>
                  <button
                    onClick={() => !t.locked && setExpanded(open ? null : t.id)}
                    disabled={t.locked}
                    style={{
                      display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
                      padding: 12, background: "transparent", border: "none", textAlign: "left",
                      cursor: t.locked ? "default" : "pointer", color: V.ink,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                      <div style={{ color: V.inkDim, fontSize: 13, marginTop: 2 }}>{t.category ?? "General"}</div>
                    </div>
                    {t.locked ? (
                      <span className="font-mono-ibm" style={{ fontSize: 10, padding: "4px 9px", borderRadius: 20, background: "rgba(90,102,120,.15)", color: V.inkFaint, letterSpacing: ".06em", textTransform: "uppercase" }}>
                        🔒 Subscriber only
                      </span>
                    ) : (
                      <span style={{ color: V.inkFaint, fontSize: 13 }}>{open ? "▲" : "▼"}</span>
                    )}
                  </button>
                  {t.locked && (
                    <p style={{ color: V.inkFaint, fontSize: 12, margin: "0 12px 12px" }}>
                      Unlocks with the $99/mo self-service subscription — see the Profile tab.
                    </p>
                  )}
                  {open && t.body_md && (
                    <div style={{ padding: "0 12px 16px", borderTop: `1px solid ${V.line}`, marginTop: -1, paddingTop: 14 }}>
                      <SopViewer bodyMd={t.body_md} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {SECTIONS.map((section) => (
        <div key={section.title} style={panelStyle}>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
            {section.title}
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {section.links.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block", textDecoration: "none", color: V.ink, padding: 12, borderRadius: 8, border: `1px solid ${V.line}` }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{link.name} →</div>
                <div style={{ color: V.inkDim, fontSize: 13, marginTop: 2 }}>{link.desc}</div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
