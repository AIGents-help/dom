import { CheckCircle2, FileBadge, ShieldCheck, Radio, AlertTriangle } from "lucide-react";

const standards = [
  {
    icon: FileBadge,
    title: "Part 107 Certified Pilots",
    desc: "Every mission is flown by a Remote Pilot in Command holding a current FAA Part 107 Remote Pilot Certificate.",
  },
  {
    icon: Radio,
    title: "LAANC Airspace Authorization",
    desc: "Flights in controlled airspace are authorized in advance through the Low Altitude Authorization and Notification Capability (LAANC) system.",
  },
  {
    icon: ShieldCheck,
    title: "Registered & Insured Aircraft",
    desc: "All unmanned aircraft are FAA-registered, maintained per manufacturer specifications, and covered under commercial liability insurance.",
  },
  {
    icon: CheckCircle2,
    title: "Pre-Flight Risk Assessments",
    desc: "Every mission includes a documented site survey, hazard assessment, and flight plan review prior to launch.",
  },
];

const waivers = [
  "Beyond Visual Line of Sight (BVLOS) — 14 CFR 107.31",
  "Operations Over People — 14 CFR 107.39",
  "Night Operations — 14 CFR 107.29",
  "Operations in Controlled Airspace — 14 CFR 107.41",
];

export default function FaaCompliancePage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">FAA Compliance</p>
          <h1 className="heading-xl max-w-3xl">
            Operating fully within FAA Part 107 regulations.
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            Compliance isn't an afterthought — it's built into every step of our mission
            lifecycle, from airspace authorization to flight documentation.
          </p>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app">
          <h2 className="heading-lg mb-12">Our compliance standards</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {standards.map((s) => (
              <div key={s.title} className="card p-8">
                <s.icon className="mb-4 h-7 w-7 text-accent" />
                <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
                <p className="body-muted">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section border-b border-border bg-surface/30">
        <div className="container-app grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="heading-lg mb-5">Waiver-supported operations</h2>
            <p className="body-muted mb-6">
              For missions requiring expanded operational parameters, we support FAA waiver
              applications and operate under existing waiver authorizations where applicable,
              including:
            </p>
            <ul className="space-y-3">
              {waivers.map((w) => (
                <li key={w} className="flex gap-3 text-sm text-slate-300">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-accent" /> {w}
                </li>
              ))}
            </ul>
          </div>
          <div className="card flex flex-col gap-4 p-8">
            <AlertTriangle className="h-7 w-7 text-accent" />
            <h3 className="text-lg font-semibold text-white">Documentation on every mission</h3>
            <p className="body-muted">
              Clients receive a compliance package with each completed mission, including flight
              logs, airspace authorization records, pilot certification confirmation, and
              insurance documentation — ready for audit, procurement, or internal risk review.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-app">
          <div className="card p-10 lg:p-12">
            <h2 className="heading-lg mb-4">A note on regulatory accuracy</h2>
            <p className="body-muted">
              FAA regulations governing small unmanned aircraft systems are subject to change.
              Drone Operation Management maintains current certifications and monitors regulatory
              updates from the FAA to ensure every operation remains compliant. For the most
              current regulatory text, refer to{" "}
              <span className="text-accent">14 CFR Part 107</span> on the FAA's official website.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
