import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Cloud,
  Cpu,
  FileCheck2,
  MapPinned,
  Plane,
  Radar,
  ShieldCheck,
  Users,
  Waypoints,
} from "lucide-react";

export const metadata: Metadata = {
  title: "License DOMINIC | Intelligent Drone Operations Software",
  description:
    "License DOMINIC for mission planning, pilot workflows, capture guidance, mapping, 3D reconstruction, documentation, compliance, and drone program operations.",
  alternates: { canonical: "/dominic/licensing" },
  openGraph: {
    title: "License DOMINIC",
    description:
      "Put DOMINIC behind your drone operation. Mission planning, capture guidance, mapping, workflow, compliance, and delivery in one intelligent platform.",
    url: "https://droneopsman.com/dominic/licensing",
    siteName: "Drone Operation Management",
    type: "website",
  },
};

const capabilities = [
  {
    icon: Waypoints,
    title: "Capture Planner",
    copy: "Guided capture paths for object scans, roofs, buildings, facades, interiors, stockpiles, and corridors.",
  },
  {
    icon: MapPinned,
    title: "Mapping + 3D",
    copy: "Manage imagery, orthomosaics, point clouds, 3D reconstruction, and project processing from one workspace.",
  },
  {
    icon: Plane,
    title: "Mission Operations",
    copy: "Plan, schedule, assign, fly, document, and complete missions with a consistent operational record.",
  },
  {
    icon: FileCheck2,
    title: "Pilot Workflow",
    copy: "Standardize before-flight, during-flight, post-flight, approvals, uploads, and deliverables without slowing pilots down.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance + Safety",
    copy: "Keep mission documentation, pilot requirements, insurance, aircraft, safety items, and audit history together.",
  },
  {
    icon: Cpu,
    title: "Built for What Comes Next",
    copy: "Use the same planning engine as the foundation for autonomous flight, sensors, live operations, and advanced integrations.",
  },
];

const audiences = [
  "Independent drone pilots",
  "Drone service companies",
  "Inspection contractors",
  "Construction and engineering teams",
  "Municipalities and public safety",
  "Industrial and enterprise drone programs",
];

const licenseCards = [
  {
    kicker: "SOLO / SMALL TEAM",
    title: "Operator License",
    copy: "For pilots and small drone businesses that want a professional operating system behind every mission.",
    items: [
      "Mission and project workflow",
      "Capture planning tools",
      "Mapping project management",
      "Deliverables and documentation",
    ],
    cta: "Request Operator Pricing",
  },
  {
    kicker: "GROWING OPERATION",
    title: "Team License",
    copy: "For service providers and inspection teams coordinating multiple pilots, projects, aircraft, and clients.",
    items: [
      "Multi-pilot operations",
      "Roles and assignment workflows",
      "Standardized field processes",
      "Centralized operational visibility",
    ],
    cta: "Request Team Pricing",
    featured: true,
  },
  {
    kicker: "PUBLIC / INDUSTRIAL / ENTERPRISE",
    title: "Organization License",
    copy: "For larger programs that need controlled access, deployment planning, configurable workflows, and implementation support.",
    items: [
      "Organization-wide deployment",
      "Configurable operational workflows",
      "Advanced operations roadmap",
      "Onboarding and implementation scope",
    ],
    cta: "Discuss Your Program",
  },
];

const faqs = [
  [
    "What does a DOMINIC license include?",
    "Licensing can be scoped for a single operator, a growing team, or a larger organization. Users, modules, onboarding, support, and deployment requirements are defined in your license proposal.",
  ],
  [
    "Does DOMINIC only work with DJI?",
    "DOMINIC is being designed around drone-agnostic operational workflows wherever possible so teams can standardize planning and documentation across different aircraft and interfaces.",
  ],
  [
    "Is DOMINIC only for mapping?",
    "No. DOMINIC supports broader drone operations including inspections, object capture, roofs, facades, stockpiles, corridors, industrial work, public safety, mapping, reconstruction, and repeatable operational missions.",
  ],
  [
    "Can we use DOMINIC inside our own company?",
    "Yes. DOMINIC licensing is intended for operators and organizations that want it to become the software layer behind their own drone program.",
  ],
];

export default function DominicLicensingPage() {
  return (
    <div className="bg-[#080c10] text-white">
      <section className="relative overflow-hidden border-b border-[#f45a1e]/35">
        <div className="absolute inset-0 opacity-[.22] [background-image:linear-gradient(rgba(244,90,30,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(244,90,30,.13)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="absolute right-[-120px] top-[-80px] h-[460px] w-[460px] rounded-full bg-[#f45a1e]/15 blur-[120px]" />

        <div className="relative mx-auto grid max-w-[1536px] gap-10 px-6 py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:py-28">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.22em] text-[#F45A1E]">
              DOMINIC Software Licensing
            </p>
            <h1 className="mt-4 max-w-[850px] text-5xl font-black leading-[.96] tracking-[-.055em] sm:text-6xl lg:text-7xl">
              Put <span className="text-[#F45A1E]">DOMINIC</span> behind your entire drone operation.
            </h1>
            <p className="mt-6 max-w-[780px] text-base leading-7 text-white/70 sm:text-lg">
              One intelligent platform for mission planning, pilot workflows, capture guidance,
              mapping, 3D reconstruction, compliance, documentation, and client delivery.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#licensing"
                className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-6 py-3 text-sm font-black text-black transition hover:bg-[#ff7338]"
              >
                Request Licensing Details <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/dominic"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-6 py-3 text-sm font-black text-white transition hover:border-[#F45A1E]"
              >
                Explore DOMINIC
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-white/60">
              {["Built for real drone operations", "Scales from pilot to enterprise", "Multiple mission types"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#F45A1E]" /> {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-[#0c1219]/95 p-3 shadow-2xl shadow-black/40">
            <div className="rounded-xl border border-white/10 bg-[#111923] p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="text-[11px] font-black tracking-[.14em] text-[#F45A1E]">DOMINIC OPERATIONS</div>
                <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[9px] font-black tracking-[.1em] text-emerald-300">
                  MISSION READY
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["Active Missions", "12"],
                  ["Pilots", "07"],
                  ["Aircraft", "09"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[9px] font-bold text-white/45">{label}</div>
                    <div className="mt-1 text-2xl font-black">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 p-4">
                <div>
                  <div className="text-[9px] font-black tracking-[.14em] text-[#F45A1E]">OBJECT SCAN</div>
                  <div className="mt-1 text-sm font-black">Industrial Asset Reconstruction</div>
                  <div className="mt-1 text-[10px] text-white/45">3-ring guided capture · overlap tracking · coverage review</div>
                </div>
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-4 border-[#F45A1E] text-[10px] font-black">
                  82%
                </div>
              </div>

              <div className="mt-3 grid grid-cols-5 gap-1">
                {["Plan", "Preflight", "Capture", "Process", "Deliver"].map((step, index) => (
                  <div
                    key={step}
                    className={`rounded-md border px-2 py-2 text-center text-[8px] font-black ${
                      index === 2
                        ? "border-[#F45A1E] bg-[#F45A1E]/10 text-[#F45A1E]"
                        : "border-white/10 bg-white/[.03] text-white/55"
                    }`}
                  >
                    {index < 2 ? "✓ " : ""}{step}
                  </div>
                ))}
              </div>

              <div className="relative mt-3 h-[220px] overflow-hidden rounded-lg border border-white/10 bg-[#0a1016]">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:28px_28px]" />
                <div className="absolute left-[18%] top-[22%] h-[54%] w-[64%] rounded-[50%] border border-dashed border-[#F45A1E]/65" />
                <div className="absolute left-[25%] top-[31%] h-[38%] w-[50%] rounded-[50%] border border-dashed border-[#F45A1E]/65" />
                <div className="absolute left-[34%] top-[40%] h-[20%] w-[32%] rounded-[50%] border border-dashed border-[#F45A1E]/65" />
                <Radar className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white" />
                <div className="absolute bottom-3 left-3 text-[8px] font-black tracking-[.14em] text-[#F45A1E]">
                  CAPTURE PATH OPTIMIZED
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#F45A1E] px-6 py-5 text-center text-sm font-black text-black sm:text-base">
        Stop stitching together forms, spreadsheets, cloud folders, flight notes, mapping tools, and client messages just to run one drone operation.
      </section>

      <section className="mx-auto max-w-[1536px] px-6 py-20 lg:px-10 lg:py-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[.22em] text-[#F45A1E]">The Software Layer for Drone Operations</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">From mission request to final deliverable.</h2>
          <p className="mt-5 text-base leading-7 text-white/60">
            DOMINIC is being built to make professional drone work more repeatable, visible,
            and intelligent without forcing pilots into a rigid workflow.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, copy }, index) => (
            <div key={title} className="rounded-xl border border-white/10 bg-[#0d131a] p-6">
              <div className="flex items-center justify-between">
                <Icon className="h-7 w-7 text-[#F45A1E]" />
                <span className="text-[10px] font-black tracking-[.16em] text-white/25">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-8 text-xl font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/55">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0b1016] px-6 py-20 lg:px-10">
        <div className="mx-auto grid max-w-[1536px] gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[.22em] text-[#F45A1E]">Who DOMINIC Is For</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">License it for one pilot. Build on it for an entire operation.</h2>
            <p className="mt-5 text-base leading-7 text-white/60">
              DOMINIC can become the operating system behind how your organization plans,
              flies, documents, processes, and delivers drone work.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {audiences.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm font-black">
                <Check className="h-4 w-4 shrink-0 text-[#F45A1E]" /> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="licensing" className="mx-auto max-w-[1536px] scroll-mt-28 px-6 py-20 lg:px-10 lg:py-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[.22em] text-[#F45A1E]">Licensing Paths</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Start with the operation you have now.</h2>
          <p className="mt-5 text-base leading-7 text-white/60">
            Pricing can be structured around users, teams, modules, operational scope, onboarding,
            and deployment requirements.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {licenseCards.map((card) => (
            <div
              key={card.title}
              className={`relative rounded-2xl border p-7 ${
                card.featured
                  ? "border-[#F45A1E] bg-[#111923] shadow-2xl shadow-[#F45A1E]/10"
                  : "border-white/10 bg-[#0d131a]"
              }`}
            >
              {card.featured && (
                <div className="absolute right-4 top-4 rounded-full bg-[#F45A1E] px-3 py-1 text-[8px] font-black tracking-[.1em] text-black">
                  MOST FLEXIBLE
                </div>
              )}
              <p className="text-[10px] font-black tracking-[.14em] text-[#F45A1E]">{card.kicker}</p>
              <h3 className="mt-2 text-2xl font-black">{card.title}</h3>
              <p className="mt-4 min-h-[96px] text-sm leading-6 text-white/55">{card.copy}</p>

              <div className="mt-5 space-y-0">
                {card.items.map((item) => (
                  <div key={item} className="flex items-center gap-3 border-t border-white/10 py-3 text-sm font-bold text-white/75">
                    <Check className="h-4 w-4 text-[#F45A1E]" /> {item}
                  </div>
                ))}
              </div>

              <a
                href="mailto:info@droneopsman.com?subject=DOMINIC%20Software%20Licensing"
                className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#F45A1E]"
              >
                {card.cta} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mb-20 grid max-w-[1450px] gap-8 rounded-2xl bg-gradient-to-r from-[#F45A1E] to-[#d9480f] px-7 py-10 text-black lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-black/60">See the Difference</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">You do not need another drone app.</h2>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-black/70">
            You need a system that helps your operation know what happens next, keeps the mission
            record together, and gives every pilot a clearer path from planning to delivery.
          </p>
        </div>
        <Link
          href="/dominic"
          target="_blank"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-6 py-3 text-sm font-black text-white"
        >
          See DOMINIC <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section className="mx-auto max-w-[1536px] px-6 pb-20 lg:px-10 lg:pb-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[.22em] text-[#F45A1E]">Common Questions</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Before you license DOMINIC.</h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {faqs.map(([question, answer]) => (
            <div key={question} className="rounded-xl border border-white/10 bg-[#0d131a] p-6">
              <h3 className="text-lg font-black">{question}</h3>
              <p className="mt-3 text-sm leading-6 text-white/55">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(244,90,30,.18),transparent_35%)] px-6 py-24 text-center lg:px-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-[11px] font-black uppercase tracking-[.22em] text-[#F45A1E]">DOMINIC Software Licensing</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-5xl lg:text-6xl">
            Tell us what you fly. We&apos;ll show you how DOMINIC can run it.
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-white/60">
            Request a licensing conversation for your pilot operation, service company, municipality,
            public safety program, or enterprise drone team.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:info@droneopsman.com?subject=DOMINIC%20Software%20Licensing"
              className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-6 py-3 text-sm font-black text-black transition hover:bg-[#ff7338]"
            >
              Request Licensing Details <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/dominic"
              target="_blank"
              className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-6 py-3 text-sm font-black text-white"
            >
              Open DOMINIC
            </Link>
          </div>
          <p className="mt-5 text-[11px] text-white/35">Licensing scope and pricing are based on your operation.</p>
        </div>
      </section>
    </div>
  );
}
