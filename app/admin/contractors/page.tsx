"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import PilotAssetSearchPanel from "@/components/admin/PilotAssetSearchPanel";

function insurancePolicyIsCurrent(expiresOn: string) {
  return new Date(`${expiresOn}T23:59:59`).getTime() > Date.now();
}

// Admin > Contractors. Gated by Supabase Auth + admin allowlist (RLS enforces it server-side).
// Lets you flip the Part 107 / insurance verification gates that /api/checkout enforces.
type Contractor = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  part107_number: string | null;
  part107_verified: boolean;
  insurance_verified: boolean;
  insurance_requested: boolean;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_expires_on: string | null;
  insurance_liability_cents: number | null;
  insurance_coi_path: string | null;
  insurance_verification_basis: string | null;
  insurance_verification_note: string | null;
  insurance_verified_at: string | null;
  dom_gig_insurance_eligible: boolean;
  uninsured_self_service_eligible: boolean;
  uninsured_self_service_authorization_note: string | null;
  uninsured_self_service_authorized_by: string | null;
  uninsured_self_service_authorized_at: string | null;
  stripe_connect_account_id: string | null;
  stripe_payouts_enabled: boolean;
  service_area: string | null;
  missions_completed: number;
  can_create_missions: boolean;
  cert_timeline_bucket: string | null;
  membership_deadline: string | null;
  resource_access_locked: boolean;
  resource_access_active: boolean;
  subscription_active: boolean;
};

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function AdminContractorsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Contractor[]>([]);
  const [tierBps, setTierBps] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [coverageFor, setCoverageFor] = useState<string | null>(null);
  const [coverageSaving, setCoverageSaving] = useState(false);
  const [coverageForm, setCoverageForm] = useState({ provider: "", reference: "", expiresOn: "", reason: "" });
  const [uninsuredFor, setUninsuredFor] = useState<string | null>(null);
  const [uninsuredReason, setUninsuredReason] = useState("");
  const [uninsuredSaving, setUninsuredSaving] = useState(false);

  const load = useCallback(async () => {
    const supabaseBrowser = getSupabaseBrowser();
    const { data, error } = await supabaseBrowser
      .from("contractors")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setRows(data as Contractor[]);

    // Tier badge — bulk-fetch trailing-90-day completed counts once and
    // tally client-side (same pattern used on the mission Offer panel and
    // the unverified-pilot funnel), instead of an RPC round-trip per row.
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const { data: recentCompletions } = await supabaseBrowser
        .from("mission_assignments")
        .select("contractor_id")
        .in("contractor_id", ids)
        .in("status", ["qc_passed", "paid"])
        .gte("completed_at", ninetyDaysAgo.toISOString());
      const counts: Record<string, number> = {};
      for (const row of recentCompletions ?? []) {
        counts[row.contractor_id] = (counts[row.contractor_id] ?? 0) + 1;
      }
      const tiers: Record<string, number> = {};
      for (const cid of ids) {
        const count = counts[cid] ?? 0;
        tiers[cid] = count >= 10 ? 1000 : count >= 5 ? 1500 : 2000;
      }
      setTierBps(tiers);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const supabaseBrowser = getSupabaseBrowser();
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        router.push("/admin/login");
        return;
      }
      setAuthed(true);
      load();
    })();
  }, [router, load]);

  async function updateAccess(id: string, payload: Record<string, unknown>) {
    const supabaseBrowser = getSupabaseBrowser();
    const { data } = await supabaseBrowser.auth.getSession();
    if (!data.session) throw new Error("Admin session expired.");
    const response = await fetch(`/api/admin/contractors/${id}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Pilot access could not be updated.");
  }

  async function toggle(id: string, field: "part107_verified" | "insurance_verified" | "dom_gig_insurance_eligible", value: boolean) {
    if (field === "insurance_verified" && value) {
      const contractor = rows.find((row) => row.id === id);
      if (!contractor?.insurance_coi_path || !contractor.insurance_policy_number || !contractor.insurance_expires_on || !insurancePolicyIsCurrent(contractor.insurance_expires_on)) {
        window.alert("A current policy number, future expiration date, and uploaded COI are required before verification.");
        return;
      }
    }
    // optimistic
    setRows((r) => r.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    try { await updateAccess(id, { action: "set_verification", field, value }); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Verification could not be updated."); await load(); }
  }

  async function approveAlternateCoverage(id: string) {
    setCoverageSaving(true);
    try {
      const supabaseBrowser = getSupabaseBrowser();
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) throw new Error("Admin session expired.");
      const response = await fetch(`/api/admin/contractors/${id}/insurance-exception`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify(coverageForm),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Alternate coverage could not be approved.");
      setCoverageFor(null);
      setCoverageForm({ provider: "", reference: "", expiresOn: "", reason: "" });
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Alternate coverage could not be approved.");
    } finally {
      setCoverageSaving(false);
    }
  }

  async function setActive(id: string) {
    setRows((r) => r.map((c) => (c.id === id ? { ...c, status: "active" } : c)));
    try { await updateAccess(id, { action: "activate" }); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Pilot could not be activated."); await load(); }
  }

  async function unlockResourceAccess(id: string) {
    setRows((r) => r.map((c) => (c.id === id ? { ...c, resource_access_locked: false } : c)));
    try { await updateAccess(id, { action: "unlock_resources" }); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Resource access could not be unlocked."); await load(); }
  }

  async function approveSelfService(id: string) {
    try { await updateAccess(id, { action: "approve_self_service" }); await load(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Self-service access could not be approved."); }
  }

  async function setUninsuredEligibility(id: string, enabled: boolean) {
    if (uninsuredReason.trim().length < 10) {
      window.alert("Enter an Admin reason of at least 10 characters.");
      return;
    }
    setUninsuredSaving(true);
    try {
      await updateAccess(id, { action: "set_uninsured_eligibility", enabled, reason: uninsuredReason.trim() });
      setUninsuredFor(null);
      setUninsuredReason("");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Uninsured self-service eligibility could not be updated.");
    } finally {
      setUninsuredSaving(false);
    }
  }

  async function onboard(id: string) {
    const supabaseBrowser = getSupabaseBrowser();
    const { data: session } = await supabaseBrowser.auth.getSession();
    if (!session.session) return;
    const res = await fetch("/api/connect/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` },
      body: JSON.stringify({ contractorId: id }),
    });
    const data = await res.json();
    if (data.url) window.open(data.url, "_blank");
    else if (data.error) alert(data.error);
  }

  if (!authed) return <Shell>Checking access…</Shell>;
  if (loading) return <Shell>Loading contractors…</Shell>;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "Saira, sans-serif", fontSize: 26 }}>Contractors</h1>
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: "#8A95A7" }}>{rows.length} total</span>
      </div>

      <PilotAssetSearchPanel />

      {rows.length > 0 && (() => {
        const unverified = rows.filter((c) => !c.part107_verified && c.membership_deadline);
        const withinWeek = unverified.filter((c) => c.membership_deadline && daysUntil(c.membership_deadline) <= 7 && daysUntil(c.membership_deadline) >= 0);
        const everUnverified = rows.filter((c) => c.cert_timeline_bucket !== null || (!c.part107_verified && c.membership_deadline));
        const nowVerified = rows.filter((c) => c.part107_verified && c.cert_timeline_bucket !== null);
        const conversionPct = everUnverified.length + nowVerified.length > 0
          ? Math.round((nowVerified.length / (everUnverified.length + nowVerified.length)) * 100)
          : 0;
        const bucketCounts: Record<string, number> = {};
        for (const c of unverified) {
          const b = c.cert_timeline_bucket ?? "unknown";
          bucketCounts[b] = (bucketCounts[b] ?? 0) + 1;
        }
        return (
          <div style={{ ...rowCard, marginBottom: 18 }}>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: ".1em", color: "#8A95A7", textTransform: "uppercase", marginBottom: 10 }}>
              Unverified Pilot Funnel
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
              <div><span style={{ color: "#172033", fontWeight: 600 }}>{unverified.length}</span> <span style={{ color: "#5F6B7A" }}>active, unverified</span></div>
              <div><span style={{ color: withinWeek.length > 0 ? "#E5701F" : "#172033", fontWeight: 600 }}>{withinWeek.length}</span> <span style={{ color: "#5F6B7A" }}>within 7 days of deadline</span></div>
              <div><span style={{ color: "#16A34A", fontWeight: 600 }}>{conversionPct}%</span> <span style={{ color: "#5F6B7A" }}>convert to verified</span></div>
              {Object.entries(bucketCounts).map(([bucket, count]) => (
                <div key={bucket}><span style={{ color: "#172033", fontWeight: 600 }}>{count}</span> <span style={{ color: "#5F6B7A" }}>{bucket.replace(/_/g, " ")}</span></div>
              ))}
            </div>
          </div>
        );
      })()}

      {rows.length === 0 && <p style={{ color: "#5F6B7A" }}>No applicants yet. Share /fly-for-dom to recruit pilots.</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((c) => {
          const insuranceCurrent = !!c.insurance_verified && !!c.insurance_expires_on && insurancePolicyIsCurrent(c.insurance_expires_on);
          const alternateCoverage = c.insurance_verification_basis === "admin_alternate_coverage";
          const cleared = c.part107_verified && insuranceCurrent;
          return (
            <div key={c.id} style={rowCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 16 }}>{c.full_name}</div>
                  <div style={{ color: "#5F6B7A", fontSize: 13 }}>{c.email} · {c.service_area ?? "—"}</div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#8A95A7", marginTop: 4 }}>
                    107#: {c.part107_number ?? "—"} · {c.missions_completed} mission{c.missions_completed === 1 ? "" : "s"} completed
                  </div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: insuranceCurrent ? "#16A34A" : "#E5701F", marginTop: 4 }}>
                    Insurance: {insuranceCurrent ? (alternateCoverage ? "ADMIN-APPROVED ALTERNATE COVERAGE" : "VERIFIED PILOT POLICY") : c.insurance_verified ? "VERIFICATION INCOMPLETE" : "NOT VERIFIED"}
                    {c.insurance_provider ? ` · ${c.insurance_provider}` : ""}{c.insurance_policy_number ? ` · ${c.insurance_policy_number}` : ""}{c.insurance_expires_on ? ` · expires ${new Date(`${c.insurance_expires_on}T12:00:00`).toLocaleDateString()}` : " · expiration required"}{c.insurance_liability_cents ? ` · $${(c.insurance_liability_cents / 100).toLocaleString()} liability` : ""}{c.insurance_coi_path ? " · COI UPLOADED" : ""}
                  </div>
                  {alternateCoverage && c.insurance_verification_note && <div style={{ fontSize: 11, color: "#5F6B7A", marginTop: 3 }}>Admin basis: {c.insurance_verification_note}</div>}
                  {!c.part107_verified && c.membership_deadline && (
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: c.resource_access_locked ? "#8A95A7" : daysUntil(c.membership_deadline) <= 7 ? "#E5701F" : "#5F6B7A", marginTop: 4 }}>
                      {(c.cert_timeline_bucket ?? "—").replace(/_/g, " ")} · deadline {new Date(c.membership_deadline).toLocaleDateString()}
                      {c.resource_access_locked ? " · LOCKED" : ` · ${daysUntil(c.membership_deadline)}d left`}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ ...badge, ...(cleared ? badgeOk : badgeWarn) }}>
                    {cleared ? "CLEARED FOR WORK" : "NOT CLEARED"}
                  </span>
                  {c.can_create_missions && (
                    <span style={{ ...badge, ...badgeOk, marginLeft: 6 }}>SELF-SERVICE ✓</span>
                  )}
                  {c.uninsured_self_service_eligible && (
                    <span style={{ ...badge, ...badgeWarn, marginLeft: 6 }}>UNINSURED SELF-SERVICE ELIGIBLE</span>
                  )}
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: c.stripe_payouts_enabled ? "#16A34A" : "#8A95A7", marginTop: 6 }}>
                    {c.stripe_connect_account_id ? (c.stripe_payouts_enabled ? "PAYOUTS READY" : "STRIPE PENDING") : "NO STRIPE ACCT"}
                  </div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#8A95A7", marginTop: 4 }}>
                    {c.subscription_active ? "0% commission (subscribed)" : `${(tierBps[c.id] ?? 2000) / 100}% commission tier`}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Toggle label="Part 107" on={c.part107_verified} onClick={() => toggle(c.id, "part107_verified", !c.part107_verified)} />
                <Toggle label="Insurance" on={insuranceCurrent} onClick={() => toggle(c.id, "insurance_verified", !c.insurance_verified)} />
                {!insuranceCurrent && <Btn onClick={() => {
                  setCoverageFor(coverageFor === c.id ? null : c.id);
                  setCoverageForm({ provider: "", reference: "", expiresOn: "", reason: "" });
                }}>Approve alternate coverage</Btn>}
                <Toggle label="DOM Gig Insurance Program" on={c.dom_gig_insurance_eligible} onClick={() => toggle(c.id, "dom_gig_insurance_eligible", !c.dom_gig_insurance_eligible)} />
                {c.insurance_requested && !c.insurance_verified && (
                  <span style={{ ...badge, background: "rgba(124,58,237,.14)", color: "#7C3AED", alignSelf: "center" }}>
                    INSURANCE REQUESTED
                  </span>
                )}
                {c.status !== "active" && <Btn onClick={() => setActive(c.id)}>Mark active</Btn>}
                {!c.stripe_connect_account_id && <Btn onClick={() => onboard(c.id)}>Start Stripe onboarding</Btn>}
                {c.stripe_connect_account_id && !c.stripe_payouts_enabled && (
                  <Btn onClick={() => onboard(c.id)}>Resume Stripe Onboarding</Btn>
                )}
                {!c.can_create_missions && (
                  <Btn onClick={() => approveSelfService(c.id)}>Approve to Create Missions</Btn>
                )}
                <Btn onClick={() => {
                  setUninsuredFor(uninsuredFor === c.id ? null : c.id);
                  setUninsuredReason("");
                }}>{c.uninsured_self_service_eligible ? "Revoke uninsured eligibility" : "Authorize uninsured self-service"}</Btn>
                {c.resource_access_locked && (
                  <Btn onClick={() => unlockResourceAccess(c.id)}>Unlock resource access</Btn>
                )}
              </div>
              {c.uninsured_self_service_authorization_note && (
                <div style={{ fontSize: 11, color: "#5F6B7A", marginTop: 9 }}>
                  Uninsured self-service authorization: {c.uninsured_self_service_authorization_note}
                  {c.uninsured_self_service_authorized_at ? ` · ${new Date(c.uninsured_self_service_authorized_at).toLocaleString()}` : ""}
                </div>
              )}
              {uninsuredFor === c.id && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: "1px solid #E5701F", background: "rgba(229,112,31,.06)" }}>
                  <strong style={{ fontSize: 13 }}>{c.uninsured_self_service_eligible ? "Revoke uninsured self-service eligibility" : "Authorize uninsured self-service eligibility"}</strong>
                  <p style={{ color: "#5F6B7A", fontSize: 12, marginTop: 4 }}>
                    This applies only to pilot-created self-service missions. It does not verify insurance or clear the pilot for DOM-assigned missions. The pilot must separately accept responsibility on each mission.
                  </p>
                  <textarea value={uninsuredReason} onChange={(event) => setUninsuredReason(event.target.value)} placeholder={c.uninsured_self_service_eligible ? "Reason for revoking future eligibility" : "Admin reason for authorizing this option"} style={{ ...inputStyle, width: "100%", minHeight: 70, marginTop: 8 }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <Btn onClick={() => setUninsuredEligibility(c.id, !c.uninsured_self_service_eligible)}>{uninsuredSaving ? "Saving…" : c.uninsured_self_service_eligible ? "Revoke eligibility" : "Authorize option"}</Btn>
                    <Btn onClick={() => setUninsuredFor(null)}>Cancel</Btn>
                  </div>
                </div>
              )}
              {coverageFor === c.id && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: "1px solid #F45A1E", background: "rgba(244,90,30,.05)" }}>
                  <strong style={{ fontSize: 13 }}>Admin-approved alternate coverage</strong>
                  <p style={{ color: "#5F6B7A", fontSize: 12, marginTop: 4 }}>Use when this pilot is covered by a client, site owner, employer, or another party. This approval expires automatically.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 10 }}>
                    <input value={coverageForm.provider} onChange={(event) => setCoverageForm((form) => ({ ...form, provider: event.target.value }))} placeholder="Covering organization / carrier" style={inputStyle} />
                    <input value={coverageForm.reference} onChange={(event) => setCoverageForm((form) => ({ ...form, reference: event.target.value }))} placeholder="Policy, contract, or approval reference" style={inputStyle} />
                    <input type="date" value={coverageForm.expiresOn} onChange={(event) => setCoverageForm((form) => ({ ...form, expiresOn: event.target.value }))} style={inputStyle} />
                  </div>
                  <textarea value={coverageForm.reason} onChange={(event) => setCoverageForm((form) => ({ ...form, reason: event.target.value }))} placeholder="Why this alternate coverage applies" style={{ ...inputStyle, width: "100%", minHeight: 70, marginTop: 8 }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <Btn onClick={() => approveAlternateCoverage(c.id)}>{coverageSaving ? "Approving…" : "Approve coverage"}</Btn>
                    <Btn onClick={() => setCoverageFor(null)}>Cancel</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", color: "#172033", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>{children}</div>
    </div>
  );
}
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...toggleBase, background: on ? "rgba(244,90,30,.12)" : "#F5F7FA", color: on ? "#F45A1E" : "#5F6B7A", borderColor: on ? "#F45A1E" : "#D9E0E8" }}>
      {on ? "✓ " : "○ "}{label} verified
    </button>
  );
}
function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={btnGhost}>{children}</button>;
}

const rowCard: React.CSSProperties = { border: "1px solid #D9E0E8", borderRadius: 12, background: "#FFFFFF", padding: 18 };
const badge: React.CSSProperties = { fontFamily: "IBM Plex Mono, monospace", fontSize: 10, letterSpacing: ".08em", padding: "4px 9px", borderRadius: 20 };
const badgeOk: React.CSSProperties = { background: "rgba(22,163,74,.14)", color: "#16A34A" };
const badgeWarn: React.CSSProperties = { background: "rgba(229,112,31,.14)", color: "#E5701F" };
const toggleBase: React.CSSProperties = { fontFamily: "IBM Plex Mono, monospace", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid #D9E0E8", cursor: "pointer" };
const btnGhost: React.CSSProperties = { fontFamily: "Saira, sans-serif", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "1px solid #D9E0E8", background: "transparent", color: "#172033", cursor: "pointer" };
const inputStyle: React.CSSProperties = { padding: "9px 10px", borderRadius: 8, border: "1px solid #D9E0E8", background: "#FFFFFF", color: "#172033", fontSize: 13 };
