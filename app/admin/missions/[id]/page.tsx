"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

// Admin > Mission detail — view a mission's quote/airspace, advance its status
// through the mission lifecycle, and offer it to a contractor.

const PIPELINE = [
  "requested", "reviewing", "scoped", "quoted", "approved",
  "assigned", "in_progress", "delivered", "closed",
] as const;

const PIPELINE_DEFINITIONS: Record<(typeof PIPELINE)[number], string> = {
  requested: "Mission received. Client needs and initial details have not yet been reviewed.",
  reviewing: "DOM is validating the request, location, airspace, feasibility, and missing information.",
  scoped: "The exact work, mission type, deliverables, constraints, and responsibilities are defined.",
  quoted: "Pricing has been prepared and presented; the mission is waiting for client approval.",
  approved: "The client approved the scope and price. DOM can schedule and assign the work.",
  assigned: "A pilot has been selected or accepted the mission and is responsible for execution.",
  in_progress: "Planning, fieldwork, flight operations, processing, or deliverable production is underway.",
  delivered: "The approved deliverables have been provided to the client and await final closure.",
  closed: "The mission is complete, records are retained, and no further operational action is expected.",
};

function nextPipelineStatus(current: string): string | null {
  const idx = PIPELINE.indexOf(current as (typeof PIPELINE)[number]);
  if (idx === -1 || idx === PIPELINE.length - 1) return null;
  return PIPELINE[idx + 1];
}

interface MissionRequest {
  id: string;
  requester_name: string | null;
  requester_email: string | null;
  company: string | null;
  service_type: string | null;
  location: string | null;
  status: string;
  quoted_amount_cents: number | null;
  airspace_class: string | null;
  scope: string | null;
  budget_range: string | null;
  requested_contractor_id: string | null;
  claimed_by_contractor_id: string | null;
  created_at: string;
}

interface Quote {
  id: string;
  base_price_cents: number;
  location_mod: number;
  airspace_mod: number;
  complexity_mod: number;
  urgency_mod: number;
  deliverable_mod: number;
  combined_multiplier: number;
  total_cents: number;
  commission_cents: number;
  contractor_cents: number;
  warnings: string[] | null;
}

interface Contractor {
  id: string;
  full_name: string;
  status: string;
  service_area: string | null;
  rating: number | null;
  missions_completed: number;
}

interface Job {
  id: string;
  title: string;
  status: string;
  scheduled_for: string | null;
  delivery_responsibility: string;
}

interface Assignment {
  id: string;
  contractor_id: string;
  status: string;
  offered_at: string | null;
  accepted_at: string | null;
  mission_price_cents: number | null;
  contractor_payout_cents: number | null;
  dom_commission_cents: number | null;
  commission_bps_applied: number | null;
  contractor?: { full_name: string } | null;
}

interface Payment {
  id: string;
  assignment_id: string;
  status: string;
  amount_total_cents: number;
  contractor_amount_cents: number | null;
  stripe_transfer_id: string | null;
  transfer_error: string | null;
  created_at: string;
}

interface Deliverable {
  id: string;
  name: string;
  type: string | null;
  storage_url: string | null;
  qc_passed: boolean | null;
  delivered_at: string | null;
}

// dsm, dtm, and processing_report added for the DOM Mapper module — the
// worker (services/mapper-worker) registers deliverables using these types.
// deliverables.type has no DB constraint (verified live), so this app-level
// list is the only place this vocabulary is defined.
const DELIVERABLE_TYPES = ["orthomosaic", "3d_model", "dsm", "dtm", "point_cloud", "processing_report", "report", "raw_images", "video", "other"];
const SERVICE_TYPES = [
  ["roof_inspection_residential", "Roof Inspection (Residential)"],
  ["roof_inspection_commercial", "Roof Inspection (Commercial)"],
  ["construction_progress", "Construction Progress Mapping"],
  ["thermal_inspection", "Thermal + Visual Inspection"],
  ["ortho_survey", "Orthomosaic Survey"],
  ["powerline_inspection", "Powerline / Utility Inspection"],
  ["real_estate_media", "Real Estate Aerial Media"],
  ["custom", "Custom Mission"],
] as const;

export default function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState<MissionRequest | null>(null);
  const [requestedPilotName, setRequestedPilotName] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [contractorTierBps, setContractorTierBps] = useState<Record<string, number>>({});
  const [selectedContractor, setSelectedContractor] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [offering, setOffering] = useState(false);
  const [releasingClaim, setReleasingClaim] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [requestingPayment, setRequestingPayment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [newDeliverableName, setNewDeliverableName] = useState("");
  const [newDeliverableType, setNewDeliverableType] = useState(DELIVERABLE_TYPES[0]);
  const [uploadingDeliverable, setUploadingDeliverable] = useState(false);
  const [togglingQc, setTogglingQc] = useState<string | null>(null);
  const [editingMission, setEditingMission] = useState(false);
  const [savingMission, setSavingMission] = useState(false);
  const [deletingMission, setDeletingMission] = useState(false);
  const [missionDraft, setMissionDraft] = useState({
    title: "", requesterName: "", requesterEmail: "", company: "", serviceType: "custom",
    location: "", scope: "", status: "requested", quotedAmount: "", scheduledFor: "",
  });

  const beginMissionEdit = useCallback(() => {
    if (!mission) return;
    setMissionDraft({
      title: job?.title ?? mission.service_type?.replace(/_/g, " ") ?? "Mission",
      requesterName: mission.requester_name ?? "",
      requesterEmail: mission.requester_email ?? "",
      company: mission.company ?? "",
      serviceType: mission.service_type ?? "custom",
      location: mission.location ?? "",
      scope: mission.scope ?? "",
      status: mission.status,
      quotedAmount: mission.quoted_amount_cents != null ? (mission.quoted_amount_cents / 100).toFixed(2) : "",
      scheduledFor: job?.scheduled_for ? new Date(job.scheduled_for).toISOString().slice(0, 16) : "",
    });
    setEditingMission(true);
  }, [mission, job]);

  const saveMission = useCallback(async (statusOverride?: string) => {
    setSavingMission(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Not authenticated");
      const status = statusOverride ?? missionDraft.status;
      const res = await fetch(`/api/admin/missions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          ...missionDraft,
          status,
          quotedAmountCents: missionDraft.quotedAmount ? Math.round(Number(missionDraft.quotedAmount) * 100) : null,
          scheduledFor: missionDraft.scheduledFor ? new Date(missionDraft.scheduledFor).toISOString() : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not update mission");
      setEditingMission(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingMission(false);
    }
  }, [id, missionDraft, load]);

  const cancelMission = useCallback(async () => {
    if (!window.confirm("Cancel this mission? The record will be retained, and the pilot assignment will be cancelled when legally safe.")) return;
    if (!mission) return;
    setSavingMission(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Not authenticated");
      const res = await fetch(`/api/admin/missions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          title: job?.title ?? mission.service_type?.replace(/_/g, " ") ?? "Mission",
          requesterName: mission.requester_name,
          requesterEmail: mission.requester_email,
          company: mission.company,
          serviceType: mission.service_type,
          location: mission.location,
          scope: mission.scope,
          quotedAmountCents: mission.quoted_amount_cents,
          scheduledFor: job?.scheduled_for,
          status: "cancelled",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not cancel mission");
      setEditingMission(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingMission(false);
    }
  }, [id, mission, job, load]);

  const deleteMission = useCallback(async () => {
    if (!window.confirm("Permanently delete this mission? This cannot be undone. Missions with payments or completed records will be refused.")) return;
    if (!window.confirm("Final confirmation: permanently delete this mission and its unprotected working records?")) return;
    setDeletingMission(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Not authenticated");
      const res = await fetch(`/api/admin/missions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not delete mission");
      router.push("/admin/missions");
    } catch (e: any) {
      setError(e.message);
      setDeletingMission(false);
    }
  }, [id, router]);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();

    const { data: mr } = await sb.from("mission_requests").select("*").eq("id", id).single();
    setMission(mr as MissionRequest);

    if (mr?.requested_contractor_id) {
      const { data: rc } = await sb.from("contractors").select("full_name").eq("id", mr.requested_contractor_id).maybeSingle();
      setRequestedPilotName(rc?.full_name ?? null);
    } else {
      setRequestedPilotName(null);
    }

    const { data: q } = await sb
      .from("quotes")
      .select("*")
      .eq("mission_request_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setQuote(q as Quote | null);

    const { data: jobRow } = await sb
      .from("jobs")
      .select("id, title, status, scheduled_for, delivery_responsibility")
      .eq("mission_request_id", id)
      .maybeSingle();
    setJob(jobRow as Job | null);

    if (jobRow) {
      const { data: assigns } = await sb
        .from("mission_assignments")
        .select("id, contractor_id, status, offered_at, accepted_at, mission_price_cents, contractor_payout_cents, dom_commission_cents, commission_bps_applied, contractor:contractors(full_name)")
        .eq("job_id", jobRow.id)
        .order("offered_at", { ascending: false });
      setAssignments((assigns as any) ?? []);

      const assignmentIds = (assigns ?? []).map((a) => a.id);
      if (assignmentIds.length) {
        const { data: paymentRows } = await sb
          .from("payments")
          .select("id, assignment_id, status, amount_total_cents, contractor_amount_cents, stripe_transfer_id, transfer_error, created_at")
          .in("assignment_id", assignmentIds)
          .order("created_at", { ascending: false });
        setPayments((paymentRows as Payment[]) ?? []);
      } else {
        setPayments([]);
      }

      const { data: deliverableRows } = await sb
        .from("deliverables")
        .select("id, name, type, storage_url, qc_passed, delivered_at")
        .eq("job_id", jobRow.id)
        .order("created_at", { ascending: false });
      setDeliverables((deliverableRows as Deliverable[]) ?? []);
    } else {
      // Only offer missions to contractors who are active AND fully
      // verified — otherwise a pilot could accept work that then fails at
      // actual payment time, since /api/checkout separately blocks
      // unverified contractors from being paid.
      const { data: activeContractors } = await sb
        .from("contractors")
        .select("id, full_name, status, service_area, rating, missions_completed")
        .eq("status", "active")
        .eq("part107_verified", true)
        .eq("insurance_verified", true)
        .order("rating", { ascending: false });
      setContractors((activeContractors as Contractor[]) ?? []);

      // Tier badge per contractor — bulk-fetch trailing-90-day completed
      // counts once and tally client-side (same pattern as the admin
      // dashboard's funnel panels), rather than one RPC round-trip per row.
      const contractorIds = (activeContractors ?? []).map((c) => c.id);
      if (contractorIds.length) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const { data: recentCompletions } = await sb
          .from("mission_assignments")
          .select("contractor_id")
          .in("contractor_id", contractorIds)
          .in("status", ["qc_passed", "paid"])
          .gte("completed_at", ninetyDaysAgo.toISOString());
        const counts: Record<string, number> = {};
        for (const row of recentCompletions ?? []) {
          counts[row.contractor_id] = (counts[row.contractor_id] ?? 0) + 1;
        }
        // Display-only badge — mirrors calculate_commission_bps's tier
        // bands (see the migration) since a real per-contractor RPC round
        // trip per dropdown row isn't worth it for a label. The actual
        // money calculation always goes through the SQL function; this
        // can never itself write an incorrect commission, only mislabel
        // the preview if the bands are ever retuned without updating here.
        const tiers: Record<string, number> = {};
        for (const cid of contractorIds) {
          const count = counts[cid] ?? 0;
          tiers[cid] = count >= 10 ? 1000 : count >= 5 ? 1500 : 2000;
        }
        setContractorTierBps(tiers);
      }
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        router.push("/admin/login");
        return;
      }
      setAuthed(true);
      load();
    })();
  }, [router, load]);

  // A pilot-claimed mission (from the open queue) pre-fills the existing
  // Offer flow with the claimant rather than getting a separate approve UI —
  // admin just reviews and clicks the same "Offer Mission" button.
  useEffect(() => {
    if (mission?.status === "claimed" && mission.claimed_by_contractor_id) {
      setSelectedContractor(mission.claimed_by_contractor_id);
    }
  }, [mission?.status, mission?.claimed_by_contractor_id]);

  const releaseClaim = useCallback(async () => {
    setReleasingClaim(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: rpcError } = await sb.rpc("admin_release_mission_claim", { p_mission_request_id: id });
      if (rpcError) throw rpcError;
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to release claim");
    } finally {
      setReleasingClaim(false);
    }
  }, [id, load]);

  const advanceStatus = useCallback(async () => {
    if (!mission) return;
    const next = nextPipelineStatus(mission.status);
    if (!next) return;
    setAdvancing(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: updateError } = await sb
        .from("mission_requests")
        .update({ status: next })
        .eq("id", id);
      if (updateError) throw updateError;

      // Booking-confirmation email — there's no dedicated "confirm booking"
      // action in this app, so 'approved' on the generic pipeline is the
      // closest real signal. Best-effort: a notification failure shouldn't
      // block the status change that already succeeded.
      if (next === "approved" || next === "delivered") {
        const { data: session } = await sb.auth.getSession();
        if (session.session) {
          const endpoint = next === "approved" ? "/api/notify/booking-confirmed" : "/api/notify/deliverable-ready";
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
            body: JSON.stringify({ missionRequestId: id }),
          }).catch((e) => console.error(`${endpoint} notify failed:`, e));
        }
      }

      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to update status");
    } finally {
      setAdvancing(false);
    }
  }, [mission, id, load]);

  // Also doubles as "Retry Payout" — /api/admin/complete-mission is
  // re-callable by design: if the assignment is already qc_passed/paid with
  // a captured-but-untransferred payment, it skips straight to retrying the
  // transfer instead of re-running the completion RPC.
  const markComplete = useCallback(async (assignmentId: string) => {
    setCompleting(assignmentId);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: session } = await sb.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");
      const res = await fetch("/api/admin/complete-mission", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to mark mission complete");
      if (data.transferError) {
        setError(`Mission marked complete, but payout failed: ${data.transferError}`);
      }
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to mark mission complete");
    } finally {
      setCompleting(null);
    }
  }, [load]);

  const requestPayment = useCallback(async (assignmentId: string) => {
    setRequestingPayment(assignmentId);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: session } = await sb.auth.getSession();
      if (!session.session) throw new Error("Not authenticated");
      const res = await fetch("/api/notify/payment-requested", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send payment request");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to send payment request");
    } finally {
      setRequestingPayment(null);
    }
  }, [load]);

  const offerToContractor = useCallback(async () => {
    if (!selectedContractor) return;
    setOffering(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: rpcError } = await sb.rpc("admin_offer_mission", {
        p_mission_request_id: id,
        p_contractor_id: selectedContractor,
        p_scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      if (rpcError) throw rpcError;

      // Best-effort: a notification failure shouldn't undo the offer that
      // already succeeded.
      const { data: session } = await sb.auth.getSession();
      if (session.session) {
        fetch("/api/notify/mission-available", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
          body: JSON.stringify({ missionRequestId: id, contractorId: selectedContractor }),
        }).catch((e) => console.error("mission-available notify failed:", e));
      }

      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to offer mission");
    } finally {
      setOffering(false);
    }
  }, [id, selectedContractor, scheduledFor, load]);

  const uploadDeliverable = useCallback(async (file: File) => {
    if (!job || !newDeliverableName.trim()) return;
    setUploadingDeliverable(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const path = `${job.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await sb.storage.from("mission-deliverables").upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await sb.from("deliverables").insert({
        job_id: job.id,
        name: newDeliverableName.trim(),
        type: newDeliverableType,
        storage_url: path,
      });
      if (insertError) throw insertError;

      setNewDeliverableName("");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to upload deliverable");
    } finally {
      setUploadingDeliverable(false);
    }
  }, [job, newDeliverableName, newDeliverableType, load]);

  const toggleQcPassed = useCallback(async (deliverableId: string, next: boolean) => {
    setTogglingQc(deliverableId);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const patch: Record<string, unknown> = { qc_passed: next };
      if (next) patch.delivered_at = new Date().toISOString();
      const { error: updateError } = await sb.from("deliverables").update(patch).eq("id", deliverableId);
      if (updateError) throw updateError;
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to update deliverable");
    } finally {
      setTogglingQc(null);
    }
  }, [load]);

  const downloadDeliverable = useCallback(async (storageUrl: string) => {
    try {
      const sb = getSupabaseBrowser();
      const { data, error: signError } = await sb.storage.from("mission-deliverables").createSignedUrl(storageUrl, 300);
      if (signError || !data) throw signError ?? new Error("Could not create download link");
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      setError(e.message ?? "Failed to generate download link");
    }
  }, []);

  const setDeliveryResponsibility = useCallback(async (value: string) => {
    if (!job) return;
    const sb = getSupabaseBrowser();
    const { error: updateError } = await sb.from("jobs").update({ delivery_responsibility: value }).eq("id", job.id);
    if (updateError) { setError(updateError.message); return; }
    await load();
  }, [job, load]);

  if (!authed) return null;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => router.push("/admin/missions")} style={btnGhost}>
          ← Back to Missions
        </button>
        <button onClick={() => router.push(`/admin/missions/${id}/briefing`)} style={btnGhost}>
          Mission Briefing →
        </button>
      </div>

      {loading && <p style={{ color: V.inkDim }}>Loading…</p>}

      {!loading && !mission && (
        <div style={panel}>
          <p style={{ color: V.inkDim }}>Mission not found.</p>
        </div>
      )}

      {!loading && mission && (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 className="font-saira" style={{ fontSize: 24, fontWeight: 700 }}>
                  {mission.company ?? mission.requester_name ?? "Unnamed"}
                </h1>
                <p style={{ color: V.inkDim, fontSize: 14, marginTop: 4 }}>
                  {(mission.service_type ?? "").replace(/_/g, " ")} · {mission.location ?? "No location"}
                </p>
              </div>
              <span className="font-mono-ibm" style={{
                fontSize: 11, letterSpacing: ".06em", padding: "5px 11px", borderRadius: 20,
                background: "rgba(124,58,237,.14)", color: "#7C3AED", textTransform: "uppercase",
              }}>
                {mission.status.replace("_", " ")}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: V.lineSoft, borderRadius: 10, overflow: "hidden", marginTop: 16 }}>
              <Readout k="Requester" v={mission.requester_email ?? "—"} />
              <Readout k="Airspace" v={mission.airspace_class ? `Class ${mission.airspace_class}` : "—"} />
              <Readout k="Quoted" v={mission.quoted_amount_cents ? `$${(mission.quoted_amount_cents / 100).toFixed(2)}` : "—"} color={V.telemetry} />
            </div>
            {mission.scope && (
              <p style={{ color: V.inkDim, fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>{mission.scope}</p>
            )}
            {requestedPilotName && (
              <p style={{ color: V.telemetry, fontSize: 13, marginTop: 10 }}>
                ★ Client requested {requestedPilotName} by name from their public profile — consider honoring this when offering the mission.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.line}` }}>
              <button onClick={beginMissionEdit} style={btnPrimary}>Edit Mission</button>
              {mission.status !== "cancelled" && mission.status !== "closed" && (
                <button onClick={cancelMission} disabled={savingMission} style={{ ...btnGhost, borderColor: V.warn, color: V.warn }}>
                  {savingMission ? "Cancelling…" : "Cancel / Archive"}
                </button>
              )}
              <button onClick={deleteMission} disabled={deletingMission} style={{ ...btnGhost, borderColor: V.danger, color: V.danger, marginLeft: "auto" }}>
                {deletingMission ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>

          {editingMission && (
            <div style={{ ...panel, borderColor: V.signal }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <Label>Edit Mission</Label>
                <button onClick={() => setEditingMission(false)} style={btnGhost}>Close</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
                <EditField label="Mission title" value={missionDraft.title} onChange={(v) => setMissionDraft((d) => ({ ...d, title: v }))} />
                <div>
                  <label style={{ fontSize: 12, color: V.inkDim }}>Mission type</label>
                  <select value={missionDraft.serviceType} onChange={(e) => setMissionDraft((d) => ({ ...d, serviceType: e.target.value }))} style={inputStyle}>
                    {SERVICE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <EditField label="Client name" value={missionDraft.requesterName} onChange={(v) => setMissionDraft((d) => ({ ...d, requesterName: v }))} />
                <EditField label="Client email" type="email" value={missionDraft.requesterEmail} onChange={(v) => setMissionDraft((d) => ({ ...d, requesterEmail: v }))} />
                <EditField label="Company" value={missionDraft.company} onChange={(v) => setMissionDraft((d) => ({ ...d, company: v }))} />
                <EditField label="Location" value={missionDraft.location} onChange={(v) => setMissionDraft((d) => ({ ...d, location: v }))} />
                <EditField label="Quoted total ($)" type="number" value={missionDraft.quotedAmount} onChange={(v) => setMissionDraft((d) => ({ ...d, quotedAmount: v }))} />
                <EditField label="Scheduled date/time" type="datetime-local" value={missionDraft.scheduledFor} onChange={(v) => setMissionDraft((d) => ({ ...d, scheduledFor: v }))} />
                <div>
                  <label style={{ fontSize: 12, color: V.inkDim }}>Status</label>
                  <select value={missionDraft.status} onChange={(e) => setMissionDraft((d) => ({ ...d, status: e.target.value }))} style={inputStyle}>
                    {[...PIPELINE, "cancelled"].map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, color: V.inkDim }}>Scope and mission instructions</label>
                  <textarea value={missionDraft.scope} onChange={(e) => setMissionDraft((d) => ({ ...d, scope: e.target.value }))} style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} />
                </div>
              </div>
              <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 10 }}>
                Changing a quoted total updates the mission record. Existing payment and completed payout records are never rewritten.
              </p>
              <button onClick={() => saveMission()} disabled={savingMission} style={{ ...btnPrimary, marginTop: 14 }}>
                {savingMission ? "Saving…" : "Save Mission Changes"}
              </button>
            </div>
          )}

          <div style={panel}>
            <Label>Mission Pipeline</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {PIPELINE.map((stage, i) => {
                const currentIdx = PIPELINE.indexOf(mission.status as (typeof PIPELINE)[number]);
                const isCurrent = stage === mission.status;
                const isDone = currentIdx !== -1 && i < currentIdx;
                return (
                  <span
                    key={stage}
                    title={PIPELINE_DEFINITIONS[stage]}
                    aria-label={`${stage.replace(/_/g, " ")}: ${PIPELINE_DEFINITIONS[stage]}`}
                    className="font-mono-ibm"
                    style={{
                      fontSize: 10, letterSpacing: ".04em", padding: "5px 10px", borderRadius: 6,
                      textTransform: "uppercase",
                      background: isCurrent ? "rgba(244,90,30,.14)" : isDone ? "rgba(22,163,74,.10)" : "transparent",
                      color: isCurrent ? V.signal : isDone ? V.telemetry : V.inkFaint,
                      border: `1px solid ${isCurrent ? V.signal : V.line}`,
                      cursor: "help",
                    }}
                  >
                    {stage.replace("_", " ")}
                  </span>
                );
              })}
            </div>

            {PIPELINE.indexOf(mission.status as (typeof PIPELINE)[number]) === -1 && (
              <p style={{ color: V.inkDim, fontSize: 13, marginTop: 12 }}>
                Current status "{mission.status}" is outside the standard pipeline (e.g. cancelled) —
                advance isn't available here.
              </p>
            )}

            {nextPipelineStatus(mission.status) && (
              <button onClick={advanceStatus} disabled={advancing} style={{ ...btnPrimary, marginTop: 14 }}>
                {advancing ? "Updating…" : `Advance to ${nextPipelineStatus(mission.status)!.replace("_", " ")} →`}
              </button>
            )}
          </div>

          {quote && (
            <div style={panel}>
              <Label>Quote Breakdown</Label>
              <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 13 }}>
                <ModRow label="Base price" value={`$${(quote.base_price_cents / 100).toFixed(2)}`} />
                <ModRow label={`Location × ${quote.location_mod}`} />
                <ModRow label={`Airspace × ${quote.airspace_mod}`} />
                <ModRow label={`Complexity × ${quote.complexity_mod}`} />
                <ModRow label={`Urgency × ${quote.urgency_mod}`} />
                <ModRow label={`Deliverable × ${quote.deliverable_mod}`} />
                <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 8, marginTop: 4 }}>
                  <ModRow label="Total" value={`$${(quote.total_cents / 100).toFixed(2)}`} accent />
                  <ModRow label="DOM commission (estimated)" value={`$${(quote.commission_cents / 100).toFixed(2)}`} />
                  <ModRow label="Contractor payout (estimated)" value={`$${(quote.contractor_cents / 100).toFixed(2)}`} />
                </div>
                <p style={{ color: V.inkFaint, fontSize: 11, marginTop: 4 }}>
                  Estimated at the flat intake rate before a pilot is assigned. The real split
                  depends on the assigned pilot's tier — see Job & Assignments once offered.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div style={{ ...panel, borderColor: "#DC2626" }}>
              <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>
            </div>
          )}

          {!job && (
            <div style={panel}>
              <Label>Offer to Contractor</Label>
              {mission.status === "claimed" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 10, padding: 12, borderRadius: 8, background: "rgba(244,90,30,.08)", border: `1px solid ${V.signal}` }}>
                  <p style={{ color: V.signal, fontSize: 13, margin: 0 }}>
                    {contractors.find((c) => c.id === mission.claimed_by_contractor_id)?.full_name ?? "A pilot"} requested this from the open queue — pre-selected below.
                  </p>
                  <button onClick={releaseClaim} disabled={releasingClaim} style={btnGhost}>
                    {releasingClaim ? "…" : "Release back to queue"}
                  </button>
                </div>
              )}
              {contractors.length === 0 ? (
                <p style={{ color: V.inkDim, fontSize: 13, marginTop: 10 }}>
                  No active contractors available. Verify and activate contractors in{" "}
                  <a href="/admin/contractors" style={{ color: V.signal }}>Admin &gt; Contractors</a> first.
                </p>
              ) : (
                <>
                  <select
                    value={selectedContractor}
                    onChange={(e) => setSelectedContractor(e.target.value)}
                    style={{ ...inputStyle, marginTop: 10 }}
                  >
                    <option value="">Select a contractor…</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} {c.service_area ? `(${c.service_area})` : ""} — {c.missions_completed} missions{c.rating ? `, ${c.rating}★` : ""}
                        {contractorTierBps[c.id] != null && ` — ${contractorTierBps[c.id] / 100}% tier`}
                      </option>
                    ))}
                  </select>
                  <label style={{ fontSize: 12, color: V.inkDim, marginTop: 12, display: "block" }}>
                    Scheduled date (optional)
                  </label>
                  <input
                    type="date"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    style={inputStyle}
                  />
                  <button
                    onClick={offerToContractor}
                    disabled={!selectedContractor || offering}
                    style={{ ...btnPrimary, marginTop: 14 }}
                  >
                    {offering ? "Offering…" : "Offer Mission →"}
                  </button>
                </>
              )}
            </div>
          )}

          {job && (
            <div style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Label>Job & Assignments</Label>
                <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint }}>
                  {job.title}
                  {job.scheduled_for ? ` · ${new Date(job.scheduled_for).toLocaleDateString()}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: V.inkDim }}>Delivered by:</span>
                {(["admin", "pilot"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDeliveryResponsibility(v)}
                    style={{
                      fontFamily: "Saira, sans-serif", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${job.delivery_responsibility === v ? V.signal : V.line}`,
                      background: job.delivery_responsibility === v ? "rgba(244,90,30,.12)" : "transparent",
                      color: job.delivery_responsibility === v ? V.signal : V.inkFaint,
                    }}
                  >
                    {v === "admin" ? "Admin" : "Pilot"}
                  </button>
                ))}
                <span style={{ color: V.inkFaint, fontSize: 11 }}>— both can always view/upload; this is just who's expected to finalize delivery.</span>
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {assignments.map((a) => {
                  const payment = payments.find((p) => p.assignment_id === a.id);
                  const hasActivePayment = !!payment && payment.status !== "failed";
                  const canRequestPayment = a.status === "accepted" && !hasActivePayment;
                  const canRetryPayout = payment?.status === "captured" && !payment.stripe_transfer_id;
                  const completedUnpaid =
                    a.status === "qc_passed" &&
                    (!payment || (payment.status !== "captured" && payment.status !== "paid_out"));
                  const paymentLabel =
                    payment?.status === "captured" ? "Collected"
                    : payment?.status === "paid_out" ? "Paid Out"
                    : payment?.status === "pending" ? "Pending"
                    : payment?.status === "failed" ? "Failed"
                    : payment?.status === "refunded" ? "Refunded"
                    : payment?.status ?? null;

                  return (
                    <div key={a.id} style={{ ...panel, padding: 14, background: V.raised }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 600 }}>{a.contractor?.full_name ?? a.contractor_id}</span>
                        <span className="font-mono-ibm" style={{
                          fontSize: 10, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase",
                          background: a.status === "declined" ? "rgba(95,107,122,.15)" : a.status === "qc_passed" ? "rgba(22,163,74,.2)" : "rgba(22,163,74,.14)",
                          color: a.status === "declined" ? V.inkFaint : V.telemetry,
                        }}>
                          {a.status === "qc_passed" ? "completed" : a.status}
                        </span>
                      </div>
                      {a.mission_price_cents != null && (
                        <p className="font-mono-ibm" style={{ fontSize: 12, color: V.inkDim, marginTop: 6 }}>
                          ${(a.mission_price_cents / 100).toFixed(2)} total · ${((a.contractor_payout_cents ?? 0) / 100).toFixed(2)} payout
                          {a.commission_bps_applied != null && ` · ${a.commission_bps_applied / 100}% commission (actual)`}
                        </p>
                      )}
                      {paymentLabel && (
                        <p className="font-mono-ibm" style={{ fontSize: 12, color: payment?.status === "paid_out" ? V.telemetry : V.inkDim, marginTop: 4 }}>
                          Payment: {paymentLabel}
                          {payment?.transfer_error && ` — ${payment.transfer_error}`}
                        </p>
                      )}
                      {completedUnpaid && (
                        <p style={{ color: V.signal, fontSize: 12, marginTop: 4 }}>
                          ⚠ Completed with no payment collected — no transfer attempted.
                        </p>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                        {canRequestPayment && (
                          <button
                            onClick={() => requestPayment(a.id)}
                            disabled={requestingPayment === a.id}
                            style={{ ...btnGhost, padding: "7px 14px", fontSize: 13 }}
                          >
                            {requestingPayment === a.id ? "Sending…" : "Send Payment Request"}
                          </button>
                        )}
                        {a.status === "accepted" && (
                          <button
                            onClick={() => markComplete(a.id)}
                            disabled={completing === a.id}
                            style={{ ...btnPrimary, padding: "7px 14px", fontSize: 13 }}
                          >
                            {completing === a.id ? "Marking…" : "Mark Mission Complete"}
                          </button>
                        )}
                        {canRetryPayout && (
                          <button
                            onClick={() => markComplete(a.id)}
                            disabled={completing === a.id}
                            style={{ ...btnPrimary, padding: "7px 14px", fontSize: 13 }}
                          >
                            {completing === a.id ? "Retrying…" : "Retry Payout"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {assignments.every((a) => a.status === "declined") && (
                <p style={{ color: V.inkDim, fontSize: 13, marginTop: 12 }}>
                  All offers declined. Re-offering to a different contractor isn't wired up in this UI yet —
                  use the Supabase dashboard to insert a new mission_assignments row for now.
                </p>
              )}
            </div>
          )}

          {job && (
            <div style={panel}>
              <Label>Deliverables</Label>
              <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 6 }}>
                Only QC-passed deliverables are visible to the client at their deliverables link.
              </p>

              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {deliverables.length === 0 && (
                  <p style={{ color: V.inkDim, fontSize: 13 }}>No deliverables uploaded yet.</p>
                )}
                {deliverables.map((d) => (
                  <div key={d.id} style={{ ...panel, padding: 14, background: V.raised }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{d.name}</span>
                        <span style={{ color: V.inkFaint, fontSize: 12, marginLeft: 8 }}>{(d.type ?? "").replace(/_/g, " ")}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="font-mono-ibm" style={{
                          fontSize: 10, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase",
                          background: d.qc_passed ? "rgba(22,163,74,.2)" : "rgba(244,90,30,.14)",
                          color: d.qc_passed ? V.telemetry : V.signal,
                        }}>
                          {d.qc_passed ? "QC passed" : "pending QC"}
                        </span>
                        {d.storage_url && (
                          <button onClick={() => downloadDeliverable(d.storage_url!)} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>
                            Download
                          </button>
                        )}
                        {!d.qc_passed && (
                          <button
                            onClick={() => toggleQcPassed(d.id, true)}
                            disabled={togglingQc === d.id}
                            style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}
                          >
                            {togglingQc === d.id ? "…" : "Mark QC Passed"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  placeholder="Deliverable name"
                  value={newDeliverableName}
                  onChange={(e) => setNewDeliverableName(e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, width: 200 }}
                />
                <select
                  value={newDeliverableType}
                  onChange={(e) => setNewDeliverableType(e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, width: 160 }}
                >
                  {DELIVERABLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <label style={{ ...btnGhost, display: "inline-block", opacity: newDeliverableName.trim() ? 1 : 0.5 }}>
                  {uploadingDeliverable ? "Uploading…" : "Choose file & upload"}
                  <input
                    type="file"
                    style={{ display: "none" }}
                    disabled={!newDeliverableName.trim() || uploadingDeliverable}
                    onChange={(e) => e.target.files?.[0] && uploadDeliverable(e.target.files[0])}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: V.signal }}>{children}</div>;
}

function Readout({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ background: V.raised, padding: "10px 14px" }}>
      <div className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".12em", color: V.inkFaint, textTransform: "uppercase" }}>{k}</div>
      <div className="font-mono-ibm" style={{ fontSize: 13, color: color ?? V.ink, marginTop: 2, fontWeight: 500 }}>{v}</div>
    </div>
  );
}

function ModRow({ label, value, accent }: { label: string; value?: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: accent ? V.signal : V.inkDim }}>
      <span>{label}</span>
      {value && <span className="font-mono-ibm" style={{ fontWeight: 500, color: accent ? V.signal : V.ink }}>{value}</span>}
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: V.inkDim }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

const panel: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: V.signal, color: "#FFFFFF", fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 10, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9, border: `1px solid ${V.line}`, background: "#FFFFFF", color: V.ink, fontSize: 14, outline: "none" };
