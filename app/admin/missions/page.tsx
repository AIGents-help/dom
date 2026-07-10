"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  requested: { bg: "rgba(255,138,61,.12)", text: "#FF8A3D" },
  reviewing: { bg: "rgba(255,138,61,.12)", text: "#FF8A3D" },
  scoped: { bg: "rgba(79,209,197,.12)", text: "#4FD1C5" },
  quoted: { bg: "rgba(79,209,197,.12)", text: "#4FD1C5" },
  approved: { bg: "rgba(79,209,197,.18)", text: "#4FD1C5" },
  claimed: { bg: "rgba(255,138,61,.14)", text: "#FF8A3D" },
  assigned: { bg: "rgba(196,107,224,.14)", text: "#C46BE0" },
  in_progress: { bg: "rgba(196,107,224,.14)", text: "#C46BE0" },
  delivered: { bg: "rgba(79,209,197,.18)", text: "#4FD1C5" },
  closed: { bg: "rgba(90,102,120,.15)", text: "#5A6678" },
  cancelled: { bg: "rgba(90,102,120,.15)", text: "#5A6678" },
};

export default function MissionsPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

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

  const filtered = missions;
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
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {["all", "requested", "scoped", "quoted", "approved", "claimed", "assigned", "in_progress", "delivered", "closed"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="font-mono-ibm" style={{
            fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
            border: `1px solid ${f === filter ? V.signal : V.line}`,
            background: f === filter ? "rgba(255,138,61,.12)" : "transparent",
            color: f === filter ? V.signal : V.inkFaint,
          }}>
            {f.replace("_", " ").toUpperCase()}
          </button>
        ))}
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
            <div key={m.id} style={{ ...panel, cursor: "pointer", transition: "border-color .15s" }}
              onClick={() => router.push(`/admin/missions/${m.id}`)}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = V.signal)}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = V.line)}>
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
    <div style={{ minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>{children}</div>
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
