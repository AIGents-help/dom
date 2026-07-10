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
//
// Leads/Clients/Notes get real "+ Add" forms since those are plain tables
// with no gating logic. Jobs are deliberately NOT directly insertable here —
// they only ever get created via the admin_offer_mission RPC (mission +
// contractor + quote all have to line up), so the Jobs tab instead links out
// to /admin/missions/create and only supports editing an existing job's
// status/schedule. Deliverables management stays on the mission workspace
// page since it needs real file upload, which belongs there, not here.

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
const JOB_STATUSES = ["scheduled", "in_progress", "flown", "processing", "qc", "delivered", "cancelled"];

const inputCls = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent/60 focus:outline-none";
const labelCls = "mb-1 block text-xs text-slate-500";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-medium text-slate-300">
      {children}
    </span>
  );
}

const emptyLeadForm = { name: "", email: "", company: "", phone: "", source: "", message: "" };
const emptyClientForm = { company_name: "", contact_name: "", email: "", phone: "", industry: "", notes: "" };
const emptyNoteForm = { entity_type: "mission_request", entity_id: "", author: "", body: "" };

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

  const [showAddLead, setShowAddLead] = useState(false);
  const [leadForm, setLeadForm] = useState(emptyLeadForm);
  const [showAddClient, setShowAddClient] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);

  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [jobDraft, setJobDraft] = useState({ status: "", scheduled_for: "" });
  const [savingJob, setSavingJob] = useState(false);

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
      setNoteForm((f) => ({ ...f, author: data.session!.user.email ?? "" }));
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

  async function addLead() {
    if (!leadForm.name && !leadForm.email && !leadForm.company) {
      alert("Add at least a name, email, or company.");
      return;
    }
    setBusy("add-lead");
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").insert({
      name: leadForm.name || null,
      email: leadForm.email || null,
      company: leadForm.company || null,
      phone: leadForm.phone || null,
      source: leadForm.source || null,
      message: leadForm.message || null,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setLeadForm(emptyLeadForm);
    setShowAddLead(false);
    await load();
  }

  async function addClient() {
    if (!clientForm.company_name) {
      alert("Company name is required.");
      return;
    }
    setBusy("add-client");
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("clients").insert({
      company_name: clientForm.company_name,
      contact_name: clientForm.contact_name || null,
      email: clientForm.email || null,
      phone: clientForm.phone || null,
      industry: clientForm.industry || null,
      notes: clientForm.notes || null,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setClientForm(emptyClientForm);
    setShowAddClient(false);
    await load();
  }

  async function addNote() {
    if (!noteForm.entity_id || !noteForm.body) {
      alert("Pick a related record and enter a note.");
      return;
    }
    setBusy("add-note");
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("notes").insert({
      entity_type: noteForm.entity_type,
      entity_id: noteForm.entity_id,
      author: noteForm.author || null,
      body: noteForm.body,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setNoteForm((f) => ({ ...emptyNoteForm, author: f.author }));
    setShowAddNote(false);
    await load();
  }

  function startEditJob(j: JobRow) {
    setEditingJob(j.id);
    setJobDraft({
      status: j.status,
      scheduled_for: j.scheduled_for ? new Date(j.scheduled_for).toISOString().slice(0, 16) : "",
    });
  }

  async function saveJobEdit(jobId: string) {
    setSavingJob(true);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("jobs").update({
      status: jobDraft.status,
      scheduled_for: jobDraft.scheduled_for ? new Date(jobDraft.scheduled_for).toISOString() : null,
    }).eq("id", jobId);
    setSavingJob(false);
    if (error) { alert(error.message); return; }
    setEditingJob(null);
    await load();
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

  const noteEntityOptions =
    noteForm.entity_type === "mission_request"
      ? missions.map((m) => ({ id: m.id, label: `${m.company ?? m.requester_name ?? "Unnamed"} — ${(m.service_type ?? "").replace(/_/g, " ")}` }))
      : noteForm.entity_type === "client"
      ? clients.map((c) => ({ id: c.id, label: c.company_name }))
      : leads.map((l) => ({ id: l.id, label: `${l.name ?? l.company ?? "Unnamed lead"}` }));

  function renderJobCard(j: JobRow) {
    const pilot = j.assignments?.find((a) => !["declined", "cancelled"].includes(a.status))?.contractor?.full_name;
    const editing = editingJob === j.id;
    return (
      <div key={j.id} className="rounded-lg border border-border bg-surface2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">{j.title}</div>
            <div className="text-xs text-slate-500">
              {j.mission_request?.company ?? j.mission_request?.requester_name ?? "—"} · {pilot ?? "Unassigned"}
              {j.scheduled_for && <> · {new Date(j.scheduled_for).toLocaleString()}</>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill>{j.status.replace("_", " ")}</Pill>
            <ActionBtn onClick={() => (editing ? setEditingJob(null) : startEditJob(j))}>{editing ? "Cancel" : "Edit"}</ActionBtn>
            <ActionBtn onClick={() => j.mission_request_id && router.push(`/admin/missions/${j.mission_request_id}`)}>Open →</ActionBtn>
          </div>
        </div>
        {editing && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={jobDraft.status}
                onChange={(e) => setJobDraft((d) => ({ ...d, status: e.target.value }))}
                className={inputCls}
              >
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Scheduled for</label>
              <input
                type="datetime-local"
                value={jobDraft.scheduled_for}
                onChange={(e) => setJobDraft((d) => ({ ...d, scheduled_for: e.target.value }))}
                className={inputCls}
              />
            </div>
            <ActionBtn disabled={savingJob} onClick={() => saveJobEdit(j.id)}>{savingJob ? "Saving…" : "Save"}</ActionBtn>
          </div>
        )}
      </div>
    );
  }

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
          <Section
            title="Leads"
            desc="Inbound prospects from the website and outreach. Click a lead to view details and take action."
            action={<ActionBtn onClick={() => setShowAddLead((s) => !s)}>{showAddLead ? "Cancel" : "+ Add Lead"}</ActionBtn>}
          >
            {showAddLead && (
              <div className="mb-4 grid gap-3 rounded-lg border border-border bg-surface2 p-4 sm:grid-cols-2">
                <div><label className={labelCls}>Name</label><input className={inputCls} value={leadForm.name} onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div><label className={labelCls}>Company</label><input className={inputCls} value={leadForm.company} onChange={(e) => setLeadForm((f) => ({ ...f, company: e.target.value }))} /></div>
                <div><label className={labelCls}>Email</label><input className={inputCls} value={leadForm.email} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} /></div>
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={leadForm.phone} onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className={labelCls}>Source</label><input className={inputCls} placeholder="phone, referral, website…" value={leadForm.source} onChange={(e) => setLeadForm((f) => ({ ...f, source: e.target.value }))} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Message</label><textarea className={inputCls} rows={2} value={leadForm.message} onChange={(e) => setLeadForm((f) => ({ ...f, message: e.target.value }))} /></div>
                <div className="sm:col-span-2"><ActionBtn disabled={busy === "add-lead"} onClick={addLead}>{busy === "add-lead" ? "Saving…" : "Save Lead"}</ActionBtn></div>
              </div>
            )}
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
          <Section
            title="Mission Requests"
            desc="Incoming requests submitted via the mission intake form. Click a row to open the full mission workspace."
            action={<ActionBtn onClick={() => router.push("/admin/missions/create")}>+ New Mission</ActionBtn>}
          >
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
          <Section
            title="Clients"
            desc="Active client accounts. Click a client to view their profile and mission history."
            action={<ActionBtn onClick={() => setShowAddClient((s) => !s)}>{showAddClient ? "Cancel" : "+ Add Client"}</ActionBtn>}
          >
            {showAddClient && (
              <div className="mb-4 grid gap-3 rounded-lg border border-border bg-surface2 p-4 sm:grid-cols-2">
                <div><label className={labelCls}>Company name *</label><input className={inputCls} value={clientForm.company_name} onChange={(e) => setClientForm((f) => ({ ...f, company_name: e.target.value }))} /></div>
                <div><label className={labelCls}>Contact name</label><input className={inputCls} value={clientForm.contact_name} onChange={(e) => setClientForm((f) => ({ ...f, contact_name: e.target.value }))} /></div>
                <div><label className={labelCls}>Email</label><input className={inputCls} value={clientForm.email} onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))} /></div>
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={clientForm.phone} onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className={labelCls}>Industry</label><input className={inputCls} value={clientForm.industry} onChange={(e) => setClientForm((f) => ({ ...f, industry: e.target.value }))} /></div>
                <div><label className={labelCls}>Notes</label><input className={inputCls} value={clientForm.notes} onChange={(e) => setClientForm((f) => ({ ...f, notes: e.target.value }))} /></div>
                <div className="sm:col-span-2"><ActionBtn disabled={busy === "add-client"} onClick={addClient}>{busy === "add-client" ? "Saving…" : "Save Client"}</ActionBtn></div>
              </div>
            )}
            {clients.length === 0 && <Empty>No clients yet — add one or convert a lead.</Empty>}
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
          <Section
            title="Jobs"
            desc="Mission jobs currently scheduled, in flight, or completed. Edit status/schedule inline, or open the full mission workspace. Jobs are created by offering a mission to a pilot, not directly — start a new one from Mission Requests."
            action={<ActionBtn onClick={() => router.push("/admin/missions/create")}>+ New Mission</ActionBtn>}
          >
            {jobs.length === 0 && <Empty>No jobs yet — jobs are created when a mission is offered to a pilot.</Empty>}
            <div className="space-y-3">{jobs.map(renderJobCard)}</div>
          </Section>
        )}

        {active === "schedule" && (
          <Section title="Schedule" desc="Upcoming flight operations across all active clients. Edit a job's date inline, or open the full mission workspace.">
            {scheduled.length === 0 && <Empty>Nothing scheduled yet.</Empty>}
            <div className="space-y-3">{scheduled.map(renderJobCard)}</div>
          </Section>
        )}

        {active === "deliverables" && (
          <Section title="Deliverables" desc="Processed assets and reports tied to each job. Click a row to open the mission workspace and manage uploads/QC there.">
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
          <Section
            title="Notes"
            desc="Internal notes tied to leads, jobs, and clients. Click a note to jump to the related record."
            action={<ActionBtn onClick={() => setShowAddNote((s) => !s)}>{showAddNote ? "Cancel" : "+ Add Note"}</ActionBtn>}
          >
            {showAddNote && (
              <div className="mb-4 grid gap-3 rounded-lg border border-border bg-surface2 p-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Related to</label>
                  <select
                    className={inputCls}
                    value={noteForm.entity_type}
                    onChange={(e) => setNoteForm((f) => ({ ...f, entity_type: e.target.value, entity_id: "" }))}
                  >
                    <option value="mission_request">Mission</option>
                    <option value="client">Client</option>
                    <option value="lead">Lead</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Record</label>
                  <select
                    className={inputCls}
                    value={noteForm.entity_id}
                    onChange={(e) => setNoteForm((f) => ({ ...f, entity_id: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {noteEntityOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2"><label className={labelCls}>Author</label><input className={inputCls} value={noteForm.author} onChange={(e) => setNoteForm((f) => ({ ...f, author: e.target.value }))} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Note</label><textarea className={inputCls} rows={3} value={noteForm.body} onChange={(e) => setNoteForm((f) => ({ ...f, body: e.target.value }))} /></div>
                <div className="sm:col-span-2"><ActionBtn disabled={busy === "add-note"} onClick={addNote}>{busy === "add-note" ? "Saving…" : "Save Note"}</ActionBtn></div>
              </div>
            )}
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

function Section({ title, desc, children, action }: { title: string; desc: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {action}
      </div>
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
