"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

type Assignment = { id: string; status: string; assigned_uav: string | null; mission_insurance_verified: boolean; mission_checklist_items: Array<{ required: boolean; completed: boolean }> };
type Deliverable = { id: string; qc_passed: boolean | null; delivered_at: string | null };
type Job = { id: string; status: string; scheduled_for: string | null; delivery_responsibility: string | null; assignments: Assignment[]; deliverables: Deliverable[] };
type Mission = { id: string; requester_name: string | null; company: string | null; service_type: string | null; location: string | null; status: string; quoted_amount_cents: number | null; created_at: string; created_by_contractor_id: string | null; created_by_pilot_name: string | null; requires_admin_approval: boolean; jobs: Job[] };

const VIEWS = [
  ["all", "All missions"], ["requests", "Mission requests"], ["active", "Active jobs"],
  ["schedule", "Schedule"], ["deliverables", "Deliverables / QC"], ["pilot_owned", "Pilot-owned"], ["closed", "Completed"],
] as const;

export default function AdminMissionsPage() {
  return <Suspense fallback={<main className="section"><div className="container-app">Loading missions…</div></main>}><MissionList /></Suspense>;
}

function MissionList() {
  const params = useSearchParams();
  const view = params.get("view") ?? "all";
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (!data.session) throw new Error("Admin session expired. Sign in again.");
      const response = await fetch("/api/admin/missions", { cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Missions could not be loaded.");
      setMissions(body.missions ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Missions could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const shown = useMemo(() => missions.filter((mission) => {
    const jobs = mission.jobs ?? [];
    if (view === "requests") return ["requested", "reviewing", "scoped", "quoted", "approved"].includes(mission.status);
    if (view === "active") return !["requested", "reviewing", "scoped", "quoted", "delivered", "closed", "cancelled"].includes(mission.status);
    if (view === "schedule") return jobs.some((job) => !!job.scheduled_for) && !["delivered", "closed", "cancelled"].includes(mission.status);
    if (view === "deliverables") return jobs.some((job) => (job.deliverables ?? []).some((item) => !item.qc_passed && !item.delivered_at));
    if (view === "pilot_owned") return !!mission.created_by_contractor_id;
    if (view === "closed") return ["delivered", "closed"].includes(mission.status);
    return true;
  }), [missions, view]);

  return <main className="section"><div className="container-app">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow mb-2">Operations</p><h1 className="heading-lg">Missions</h1><p className="body-muted mt-2">One working view for requests, staffing, schedules, deliverables, and completion.</p></div><Link href="/admin/missions/create" className="rounded-lg bg-[#f26a1b] px-4 py-3 font-bold text-white">+ Create Mission</Link></div>
    <nav aria-label="Mission views" className="mt-6 flex flex-wrap gap-2">{VIEWS.map(([key, label]) => <Link key={key} href={key === "all" ? "/admin/missions" : `/admin/missions?view=${key}`} className={`rounded-lg border px-3 py-2 text-sm font-semibold no-underline ${view === key ? "border-[#f26a1b] bg-[#f26a1b] text-white" : "border-slate-300 bg-white text-slate-800"}`}>{label}</Link>)}</nav>
    {error && <div role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
    {loading && <div className="card mt-5 p-8">Loading missions…</div>}
    {!loading && !error && <div className="mt-5 grid gap-3">
      <p className="text-sm text-slate-600">{shown.length} mission{shown.length === 1 ? "" : "s"} in this view</p>
      {shown.length === 0 && <div className="card p-8">No missions match this view.</div>}
      {shown.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
    </div>}
  </div></main>;
}

function MissionCard({ mission }: { mission: Mission }) {
  const jobs = mission.jobs ?? [];
  const nextDate = jobs.map((job) => job.scheduled_for).filter(Boolean).sort()[0];
  const pendingQc = jobs.reduce((total, job) => total + (job.deliverables ?? []).filter((item) => !item.qc_passed && !item.delivered_at).length, 0);
  const pilotOwned = !!mission.created_by_contractor_id || jobs.some((job) => job.delivery_responsibility === "pilot");
  return <Link href={`/admin/missions/${mission.id}`} className="card block p-5 text-inherit no-underline transition hover:border-[#f26a1b] hover:shadow-md">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#f26a1b]">{mission.status.replaceAll("_", " ")}{pilotOwned ? ` · pilot-owned${mission.created_by_pilot_name ? ` by ${mission.created_by_pilot_name}` : ""}` : ""}</p><h2 className="mt-1 text-lg font-extrabold">{mission.company || mission.requester_name || "Unnamed mission"}</h2><p className="mt-1 text-sm text-slate-600">{(mission.service_type ?? "custom").replaceAll("_", " ")} · {mission.location || "Location not set"}</p></div><div className="text-right text-sm text-slate-600">{nextDate ? `Scheduled ${new Date(nextDate).toLocaleString()}` : "Not scheduled"}{pendingQc > 0 && <div className="mt-1 font-bold text-amber-700">{pendingQc} pending QC</div>}</div></div>
  </Link>;
}
