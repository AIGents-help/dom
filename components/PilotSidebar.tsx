"use client";

import { useEffect, useState } from "react";

// Pilot counterpart to AdminSidebar. It intentionally uses the same full-
// height rail geometry, spacing, collapse behavior, colors, and footer so
// moving between DOM Admin and DOM Pilot feels like one operating system.
// /pilot is tab-based, so active state is supplied by the parent.

// Navy nav shell with light text + blue active state (DOM light theme).
const V = { surface: "#172033", line: "rgba(255,255,255,0.08)", ink: "#FFFFFF", inkDim: "#AEB7C4", inkFaint: "#8A95A7", signal: "#FFFFFF" };

export type PilotTab = "missions" | "crm" | "support" | "queue" | "create" | "mapping" | "assets" | "publicprofile" | "resources" | "sops" | "payouts" | "profile";

// The open Mission Queue is built but stays dark (hidden from nav) until
// escrow ships in a later PR — an open claim queue without payment
// commitment would expose client location/price data to every verified
// pilot pre-claim. Flip NEXT_PUBLIC_MISSION_QUEUE_ENABLED=true in Vercel to
// turn it on; no redeploy of logic needed.
const QUEUE_ENABLED = process.env.NEXT_PUBLIC_MISSION_QUEUE_ENABLED === "true";

// DOM Mapper — same "ship dark, flip flag" pattern as the Queue tab above.
// The processing worker (services/mapper-worker) needs to actually be
// running against a real NodeODM instance before this is useful to pilots;
// until then it stays out of the nav. Flip NEXT_PUBLIC_MAPPER_ENABLED=true
// once that's set up.
const MAPPER_ENABLED = process.env.NEXT_PUBLIC_MAPPER_ENABLED === "true";

const ITEMS: { id: PilotTab; label: string; icon: string }[] = [
  { id: "missions", label: "Missions", icon: "▤" },
  { id: "crm", label: "My CRM", icon: "☍" },
  { id: "support", label: "Pilot Support", icon: "✚" },
  ...(QUEUE_ENABLED ? [{ id: "queue" as PilotTab, label: "Queue", icon: "◫" }] : []),
  { id: "create", label: "Create Mission", icon: "✎" },
  ...(MAPPER_ENABLED ? [{ id: "mapping" as PilotTab, label: "Mapping", icon: "▦" }] : []),
  { id: "assets", label: "Assets", icon: "✈" },
  { id: "publicprofile", label: "Public Profile", icon: "◈" },
  { id: "resources", label: "Resources", icon: "⬡" },
  { id: "sops", label: "SOPs", icon: "☰" },
  { id: "payouts", label: "Payouts", icon: "$" },
  { id: "profile", label: "Profile", icon: "◎" },
];

export default function PilotSidebar({
  tab,
  setTab,
  onSignOut,
}: {
  tab: PilotTab;
  setTab: (t: PilotTab) => void;
  onSignOut: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("dom_pilot_sidebar_collapsed");
    if (stored) setCollapsed(stored === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      window.localStorage.setItem("dom_pilot_sidebar_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  return (
    <aside
      style={{
        width: collapsed ? 64 : 220,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        background: V.surface,
        borderRight: `1px solid ${V.line}`,
        display: "flex",
        flexDirection: "column",
        transition: "width .15s ease",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: "18px 16px" }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/brand/dom-icon-mark.png?v=3" alt="" style={{ height: 20, width: "auto" }} />
            <span className="font-saira" style={{ fontWeight: 700, fontSize: 16, color: V.ink }}>DOM Pilot</span>
          </div>
        )}
        <button
          onClick={toggle}
          aria-label="Toggle sidebar"
          style={{ background: "transparent", border: `1px solid ${V.line}`, color: V.inkDim, borderRadius: 6, width: 28, height: 28, cursor: "pointer", flexShrink: 0 }}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: 8, flex: 1 }}>
        {ITEMS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                border: "none", cursor: "pointer", textAlign: "left",
                color: active ? V.signal : V.inkDim,
                background: active ? "rgba(244,90,30,.22)" : "transparent",
                fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13,
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {!collapsed && item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: 12, borderTop: `1px solid ${V.line}` }}>
        <button
          onClick={onSignOut}
          style={{ width: "100%", background: "transparent", border: "none", color: V.inkFaint, fontSize: 12, cursor: "pointer", textAlign: collapsed ? "center" : "left" }}
        >
          {collapsed ? "⏻" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
