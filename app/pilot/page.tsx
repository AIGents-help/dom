"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import PilotCreateMissionWizard from "@/components/PilotCreateMissionWizard";
import PilotMissionLog from "@/components/PilotMissionLog";
import PilotSidebar, { type PilotTab } from "@/components/PilotSidebar";
import PilotProfileEditor from "@/components/PilotProfileEditor";
import PilotPublicProfileEditor from "@/components/PilotPublicProfileEditor";
import PilotResources, { type Tutorial } from "@/components/PilotResources";
import PilotQueue from "@/components/PilotQueue";
import VerificationDeadlineBanner from "@/components/VerificationDeadlineBanner";
import SopViewer from "@/components/SopViewer";
import { sopMarkdownToHtml } from "@/lib/sopMarkdown";
import MappingTab from "@/components/mapper/MappingTab";
import { V } from "@/lib/theme";
import { googleMapsPlaceUrl } from "@/lib/googleMaps";
import MissionMapThumbnail from "@/components/MissionMapThumbnail";
import PilotCRM from "@/components/PilotCRM";
import PilotSupportCenter from "@/components/PilotSupportCenter";

interface Profile {
  id: string; full_name: string; email: string; phone: string | null; status: string;
  part107_number: string | null; part107_verified: boolean;
  insurance_verified: boolean; insurance_requested: boolean; stripe_payouts_enabled: boolean;
  insurance_provider: string | null; insurance_policy_number: string | null; insurance_expires_on: string | null;
  insurance_liability_cents: number | null; insurance_coi_path: string | null; dom_gig_insurance_eligible: boolean;
  stripe_connect_account_id: string | null;
  service_area: string | null; home_address: string | null; equipment: string | null;
  missions_completed: number; rating: number | null;
  can_create_missions: boolean; subscription_active: boolean;
  slug: string | null; bio: string | null; tagline: string | null;
  photo_url: string | null; website_url: string | null; profile_published: boolean;
  cert_timeline_bucket: string | null; membership_deadline: string | null;
  resource_access_locked: boolean; resource_access_active: boolean;
  current_commission_bps: number | null;
}
interface PortfolioImage { id: string; image_url: string; caption: string | null; sort_order: number; }
interface RequestedForMe { id: string; requester_name: string | null; company: string | null; service_type: string | null; location: string | null; status: string; created_at: string; }
interface Assignment {
  id: string; status: string; mission_price_cents: number | null;
  contractor_payout_cents: number | null; offered_at: string;
  accepted_at: string | null; submitted_at: string | null;
  operational_notes: string | null;
  site_access_notes: string | null; cautions_awareness: string | null; client_communications: string | null;
  assigned_uav: string | null;
  mission_insurance_verified: boolean;
  mission_checklist_items: Array<{ id: string; required: boolean; completed: boolean }>;
  job: { id: string; title: string; service_type: string; location: string; scheduled_for: string | null; status: string; mission_request_id: string; delivery_responsibility: string; mission_request: { requester_name: string | null; requester_email: string | null; company: string | null; scope: string | null; airspace_class: string | null } | null } | null;
}
interface Payout { id: string; contractor_amount_cents: number; status: string; created_at: string; }
interface SOP { id: string; slug: string; title: string; mission_type: string; category: string; version: number; body_md: string; }
interface QueueClaim {
  id: string; service_type: string | null; status: string; created_at: string;
  scheduled_date: string | null; airspace_class: string | null;
  area?: { lat_grid: number; lng_grid: number } | null; payout_cents?: number | null;
}
type Tab = PilotTab;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  offered: { bg: "rgba(229,112,31,.07)", text: "#B45309", border: "#E5701F" },
  accepted: { bg: "rgba(14,165,233,.07)", text: "#0369A1", border: "#0EA5E9" },
  scheduled: { bg: "rgba(13,148,136,.08)", text: "#0F766E", border: "#0D9488" },
  in_progress: { bg: "rgba(37,99,235,.07)", text: "#1D4ED8", border: "#2563EB" },
  submitted: { bg: "rgba(124,58,237,.07)", text: "#6D28D9", border: "#7C3AED" },
  qc_passed: { bg: "rgba(22,163,74,.08)", text: "#15803D", border: "#16A34A" },
  paid: { bg: "rgba(22,163,74,.1)", text: "#15803D", border: "#16A34A" },
  declined: { bg: "rgba(95,107,122,.07)", text: "#475569", border: "#64748B" },
  cancelled: { bg: "rgba(220,38,38,.055)", text: "#B91C1C", border: "#DC2626" },
};
const PILOT_LEGEND = [["Offered", "#E5701F"], ["Accepted", "#0EA5E9"], ["Scheduled", "#0D9488"], ["In progress", "#2563EB"], ["Submitted", "#7C3AED"], ["Completed / paid", "#16A34A"], ["Declined", "#64748B"], ["Cancelled", "#DC2626"]] as const;
const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };

export default function PilotDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [sops, setSops] = useState<SOP[]>([]);
  const [tab, setTab] = useState<Tab>("missions");
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [subActionLoading, setSubActionLoading] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioImage[]>([]);
  const [requestsForMe, setRequestsForMe] = useState<RequestedForMe[]>([]);
  const [myClaims, setMyClaims] = useState<QueueClaim[]>([]);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [resourcesLocked, setResourcesLocked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [missionLogAssignment, setMissionLogAssignment] = useState<Assignment | null>(null);
  const [expandedSop, setExpandedSop] = useState<string | null>(null);
  const [sopMissionServiceType, setSopMissionServiceType] = useState<string | null>(null);
  const [missionSort, setMissionSort] = useState("action");
  const [missionFilter, setMissionFilter] = useState("all");

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      router.push("/pilot/login");
      return;
    }
    setAccessToken(data.session.access_token);
    setUserId(data.session.user.id);

    const res = await fetch("/api/pilot/me", {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (!res.ok) {
      router.push("/pilot/login");
      return;
    }
    const body = await res.json();
    setProfile(body.profile);
    setPortfolio(body.portfolio ?? []);
    setRequestsForMe(body.requestsForMe ?? []);
    setAssignments(body.assignments ?? []);
    setPayouts(body.payouts ?? []);
    setSops(body.sops ?? []);
    setMyClaims(body.myClaims ?? []);
    setTutorials(body.tutorials ?? []);
    setResourcesLocked(!!body.resourcesLocked);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = useCallback(async (assignmentId: string, action: "accept" | "decline") => {
    setActingOn(assignmentId);
    setError(null);
    try {
      if (!accessToken) throw new Error("Not authenticated");
      const res = await fetch(`/api/pilot/missions/${assignmentId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to respond to assignment");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to respond to assignment");
    } finally {
      setActingOn(null);
    }
  }, [accessToken, load]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    router.push("/");
  }

  async function startSubscription() {
    if (!accessToken) return;
    setSubActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/subscription/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setSubActionLoading(false);
    }
  }

  async function manageSubscription() {
    if (!accessToken) return;
    setSubActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/subscription/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open billing portal");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setSubActionLoading(false);
    }
  }

  async function connectStripe() {
    if (!accessToken) return;
    setSubActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/connect/onboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start Stripe onboarding");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setSubActionLoading(false);
    }
  }

  async function requestInsurance() {
    if (!accessToken) return;
    window.open("https://www.skywatch.ai", "_blank");
    setSubActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/insurance/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record insurance request");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubActionLoading(false);
    }
  }

  function missionTypeForService(serviceType: string | null | undefined): string {
    if (!serviceType) return "general";
    if (serviceType === "roof_inspection_residential" || serviceType === "roof_inspection_commercial") return "roof_inspection";
    const known = ["construction_progress", "thermal_inspection", "ortho_survey", "powerline_inspection", "real_estate_media"];
    return known.includes(serviceType) ? serviceType : "general";
  }

  function sopsFor(serviceType: string | null | undefined): SOP[] {
    const mt = missionTypeForService(serviceType);
    return sops.filter((s) => s.mission_type === mt);
  }

  function printSop(sop: SOP) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>${sop.title}</title><style>
      body { font-family: Georgia, serif; color: #1a1a1a; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
      h1 { font-size: 22px; margin-bottom: 2px; }
      h2 { font-size: 14px; letter-spacing: .06em; text-transform: uppercase; color: #444; margin-top: 24px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
      ul.check-list { list-style: none; padding: 0; }
      ul.check-list li { display: flex; gap: 8px; margin: 6px 0; font-size: 14px; }
      .box { flex-shrink: 0; }
      .gate { margin-top: 16px; padding: 10px 12px; border: 1px solid #999; background: #f5f5f5; font-size: 13px; }
      p { font-size: 14px; }
      @media print { body { margin: 0 auto; } }
    </style></head><body>
      <h1>${sop.title}</h1>
      <div class="meta">${sop.mission_type.replace(/_/g, " ")} · ${sop.category} · v${sop.version}</div>
      ${sopMarkdownToHtml(sop.body_md)}
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  if (loading) return <Shell><p style={{ color: V.inkDim }}>Loading your dashboard…</p></Shell>;
  if (!profile) return <Shell><p style={{ color: V.danger }}>Could not load profile.</p></Shell>;

  const cleared = profile.part107_verified && profile.insurance_verified;
  const activeAssignments = assignments.filter((a) => !["paid", "cancelled"].includes(a.status));
  const sortedAssignments = assignments.filter((a) => {
    if (missionFilter === "action") return ["offered", "accepted", "scheduled", "in_progress", "submitted"].includes(a.status);
    if (missionFilter === "complete") return ["qc_passed", "paid"].includes(a.status);
    if (missionFilter === "inactive") return ["declined", "cancelled"].includes(a.status);
    return true;
  }).sort((a, b) => {
    const aj = Array.isArray(a.job) ? a.job[0] : a.job;
    const bj = Array.isArray(b.job) ? b.job[0] : b.job;
    if (missionSort === "scheduled") return (aj?.scheduled_for ? new Date(aj.scheduled_for).getTime() : Number.MAX_SAFE_INTEGER) - (bj?.scheduled_for ? new Date(bj.scheduled_for).getTime() : Number.MAX_SAFE_INTEGER);
    if (missionSort === "payout") return (b.contractor_payout_cents ?? 0) - (a.contractor_payout_cents ?? 0);
    if (missionSort === "newest") return new Date(b.offered_at).getTime() - new Date(a.offered_at).getTime();
    const priority: Record<string, number> = { offered: 0, accepted: 1, scheduled: 2, in_progress: 3, submitted: 4, qc_passed: 5, paid: 6, declined: 7, cancelled: 8 };
    return (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
  });
  const totalEarned = payouts.filter((p) => ["captured", "paid_out"].includes(p.status)).reduce((s, p) => s + p.contractor_amount_cents, 0);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <PilotSidebar tab={tab} setTab={setTab} onSignOut={signOut} />
      <main style={{ flex: 1, minWidth: 0 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="font-saira" style={{ fontSize: 26, fontWeight: 700 }}>{profile.full_name}</h1>
          <p style={{ color: V.inkDim, fontSize: 13 }}>{profile.email} · {profile.service_area ?? "No area set"}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <CredBadge label="Part 107" ok={profile.part107_verified} />
          <CredBadge label="Insurance" ok={profile.insurance_verified} />
          <CredBadge label="Payouts" ok={profile.stripe_payouts_enabled} />
        </div>
      </div>

      {!cleared && (
        <div style={{ ...panelStyle, borderColor: "rgba(229,112,31,.4)", marginBottom: 18, background: "rgba(229,112,31,.05)" }}>
          <p style={{ color: V.warn, fontSize: 14 }}>Your credentials are not fully verified yet. DOM verifies Part 107 and insurance before assigning paid missions.{!profile.stripe_payouts_enabled && " Complete Stripe payout setup to receive payments."}</p>
          {!profile.insurance_verified && (
            profile.insurance_requested ? (
              <p style={{ color: V.inkDim, fontSize: 13, marginTop: 10 }}>Insurance requested — pending confirmation.</p>
            ) : (
              <button onClick={requestInsurance} disabled={subActionLoading} style={{ ...btnGhost, marginTop: 10 }}>
                {subActionLoading ? "…" : "Request Insurance via SkyWatch →"}
              </button>
            )
          )}
        </div>
      )}

      {error && (
        <div style={{ ...panelStyle, borderColor: "#DC2626", marginBottom: 18 }}>
          <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: V.lineSoft, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <Stat k="Status" v={profile.status.toUpperCase()} color={profile.status === "active" ? V.telemetry : V.warn} />
        <Stat k="Active Missions" v={String(activeAssignments.length)} />
        <Stat k="Completed" v={String(profile.missions_completed)} />
        <Stat k="Earned" v={`$${(totalEarned / 100).toFixed(2)}`} color={V.telemetry} />
      </div>

      {accessToken && (
        <VerificationDeadlineBanner
          accessToken={accessToken}
          part107Verified={profile.part107_verified}
          membershipDeadline={profile.membership_deadline}
          resourcesLocked={resourcesLocked}
          resourceAccessActive={profile.resource_access_active}
          onGoToProfile={() => setTab("profile")}
        />
      )}

      {tab === "create" && accessToken && (
        <>
          {!profile.can_create_missions && (
            <div style={{ ...panelStyle, borderColor: "rgba(229,112,31,.4)", marginBottom: 18, background: "rgba(229,112,31,.05)" }}>
              <p style={{ color: V.warn, fontSize: 14 }}>
                You can build out a mission below to see how quoting and self-service works, but you can't finalize
                it yet — DOM admin needs to approve your account for self-service first, either after you complete
                a DOM-assigned mission or once your credentials are verified.
              </p>
            </div>
          )}
          <PilotCreateMissionWizard
            accessToken={accessToken}
            subscriptionActive={profile.subscription_active}
            canFinalize={profile.can_create_missions}
            homeAddress={profile.home_address}
            onCreated={load}
          />
        </>
      )}

      {tab === "missions" && missionLogAssignment && (() => {
        const j = Array.isArray(missionLogAssignment.job) ? missionLogAssignment.job[0] : missionLogAssignment.job;
        if (!j) return null;
        const mr = Array.isArray(j.mission_request) ? j.mission_request[0] : j.mission_request;
        return (
          <PilotMissionLog
            assignmentId={missionLogAssignment.id}
            assignmentStatus={missionLogAssignment.status}
            jobId={j.id}
            missionRequestId={j.mission_request_id}
            missionTitle={j.title}
            missionLocation={j.location}
            serviceType={j.service_type}
            clientName={mr?.requester_name ?? null}
            clientEmail={mr?.requester_email ?? null}
            clientCompany={mr?.company ?? null}
            clientRequests={mr?.scope ?? null}
            airspaceClass={mr?.airspace_class ?? null}
            scheduledFor={j.scheduled_for}
            operationalNotes={missionLogAssignment.operational_notes}
            siteAccessNotes={missionLogAssignment.site_access_notes}
            cautionsAwareness={missionLogAssignment.cautions_awareness}
            clientCommunications={missionLogAssignment.client_communications}
            assignedUav={missionLogAssignment.assigned_uav}
            profileEquipment={profile.equipment}
            deliveryResponsibility={j.delivery_responsibility}
            onClose={() => setMissionLogAssignment(null)}
            onGoToProfile={() => { setMissionLogAssignment(null); setTab("profile"); }}
            onSaved={load}
          />
        );
      })()}

      {tab === "missions" && !missionLogAssignment && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <label style={{ color: V.inkDim, fontSize: 12 }}>Show{" "}<select value={missionFilter} onChange={(e) => setMissionFilter(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface, color: V.ink }}><option value="all">All missions</option><option value="action">Active / action needed</option><option value="complete">Completed / paid</option><option value="inactive">Declined / cancelled</option></select></label>
            <label style={{ color: V.inkDim, fontSize: 12 }}>Sort{" "}<select value={missionSort} onChange={(e) => setMissionSort(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface, color: V.ink }}><option value="action">Action needed</option><option value="scheduled">Scheduled soonest</option><option value="newest">Newest offered</option><option value="payout">Highest payout</option></select></label>
          </div>
          {requestsForMe.length > 0 && (
            <div style={{ ...panelStyle, borderColor: "rgba(22,163,74,.4)", background: "rgba(22,163,74,.05)" }}>
              <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.telemetry, textTransform: "uppercase" }}>
                Requests for you ({requestsForMe.length})
              </div>
              <p style={{ color: V.inkDim, fontSize: 13, marginTop: 8 }}>
                Clients found your public profile and asked for you by name. DOM admin reviews and quotes these before
                they're assigned — nothing to do here yet.
              </p>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {requestsForMe.map((r) => (
                  <div key={r.id} style={{ fontSize: 13, color: V.ink, display: "flex", justifyContent: "space-between" }}>
                    <span>{r.company ?? r.requester_name ?? "Unnamed"} — {(r.service_type ?? "").replace(/_/g, " ")}</span>
                    <span className="font-mono-ibm" style={{ color: V.inkFaint, fontSize: 11 }}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {assignments.length === 0 && <div style={{ ...panelStyle, textAlign: "center", padding: 40 }}><p style={{ color: V.inkDim }}>No mission assignments yet.</p><p style={{ color: V.inkFaint, fontSize: 13, marginTop: 6 }}>{cleared ? "You're cleared — DOM will offer missions in your area." : "Complete credential verification to receive offers."}</p></div>}
          {assignments.length > 0 && sortedAssignments.length === 0 && <div style={{ ...panelStyle, textAlign: "center", padding: 28 }}><p style={{ color: V.inkDim }}>No missions match this filter.</p></div>}
          {sortedAssignments.map((a) => {
            const job = Array.isArray(a.job) ? a.job[0] : a.job;
            const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.offered;
            const incompleteRequired = a.mission_checklist_items?.filter((item) => item.required && !item.completed).length ?? 0;
            const readinessIncomplete = !!job?.scheduled_for && (!a.assigned_uav || !a.mission_insurance_verified || incompleteRequired > 0);
            return (
              <div key={a.id} style={{ ...panelStyle, borderColor: sc.border, borderLeftWidth: 6, background: `linear-gradient(90deg, ${sc.bg}, ${V.surface} 48%)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 13, alignItems: "center", minWidth: 0, flex: 1 }}>
                    {job?.location && <MissionMapThumbnail location={job.location} />}
                    <div style={{ minWidth: 0 }}>
                    <div className="font-saira" style={{ fontWeight: 600, fontSize: 16 }}>{job?.title ?? "Mission"} <span style={{ color: V.inkDim, fontWeight: 400, fontSize: 13 }}>— {(job?.service_type ?? "").replace(/_/g, " ")}</span></div>
                    <div style={{ color: V.inkFaint, fontSize: 13, marginTop: 3 }}>{job?.location ?? "—"}</div>
                    {job?.location && <a href={googleMapsPlaceUrl(job.location)} target="_blank" rel="noreferrer" style={{ display: "inline-block", color: V.signal, fontSize: 11, fontWeight: 600, marginTop: 5 }}>Google Maps ↗</a>}
                    {job?.scheduled_for && <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 4 }}>Scheduled: {new Date(job.scheduled_for).toLocaleDateString()}</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="font-mono-ibm" style={{ fontSize: 10, padding: "4px 9px", borderRadius: 20, background: sc.bg, color: sc.text, letterSpacing: ".06em", textTransform: "uppercase" }}>{a.status.replace("_", " ")}</span>
                    {readinessIncomplete && <div title="The date is set, but required readiness items remain incomplete" style={{ color: V.danger, fontSize: 10, fontWeight: 700, marginTop: 4 }}>⛔ READINESS INCOMPLETE</div>}
                    {a.contractor_payout_cents && <div className="font-mono-ibm" style={{ fontSize: 16, color: V.telemetry, marginTop: 8, fontWeight: 500 }}>${(a.contractor_payout_cents / 100).toFixed(2)}</div>}
                  </div>
                </div>
                {a.status === "offered" && (
                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button onClick={() => respond(a.id, "accept")} disabled={actingOn === a.id} style={btnPrimary}>
                      {actingOn === a.id ? "…" : "Accept"}
                    </button>
                    <button onClick={() => respond(a.id, "decline")} disabled={actingOn === a.id} style={btnGhost}>
                      Decline
                    </button>
                  </div>
                )}
                {a.status !== "offered" && a.status !== "declined" && job && (
                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <button onClick={() => setMissionLogAssignment(a)} style={btnGhost}>
                      Open Mission →
                    </button>
                    {sopsFor(job.service_type).length > 0 && (
                      <button
                        onClick={() => {
                          const missionSops = sopsFor(job.service_type);
                          setSopMissionServiceType(job.service_type);
                          setExpandedSop(missionSops[0].id);
                          setTab("sops");
                        }}
                        style={btnGhost}
                      >
                        View SOP →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {assignments.length > 0 && <PilotStatusLegend />}
        </div>
      )}

      {tab === "queue" && accessToken && (
        <PilotQueue accessToken={accessToken} myClaims={myClaims} onClaimed={load} />
      )}

      {tab === "mapping" && accessToken && <MappingTab accessToken={accessToken} />}
      {tab === "crm" && <PilotCRM />}
      {tab === "support" && <PilotSupportCenter />}

      {tab === "sops" && (
        <div style={{ display: "grid", gap: 10 }}>
          {sopMissionServiceType && (
            <div style={{ ...panelStyle, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div className="font-saira" style={{ fontWeight: 600 }}>Mission documents</div>
                <div style={{ color: V.inkDim, fontSize: 12, marginTop: 3 }}>
                  Showing only SOPs and supporting documents for {sopMissionServiceType.replace(/_/g, " ")}.
                </div>
              </div>
              <button onClick={() => { setSopMissionServiceType(null); setExpandedSop(null); }} style={btnGhost}>View SOP library</button>
            </div>
          )}
          {(sopMissionServiceType ? sopsFor(sopMissionServiceType) : sops).length === 0 && (
            <p style={{ color: V.inkDim }}>
              {sopMissionServiceType ? "No mission-specific documents have been assigned yet." : "No SOPs published yet."}
            </p>
          )}
          {(sopMissionServiceType ? sopsFor(sopMissionServiceType) : sops).map((s) => {
            const open = expandedSop === s.id;
            return (
              <div key={s.id} style={panelStyle}>
                <div
                  onClick={() => setExpandedSop(open ? null : s.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                >
                  <div>
                    <div className="font-saira" style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                    <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 3 }}>{s.mission_type?.replace(/_/g, " ")} · {s.category} · v{s.version}</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="font-mono-ibm" style={{ fontSize: 11, color: V.telemetry }}>CURRENT</span>
                    <span style={{ color: V.inkFaint, fontSize: 13 }}>{open ? "▲" : "▼"}</span>
                  </div>
                </div>
                {open && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${V.line}` }}>
                    <SopViewer bodyMd={s.body_md} />
                    <div style={{ marginTop: 18 }}>
                      <button onClick={() => printSop(s)} style={btnGhost}>
                        Print / Download →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "payouts" && (
        <div style={{ display: "grid", gap: 10 }}>
          {payouts.length === 0 && <p style={{ color: V.inkDim }}>No payouts yet.</p>}
          {payouts.map((p) => (
            <div key={p.id} style={{ ...panelStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="font-mono-ibm" style={{ fontSize: 14, color: V.telemetry, fontWeight: 500 }}>${(p.contractor_amount_cents / 100).toFixed(2)}</div>
                <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 3 }}>{new Date(p.created_at).toLocaleDateString()}</div>
              </div>
              <span className="font-mono-ibm" style={{ fontSize: 10, padding: "4px 9px", borderRadius: 20, background: ["captured", "paid_out"].includes(p.status) ? "rgba(22,163,74,.12)" : "rgba(229,112,31,.12)", color: ["captured", "paid_out"].includes(p.status) ? V.telemetry : V.warn, textTransform: "uppercase", letterSpacing: ".06em" }}>{p.status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "publicprofile" && userId && (
        <PilotPublicProfileEditor profile={profile} portfolio={portfolio} userId={userId} onSaved={load} />
      )}

      {tab === "resources" && <PilotResources tutorials={tutorials} />}

      {tab === "profile" && (
        <div style={panelStyle}>
          <PilotProfileEditor profile={profile} onSaved={load} />
        </div>
      )}

      {tab === "profile" && (
        <div style={{ ...panelStyle, marginTop: 12 }}>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
            Payout Account
          </div>
          <p style={{ color: V.inkDim, fontSize: 13, marginTop: 10 }}>
            {profile.stripe_payouts_enabled
              ? "Your Stripe account is connected and ready to receive payouts."
              : profile.stripe_connect_account_id
                ? "You've started Stripe onboarding but haven't finished — pick up where you left off."
                : "Connect a Stripe account to get paid for missions."}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <CredBadge label={profile.stripe_payouts_enabled ? "Payouts Ready" : "Not Connected"} ok={profile.stripe_payouts_enabled} />
            <button onClick={connectStripe} disabled={subActionLoading} style={btnPrimary}>
              {subActionLoading ? "…" : profile.stripe_connect_account_id ? "Finish Stripe Setup" : "Connect Stripe Account"}
            </button>
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div style={{ ...panelStyle, marginTop: 12 }}>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
            Commission & Subscription
          </div>
          <p style={{ color: V.inkDim, fontSize: 13, marginTop: 10 }}>
            {profile.subscription_active
              ? "You're subscribed — DOM takes 0% commission on every mission, whether DOM sources it or you do."
              : "Your commission rate steps down as you complete more missions in the trailing 90 days. Subscribe for $99/mo to drop to 0% on every mission instead."}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <span className="font-mono-ibm" style={{ fontSize: 20, fontWeight: 600, color: profile.subscription_active ? V.telemetry : V.signal }}>
              {profile.subscription_active
                ? "0% commission"
                : profile.current_commission_bps != null
                  ? `${profile.current_commission_bps / 100}% commission`
                  : "…"}
            </span>
            <button
              onClick={profile.subscription_active ? manageSubscription : startSubscription}
              disabled={subActionLoading}
              style={btnPrimary}
            >
              {subActionLoading ? "…" : profile.subscription_active ? "Manage subscription" : "Subscribe — $99/mo"}
            </button>
          </div>
          {!profile.subscription_active && (
            <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 10 }}>
              Missions worth $500+ carry a 15% minimum commission regardless of your tier.
            </p>
          )}
        </div>
      )}
      </div>
      </main>
    </div>
  );
}

function PilotStatusLegend() {
  return <div style={{ ...panelStyle, marginTop: 8, padding: 14 }}><div className="font-mono-ibm" style={{ fontSize: 10, color: V.inkFaint, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 9 }}>Mission status colors</div><div style={{ display: "flex", gap: "8px 16px", flexWrap: "wrap" }}>{PILOT_LEGEND.map(([label, color]) => <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: V.inkDim, fontSize: 12 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />{label}</span>)}</div></div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (<div style={{ minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}><div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>{children}</div></div>);
}
function CredBadge({ label, ok }: { label: string; ok: boolean }) {
  return (<span className="font-mono-ibm" style={{ fontSize: 10, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ok ? V.telemetry : V.line}`, background: ok ? "rgba(22,163,74,.1)" : "transparent", color: ok ? V.telemetry : V.inkFaint, letterSpacing: ".06em" }}>{ok ? "✓ " : "○ "}{label}</span>);
}
function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (<div style={{ background: V.raised, padding: "14px 16px" }}><div className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".12em", color: V.inkFaint, textTransform: "uppercase" }}>{k}</div><div className="font-mono-ibm" style={{ fontSize: 18, color: color ?? V.ink, marginTop: 2, fontWeight: 600 }}>{v}</div></div>);
}
