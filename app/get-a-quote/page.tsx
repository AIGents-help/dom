import PublicQuoteWizard from "@/components/PublicQuoteWizard";
import { ShieldCheck, Clock, FileCheck } from "lucide-react";

export default function GetAQuotePage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Get a Quote</p>
          <h1 className="heading-xl max-w-3xl">
            Instant airspace check + pricing for your mission.
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            Enter your site address and scope to get automated airspace classification and
            a real quote in seconds. Prefer to just tell us about your project instead?{" "}
            <a href="/request-mission" className="text-accent hover:underline">
              Request a mission
            </a>
            .
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app grid gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PublicQuoteWizard />
          </div>

          <aside className="space-y-6">
            <div className="card p-6">
              <ShieldCheck className="mb-3 h-6 w-6 text-accent" />
              <h3 className="mb-1 text-sm font-semibold text-white">Real Airspace Data</h3>
              <p className="text-sm text-slate-400">
                Every quote starts with an automatic FAA airspace classification for your
                exact site.
              </p>
            </div>
            <div className="card p-6">
              <Clock className="mb-3 h-6 w-6 text-accent" />
              <h3 className="mb-1 text-sm font-semibold text-white">Instant Estimate</h3>
              <p className="text-sm text-slate-400">
                See pricing immediately based on scope, complexity, and timeline — no waiting
                for a callback.
              </p>
            </div>
            <div className="card p-6">
              <FileCheck className="mb-3 h-6 w-6 text-accent" />
              <h3 className="mb-1 text-sm font-semibold text-white">Confirmed by Ops</h3>
              <p className="text-sm text-slate-400">
                Our operations team reviews every request and follows up within one business
                day before scheduling.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
