"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import PilotCreateMissionWizard from "@/components/PilotCreateMissionWizard";
import PilotSidebar, { type PilotTab } from "@/components/PilotSidebar";
import PilotProfileEditor from "@/components/PilotProfileEditor";
import PilotPublicProfileEditor from "@/components/PilotPublicProfileEditor";
import PilotResources from "@/components/PilotResources";

interface Profile {
  id: string; full_name: string; email: string; phone: string | null; status: string;
  part107_number: string | null; part107_verified: boolean;
  insurance_verified: boolean; stripe_payouts_enabled: boolean;
  service_area: string | null; equipment: string | null;
  missions_completed: number; rating: number | null;
  can_create_missions: boolean; subscription_active: boolean;
  slug: string | null; bio: string | null; tagline: string | null;
  photo_url: string | null; website_url: string | null; profile_published: boolean;
}
interface PortfolioImage { id: string; image_url: string; caption: string | null; sort_order: number; }
interface RequestedForMe { id: string; requester_name: string | null; company: string | null; service_type: string | null; location: string | null; status: string; created_at: string; }
interface Assignment {
  id: string; status: string; mission_price_cents: number | null;
  contractor_payout_cents: number | null; offered_at: string;
  accepted_at: string | null; submitted_at: string | null;
  job: { id: string; title: string; service_type: string; location: string; scheduled_for: string | null; status: string } | null;
}
interface Payout { id: string; contractor_amount_cents: number; status: string; created_at: string; }
interface SOP { id: string; slug: string; title: string; mission_type: string; category: string; version: number; }
type Tab = PilotTab;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  offered: { bg: "rgba(255,138,61,.12)", text: "#FF8A3D" },
  accepted: { bg: "rgba(79,209,197,.12)", text: "#4FD1C5" },
  in_progress: { bg: "rgba(196,107,224,.14)", text: "#C46BE0" },
  submitted: { bg: "rgba(79,209,197,.14)", text: "#4FD1C5" },
  qc_passed: { bg: "rgba(79,209,197,.18)", text: "#4FD1C5" },
  paid: { bg: "rgba(79,209,197,.2)", text: "#4FD1C5" },
  declined: { bg: "rgba(90,102,120,.15)", text: "#5A6678" },
  cancelled: { bg: "rgba(90,102,120,.15)", text: "#5A6678" },
};
const V = { ground: "#0A0E14", surface: "#11161F", raised: "#161D29", line: "#232C3B", lineSoft: "#1A222F", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D", telemetry: "#4FD1C5" };
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
  const [userId, setUserId] = useState<string | null>(null);

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
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = useCallback(async (assignmentId: string, action: "accept" | "decline") => {
    setActingOn(assignmentId);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: rpcError } = await sb.rpc(
        action === "accept" ? "accept_mission_assignment" : "decline_mission_assignment",
        action === "accept" ? { p_assignment_id: assignmentId } : { p_assignment_id: assignmentId, p_reason: null }
      );
      if (rpcError) throw rpcError;
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to respond to assignment");
    } finally {
      setActingOn(null);
    }
  }, [load]);

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

  if (loading) return <Shell><p style={{ color: V.inkDim }}>Loading your dashboard…</p></Shell>;
  if (!profile) return <Shell><p style={{ color: V.signal }}>Could not load profile.</p></Shell>;

  const cleared = profile.part107_verified && profile.insurance_verified;
  const activeAssignments = assignments.filter((a) => !["paid", "cancelled"].includes(a.status));
  const totalEarned = payouts.filter((p) => ["captured", "paid_out"].includes(p.status)).reduce((s, p) => s + p.contractor_amount_cents, 0);

  return (
    <Shell>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <PilotSidebar tab={tab} setTab={setTab} onSignOut={signOut} />
      <div style={{ flex: 1, minWidth: 0 }}>
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
        <div style={{ ...panelStyle, borderColor: "rgba(255,138,61,.4)", marginBottom: 18, background: "rgba(255,138,61,.05)" }}>
          <p style={{ color: V.signal, fontSize: 14 }}>Your credentials are not fully verified yet. DOM verifies Part 107 and insurance before assigning paid missions.{!profile.stripe_payouts_enabled && " Complete Stripe payout setup to receive payments."}</p>
        </div>
      )}

      {error && (
        <div style={{ ...panelStyle, borderColor: "#FF8A3D", marginBottom: 18 }}>
          <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: V.lineSoft, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <Stat k="Status" v={profile.status.toUpperCase()} color={profile.status === "active" ? V.telemetry : V.signal} />
        <Stat k="Active Missions" v={String(activeAssignments.length)} />
        <Stat k="Completed" v={String(profile.missions_completed)} />
        <Stat k="Earned" v={`$${(totalEarned / 100).toFixed(2)}`} color={V.telemetry} />
      </div>

      {tab === "create" && accessToken && (
        <>
          {!profile.can_create_missions && (
            <div style={{ ...panelStyle, borderColor: "rgba(255,138,61,.4)", marginBottom: 18, background: "rgba(255,138,61,.05)" }}>
              <p style={{ color: V.signal, fontSize: 14 }}>
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
            onCreated={load}
          />
        </>
      )}

      {tab === "missions" && (
        <div style={{ display: "grid", gap: 10 }}>
          {requestsForMe.length > 0 && (
            <div style={{ ...panelStyle, borderColor: "rgba(79,209,197,.4)", background: "rgba(79,209,197,.05)" }}>
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
          {assignments.map((a) => {
            const job = Array.isArray(a.job) ? a.job[0] : a.job;
            const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.offered;
            return (
              <div key={a.id} style={panelStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div className="font-saira" style={{ fontWeight: 600, fontSize: 16 }}>{job?.title ?? "Mission"} <span style={{ color: V.inkDim, fontWeight: 400, fontSize: 13 }}>— {(job?.service_type ?? "").replace(/_/g, " ")}</span></div>
                    <div style={{ color: V.inkFaint, fontSize: 13, marginTop: 3 }}>{job?.location ?? "—"}</div>
                    {job?.scheduled_for && <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 4 }}>Scheduled: {new Date(job.scheduled_for).toLocaleDateString()}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="font-mono-ibm" style={{ fontSize: 10, padding: "4px 9px", borderRadius: 20, background: sc.bg, color: sc.text, letterSpacing: ".06em", textTransform: "uppercase" }}>{a.status.replace("_", " ")}</span>
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
              </div>
            );
          })}
        </div>
      )}

      {tab === "sops" && (
        <div style={{ display: "grid", gap: 10 }}>
          {sops.length === 0 && <p style={{ color: V.inkDim }}>No SOPs published yet.</p>}
          {sops.map((s) => (
            <div key={s.id} style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div className="font-saira" style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                  <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 3 }}>{s.mission_type?.replace(/_/g, " ")} · {s.category} · v{s.version}</div>
                </div>
                <span className="font-mono-ibm" style={{ fontSize: 11, color: V.telemetry }}>CURRENT</span>
              </div>
            </div>
          ))}
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
              <span className="font-mono-ibm" style={{ fontSize: 10, padding: "4px 9px", borderRadius: 20, background: ["captured", "paid_out"].includes(p.status) ? "rgba(79,209,197,.12)" : "rgba(255,138,61,.12)", color: ["captured", "paid_out"].includes(p.status) ? V.telemetry : V.signal, textTransform: "uppercase", letterSpacing: ".06em" }}>{p.status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "publicprofile" && userId && (
        <PilotPublicProfileEditor profile={profile} portfolio={portfolio} userId={userId} onSaved={load} />
      )}

      {tab === "resources" && <PilotResources />}

      {tab === "profile" && (
        <div style={panelStyle}>
          <PilotProfileEditor profile={profile} onSaved={load} />
        </div>
      )}

      {tab === "profile" && (
        <div style={{ ...panelStyle, marginTop: 12 }}>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
            Commission & Subscription
          </div>
          <p style={{ color: V.inkDim, fontSize: 13, marginTop: 10 }}>
            {profile.subscription_active
              ? "You're subscribed — DOM takes 0% commission on missions you create yourself."
              : `DOM takes a commission on missions you create yourself. Subscribe for $99/mo to keep 100% instead.`}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <span className="font-mono-ibm" style={{ fontSize: 20, fontWeight: 600, color: profile.subscription_active ? V.telemetry : V.signal }}>
              {profile.subscription_active ? "0% commission" : "20% commission"}
            </span>
            <button
              onClick={profile.subscription_active ? manageSubscription : startSubscription}
              disabled={subActionLoading}
              style={btnPrimary}
            >
              {subActionLoading ? "…" : profile.subscription_active ? "Manage subscription" : "Subscribe — $99/mo"}
            </button>
          </div>
        </div>
      )}
      </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (<div style={{ minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}><div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>{children}</div></div>);
}
function CredBadge({ label, ok }: { label: string; ok: boolean }) {
  return (<span className="font-mono-ibm" style={{ fontSize: 10, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ok ? V.telemetry : V.line}`, background: ok ? "rgba(79,209,197,.1)" : "transparent", color: ok ? V.telemetry : V.inkFaint, letterSpacing: ".06em" }}>{ok ? "✓ " : "○ "}{label}</span>);
}
function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (<div style={{ background: V.raised, padding: "14px 16px" }}><div className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".12em", color: V.inkFaint, textTransform: "uppercase" }}>{k}</div><div className="font-mono-ibm" style={{ fontSize: 18, color: color ?? V.ink, marginTop: 2, fontWeight: 600 }}>{v}</div></div>);
}
