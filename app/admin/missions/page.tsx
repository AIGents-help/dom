"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

// Admin > Missions — list all missions with status, airspace, and financials at a glance.

interface Mission {
  id: string;
  requester_name: string | null;
  company: string | null;
  service_type: string | null;
  location: string | null;
  status: string;
  quoted_amount_cents: number | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  requested: { bg: "rgba(229,112,31,.07)", text: "#B45309", border: "#E5701F" },
  reviewing: { bg: "rgba(234,179,8,.08)", text: "#A16207", border: "#EAB308" },
  scoped: { bg: "rgba(14,165,233,.07)", text: "#0369A1", border: "#0EA5E9" },
  quoted: { bg: "rgba(6,182,212,.07)", text: "#0E7490", border: "#06B6D4" },
  approved: { bg: "rgba(22,163,74,.07)", text: "#15803D", border: "#16A34A" },
  claimed: { bg: "rgba(249,115,22,.08)", text: "#C2410C", border: "#F97316" },
  assigned: { bg: "rgba(124,58,237,.07)", text: "#6D28D9", border: "#7C3AED" },
  in_progress: { bg: "rgba(37,99,235,.07)", text: "#1D4ED8", border: "#2563EB" },
  delivered: { bg: "rgba(22,163,74,.08)", text: "#15803D", border: "#16A34A" },
  closed: { bg: "rgba(95,107,122,.07)", text: "#475569", border: "#64748B" },
  cancelled: { bg: "rgba(220,38,38,.055)", text: "#B91C1C", border: "#DC2626" },
};

const LEGEND = [
  ["New / review", "#E5701F"], ["Scoped / quoted", "#0EA5E9"], ["Approved / delivered", "#16A34A"],
  ["Assigned", "#7C3AED"], ["In progress", "#2563EB"], ["Closed", "#64748B"], ["Cancelled", "#DC2626"],
] as const;

export default function MissionsPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState("newest");

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    let query = sb
      .from("mission_requests")
      .select("id, requester_name, company, service_type, location, status, quoted_amount_cents, created_at")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    if (data) setMissions(data as Mission[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) { router.push("/admin/login"); return; }
      load();
    })();
  }, [router, load]);

  const filtered = [...missions].sort((a, b) => {
    if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === "value_high") return (b.quoted_amount_cents ?? 0) - (a.quoted_amount_cents ?? 0);
    if (sortBy === "client") return (a.company ?? a.requester_name ?? "").localeCompare(b.company ?? b.requester_name ?? "");
    if (sortBy === "status") return a.status.localeCompare(b.status);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const activeCount = missions.filter((m) => !["closed", "cancelled"].includes(m.status)).length;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 className="font-saira" style={{ fontSize: 26, fontWeight: 700 }}>Missions</h1>
          <p style={{ color: V.inkDim, fontSize: 13 }}>{activeCount} active · {missions.length} total</p>
        </div>
        <button onClick={() => router.push("/admin/missions/create")} style={btnPrimary}>
          + Create Mission
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["all", "requested", "reviewing", "scoped", "quoted", "approved", "claimed", "assigned", "in_progress", "delivered", "closed", "cancelled"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="font-mono-ibm" style={{
            fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
            border: `1px solid ${f === filter ? V.signal : V.line}`,
            background: f === filter ? "rgba(244,90,30,.12)" : "transparent",
            color: f === filter ? V.signal : V.inkFaint,
          }}>
            {f.replace("_", " ").toUpperCase()}
          </button>
        ))}
        </div>
        <label style={{ color: V.inkDim, fontSize: 12 }}>
          Sort{" "}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface, color: V.ink }}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
            <option value="value_high">Highest quote</option><option value="client">Client A–Z</option><option value="status">Status A–Z</option>
          </select>
        </label>
      </div>

      {loading && <p style={{ color: V.inkDim }}>Loading missions…</p>}

      {!loading && filtered.length === 0 && (
        <div style={{ ...panel, textAlign: "center", padding: 40 }}>
          <p style={{ color: V.inkDim }}>No missions yet.</p>
          <button onClick={() => router.push("/admin/missions/create")} style={{ ...btnPrimary, marginTop: 14 }}>
            Create your first mission
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((m) => {
          const sc = STATUS_COLORS[m.status] ?? STATUS_COLORS.requested;
          return (
            <div key={m.id} style={{ ...panel, cursor: "pointer", transition: "box-shadow .15s, transform .15s", borderColor: sc.border, borderLeftWidth: 6, background: `linear-gradient(90deg, ${sc.bg}, ${V.surface} 48%)` }}
              onClick={() => router.push(`/admin/missions/${m.id}`)}
              onMouseOver={(e) => (e.currentTarget.style.boxShadow = `0 5px 18px ${sc.bg}`)}
              onMouseOut={(e) => (e.currentTarget.style.boxShadow = "none")}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="font-saira" style={{ fontWeight: 600, fontSize: 16 }}>
                    {m.company ?? m.requester_name ?? "Unnamed"}{" "}
                    <span style={{ color: V.inkDim, fontWeight: 400, fontSize: 14 }}>
                      — {(m.service_type ?? "").replace(/_/g, " ")}
                    </span>
                  </div>
                  <div style={{ color: V.inkFaint, fontSize: 13, marginTop: 3 }}>
                    {m.location?.slice(0, 60) ?? "No location"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="font-mono-ibm" style={{
                    fontSize: 10, letterSpacing: ".06em", padding: "4px 9px", borderRadius: 20,
                    background: sc.bg, color: sc.text, textTransform: "uppercase",
                  }}>
                    {m.status.replace("_", " ")}
                  </span>
                  {m.quoted_amount_cents && (
                    <div className="font-mono-ibm" style={{ fontSize: 14, color: V.telemetry, marginTop: 6 }}>
                      ${(m.quoted_amount_cents / 100).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
              <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, marginTop: 8 }}>
                {new Date(m.created_at).toLocaleDateString()} · {m.id.slice(0, 8)}
                <span style={{ float: "right", color: V.signal, fontWeight: 600 }}>Open / Edit →</span>
              </div>
            </div>
          );
        })}
      </div>
      {!loading && missions.length > 0 && <StatusLegend items={LEGEND} />}
    </Shell>
  );
}

function StatusLegend({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return <div style={{ ...panel, marginTop: 18, padding: 14 }}><div className="font-mono-ibm" style={{ fontSize: 10, color: V.inkFaint, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 9 }}>Mission status colors</div><div style={{ display: "flex", gap: "8px 16px", flexWrap: "wrap" }}>{items.map(([label, color]) => <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: V.inkDim, fontSize: 12 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />{label}</span>)}</div></div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>{children}</div>
    </div>
  );
}

const panel: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: V.signal, color: "#FFFFFF", fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
