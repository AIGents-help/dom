import { Suspense } from "react";
import Link from "next/link";
import LeadsWorkspace from "@/components/LeadsWorkspace";

export const metadata = {
  title: "CRM Files | Drone Operation Management",
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
          <h1 className="heading-lg">CRM Files</h1>
          <p className="body-muted mt-2">
            One customer file from first prospect contact through active client work, with documents, history, notes, and outreach in one place.
          </p>
        </div>
        <Suspense fallback={<p className="text-slate-400">Loading leads…</p>}>
          <LeadsWorkspace />
        </Suspense>
      </div>
    </section>
  );
}
