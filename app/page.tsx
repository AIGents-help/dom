"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// ── DOM Homepage — "Flight Operations Console" direction ──
// Replaces the original cyan/fake-stats template. Amber brand accent,
// IBM Plex Mono for telemetry, Saira for display, honest pre-launch claims.

export default function HomePage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Saira:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        :root {
          --ground:#0A0E14; --surface:#11161F; --raised:#161D29;
          --line:#232C3B; --line-soft:#1A222F;
          --ink:#E8ECF2; --ink-dim:#8A95A7; --ink-faint:#5A6678;
          --signal:#FF8A3D; --signal-deep:#E5701F;
          --telemetry:#4FD1C5; --airspace:#C46BE0;
        }
        .font-saira { font-family: 'Saira', sans-serif; }
        .font-mono-ibm { font-family: 'IBM Plex Mono', monospace; }
        @keyframes draw { from { stroke-dashoffset: 520; } to { stroke-dashoffset: 0; } }
        @keyframes pulse-dot { 0% { box-shadow: 0 0 0 0 rgba(79,209,197,.5); } 70% { box-shadow: 0 0 0 7px rgba(79,209,197,0); } 100% { box-shadow: 0 0 0 0 rgba(79,209,197,0); } }
        @keyframes wpin { to { opacity: 1; } }
        .path-draw { stroke-dasharray: 520; stroke-dashoffset: 520; animation: draw 2.6s ease forwards .4s; }
        .dot-pulse { animation: pulse-dot 2.4s infinite; }
        .wp-fade { opacity: 0; animation: wpin .4s ease forwards; }
        .grid-bg {
          background-image: linear-gradient(#1A222F 1px, transparent 1px), linear-gradient(90deg, #1A222F 1px, transparent 1px);
          background-size: 64px 64px;
          -webkit-mask-image: radial-gradient(120% 90% at 70% 0%, #000 30%, transparent 80%);
          mask-image: radial-gradient(120% 90% at 70% 0%, #000 30%, transparent 80%);
        }
        @keyframes heroFade {
          0% { opacity: 0; }
          5% { opacity: .32; }
          28% { opacity: .32; }
          33% { opacity: 0; }
          100% { opacity: 0; }
        }
        .hero-bg { animation: heroFade 21s ease-in-out infinite; }
      `}</style>

      <div className="min-h-screen" style={{ background: "var(--ground)", color: "var(--ink)", fontFamily: "Inter, system-ui, sans-serif" }}>

        {/* ═══ HERO ═══ */}
        <header className="relative overflow-hidden" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          {/* Background layers — crossfading slideshow of aerial capture stills */}
          <img
            src="/images/city-night-aerial.jpg"
            alt=""
            aria-hidden="true"
            className="hero-bg absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0, animationDelay: "0s" }}
          />
          <img
            src="/images/construction-aerial.jpg"
            alt=""
            aria-hidden="true"
            className="hero-bg absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0, animationDelay: "-7s" }}
          />
          <img
            src="/images/solar-aerial.jpg"
            alt=""
            aria-hidden="true"
            className="hero-bg absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0, animationDelay: "-14s" }}
          />
          <div className="absolute inset-0" style={{
            background: "radial-gradient(120% 80% at 78% -10%, rgba(255,138,61,.10), transparent 55%), radial-gradient(90% 70% at 12% 8%, rgba(79,209,197,.07), transparent 50%), linear-gradient(180deg,#0c1119 0%, #0A0E14 70%)"
          }} />
          <div className="absolute inset-0 opacity-50 grid-bg" />

          <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-20 md:py-24">
            <div className="grid md:grid-cols-[1.15fr_.85fr] gap-12 items-center">
              <div>
                <span className="font-mono-ibm text-xs tracking-[.18em] uppercase inline-flex items-center gap-2.5" style={{ color: "var(--signal)" }}>
                  <span className="w-[7px] h-[7px] border-[1.5px] rotate-45 inline-block" style={{ borderColor: "var(--signal)" }} />
                  FAA Part 107 · Commercial UAS Operations
                </span>

                <h1 className="font-saira font-bold mt-5 leading-[1.05] tracking-tight" style={{ fontSize: "clamp(38px,5.4vw,68px)", maxWidth: "13ch" }}>
                  Aerial missions, run like{" "}
                  <span style={{ color: "var(--signal)" }}>flight operations.</span>
                </h1>

                <p className="mt-5" style={{ color: "var(--ink-dim)", fontSize: "clamp(16px,1.4vw,19px)", maxWidth: "46ch" }}>
                  Commercial drone services — flown to a documented standard, processed into
                  deliverables your engineering and compliance teams can act on. Every mission
                  logged, tracked, and accountable.
                </p>

                <div className="flex flex-wrap gap-3.5 mt-8">
                  <Link href="/request-mission" className="font-saira font-semibold text-[15px] tracking-wide px-6 py-3.5 rounded-[10px] inline-flex items-center gap-2 transition-transform hover:-translate-y-0.5" style={{ background: "var(--signal)", color: "var(--ground)" }}>
                    Request a Mission <span className="text-[17px]">→</span>
                  </Link>
                  <Link href="/services" className="font-saira font-semibold text-[15px] tracking-wide px-6 py-3.5 rounded-[10px] inline-flex items-center gap-2 transition-all hover:-translate-y-0.5" style={{ border: "1px solid var(--line)", color: "var(--ink)" }}>
                    View Capabilities
                  </Link>
                </div>
              </div>

              {/* ── Telemetry HUD ── */}
              <div className="rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--line)", background: "linear-gradient(160deg,rgba(22,29,41,.9),rgba(17,22,31,.9))" }}>
                <div className="flex justify-between items-center px-4 py-3 font-mono-ibm text-[11px] tracking-[.14em]" style={{ borderBottom: "1px solid var(--line-soft)", color: "var(--ink-faint)" }}>
                  <span>MISSION&nbsp;PLAN&nbsp;//&nbsp;PREVIEW</span>
                  <span className="flex items-center gap-2" style={{ color: "var(--telemetry)" }}>
                    <span className="w-[7px] h-[7px] rounded-full dot-pulse" style={{ background: "var(--telemetry)" }} />
                    STANDBY
                  </span>
                </div>
                <div className="relative h-[188px]" style={{ background: "radial-gradient(80% 120% at 30% 20%, rgba(79,209,197,.06), transparent 60%)" }}>
                  <svg viewBox="0 0 360 188" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                    <path className="path-draw" d="M28,150 C90,120 110,60 175,72 C235,83 250,40 332,38" stroke="var(--signal)" strokeWidth="2" fill="none" />
                    <circle cx="28" cy="150" r="5" fill="var(--ground)" stroke="var(--signal)" strokeWidth="1.6" />
                    <circle cx="28" cy="150" r="2.4" fill="var(--signal)" className="wp-fade" style={{ animationDelay: ".5s" }} />
                    <circle cx="175" cy="72" r="5" fill="var(--ground)" stroke="var(--signal)" strokeWidth="1.6" />
                    <circle cx="175" cy="72" r="2.4" fill="var(--signal)" className="wp-fade" style={{ animationDelay: "1.6s" }} />
                    <circle cx="332" cy="38" r="5" fill="var(--ground)" stroke="var(--signal)" strokeWidth="1.6" />
                    <circle cx="332" cy="38" r="2.4" fill="var(--signal)" className="wp-fade" style={{ animationDelay: "2.7s" }} />
                  </svg>
                </div>
                <div className="grid grid-cols-2" style={{ borderTop: "1px solid var(--line-soft)", background: "var(--line-soft)", gap: "1px" }}>
                  {[
                    ["Airspace", "CLASS G · CLEAR"],
                    ["Authorization", "LAANC ✓"],
                    ["Deliverable", "ORTHO + REPORT"],
                    ["Chain-of-custody", "LOGGED"],
                  ].map(([k, v]) => (
                    <div key={k} className="px-4 py-3" style={{ background: "var(--raised)" }}>
                      <div className="font-mono-ibm text-[10px] tracking-[.14em] uppercase" style={{ color: "var(--ink-faint)" }}>{k}</div>
                      <div className="font-mono-ibm text-[15px] font-medium mt-0.5" style={{ color: "var(--telemetry)" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ═══ CAPABILITY STRIP ═══ */}
        <section style={{ borderBottom: "1px solid var(--line-soft)", background: "var(--line-soft)" }}>
          <div className="max-w-[1200px] mx-auto grid grid-cols-2 md:grid-cols-4" style={{ gap: "1px" }}>
            {[
              ["Part 107 Standard", "Operations built to federal commercial UAS rules."],
              ["LAANC Authorized", "Controlled-airspace clearance, mission by mission."],
              ["Insured Operations", "Liability coverage on every flight."],
              ["Documented", "Flight logs & deliverable chain-of-custody."],
            ].map(([t, d]) => (
              <div key={t} className="px-6 py-7" style={{ background: "var(--surface)" }}>
                <div className="font-saira font-bold text-[17px]">{t}</div>
                <div className="text-[13px] mt-1" style={{ color: "var(--ink-dim)" }}>{d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ SERVICES ═══ */}
        <section className="py-24" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <div className="max-w-[1200px] mx-auto px-6">
            <SectionHead anno="Core Services" title="From flight to final deliverable." lead="Not flight hours — finished data products your teams can use." />
            <div className="grid md:grid-cols-3 gap-4 mt-12">
              {[
                ["▦", "Mapping & Surveying", "Orthomosaics, 3D models, and topographic survey data with measurable accuracy.", "/images/city-night-aerial.jpg"],
                ["⊡", "Infrastructure Inspection", "High-resolution capture of towers, rooftops, bridges, and pipelines — with findings reports.", "/images/construction-aerial.jpg"],
                ["◍", "Data & Analytics", "Processed deliverables: GIS layers, point clouds, volumetrics, and annotated reports.", "/images/solar-aerial.jpg"],
                ["▲", "Aerial Capture", "Cinema-grade aerial media for commercial, marketing, and stakeholder communication.", "/images/city-night-aerial.jpg"],
                ["◈", "Thermal & Multispectral", "Radiometric thermal and multispectral imaging for energy, ag, and building envelope work.", "/images/solar-aerial.jpg"],
                ["▣", "Mission Documentation", "Complete flight logs, compliance records, and reporting on every job — by default.", "/images/construction-aerial.jpg"],
              ].map(([ic, t, d, img]) => (
                <Card key={t} icon={ic} title={t} desc={d} image={img} />
              ))}
            </div>
          </div>
        </section>

        {/* ═══ INDUSTRIES ═══ */}
        <section className="py-24" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <div className="max-w-[1200px] mx-auto px-6">
            <SectionHead anno="Industries Served" title="Built for teams operating critical assets." />
            <div className="grid md:grid-cols-3 gap-4 mt-12">
              {[
                ["⚡", "Energy & Utilities", "Transmission lines, solar arrays, and wind asset inspection.", "/images/solar-aerial.jpg"],
                ["▢", "Construction", "Site progress mapping, volumetrics, and stakeholder reporting.", "/images/construction-aerial.jpg"],
                ["⌂", "Roofing & Restoration", "Fast, safe roof condition inspections for contractors and insurance work.", "/images/construction-aerial.jpg"],
                ["◇", "Infrastructure", "Bridge, tower, and structural assessment without scaffolding or shutdowns.", "/images/city-night-aerial.jpg"],
                ["✦", "Agriculture", "Multispectral crop health and irrigation analysis at field scale.", "/images/solar-aerial.jpg"],
                ["⬡", "Public Sector", "Compliant operations structured for municipal and government requirements.", "/images/city-night-aerial.jpg"],
              ].map(([ic, t, d, img]) => (
                <Card key={t} icon={ic} title={t} desc={d} image={img} />
              ))}
            </div>
          </div>
        </section>

        {/* ═══ THE DOM DIFFERENCE (platform thesis) ═══ */}
        <section className="py-24" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-14 items-center">
              <div>
                <SectionHead anno="The DOM Difference" title="Most operators fly a drone. We run an operation." lead="Anyone can put an aircraft in the air. The value is in everything around the flight — intake, airspace review, documentation, and a delivery you can audit." />
                <div className="grid gap-5 mt-8">
                  {[
                    ["01", "Structured intake & airspace review", "Every mission scoped, authorized, and risk-assessed before a rotor spins."],
                    ["02", "Documented flight operations", "Logs, conditions, and compliance records captured on every job."],
                    ["03", "Tracked deliverables", "From raw capture to final asset, with chain-of-custody you can verify."],
                    ["04", "A client view, not a Dropbox link", "Status, jobs, and deliverables in one place — the platform we're building out."],
                  ].map(([n, t, d]) => (
                    <div key={n} className="flex gap-3.5">
                      <span className="font-mono-ibm text-[13px] flex-none mt-0.5" style={{ color: "var(--signal)" }}>{n}</span>
                      <div>
                        <div className="font-saira font-semibold text-[15px]">{t}</div>
                        <div className="text-sm mt-0.5" style={{ color: "var(--ink-dim)" }}>{d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Console mock */}
              <div className="rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--line)", background: "var(--raised)" }}>
                <div className="flex gap-1.5 px-4 py-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <i className="w-[9px] h-[9px] rounded-full block" style={{ background: "var(--line)" }} />
                  <i className="w-[9px] h-[9px] rounded-full block" style={{ background: "var(--line)" }} />
                  <i className="w-[9px] h-[9px] rounded-full block" style={{ background: "var(--line)" }} />
                </div>
                <div className="flex flex-wrap gap-1 px-4 pt-3 font-mono-ibm text-[11px]" style={{ color: "var(--ink-faint)" }}>
                  {["Missions", "Clients", "Schedule", "Deliverables", "Status"].map((t, i) => (
                    <span key={t} className="px-2.5 py-1.5 rounded-md" style={i === 0 ? { background: "rgba(255,138,61,.12)", color: "var(--signal)" } : {}}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="p-4">
                  {[
                    ["Substation 7 — Thermal", "34.05N · 118.24W", "Scheduled", "sch"],
                    ["Riverside Roof Survey", "33.95N · 117.39W", "In Review", "rev"],
                    ["Industrial Park Ortho", "34.10N · 117.29W", "Delivered", "del"],
                    ["Bridge Deck Inspection", "34.02N · 118.49W", "Scheduled", "sch"],
                  ].map(([nm, loc, st, cls], i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-3 items-center py-3 text-[13px]" style={{ borderBottom: i < 3 ? "1px solid var(--line-soft)" : "none" }}>
                      <div>
                        <div className="font-medium">{nm}</div>
                        <div className="font-mono-ibm text-[11px]" style={{ color: "var(--ink-faint)" }}>{loc}</div>
                      </div>
                      <span className="font-mono-ibm text-[10px] tracking-wide px-2.5 py-1 rounded-full uppercase" style={{
                        background: cls === "rev" ? "rgba(79,209,197,.12)" : cls === "del" ? "rgba(196,107,224,.14)" : "rgba(255,138,61,.12)",
                        color: cls === "rev" ? "var(--telemetry)" : cls === "del" ? "var(--airspace)" : "var(--signal)",
                      }}>{st}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ COMPLIANCE ═══ */}
        <section className="py-24" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-14 items-center">
              <div>
                <SectionHead anno="FAA Part 107 Compliance" title="Flown inside the regulations. Every time." lead="Commercial drone work is regulated for a reason. Operations are conducted to FAA Part 107 standards, with airspace authorization, registered aircraft, and liability coverage as the baseline — not the upsell." />
                <Link href="/faa-compliance" className="font-saira font-semibold text-[15px] tracking-wide px-6 py-3.5 rounded-[10px] inline-flex items-center gap-2 mt-7 transition-all hover:-translate-y-0.5" style={{ border: "1px solid var(--line)", color: "var(--ink)" }}>
                  View Compliance Standards
                </Link>
              </div>
              <div className="rounded-[14px] p-8" style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
                <ul className="grid gap-3.5">
                  {[
                    "Operated by Remote Pilots in Command under Part 107",
                    "LAANC airspace authorization on controlled-airspace flights",
                    "Registered aircraft, maintained and logged",
                    "Documented pre-flight risk assessment per mission",
                    "Liability insurance coverage on every operation",
                    "Waiver pathway for BVLOS & night operations",
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm items-start">
                      <span className="flex-none" style={{ color: "var(--telemetry)" }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ WORKFLOW ═══ */}
        <section className="py-24" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <div className="max-w-[1200px] mx-auto px-6">
            <SectionHead anno="Mission Workflow" title="From request to delivered data." />
            <div className="relative mt-12">
              <div className="hidden md:block absolute top-[22px] left-0 right-0 h-px" style={{ background: "repeating-linear-gradient(90deg,var(--line) 0 8px,transparent 8px 16px)" }} />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-5 relative">
                {[
                  ["01", "Mission Request", "Submit scope, location, and timeline through intake."],
                  ["02", "Airspace & Risk", "Authorization, airspace class, and site risk confirmed."],
                  ["03", "Flight Ops", "Mission executed with documented flight logs."],
                  ["04", "Processing", "Raw capture turned into mapped, analyzed deliverables."],
                  ["05", "Delivery", "Final assets & compliance docs handed to your team."],
                ].map(([n, t, d]) => (
                  <div key={n}>
                    <div className="w-11 h-11 rounded-[11px] grid place-items-center font-mono-ibm font-semibold relative z-10" style={{ border: "1px solid var(--line)", background: "var(--surface)", color: "var(--signal)" }}>
                      {n}
                    </div>
                    <h4 className="font-saira font-semibold text-[15px] mt-4">{t}</h4>
                    <p className="text-[13px] mt-1.5" style={{ color: "var(--ink-dim)" }}>{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="rounded-[18px] p-10 md:p-14 flex flex-col md:flex-row justify-between items-start md:items-center gap-8" style={{
              border: "1px solid var(--line)",
              background: "radial-gradient(90% 130% at 85% 10%, rgba(255,138,61,.13), transparent 55%), var(--raised)",
            }}>
              <div>
                <span className="font-mono-ibm text-xs tracking-[.18em] uppercase inline-flex items-center gap-2.5" style={{ color: "var(--signal)" }}>
                  <span className="w-[7px] h-[7px] border-[1.5px] rotate-45 inline-block" style={{ borderColor: "var(--signal)" }} />
                  Request a Mission
                </span>
                <h2 className="font-saira font-bold mt-3.5 leading-tight" style={{ fontSize: "clamp(26px,3vw,36px)", maxWidth: "16ch" }}>
                  Tell us the asset. We&apos;ll handle the airspace.
                </h2>
                <p className="mt-2.5 max-w-[42ch]" style={{ color: "var(--ink-dim)" }}>
                  Send scope, location, and timeline. You&apos;ll get back capability, compliance status, and scheduling — fast.
                </p>
              </div>
              <Link href="/request-mission" className="font-saira font-semibold text-[16px] tracking-wide px-7 py-4 rounded-[10px] inline-flex items-center gap-2 flex-none transition-transform hover:-translate-y-0.5" style={{ background: "var(--signal)", color: "var(--ground)" }}>
                Start a Mission Request <span className="text-[17px]">→</span>
              </Link>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}

/* ── Reusable components ── */

function SectionHead({ anno, title, lead }: { anno: string; title: string; lead?: string }) {
  return (
    <div style={{ maxWidth: 620 }}>
      <span className="font-mono-ibm text-xs tracking-[.18em] uppercase inline-flex items-center gap-2.5" style={{ color: "var(--signal)" }}>
        <span className="w-[7px] h-[7px] border-[1.5px] rotate-45 inline-block" style={{ borderColor: "var(--signal)" }} />
        {anno}
      </span>
      <h2 className="font-saira font-bold mt-3.5 leading-tight" style={{ fontSize: "clamp(28px,3.2vw,40px)" }}>{title}</h2>
      {lead && <p className="mt-4 text-[17px]" style={{ color: "var(--ink-dim)" }}>{lead}</p>}
    </div>
  );
}

function Card({ icon, title, desc, image }: { icon: string; title: string; desc: string; image?: string }) {
  return (
    <div className="rounded-[14px] overflow-hidden transition-all hover:-translate-y-0.5" style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
      {image && (
        <div className="relative h-36 w-full">
          <img src={image} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,14,20,.15) 0%, var(--surface) 96%)" }} />
        </div>
      )}
      <div className="p-6">
        <div className="w-10 h-10 rounded-[10px] grid place-items-center text-[19px]" style={{ background: "rgba(255,138,61,.1)", color: "var(--signal)", border: "1px solid rgba(255,138,61,.22)" }}>
          {icon}
        </div>
        <h3 className="font-saira font-semibold text-[18px] mt-4">{title}</h3>
        <p className="text-sm mt-2" style={{ color: "var(--ink-dim)" }}>{desc}</p>
      </div>
    </div>
  );
}
