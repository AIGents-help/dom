"use client";

import { useState } from "react";
import {
  Users, Send, Briefcase, Calendar, FileText, StickyNote, Activity, Building2,
} from "lucide-react";

type TabKey =
  | "leads"
  | "missions"
  | "clients"
  | "jobs"
  | "schedule"
  | "deliverables"
  | "notes"
  | "status";

const tabs: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: "leads", label: "Leads", icon: Users },
  { key: "missions", label: "Mission Requests", icon: Send },
  { key: "clients", label: "Clients", icon: Building2 },
  { key: "jobs", label: "Jobs", icon: Briefcase },
  { key: "schedule", label: "Schedule", icon: Calendar },
  { key: "deliverables", label: "Deliverables", icon: FileText },
  { key: "notes", label: "Notes", icon: StickyNote },
  { key: "status", label: "Status Tracking", icon: Activity },
];

// Sample/demo data — replace with live Supabase queries in production.
const leads = [
  { name: "Marcus Webb", company: "Sunrise Solar Co.", email: "marcus@sunrisesolar.com", status: "New" },
  { name: "Elena Cruz", company: "Cruz Construction Group", email: "elena@cruzconstruction.com", status: "Contacted" },
  { name: "Devon Park", company: "GreenFields Agriculture", email: "devon@greenfields.ag", status: "Qualified" },
];

const missionRequests = [
  { name: "Sunrise Solar Co.", service: "Thermal Imaging", location: "Austin, TX", status: "Pending Review" },
  { name: "Cruz Construction Group", service: "Construction Monitoring", location: "Denver, CO", status: "Scheduled" },
  { name: "City of Lakeview", service: "Infrastructure Inspection", location: "Lakeview, OR", status: "In Review" },
];

const clients = [
  { name: "Sunrise Solar Co.", tier: "Enterprise", contact: "Marcus Webb", jobs: 6 },
  { name: "Cruz Construction Group", tier: "Standard", contact: "Elena Cruz", jobs: 3 },
  { name: "City of Lakeview", tier: "Government", contact: "Office of Public Works", jobs: 2 },
];

const jobs = [
  { title: "Solar Farm Thermal Survey", client: "Sunrise Solar Co.", pilot: "J. Alvarez", status: "In Progress" },
  { title: "Phase 2 Site Progress Capture", client: "Cruz Construction Group", pilot: "T. Brennan", status: "Scheduled" },
  { title: "Bridge Structural Inspection", client: "City of Lakeview", pilot: "S. Okafor", status: "Completed" },
];

const schedule = [
  { date: "2026-07-02", job: "Solar Farm Thermal Survey", location: "Austin, TX", pilot: "J. Alvarez" },
  { date: "2026-07-05", job: "Phase 2 Site Progress Capture", location: "Denver, CO", pilot: "T. Brennan" },
  { date: "2026-07-09", job: "Pipeline Corridor Mapping", location: "Midland, TX", pilot: "K. Nguyen" },
];

const deliverables = [
  { title: "Thermal Report — Sunrise Solar Phase 1", job: "Solar Farm Thermal Survey", status: "In Progress" },
  { title: "Orthomosaic Map — Bridge 4B", job: "Bridge Structural Inspection", status: "Delivered" },
  { title: "Progress Report — June", job: "Phase 2 Site Progress Capture", status: "In Review" },
];

const notes = [
  { related: "Sunrise Solar Co.", body: "Client requested expedited turnaround on thermal report due to insurance deadline.", author: "Ops Team" },
  { related: "City of Lakeview", body: "Procurement requires signed compliance packet before final invoice.", author: "Ops Team" },
];

const statusBoard = [
  { label: "New Leads", count: 3, tone: "bg-blue-500/10 text-blue-400" },
  { label: "Pending Mission Requests", count: 2, tone: "bg-amber-500/10 text-amber-400" },
  { label: "Active Jobs", count: 4, tone: "bg-accent/10 text-accent" },
  { label: "Deliverables in Review", count: 3, tone: "bg-purple-500/10 text-purple-400" },
];

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-medium text-slate-300">
      {children}
    </span>
  );
}

export default function AdminDashboardClient() {
  const [active, setActive] = useState<TabKey>("leads");

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <nav className="space-y-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${
              active === t.key
                ? "bg-accent/10 text-accent"
                : "text-slate-400 hover:bg-surface2 hover:text-white"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </nav>

      <div className="card p-6 lg:p-8">
        {active === "leads" && (
          <Section title="Leads" desc="Inbound prospects from the website and outreach.">
            <Table
              headers={["Name", "Company", "Email", "Status"]}
              rows={leads.map((l) => [l.name, l.company, l.email, <Pill key={l.email}>{l.status}</Pill>])}
            />
          </Section>
        )}

        {active === "missions" && (
          <Section title="Mission Requests" desc="Incoming requests submitted via the mission intake form.">
            <Table
              headers={["Requester", "Service", "Location", "Status"]}
              rows={missionRequests.map((m) => [m.name, m.service, m.location, <Pill key={m.name}>{m.status}</Pill>])}
            />
          </Section>
        )}

        {active === "clients" && (
          <Section title="Clients" desc="Active client accounts and engagement tier.">
            <Table
              headers={["Client", "Tier", "Primary Contact", "Total Jobs"]}
              rows={clients.map((c) => [c.name, <Pill key={c.name}>{c.tier}</Pill>, c.contact, String(c.jobs)])}
            />
          </Section>
        )}

        {active === "jobs" && (
          <Section title="Jobs" desc="Mission jobs currently scheduled, in flight, or completed.">
            <Table
              headers={["Job Title", "Client", "Assigned Pilot", "Status"]}
              rows={jobs.map((j) => [j.title, j.client, j.pilot, <Pill key={j.title}>{j.status}</Pill>])}
            />
          </Section>
        )}

        {active === "schedule" && (
          <Section title="Schedule" desc="Upcoming flight operations across all active clients.">
            <Table
              headers={["Date", "Job", "Location", "Pilot"]}
              rows={schedule.map((s) => [s.date, s.job, s.location, s.pilot])}
            />
          </Section>
        )}

        {active === "deliverables" && (
          <Section title="Deliverables" desc="Processed assets and reports tied to each job.">
            <Table
              headers={["Deliverable", "Related Job", "Status"]}
              rows={deliverables.map((d) => [d.title, d.job, <Pill key={d.title}>{d.status}</Pill>])}
            />
          </Section>
        )}

        {active === "notes" && (
          <Section title="Notes" desc="Internal notes tied to leads, jobs, and clients.">
            <div className="space-y-4">
              {notes.map((n, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface2 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{n.related}</span>
                    <span className="text-xs text-slate-500">{n.author}</span>
                  </div>
                  <p className="text-sm text-slate-400">{n.body}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {active === "status" && (
          <Section title="Status Tracking" desc="High-level operational snapshot across the pipeline.">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {statusBoard.map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface2 p-6">
                  <p className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${s.tone}`}>
                    {s.label}
                  </p>
                  <p className="text-3xl font-bold text-white">{s.count}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-white">{title}</h2>
      <p className="mb-6 text-sm text-slate-400">{desc}</p>
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
            {headers.map((h) => (
              <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-4 pr-4 text-slate-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
