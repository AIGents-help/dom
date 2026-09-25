import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  Crosshair,
  Cuboid,
  FileCheck2,
  MapPinned,
  Plane,
  ShieldCheck,
  Sparkles,
  Users,
  Waypoints,
} from "lucide-react";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicMascotImage from "@/components/dominic/DominicMascotImage";

export const metadata: Metadata = {
  title: "DOMINIC Software | Free Drone Operations Platform + Licensing",
  description:
    "Start with DOMINIC free, then scale into professional drone operations, mapping, capture planning, team workflows, compliance, and enterprise licensing.",
  alternates: { canonical: "/dominic/licensing" },
  openGraph: {
    title: "DOMINIC | Intelligent Drone Operations Software",
    description:
      "Create a free DOMINIC profile and start planning smarter missions. Upgrade when your operation needs mapping, advanced workflows, team collaboration, and enterprise deployment.",
    url: "https://droneopsman.com/dominic/licensing",
    siteName: "Drone Operation Management",
    type: "website",
  },
};

const capabilities = [
  {
    icon: Waypoints,
    title: "Mission Planning",
    copy: "Build repeatable mission plans with smarter operational structure before the aircraft ever leaves the ground.",
  },
  {
    icon: Crosshair,
    title: "Capture Planner",
    copy: "Guided manual capture paths for objects, roofs, buildings, facades, interiors, stockpiles, and corridors.",
  },
  {
    icon: Cuboid,
    title: "Mapping + 3D",
    copy: "Turn field imagery into orthomosaics, measurements, point clouds, 3D reconstruction, and professional outputs.",
  },
  {
    icon: Plane,
    title: "Pilot Workflow",
    copy: "Standardize preflight, flight, post-flight, project records, approvals, and delivery without slowing the pilot down.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance + Safety",
    copy: "Keep mission documentation, aircraft, pilot requirements, insurance, safety items, and audit history together.",
  },
  {
    icon: BarChart3,
    title: "Built to Scale",
    copy: "Start as one pilot and grow into a multi-pilot, municipal, industrial, public-safety, or enterprise drone program.",
  },
];

const audiences = [
  ["Independent Pilots", "Start free and build a professional operating system around your own missions."],
  ["Drone Service Companies", "Coordinate pilots, projects, repeatable workflows, and client delivery."],
  ["Public Safety", "Build structured mission planning and operational readiness around response use cases."],
  ["Municipalities", "Support inspections, documentation, emergency response, and recurring municipal operations."],
  ["Industrial Teams", "Standardize complex inspection and capture workflows across sites and crews."],
  ["Enterprise Programs", "Deploy DOMINIC as the software layer behind a larger drone operation."],
];

const plans = [
  {
    kicker: "FREE FOREVER",
    title: "DOMINIC Free",
    price: "$0",
    suffix: "/ month",
    copy: "Create your DOMINIC profile and start using the core planning experience with no credit card.",
    items: [
      "Free DOMINIC profile",
      "DOMINIC Home workspace",
      "Manual Capture Planner",
      "Basic mission planning",
      "Preview next-generation modules",
    ],
    cta: "Create Free Profile",
    href: "/dominic/signup",
  },
  {
    kicker: "SOLO / PROFESSIONAL",
    title: "Operator License",
    price: "Upgrade",
    suffix: "when ready",
    copy: "For independent pilots and small operators who need persistent projects, processing, mapping, and professional deliverables.",
    items: [
      "Everything in Free",
      "Persistent DOMINIC projects",
      "Mapping + processing workflows",
      "3D + point-cloud tools",
      "Deliverables and project history",
    ],
    cta: "Request Operator Pricing",
    href: "mailto:info@droneopsman.com?subject=DOMINIC%20Operator%20License",
  },
  {
    kicker: "GROWING OPERATION",
    title: "Team License",
    price: "Team",
    suffix: "licensing",
    copy: "For drone service companies and inspection teams coordinating multiple people, projects, aircraft, and customers.",
    items: [
      "Everything in Operator",
      "Multi-user operations",
      "Shared project workflows",
      "Team roles and coordination",
      "Centralized operational visibility",
    ],
    cta: "Request Team Pricing",
    href: "mailto:info@droneopsman.com?subject=DOMINIC%20Team%20License",
    featured: true,
  },
  {
    kicker: "PUBLIC / INDUSTRIAL / ENTERPRISE",
    title: "Organization License",
    price: "Custom",
    suffix: "deployment",
    copy: "For municipalities, public safety, industrial programs, and enterprise teams that need controlled deployment and tailored workflows.",
    items: [
      "Organization-wide deployment",
      "Configurable workflows",
      "Advanced permissions and rollout",
      "Integration planning",
      "Implementation and onboarding scope",
    ],
    cta: "Discuss Your Program",
    href: "mailto:info@droneopsman.com?subject=DOMINIC%20Organization%20License",
  },
];

const faqs = [
  [
    "Is DOMINIC really free to start?",
    "Yes. DOMINIC Free is intended to be a permanent entry tier. Create a profile and use the basic DOMINIC planning experience without a paid license.",
  ],
  [
    "Do I need to be a DOM pilot to use DOMINIC?",
    "No. DOMINIC is being separated from DOM pilot eligibility so software users can create a DOMINIC account without becoming a contracted DOM pilot.",
  ],
  [
    "Does DOMINIC only work with DJI?",
    "No. DOMINIC is being designed around drone-agnostic operational workflows wherever possible so teams can standardize planning and documentation across different aircraft and interfaces.",
  ],
  [
    "What changes when I upgrade?",
    "Paid licensing unlocks the heavier operational layers such as persistent production projects, mapping and processing, advanced 3D workflows, deliverables, team collaboration, and organization deployment.",
  ],
];

function DominicWord() {
  return (
    <span
      aria-label="DOMINIC"
      className="inline-flex items-baseline whitespace-nowrap font-saira font-black tracking-[.015em]"
    >
      <span className="text-white">DOM</span>
      <span className="font-semibold text-[#F45A1E]">INIC</span>
    </span>
  );
}

export default function DominicLicensingPage() {
  return (
    <div className="bg-[#070b0f] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#090d11]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1536px] items-center justify-between gap-6 px-6 lg:px-10">
          <Link href="/" className="flex items-center">
            <Image src="/brand/dom-lockup-horizontal.png" alt="DOM — Drone Operation Management" width={156} height={46} priority />
          </Link>
          <nav className="hidden items-center gap-7 text-[11px] font-bold text-white/70 lg:flex">
            <a href="#platform" className="transition hover:text-white">DOMINIC</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#industries" className="transition hover:text-white">Industries</a>
            <a href="#licensing" className="border-b-2 border-[#F45A1E] pb-5 pt-5 text-white">Licensing</a>
            <a href="#faq" className="transition hover:text-white">Resources</a>
            <Link href="/about" className="transition hover:text-white">About</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dominic/signup" className="hidden rounded-md border border-white/15 px-4 py-2 text-[11px] font-black text-white sm:inline-flex">Start Free</Link>
            <a href="mailto:info@droneopsman.com?subject=DOMINIC%20Demo" className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-4 py-2 text-[11px] font-black text-black">
              Request a Demo <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <section className="relative min-h-[720px] overflow-hidden border-b border-[#F45A1E]/45">
        <Image
          src="/images/construction-aerial.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-40"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#070b0f_0%,rgba(7,11,15,.96)_35%,rgba(7,11,15,.62)_68%,rgba(7,11,15,.3)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,11,15,.1),rgba(7,11,15,.2)_55%,#070b0f_100%)]" />
        <div className="absolute inset-0 opacity-[.18] [background-image:linear-gradient(rgba(244,90,30,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,90,30,.12)_1px,transparent_1px)] [background-size:40px_40px]" />

        <div className="relative mx-auto grid min-h-[720px] max-w-[1536px] items-center gap-0 px-6 py-12 lg:grid-cols-[.82fr_1.18fr] lg:px-10">
          <div className="relative z-20 max-w-[650px]">
            <div className="mb-7">
              <DominicBrandLockup size="md" />
            </div>

            <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-white/60">
              <span className="h-[2px] w-6 bg-[#F45A1E]" />
              Plan <span className="text-[#F45A1E]">/</span> Fly <span className="text-[#F45A1E]">/</span> Process <span className="text-[#F45A1E]">/</span> Deliver
            </div>

            <h1 className="text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-6xl lg:text-[86px]">
              License
              <br />
              <DominicWord />
            </h1>

            <p className="mt-5 max-w-[650px] text-lg font-semibold leading-7 text-white/82">
              The intelligent drone operations software by Drone Operation Management.
            </p>
            <p className="mt-2 text-sm font-bold tracking-[.02em] text-white/48">
              Making your flights more intelligent.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dominic/signup"
                className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-6 py-3 text-sm font-black text-black transition hover:bg-[#ff7338]"
              >
                Start Free <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#licensing"
                className="inline-flex items-center gap-2 rounded-md border border-[#F45A1E]/70 bg-black/35 px-6 py-3 text-sm font-black text-white backdrop-blur-sm transition hover:bg-[#F45A1E]/10"
              >
                View Licensing
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[10px] font-black uppercase tracking-[.08em] text-white/60">
              {["Free to start", "Built for real operations", "Pilot to enterprise"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#F45A1E]" /> {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative z-10 hidden min-h-[650px] lg:block">
            <div className="absolute inset-x-[-2%] bottom-[-30px] top-[-5px]">
              <DominicMascotImage priority className="object-contain object-bottom drop-shadow-[0_32px_60px_rgba(0,0,0,.72)]" />
            </div>

            <div className="absolute right-[2%] top-[5%] h-[150px] w-[270px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-2xl">
              <Image src="/images/drone-operation-safety.png" alt="Professional drone operation" fill sizes="270px" className="object-cover object-center opacity-85" />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#070b0f]/40" />
            </div>

            <div className="absolute right-[2%] top-[31%] max-w-[220px] rotate-[-5deg] text-right font-saira text-2xl font-black uppercase leading-[1.05] tracking-[-.03em] text-white">
              Same skills.
              <br />
              Smarter
              <br />
              operations.
              <div className="ml-auto mt-3 h-[3px] w-28 bg-[#F45A1E]" />
            </div>

            <div className="absolute bottom-[9%] right-[1%] rounded-xl border border-white/10 bg-black/55 p-4 backdrop-blur-md">
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#F45A1E]">DOMINIC FREE</div>
              <div className="mt-1 text-sm font-black">Create a profile. Plan your first mission.</div>
              <div className="mt-1 text-[11px] text-white/55">No credit card required.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-white/10 bg-[#0b1117]">
        <div className="mx-auto grid max-w-[1536px] lg:grid-cols-[300px_1fr]">
          <div className="border-b border-white/10 p-7 lg:border-b-0 lg:border-r">
            <div className="mb-3 h-[3px] w-7 bg-[#F45A1E]" />
            <h2 className="font-saira text-3xl font-black uppercase leading-[.96]">
              A complete
              <br />
              drone operations
              <br />
              platform
            </h2>
            <p className="mt-5 text-sm leading-6 text-white/58">
              From mission planning to final delivery, DOMINIC brings intelligence, structure,
              and automation to the workflow.
            </p>
            <Link
              href="/dominic"
              target="_blank"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-5 py-3 text-xs font-black text-black"
            >
              See DOMINIC in Action <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="relative min-h-[520px] overflow-hidden p-4 sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(244,90,30,.13),transparent_34%)]" />
            <div className="relative rounded-[18px] border border-white/20 bg-[#101821] p-2 shadow-2xl shadow-black/50">
              <div className="rounded-[13px] border border-white/10 bg-[#0b1117] p-3">
                <div className="flex items-center justify-between border-b border-white/10 px-2 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="scale-[.78] origin-left">
                      <DominicBrandLockup size="sm" showTagline={false} compact />
                    </div>
                    <div className="hidden text-[9px] font-black uppercase tracking-[.12em] text-white/40 sm:block">Operations Workspace</div>
                  </div>
                  <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[8px] font-black uppercase tracking-[.1em] text-emerald-300">
                    Connected
                  </div>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-[132px_1fr_176px]">
                  <div className="space-y-1">
                    {["Dashboard", "Plan Mission", "Capture", "Process", "Map & 3D", "Deliver", "Compliance", "Team", "Assets", "Reports"].map((item, i) => (
                      <div
                        key={item}
                        className={`rounded-md px-3 py-2 text-[9px] font-bold ${
                          i === 0 ? "bg-[#F45A1E] text-black" : "bg-white/[.04] text-white/58"
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="min-w-0">
                    <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                      {[
                        ["Plan", "Mission planning"],
                        ["Fly", "Guidance"],
                        ["Process", "Data processing"],
                        ["Map & 3D", "Analyze"],
                        ["Deliver", "Share"],
                      ].map(([a, b], i) => (
                        <div key={a} className={`rounded-lg border p-3 ${i === 0 ? "border-[#F45A1E] bg-[#F45A1E]/12" : "border-white/10 bg-white/[.03]"}`}>
                          <div className="text-[10px] font-black">{a}</div>
                          <div className="mt-1 text-[8px] leading-3 text-white/42">{b}</div>
                        </div>
                      ))}
                    </div>

                    <div className="relative h-[260px] overflow-hidden rounded-xl border border-white/10">
                      <Image src="/images/construction-aerial.jpg" alt="DOMINIC mapping workspace preview" fill sizes="60vw" className="object-cover opacity-72" />
                      <div className="absolute inset-0 bg-black/25" />
                      <div className="absolute inset-[18%_15%_22%_18%] border-2 border-[#F45A1E]">
                        <span className="absolute -top-6 right-0 rounded bg-[#F45A1E] px-2 py-1 text-[8px] font-black text-black">
                          Site Area 42.6 ac
                        </span>
                      </div>
                      <div className="absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/65 px-3 py-2 text-[9px] font-bold text-white/75 backdrop-blur">
                        Mission Plan · 3D Capture · 12 Waypoints
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[.025] p-3">
                    <div className="text-[10px] font-black">Mission Details</div>
                    <div className="mt-3 space-y-3">
                      {[
                        ["Images", "342"],
                        ["GSD", "2.1 cm/pixel"],
                        ["Est. Time", "18 min"],
                        ["Battery", "2 batteries"],
                        ["Status", "Within limits"],
                      ].map(([a, b]) => (
                        <div key={a} className="flex justify-between gap-3 border-b border-white/8 pb-2 text-[9px]">
                          <span className="text-white/35">{a}</span>
                          <span className="font-bold text-white/75">{b}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-lg border border-[#F45A1E]/25 bg-[#F45A1E]/8 p-3">
                      <Sparkles className="h-4 w-4 text-[#F45A1E]" />
                      <div className="mt-2 text-[9px] font-black">Capture path optimized</div>
                      <div className="mt-1 text-[8px] leading-4 text-white/45">Coverage, overlap, distance, and safety constraints considered.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-white/10 bg-[#090e13]">
        <div className="mx-auto grid max-w-[1536px] lg:grid-cols-[260px_1fr]">
          <div className="border-b border-white/10 p-7 lg:border-b-0 lg:border-r">
            <div className="mb-3 h-[3px] w-7 bg-[#F45A1E]" />
            <h2 className="font-saira text-3xl font-black uppercase leading-[.96]">
              Powerful features.
              <br />
              Real-world results.
            </h2>
            <p className="mt-4 text-sm leading-6 text-white/50">
              Everything you need for smarter, safer, and more productive drone operations.
            </p>
          </div>

          <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="bg-[#0d1319] p-6">
                <Icon className="h-7 w-7 text-[#F45A1E]" />
                <h3 className="mt-5 font-saira text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/48">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="industries" className="border-b border-white/10 bg-[#080c10]">
        <div className="mx-auto grid max-w-[1536px] lg:grid-cols-[260px_1fr]">
          <div className="border-b border-white/10 p-7 lg:border-b-0 lg:border-r">
            <div className="mb-3 h-[3px] w-7 bg-[#F45A1E]" />
            <h2 className="font-saira text-3xl font-black uppercase leading-[.96]">
              Built for the people
              <br />
              who move the world
              <br />
              forward
            </h2>
            <p className="mt-4 text-sm leading-6 text-white/50">
              From one pilot to complex organizations.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-3">
            {audiences.map(([title, copy], index) => {
              const icons = [Plane, Users, ShieldCheck, Building2, FileCheck2, BarChart3];
              const Icon = icons[index];
              return (
                <div key={title} className="border-b border-white/10 p-6 sm:border-r">
                  <Icon className="h-6 w-6 text-[#F45A1E]" />
                  <h3 className="mt-4 font-saira text-lg font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/48">{copy}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="licensing" className="scroll-mt-24 border-b border-white/10 bg-[#0b1016]">
        <div className="mx-auto grid max-w-[1536px] lg:grid-cols-[300px_1fr]">
          <div className="border-b border-white/10 p-7 lg:border-b-0 lg:border-r">
            <div className="mb-3 h-[3px] w-7 bg-[#F45A1E]" />
            <h2 className="font-saira text-3xl font-black uppercase leading-[.96]">
              Flexible licensing
              <br />
              for every stage
              <br />
              of your operation
            </h2>
            <p className="mt-4 text-sm leading-6 text-white/50">
              Start at no cost. Upgrade only when your operation needs more.
            </p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.title}
                className={`relative flex min-h-[470px] flex-col rounded-xl border p-5 ${
                  plan.featured
                    ? "border-[#F45A1E] bg-[linear-gradient(180deg,rgba(244,90,30,.18),#111820_34%)] shadow-2xl shadow-[#F45A1E]/10"
                    : "border-white/14 bg-[#0c1218]"
                }`}
              >
                {plan.featured ? (
                  <div className="absolute inset-x-0 top-0 rounded-t-xl bg-[#F45A1E] py-1 text-center text-[8px] font-black uppercase tracking-[.12em] text-black">
                    Most Flexible
                  </div>
                ) : null}

                <div className={plan.featured ? "pt-4" : ""}>
                  <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#F45A1E]">{plan.kicker}</div>
                  <h3 className="mt-2 font-saira text-xl font-black">{plan.title}</h3>
                  <div className="mt-4 flex items-end gap-2">
                    <div className="font-saira text-3xl font-black">{plan.price}</div>
                    <div className="pb-1 text-[10px] font-bold text-white/40">{plan.suffix}</div>
                  </div>
                  <p className="mt-4 min-h-[90px] text-sm leading-6 text-white/48">{plan.copy}</p>
                </div>

                <div className="mt-5 flex-1 space-y-0">
                  {plan.items.map((item) => (
                    <div key={item} className="flex items-start gap-2 border-t border-white/10 py-3 text-xs font-bold text-white/70">
                      <Check className="mt-[1px] h-4 w-4 shrink-0 text-[#F45A1E]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                {plan.href.startsWith("/") ? (
                  <Link
                    href={plan.href}
                    className={`mt-5 inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-xs font-black ${
                      plan.featured ? "bg-[#F45A1E] text-black" : "border border-[#F45A1E]/70 text-white"
                    }`}
                  >
                    {plan.cta} <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <a
                    href={plan.href}
                    className={`mt-5 inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-xs font-black ${
                      plan.featured ? "bg-[#F45A1E] text-black" : "border border-[#F45A1E]/70 text-white"
                    }`}
                  >
                    {plan.cta} <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>


      <section className="border-b border-white/10 bg-[#f2f3f4] text-[#10151b]">
        <div className="mx-auto grid max-w-[1536px] gap-px bg-black/10 md:grid-cols-4">
          {[
            ["FREE TO START", "Create a DOMINIC profile with no credit card."],
            ["BUILT FOR FIELD WORK", "Designed around actual drone operations, not generic project management."],
            ["MULTI-MISSION", "Object scan, roofs, facades, interiors, stockpiles, corridors and more."],
            ["GROWS WITH YOU", "Move from one pilot to team and organization licensing when needed."],
          ].map(([title, copy]) => (
            <div key={title} className="bg-white px-6 py-7">
              <div className="text-[10px] font-black tracking-[.14em] text-[#F45A1E]">{title}</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-black/65">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="border-b border-white/10 bg-[#080c10] px-6 py-20 lg:px-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <div className="mb-3 h-[3px] w-7 bg-[#F45A1E]" />
              <h2 className="font-saira text-3xl font-black uppercase">Common questions</h2>
            </div>
            <Link href="/dominic/signup" className="hidden text-xs font-black text-[#F45A1E] sm:inline-flex sm:items-center sm:gap-2">
              Start Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {faqs.map(([question, answer]) => (
              <div key={question} className="rounded-lg border border-white/10 bg-[#0d1319] p-5">
                <h3 className="font-saira text-base font-black">{question}</h3>
                <p className="mt-3 text-sm leading-6 text-white/48">{answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#080c10]">
        <Image
          src="/images/city-night-aerial.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-28"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#080c10_0%,rgba(8,12,16,.78)_52%,rgba(8,12,16,.45)_100%)]" />
        <div className="relative mx-auto grid max-w-[1536px] gap-8 px-6 py-20 lg:grid-cols-[1fr_420px] lg:items-center lg:px-10">
          <div>
            <div className="mb-3 h-[3px] w-7 bg-[#F45A1E]" />
            <h2 className="max-w-[760px] font-saira text-4xl font-black uppercase leading-[.96] sm:text-5xl">
              Built for real
              <br />
              drone operations.
            </h2>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-white/58">
              <span>Mission Planning</span>
              <span className="text-[#F45A1E]">•</span>
              <span>Mapping + 3D</span>
              <span className="text-[#F45A1E]">•</span>
              <span>Workflow Automation</span>
              <span className="text-[#F45A1E]">•</span>
              <span>Compliance</span>
              <span className="text-[#F45A1E]">•</span>
              <span>Pilot to Enterprise Scalability</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/12 bg-black/55 p-7 backdrop-blur-md">
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-[#F45A1E]">Ready to use DOMINIC?</div>
            <h3 className="mt-3 font-saira text-2xl font-black">
              Start free. Upgrade when the operation demands it.
            </h3>
            <p className="mt-3 text-sm leading-6 text-white/52">
              Create your DOMINIC profile now or talk with DOM about team and organization licensing.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dominic/signup" className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-5 py-3 text-xs font-black text-black">
                Create Free Profile <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="mailto:info@droneopsman.com?subject=DOMINIC%20Software%20Licensing" className="inline-flex items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-xs font-black text-white">
                Request a Demo
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
