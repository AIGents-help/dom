"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Admin > Mission detail — view a mission's quote/airspace, advance its status
// through the mission lifecycle, and offer it to a contractor.

const PIPELINE = [
  "requested", "reviewing", "scoped", "quoted", "approved",
  "assigned", "in_progress", "delivered", "closed",
] as const;

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
  contractor?: { full_name: string } | null;
}

interface Deliverable {
  id: string;
  name: string;
  type: string | null;
  storage_url: string | null;
  qc_passed: boolean | null;
  delivered_at: string | null;
}

const DELIVERABLE_TYPES = ["orthomosaic", "3d_model", "point_cloud", "report", "raw_images", "video", "other"];

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
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [selectedContractor, setSelectedContractor] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [offering, setOffering] = useState(false);
  const [releasingClaim, setReleasingClaim] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [newDeliverableName, setNewDeliverableName] = useState("");
  const [newDeliverableType, setNewDeliverableType] = useState(DELIVERABLE_TYPES[0]);
  const [uploadingDeliverable, setUploadingDeliverable] = useState(false);
  const [togglingQc, setTogglingQc] = useState<string | null>(null);

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
        .select("id, contractor_id, status, offered_at, accepted_at, mission_price_cents, contractor_payout_cents, dom_commission_cents, contractor:contractors(full_name)")
        .eq("job_id", jobRow.id)
        .order("offered_at", { ascending: false });
      setAssignments((assigns as any) ?? []);

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

  const markComplete = useCallback(async (assignmentId: string) => {
    setCompleting(assignmentId);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: rpcError } = await sb.rpc("admin_mark_mission_complete", {
        p_assignment_id: assignmentId,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to mark mission complete");
    } finally {
      setCompleting(null);
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
                background: "rgba(196,107,224,.14)", color: "#C46BE0", textTransform: "uppercase",
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
          </div>

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
                    className="font-mono-ibm"
                    style={{
                      fontSize: 10, letterSpacing: ".04em", padding: "5px 10px", borderRadius: 6,
                      textTransform: "uppercase",
                      background: isCurrent ? "rgba(255,138,61,.14)" : isDone ? "rgba(79,209,197,.10)" : "transparent",
                      color: isCurrent ? V.signal : isDone ? V.telemetry : V.inkFaint,
                      border: `1px solid ${isCurrent ? V.signal : V.line}`,
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
                  <ModRow label="DOM commission" value={`$${(quote.commission_cents / 100).toFixed(2)}`} />
                  <ModRow label="Contractor payout" value={`$${(quote.contractor_cents / 100).toFixed(2)}`} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ ...panel, borderColor: "#FF8A3D" }}>
              <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>
            </div>
          )}

          {!job && (
            <div style={panel}>
              <Label>Offer to Contractor</Label>
              {mission.status === "claimed" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 10, padding: 12, borderRadius: 8, background: "rgba(255,138,61,.08)", border: `1px solid ${V.signal}` }}>
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
                      background: job.delivery_responsibility === v ? "rgba(255,138,61,.12)" : "transparent",
                      color: job.delivery_responsibility === v ? V.signal : V.inkFaint,
                    }}
                  >
                    {v === "admin" ? "Admin" : "Pilot"}
                  </button>
                ))}
                <span style={{ color: V.inkFaint, fontSize: 11 }}>— both can always view/upload; this is just who's expected to finalize delivery.</span>
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {assignments.map((a) => (
                  <div key={a.id} style={{ ...panel, padding: 14, background: V.raised }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600 }}>{a.contractor?.full_name ?? a.contractor_id}</span>
                      <span className="font-mono-ibm" style={{
                        fontSize: 10, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase",
                        background: a.status === "declined" ? "rgba(90,102,120,.15)" : a.status === "qc_passed" ? "rgba(79,209,197,.2)" : "rgba(79,209,197,.14)",
                        color: a.status === "declined" ? V.inkFaint : V.telemetry,
                      }}>
                        {a.status === "qc_passed" ? "completed" : a.status}
                      </span>
                    </div>
                    {a.mission_price_cents != null && (
                      <p className="font-mono-ibm" style={{ fontSize: 12, color: V.inkDim, marginTop: 6 }}>
                        ${(a.mission_price_cents / 100).toFixed(2)} total · ${((a.contractor_payout_cents ?? 0) / 100).toFixed(2)} payout
                      </p>
                    )}
                    {a.status === "accepted" && (
                      <button
                        onClick={() => markComplete(a.id)}
                        disabled={completing === a.id}
                        style={{ ...btnPrimary, marginTop: 12, padding: "7px 14px", fontSize: 13 }}
                      >
                        {completing === a.id ? "Marking…" : "Mark Mission Complete"}
                      </button>
                    )}
                  </div>
                ))}
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
                          background: d.qc_passed ? "rgba(79,209,197,.2)" : "rgba(255,138,61,.14)",
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

const V = {
  ground: "#0A0E14", surface: "#11161F", raised: "#161D29",
  line: "#232C3B", lineSoft: "#1A222F",
  ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678",
  signal: "#FF8A3D", telemetry: "#4FD1C5",
};
const panel: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 10, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 14, outline: "none" };
