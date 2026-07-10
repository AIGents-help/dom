"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Send, Briefcase, Calendar, FileText, StickyNote, Activity, Building2,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Every tab here reads real Supabase tables (leads, mission_requests, clients,
// jobs, deliverables, notes) and every row is clickable — missions/jobs/
// schedule/deliverables open the full mission workspace at
// /admin/missions/[id] (jobs are 1:1 with the mission_request that spawned
// them in this app), while leads/clients expand inline since they don't have
// a dedicated detail route.

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

interface Lead {
  id: string; name: string | null; email: string | null; company: string | null;
  phone: string | null; source: string | null; message: string | null; status: string; created_at: string;
}
interface MissionRequest {
  id: string; requester_name: string | null; company: string | null; service_type: string | null;
  location: string | null; status: string; quoted_amount_cents: number | null; created_at: string; client_id: string | null;
}
interface Client {
  id: string; company_name: string; contact_name: string | null; email: string | null;
  phone: string | null; industry: string | null; notes: string | null; created_at: string;
}
interface JobRow {
  id: string; title: string; service_type: string | null; location: string | null;
  scheduled_for: string | null; status: string; mission_request_id: string | null; delivery_responsibility: string;
  mission_request: { requester_name: string | null; company: string | null } | null;
  assignments: { status: string; contractor: { full_name: string } | null }[] | null;
}
interface DeliverableRow {
  id: string; name: string; type: string | null; qc_passed: boolean | null;
  delivered_at: string | null; created_at: string; job_id: string | null;
  job: { title: string; mission_request_id: string | null } | null;
}
interface NoteRow {
  id: string; entity_type: string; entity_id: string; author: string | null; body: string; created_at: string;
}

const LEAD_STATUS_FLOW: Record<string, string> = { new: "contacted", contacted: "qualified", qualified: "converted" };

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-medium text-slate-300">
      {children}
    </span>
  );
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const [active, setActive] = useState<TabKey>("leads");
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [missions, setMissions] = useState<MissionRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const [leadsRes, missionsRes, clientsRes, jobsRes, deliverablesRes, notesRes] = await Promise.all([
      sb.from("leads").select("*").order("created_at", { ascending: false }),
      sb.from("mission_requests")
        .select("id, requester_name, company, service_type, location, status, quoted_amount_cents, created_at, client_id")
        .order("created_at", { ascending: false }),
      sb.from("clients").select("*").order("created_at", { ascending: false }),
      sb.from("jobs")
        .select("id, title, service_type, location, scheduled_for, status, mission_request_id, delivery_responsibility, mission_request:mission_requests(requester_name, company), assignments:mission_assignments(status, contractor:contractors(full_name))")
        .order("created_at", { ascending: false }),
      sb.from("deliverables")
        .select("id, name, type, qc_passed, delivered_at, created_at, job_id, job:jobs(title, mission_request_id)")
        .order("created_at", { ascending: false }),
      sb.from("notes").select("*").order("created_at", { ascending: false }),
    ]);
    setLeads((leadsRes.data as Lead[]) ?? []);
    setMissions((missionsRes.data as MissionRequest[]) ?? []);
    setClients((clientsRes.data as Client[]) ?? []);
    setJobs((jobsRes.data as unknown as JobRow[]) ?? []);
    setDeliverables((deliverablesRes.data as unknown as DeliverableRow[]) ?? []);
    setNotes((notesRes.data as NoteRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) { router.push("/admin/login"); return; }
      load();
    })();
  }, [router, load]);

  async function setLeadStatus(lead: Lead, status: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    await sb.from("leads").update({ status }).eq("id", lead.id);
    await load();
    setBusy(null);
  }

  async function convertLead(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("clients").insert({
      company_name: lead.company ?? lead.name ?? "Unnamed",
      contact_name: lead.name,
      email: lead.email,
      phone: lead.phone,
    });
    if (error) { alert(error.message); setBusy(null); return; }
    await sb.from("leads").update({ status: "converted" }).eq("id", lead.id);
    await load();
    setBusy(null);
    setActive("clients");
  }

  function openNote(note: NoteRow) {
    if (note.entity_type === "mission_request" || note.entity_type === "mission") {
      router.push(`/admin/missions/${note.entity_id}`);
    } else if (note.entity_type === "client") {
      setActive("clients");
      setExpandedClient(note.entity_id);
    } else if (note.entity_type === "lead") {
      setActive("leads");
      setExpandedLead(note.entity_id);
    }
  }

  if (loading) return <p className="text-slate-400">Loading dashboard…</p>;

  const scheduled = jobs
    .filter((j) => j.scheduled_for)
    .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime());

  const statusBoard: { label: string; count: number; tone: string; onClick: () => void }[] = [
    { label: "New Leads", count: leads.filter((l) => l.status === "new").length, tone: "bg-blue-500/10 text-blue-400", onClick: () => setActive("leads") },
    { label: "Pending Mission Requests", count: missions.filter((m) => ["requested", "reviewing"].includes(m.status)).length, tone: "bg-amber-500/10 text-amber-400", onClick: () => setActive("missions") },
    { label: "Active Jobs", count: jobs.filter((j) => !["delivered", "cancelled"].includes(j.status)).length, tone: "bg-accent/10 text-accent", onClick: () => setActive("jobs") },
    { label: "Deliverables in Review", count: deliverables.filter((d) => !d.qc_passed).length, tone: "bg-purple-500/10 text-purple-400", onClick: () => setActive("deliverables") },
  ];

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
          <Section title="Leads" desc="Inbound prospects from the website and outreach. Click a lead to view details and take action.">
            {leads.length === 0 && <Empty>No leads yet.</Empty>}
            <div className="space-y-3">
              {leads.map((l) => {
                const open = expandedLead === l.id;
                return (
                  <div key={l.id} className="rounded-lg border border-border bg-surface2">
                    <button
                      onClick={() => setExpandedLead(open ? null : l.id)}
                      className="flex w-full items-center justify-between gap-4 p-4 text-left"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{l.name ?? "Unnamed"}</div>
                        <div className="text-xs text-slate-500">{l.company ?? "—"} · {l.email ?? "—"}</div>
                      </div>
                      <Pill>{l.status}</Pill>
                    </button>
                    {open && (
                      <div className="space-y-3 border-t border-border p-4 text-sm text-slate-300">
                        <p><span className="text-slate-500">Phone:</span> {l.phone ?? "—"}</p>
                        <p><span className="text-slate-500">Source:</span> {l.source ?? "—"}</p>
                        {l.message && <p><span className="text-slate-500">Message:</span> {l.message}</p>}
                        <p className="text-xs text-slate-500">Submitted {new Date(l.created_at).toLocaleDateString()}</p>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {LEAD_STATUS_FLOW[l.status] && (
                            <ActionBtn disabled={busy === l.id} onClick={() => setLeadStatus(l, LEAD_STATUS_FLOW[l.status])}>
                              Mark {LEAD_STATUS_FLOW[l.status]}
                            </ActionBtn>
                          )}
                          {l.status !== "converted" && l.status !== "lost" && (
                            <ActionBtn disabled={busy === l.id} onClick={() => convertLead(l)}>Convert to client</ActionBtn>
                          )}
                          {l.status !== "lost" && l.status !== "converted" && (
                            <ActionBtn disabled={busy === l.id} onClick={() => setLeadStatus(l, "lost")}>Mark lost</ActionBtn>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {active === "missions" && (
          <Section title="Mission Requests" desc="Incoming requests submitted via the mission intake form. Click a row to open the full mission workspace.">
            {missions.length === 0 && <Empty>No mission requests yet.</Empty>}
            <Table
              headers={["Requester", "Service", "Location", "Status"]}
              rows={missions.map((m) => ({
                key: m.id,
                onClick: () => router.push(`/admin/missions/${m.id}`),
                cells: [
                  m.company ?? m.requester_name ?? "Unnamed",
                  (m.service_type ?? "").replace(/_/g, " "),
                  m.location ?? "—",
                  <Pill key="s">{m.status}</Pill>,
                ],
              }))}
            />
          </Section>
        )}

        {active === "clients" && (
          <Section title="Clients" desc="Active client accounts. Click a client to view their profile and mission history.">
            {clients.length === 0 && <Empty>No clients yet — convert a lead to create one.</Empty>}
            <div className="space-y-3">
              {clients.map((c) => {
                const open = expandedClient === c.id;
                const related = missions.filter((m) => m.client_id === c.id);
                return (
                  <div key={c.id} className="rounded-lg border border-border bg-surface2">
                    <button
                      onClick={() => setExpandedClient(open ? null : c.id)}
                      className="flex w-full items-center justify-between gap-4 p-4 text-left"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{c.company_name}</div>
                        <div className="text-xs text-slate-500">{c.contact_name ?? "—"} · {c.email ?? "—"}</div>
                      </div>
                      <Pill>{related.length} mission{related.length === 1 ? "" : "s"}</Pill>
                    </button>
                    {open && (
                      <div className="space-y-3 border-t border-border p-4 text-sm text-slate-300">
                        <p><span className="text-slate-500">Phone:</span> {c.phone ?? "—"}</p>
                        <p><span className="text-slate-500">Industry:</span> {c.industry ?? "—"}</p>
                        {c.notes && <p><span className="text-slate-500">Notes:</span> {c.notes}</p>}
                        {related.length > 0 && (
                          <div className="pt-2">
                            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Missions</p>
                            <div className="space-y-1">
                              {related.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => router.push(`/admin/missions/${m.id}`)}
                                  className="block text-left text-accent hover:underline"
                                >
                                  {(m.service_type ?? "").replace(/_/g, " ")} — {m.status} →
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {active === "jobs" && (
          <Section title="Jobs" desc="Mission jobs currently scheduled, in flight, or completed. Click a row to open the mission workspace.">
            {jobs.length === 0 && <Empty>No jobs yet.</Empty>}
            <Table
              headers={["Job Title", "Client", "Assigned Pilot", "Status"]}
              rows={jobs.map((j) => {
                const pilot = j.assignments?.find((a) => !["declined", "cancelled"].includes(a.status))?.contractor?.full_name;
                return {
                  key: j.id,
                  onClick: () => j.mission_request_id && router.push(`/admin/missions/${j.mission_request_id}`),
                  cells: [
                    j.title,
                    j.mission_request?.company ?? j.mission_request?.requester_name ?? "—",
                    pilot ?? "Unassigned",
                    <Pill key="s">{j.status.replace("_", " ")}</Pill>,
                  ],
                };
              })}
            />
          </Section>
        )}

        {active === "schedule" && (
          <Section title="Schedule" desc="Upcoming flight operations across all active clients. Click a row to open the mission workspace.">
            {scheduled.length === 0 && <Empty>Nothing scheduled yet.</Empty>}
            <Table
              headers={["Date", "Job", "Location", "Pilot"]}
              rows={scheduled.map((j) => {
                const pilot = j.assignments?.find((a) => !["declined", "cancelled"].includes(a.status))?.contractor?.full_name;
                return {
                  key: j.id,
                  onClick: () => j.mission_request_id && router.push(`/admin/missions/${j.mission_request_id}`),
                  cells: [new Date(j.scheduled_for!).toLocaleDateString(), j.title, j.location ?? "—", pilot ?? "Unassigned"],
                };
              })}
            />
          </Section>
        )}

        {active === "deliverables" && (
          <Section title="Deliverables" desc="Processed assets and reports tied to each job. Click a row to open the mission workspace.">
            {deliverables.length === 0 && <Empty>No deliverables yet.</Empty>}
            <Table
              headers={["Deliverable", "Related Job", "Status"]}
              rows={deliverables.map((d) => ({
                key: d.id,
                onClick: () => d.job?.mission_request_id && router.push(`/admin/missions/${d.job!.mission_request_id}`),
                cells: [d.name, d.job?.title ?? "—", <Pill key="s">{d.qc_passed ? "Delivered" : "In review"}</Pill>],
              }))}
            />
          </Section>
        )}

        {active === "notes" && (
          <Section title="Notes" desc="Internal notes tied to leads, jobs, and clients. Click a note to jump to the related record.">
            {notes.length === 0 && <Empty>No notes yet.</Empty>}
            <div className="space-y-4">
              {notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNote(n)}
                  className="block w-full rounded-lg border border-border bg-surface2 p-4 text-left transition hover:border-accent/60"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{n.entity_type} →</span>
                    <span className="text-xs text-slate-500">{n.author ?? "Ops Team"}</span>
                  </div>
                  <p className="text-sm text-slate-400">{n.body}</p>
                </button>
              ))}
            </div>
          </Section>
        )}

        {active === "status" && (
          <Section title="Status Tracking" desc="High-level operational snapshot across the pipeline. Click a card to jump to that list.">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {statusBoard.map((s) => (
                <button
                  key={s.label}
                  onClick={s.onClick}
                  className="rounded-xl border border-border bg-surface2 p-6 text-left transition hover:border-accent/60"
                >
                  <p className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${s.tone}`}>
                    {s.label}
                  </p>
                  <p className="text-3xl font-bold text-white">{s.count}</p>
                </button>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function ActionBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-white transition hover:border-accent/60 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: { key: string; onClick?: () => void; cells: React.ReactNode[] }[] }) {
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
          {rows.map((row) => (
            <tr
              key={row.key}
              onClick={row.onClick}
              className={`border-b border-border/60 last:border-0 ${row.onClick ? "cursor-pointer hover:bg-surface2/60" : ""}`}
            >
              {row.cells.map((cell, j) => (
                <td key={j} className="py-4 pr-4 text-slate-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
