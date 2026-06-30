import { Target, Eye, ShieldCheck, Users } from "lucide-react";

const values = [
  { icon: ShieldCheck, title: "Safety First", desc: "Every mission begins with a documented risk assessment and airspace review." },
  { icon: Target, title: "Precision Data", desc: "We deliver data built for engineering and analytical decision-making, not just imagery." },
  { icon: Eye, title: "Transparent Operations", desc: "Clients receive full visibility into flight plans, status, and documentation." },
  { icon: Users, title: "Partnership Approach", desc: "We operate as an extension of your team, not a one-off vendor." },
];

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">About Us</p>
          <h1 className="heading-xl max-w-3xl">
            Commercial drone operations built on engineering discipline.
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            Drone Operation Management was founded to bring enterprise-grade process, safety,
            and documentation to commercial drone operations — replacing ad-hoc aerial vendors
            with a structured operations partner.
          </p>
        </div>
      </section>

      <section className="section border-b border-border">
        <div className="container-app grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="heading-lg mb-5">Our Mission</h2>
            <p className="body-muted mb-4">
              We exist to make aerial data collection reliable, compliant, and useful for the
              organizations managing critical infrastructure, land, and assets. That means
              treating every flight as an operation — planned, documented, and reviewed — rather
              than a one-off photo shoot.
            </p>
            <p className="body-muted">
              Our team combines certified remote pilots, GIS analysts, and operations managers to
              deliver missions that meet the standards of engineering, compliance, and executive
              stakeholders alike.
            </p>
          </div>
          <div>
            <h2 className="heading-lg mb-5">How We Operate</h2>
            <p className="body-muted mb-4">
              Every engagement follows a standardized mission lifecycle: intake and scoping,
              airspace and risk review, certified flight execution, data processing, and
              documented delivery. Nothing is informal.
            </p>
            <p className="body-muted">
              This consistency is what allows us to support recurring programs across multiple
              sites and states without sacrificing quality or compliance.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-app">
          <h2 className="heading-lg mb-12">What we stand for</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <div key={v.title} className="card p-6">
                <v.icon className="mb-4 h-7 w-7 text-accent" />
                <h3 className="mb-2 text-base font-semibold text-white">{v.title}</h3>
                <p className="text-sm text-slate-400">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
