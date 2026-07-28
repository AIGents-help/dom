import { Suspense } from "react";
import Link from "next/link";
import LeadsWorkspace from "@/components/LeadsWorkspace";

export const metadata = {
  title: "Leads | Drone Operation Management",
};

export default function AdminLeadsPage() {
  return (
    <section className="section">
      <div className="container-app">
        <div className="mb-10">
          <Link href="/admin/dashboard" className="mb-4 inline-block text-xs font-semibold uppercase tracking-wide text-accent hover:underline">
            ← Back to Dashboard
          </Link>
          <p className="eyebrow mb-2">Operations Console</p>
          <h1 className="heading-lg">Leads</h1>
          <p className="body-muted mt-2">
            Full prospect management — categorize by tier and vertical, track contact history, log notes, and follow the Smartlead outreach trail, all in one place.
          </p>
        </div>
        <Suspense fallback={<p className="text-slate-400">Loading leads…</p>}>
          <LeadsWorkspace />
        </Suspense>
      </div>
    </section>
  );
}
