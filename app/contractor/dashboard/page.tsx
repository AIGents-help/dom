"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Contractor > Dashboard — view offered/accepted missions, accept or decline.
// Status transitions past accept/decline (in_progress -> submitted -> paid)
// aren't wired up yet; this covers offer -> accept/decline only.

interface ContractorProfile {
  id: string;
  full_name: string;
  status: string;
  part107_verified: boolean;
  insurance_verified: boolean;
  stripe_payouts_enabled: boolean;
}

interface Assignment {
  id: string;
  status: string;
  offered_at: string | null;
  accepted_at: string | null;
  mission_price_cents: number | null;
  contractor_payout_cents: number | null;
  job: {
    id: string;
    title: string;
    location: string | null;
    service_type: string | null;
    scheduled_for: string | null;
  } | null;
}

export default function ContractorDashboardPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contractor, setContractor] = useState<ContractorProfile | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { data: c } = await sb
      .from("contractors")
      .select("id, full_name, status, part107_verified, insurance_verified, stripe_payouts_enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    setContractor(c as ContractorProfile | null);

    if (c) {
      const { data: assigns } = await sb
        .from("mission_assignments")
        .select("id, status, offered_at, accepted_at, mission_price_cents, contractor_payout_cents, job:jobs(id, title, location, service_type, scheduled_for)")
        .eq("contractor_id", c.id)
        .order("offered_at", { ascending: false });
      setAssignments((assigns as any) ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        router.push("/contractor/login");
        return;
      }
      setAuthed(true);
      load();
    })();
  }, [router, load]);

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

  const managePayouts = useCallback(async () => {
    if (!contractor) return;
    setOnboarding(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId: contractor.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start payout setup.");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setOnboarding(false);
    }
  }, [contractor]);

  if (!authed) return null;

  return (
    <Shell>
      {loading && <p style={{ color: V.inkDim }}>Loading…</p>}

      {!loading && !contractor && (
        <div style={panel}>
          <p style={{ color: V.inkDim }}>
            No contractor profile linked to this account.{" "}
            <a href="/fly-for-dom" style={{ color: V.signal }}>Apply at /fly-for-dom</a>.
          </p>
        </div>
      )}

      {!loading && contractor && (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={panel}>
            <h1 className="font-saira" style={{ fontSize: 24, fontWeight: 700 }}>
              Welcome, {contractor.full_name.split(" ")[0]}
            </h1>

            {contractor.status !== "active" && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,138,61,.08)", border: "1px solid rgba(255,138,61,.25)" }}>
                <p style={{ color: V.signal, fontSize: 13 }}>
                  Your application is under review. You'll be able to accept missions once DOM verifies your credentials.
                </p>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: V.lineSoft, borderRadius: 10, overflow: "hidden", marginTop: 16 }}>
              <Readout k="Part 107" v={contractor.part107_verified ? "Verified" : "Pending"} color={contractor.part107_verified ? V.telemetry : V.inkFaint} />
              <Readout k="Insurance" v={contractor.insurance_verified ? "Verified" : "Pending"} color={contractor.insurance_verified ? V.telemetry : V.inkFaint} />
              <Readout k="Payouts" v={contractor.stripe_payouts_enabled ? "Enabled" : "Not set up"} color={contractor.stripe_payouts_enabled ? V.telemetry : V.inkFaint} />
            </div>

            {!contractor.stripe_payouts_enabled && (
              <button onClick={managePayouts} disabled={onboarding} style={{ ...btnGhost, marginTop: 14 }}>
                {onboarding ? "Redirecting…" : "Set up payouts →"}
              </button>
            )}
          </div>

          {error && (
            <div style={{ ...panel, borderColor: "#FF8A3D" }}>
              <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>
            </div>
          )}

          <div style={panel}>
            <Label>Your Missions</Label>
            {assignments.length === 0 && (
              <p style={{ color: V.inkDim, fontSize: 13, marginTop: 10 }}>No missions offered yet.</p>
            )}
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {assignments.map((a) => (
                <div key={a.id} style={{ ...panel, padding: 16, background: V.raised }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.job?.title ?? "Mission"}</div>
                      <div style={{ color: V.inkFaint, fontSize: 13, marginTop: 3 }}>
                        {a.job?.location ?? "No location"}
                        {a.job?.scheduled_for ? ` · ${new Date(a.job.scheduled_for).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <span className="font-mono-ibm" style={{
                      fontSize: 10, padding: "4px 9px", borderRadius: 20, textTransform: "uppercase",
                      background: a.status === "declined" ? "rgba(90,102,120,.15)" : "rgba(79,209,197,.14)",
                      color: a.status === "declined" ? V.inkFaint : V.telemetry,
                    }}>
                      {a.status}
                    </span>
                  </div>
                  {a.contractor_payout_cents != null && (
                    <p className="font-mono-ibm" style={{ fontSize: 13, color: V.telemetry, marginTop: 8 }}>
                      ${(a.contractor_payout_cents / 100).toFixed(2)} payout
                    </p>
                  )}
                  {a.status === "offered" && (
                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                      <button
                        onClick={() => respond(a.id, "accept")}
                        disabled={actingOn === a.id}
                        style={btnPrimary}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respond(a.id, "decline")}
                        disabled={actingOn === a.id}
                        style={btnGhost}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
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

const V = {
  ground: "#0A0E14", surface: "#11161F", raised: "#161D29",
  line: "#232C3B", lineSoft: "#1A222F",
  ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678",
  signal: "#FF8A3D", telemetry: "#4FD1C5",
};
const panel: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
