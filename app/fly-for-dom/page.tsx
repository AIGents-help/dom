import { ShieldCheck, Wallet, Radar, FileCheck, Compass, Users, CreditCard, LayoutDashboard } from "lucide-react";
import FlyForDomApplyForm from "@/components/FlyForDomApplyForm";

export const metadata = {
  title: "Fly for DOM | Drone Operation Management",
  description: "Commercial drone missions for Part 107 pilots — DOM brings the clients, airspace prep, and payment collection. You bring the aircraft and the discipline to fly to spec.",
};

const steps = [
  { n: "01", title: "Apply & verify", desc: "Submit your Part 107 certificate, insurance, and equipment. DOM verifies your credentials before any paid assignment." },
  { n: "02", title: "Get matched or self-serve", desc: "DOM offers you missions sourced and quoted for your service area — or, once approved, build and price your own missions directly in your portal." },
  { n: "03", title: "Fly to a documented standard", desc: "Every mission type has a reference SOP — equipment checklist, preflight/airspace review, flight ops, deliverable spec — so you know exactly what's expected before you launch." },
  { n: "04", title: "Get paid automatically", desc: "Upload your deliverable, it clears QC, and payout hits your account via Stripe. No chasing invoices." },
];

const brings = [
  { icon: Users, title: "Client sourcing", desc: "DOM finds and qualifies the clients — you don't spend time on sales." },
  { icon: Compass, title: "Airspace & LAANC prep", desc: "Airspace class, authorization requirements, and risk review handled before you're offered the mission." },
  { icon: CreditCard, title: "Quoting & payment collection", desc: "DOM prices the mission and collects payment from the client up front — you never chase an invoice." },
  { icon: FileCheck, title: "SOPs & document templates", desc: "Reference checklists per mission type, plus ready-to-use waivers, release forms, and service agreements." },
  { icon: LayoutDashboard, title: "A real mission portal", desc: "Track assignments, upload deliverables and mission docs, and see your payout history in one dashboard." },
  { icon: ShieldCheck, title: "Credential tracking", desc: "DOM tracks your Part 107 and insurance expiration and reminds you before they lapse." },
];

export default function FlyForDomPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">◆ Fly for DOM</p>
          <h1 className="heading-xl max-w-3xl">
            Get paid to fly missions to a standard.
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            DOM brings the clients, the airspace prep, and the documentation system. You bring a
            Part 107 certificate, your aircraft, and the discipline to fly to spec.
          </p>
          <div className="mt-8 flex flex-wrap gap-3.5">
            <a href="#apply" className="btn-primary">
              Apply now →
            </a>
            <a
              href="#how-it-works"
              className="rounded-lg border border-border px-6 py-3 text-sm font-semibold text-white transition hover:border-accent/60"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section border-b border-border">
        <div className="container-app">
          <h2 className="heading-lg mb-12">How it works</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="card p-6">
                <p className="mb-3 font-mono text-xs tracking-[.14em] text-accent">{s.n}</p>
                <h3 className="mb-2 text-base font-semibold text-white">{s.title}</h3>
                <p className="text-sm text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app grid gap-12 lg:grid-cols-2">
          <div className="card p-8">
            <Wallet className="mb-4 h-7 w-7 text-accent" />
            <h2 className="heading-lg mb-3">What you keep</h2>
            <div className="mt-6 space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Standard</p>
                <p className="mt-1 text-2xl font-bold text-white">80% of every mission</p>
                <p className="mt-1 text-sm text-slate-400">
                  DOM sources the client, quotes the job, and collects payment — you fly and keep 80%.
                </p>
              </div>
              <div className="border-t border-border pt-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">Self-service subscribers</p>
                <p className="mt-1 text-2xl font-bold text-white">100% on missions you create</p>
                <p className="mt-1 text-sm text-slate-400">
                  Once approved for self-service, subscribe for $99/mo to waive DOM's commission entirely
                  on missions you build and price yourself in your own portal.
                </p>
              </div>
            </div>
          </div>
          <div className="card p-8">
            <Radar className="mb-4 h-7 w-7 text-accent" />
            <h2 className="heading-lg mb-3">What DOM brings</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {brings.map((b) => (
                <div key={b.title}>
                  <b.icon className="mb-2 h-5 w-5 text-accent" />
                  <h3 className="mb-1 text-sm font-semibold text-white">{b.title}</h3>
                  <p className="text-xs text-slate-400">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app">
          <h2 className="heading-lg mb-8">What you need</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="card p-6">
              <h3 className="mb-2 text-base font-semibold text-white">FAA Part 107 certificate</h3>
              <p className="text-sm text-slate-400">Current and in good standing — DOM verifies this before any paid assignment.</p>
            </div>
            <div className="card p-6">
              <h3 className="mb-2 text-base font-semibold text-white">Active drone insurance</h3>
              <p className="text-sm text-slate-400">Liability coverage on your aircraft and operations.</p>
            </div>
            <div className="card p-6">
              <h3 className="mb-2 text-base font-semibold text-white">Your own aircraft & sensors</h3>
              <p className="text-sm text-slate-400">Whatever's appropriate for the missions in your service area — visual, thermal, mapping, etc.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="apply" className="section">
        <div className="container-app">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="heading-lg mb-3">Ready to fly?</h2>
            <p className="body-muted">
              Apply below, set up payouts, and DOM will be in touch to verify your credentials.
            </p>
          </div>
          <FlyForDomApplyForm />
        </div>
      </section>
    </>
  );
}
