import MissionRequestForm from "@/components/MissionRequestForm";
import { ShieldCheck, Clock, FileCheck } from "lucide-react";

export default function RequestMissionPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Request a Mission</p>
          <h1 className="heading-xl max-w-3xl">
            Start your aerial operations mission.
          </h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">
            Tell us about your project. Our operations team will review airspace, compliance,
            and scope, then respond within one business day.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-app grid gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MissionRequestForm />
          </div>

          <aside className="space-y-6">
            <div className="card p-6">
              <Clock className="mb-3 h-6 w-6 text-accent" />
              <h3 className="mb-1 text-sm font-semibold text-white">Response Time</h3>
              <p className="text-sm text-slate-400">
                Our team responds to all mission requests within one business day.
              </p>
            </div>
            <div className="card p-6">
              <ShieldCheck className="mb-3 h-6 w-6 text-accent" />
              <h3 className="mb-1 text-sm font-semibold text-white">FAA Compliant</h3>
              <p className="text-sm text-slate-400">
                Every mission is flown under Part 107 with full airspace authorization.
              </p>
            </div>
            <div className="card p-6">
              <FileCheck className="mb-3 h-6 w-6 text-accent" />
              <h3 className="mb-1 text-sm font-semibold text-white">Documented Delivery</h3>
              <p className="text-sm text-slate-400">
                Receive flight logs, compliance records, and processed deliverables with every job.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
