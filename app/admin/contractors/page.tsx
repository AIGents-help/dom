"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

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
  stripe_connect_account_id: string | null;
  stripe_payouts_enabled: boolean;
  service_area: string | null;
  missions_completed: number;
  can_create_missions: boolean;
};

export default function AdminContractorsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const load = useCallback(async () => {
    const supabaseBrowser = getSupabaseBrowser();
    const { data, error } = await supabaseBrowser
      .from("contractors")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setRows(data as Contractor[]);
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

  async function toggle(id: string, field: "part107_verified" | "insurance_verified", value: boolean) {
    // optimistic
    setRows((r) => r.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    const supabaseBrowser = getSupabaseBrowser();
    const { error } = await supabaseBrowser.from("contractors").update({ [field]: value }).eq("id", id);
    if (error) load(); // revert from source of truth on failure
  }

  async function setActive(id: string) {
    setRows((r) => r.map((c) => (c.id === id ? { ...c, status: "active" } : c)));
    const supabaseBrowser = getSupabaseBrowser();
    await supabaseBrowser.from("contractors").update({ status: "active" }).eq("id", id);
  }

  async function approveSelfService(id: string) {
    const supabaseBrowser = getSupabaseBrowser();
    const { error } = await supabaseBrowser.rpc("admin_approve_self_service", { p_contractor_id: id });
    if (error) {
      alert(error.message);
      return;
    }
    load();
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
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: "#5A6678" }}>{rows.length} total</span>
      </div>

      {rows.length === 0 && <p style={{ color: "#8A95A7" }}>No applicants yet. Share /fly-for-dom to recruit pilots.</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((c) => {
          const cleared = c.part107_verified && c.insurance_verified;
          return (
            <div key={c.id} style={rowCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 16 }}>{c.full_name}</div>
                  <div style={{ color: "#8A95A7", fontSize: 13 }}>{c.email} · {c.service_area ?? "—"}</div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#5A6678", marginTop: 4 }}>
                    107#: {c.part107_number ?? "—"} · {c.missions_completed} mission{c.missions_completed === 1 ? "" : "s"} completed
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ ...badge, ...(cleared ? badgeOk : badgeWarn) }}>
                    {cleared ? "CLEARED FOR WORK" : "NOT CLEARED"}
                  </span>
                  {c.can_create_missions && (
                    <span style={{ ...badge, ...badgeOk, marginLeft: 6 }}>SELF-SERVICE ✓</span>
                  )}
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: c.stripe_payouts_enabled ? "#4FD1C5" : "#5A6678", marginTop: 6 }}>
                    {c.stripe_connect_account_id ? (c.stripe_payouts_enabled ? "PAYOUTS READY" : "STRIPE PENDING") : "NO STRIPE ACCT"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Toggle label="Part 107" on={c.part107_verified} onClick={() => toggle(c.id, "part107_verified", !c.part107_verified)} />
                <Toggle label="Insurance" on={c.insurance_verified} onClick={() => toggle(c.id, "insurance_verified", !c.insurance_verified)} />
                {c.status !== "active" && <Btn onClick={() => setActive(c.id)}>Mark active</Btn>}
                {!c.stripe_connect_account_id && <Btn onClick={() => onboard(c.id)}>Start Stripe onboarding</Btn>}
                {c.stripe_connect_account_id && !c.stripe_payouts_enabled && (
                  <Btn onClick={() => onboard(c.id)}>Resume Stripe Onboarding</Btn>
                )}
                {!c.can_create_missions && (
                  <Btn onClick={() => approveSelfService(c.id)}>Approve to Create Missions</Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0E14", color: "#E8ECF2", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>{children}</div>
    </div>
  );
}
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...toggleBase, background: on ? "rgba(79,209,197,.14)" : "#0A0E14", color: on ? "#4FD1C5" : "#8A95A7", borderColor: on ? "#4FD1C5" : "#232C3B" }}>
      {on ? "✓ " : "○ "}{label} verified
    </button>
  );
}
function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={btnGhost}>{children}</button>;
}

const rowCard: React.CSSProperties = { border: "1px solid #232C3B", borderRadius: 12, background: "#11161F", padding: 18 };
const badge: React.CSSProperties = { fontFamily: "IBM Plex Mono, monospace", fontSize: 10, letterSpacing: ".08em", padding: "4px 9px", borderRadius: 20 };
const badgeOk: React.CSSProperties = { background: "rgba(79,209,197,.14)", color: "#4FD1C5" };
const badgeWarn: React.CSSProperties = { background: "rgba(255,138,61,.14)", color: "#FF8A3D" };
const toggleBase: React.CSSProperties = { fontFamily: "IBM Plex Mono, monospace", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid #232C3B", cursor: "pointer" };
const btnGhost: React.CSSProperties = { fontFamily: "Saira, sans-serif", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "1px solid #232C3B", background: "transparent", color: "#E8ECF2", cursor: "pointer" };
