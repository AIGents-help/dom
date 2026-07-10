"use client";

import { useEffect, useState } from "react";

// Collapsible left nav for the pilot dashboard's tabs. Unlike AdminSidebar
// this isn't route-based — /pilot is a single page that swaps sections by
// client state, so this takes the active tab + setter as props instead of
// using next/navigation.

const V = { surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D" };

export type PilotTab = "missions" | "queue" | "create" | "publicprofile" | "resources" | "sops" | "payouts" | "profile";

// The open Mission Queue is built but stays dark (hidden from nav) until
// escrow ships in a later PR — an open claim queue without payment
// commitment would expose client location/price data to every verified
// pilot pre-claim. Flip NEXT_PUBLIC_MISSION_QUEUE_ENABLED=true in Vercel to
// turn it on; no redeploy of logic needed.
const QUEUE_ENABLED = process.env.NEXT_PUBLIC_MISSION_QUEUE_ENABLED === "true";

const ITEMS: { id: PilotTab; label: string; icon: string }[] = [
  { id: "missions", label: "Missions", icon: "▤" },
  ...(QUEUE_ENABLED ? [{ id: "queue" as PilotTab, label: "Queue", icon: "◫" }] : []),
  { id: "create", label: "Create Mission", icon: "✎" },
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
        width: collapsed ? 60 : 200,
        flexShrink: 0,
        background: V.surface,
        border: `1px solid ${V.line}`,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        height: "fit-content",
        position: "sticky",
        top: 24,
        transition: "width .15s ease",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-end", padding: 10 }}>
        <button
          onClick={toggle}
          aria-label="Toggle sidebar"
          style={{ background: "transparent", border: `1px solid ${V.line}`, color: V.inkDim, borderRadius: 6, width: 26, height: 26, cursor: "pointer", flexShrink: 0 }}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px 8px" }}>
        {ITEMS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 8,
                border: "none", cursor: "pointer", textAlign: "left",
                color: active ? V.signal : V.inkDim,
                background: active ? "rgba(255,138,61,.10)" : "transparent",
                fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13,
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {!collapsed && item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: 8, borderTop: `1px solid ${V.line}`, marginTop: 4 }}>
        <button
          onClick={onSignOut}
          style={{ width: "100%", background: "transparent", border: "none", color: V.inkFaint, fontSize: 12, cursor: "pointer", padding: "8px 10px", textAlign: collapsed ? "center" : "left" }}
        >
          {collapsed ? "⏻" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
