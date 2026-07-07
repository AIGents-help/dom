"use client";

// Pilot > Resources — curated external links. Static content, no DB
// needed; free for every pilot regardless of subscription tier. Insurance
// entries are plain links for now — swap in real affiliate URLs/codes
// here once partnership deals exist, without touching anything else.

const V = { surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D" };
const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };

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
];

export default function PilotResources() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
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
