"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { PILOT_V as V } from "@/lib/pilotTheme";


export type PilotTab =
  | "missions"
  | "crm"
  | "support"
  | "queue"
  | "create"
  | "mapping"
  | "publicprofile"
  | "resources"
  | "sops"
  | "payouts"
  | "profile";

const QUEUE_ENABLED = process.env.NEXT_PUBLIC_MISSION_QUEUE_ENABLED === "true";

type SectionId = "missions" | "dominic" | "business" | "operations" | "help";
type PilotIdentity = { fullName: string; email: string; photoUrl: string | null; part107Verified: boolean };
type Item = { id: PilotTab; label: string; icon: string; href?: string; newTab?: boolean };
type Section = { id: SectionId; label: string; icon: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    id: "missions",
    label: "Missions",
    icon: "▤",
    items: [
      { id: "missions", label: "My Missions", icon: "•" },
      { id: "create", label: "Create New", icon: "+" },
      ...(QUEUE_ENABLED ? [{ id: "queue" as PilotTab, label: "Mission Queue", icon: "◫" }] : []),
    ],
  },
  {
    id: "dominic",
    label: "DOMINIC",
    icon: "◉",
    items: [
      { id: "mapping", label: "Open Workspace", icon: "◉", href: "/dominic", newTab: true },
      { id: "mapping", label: "New Project", icon: "+", href: "/dominic?new=1", newTab: true },
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: "◈",
    items: [
      { id: "crm", label: "My CRM", icon: "☍" },
      { id: "payouts", label: "Payouts", icon: "$" },
      { id: "publicprofile", label: "Public Profile", icon: "◇" },
    ],
  },
  {
    id: "operations",
    label: "Flight Operations",
    icon: "✈",
    items: [
      { id: "sops", label: "SOPs", icon: "☰" },
    ],
  },
  {
    id: "help",
    label: "Help & Resources",
    icon: "✚",
    items: [
      { id: "resources", label: "Resources", icon: "⬡" },
      { id: "support", label: "Pilot Support", icon: "✚" },
    ],
  },
];

const DIRECT_ITEMS: Item[] = [
  { id: "profile", label: "Profile & Settings", icon: "◎" },
];

function sectionForTab(tab: PilotTab): SectionId | null {
  return SECTIONS.find((section) => section.items.some((item) => item.id === tab))?.id ?? null;
}

export default function PilotSidebar({
  tab,
  setTab,
  onSignOut,
  pilot,
}: {
  tab: PilotTab;
  setTab: (t: PilotTab) => void;
  onSignOut: () => void;
  pilot: PilotIdentity;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const activeSection = useMemo(() => sectionForTab(tab), [tab]);
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    missions: true,
    dominic: true,
    business: false,
    operations: false,
    help: false,
  });
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem("dom_pilot_sidebar_collapsed");
    if (stored) setCollapsed(stored === "1");

    const storedSections = window.localStorage.getItem("dom_pilot_sidebar_sections");
    if (storedSections) {
      try {
        setOpenSections((current) => ({ ...current, ...JSON.parse(storedSections) }));
      } catch {
        // Ignore stale menu preferences.
      }
    }
  }, []);

  useEffect(() => {
    if (!activeSection) return;
    setOpenSections((current) => current[activeSection] ? current : { ...current, [activeSection]: true });
  }, [activeSection]);

  function toggleSidebar() {
    setCollapsed((current) => {
      window.localStorage.setItem("dom_pilot_sidebar_collapsed", current ? "0" : "1");
      return !current;
    });
  }

  function toggleSection(id: SectionId) {
    if (collapsed) {
      setCollapsed(false);
      window.localStorage.setItem("dom_pilot_sidebar_collapsed", "0");
    }
    setOpenSections((current) => {
      const next = { ...current, [id]: !current[id] };
      window.localStorage.setItem("dom_pilot_sidebar_sections", JSON.stringify(next));
      return next;
    });
  }

  function go(item: Item) {
    if (item.href && item.newTab) window.open(item.href, "_blank", "noopener,noreferrer");
    else if (item.href) router.push(item.href);
    else setTab(item.id);
  }

  function navButtonStyle(active: boolean, nested = false): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: 10,
      minHeight: nested ? 34 : 40,
      padding: nested ? "7px 10px 7px 31px" : "9px 11px",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      textAlign: "left",
      color: active ? "#160A02" : V.inkDim,
      background: active ? "linear-gradient(90deg, #D9480F, #F45A1E)" : "transparent",
      fontFamily: "Saira, sans-serif",
      fontWeight: active ? 900 : 600,
      fontSize: nested ? 12 : 13,
      justifyContent: collapsed ? "center" : "flex-start",
      width: "100%",
    };
  }

  return (
    <aside
      style={{
        width: collapsed ? 64 : 228,
        flexShrink: 0,
        position: "sticky",
        top: 78,
        height: "calc(100vh - 78px)",
        background: V.surface,
        borderRight: `1px solid ${V.line}`,
        display: "flex",
        flexDirection: "column",
        transition: "width .15s ease",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: "14px 12px 12px" }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Image src="/brand/dom-icon-mark.png" alt="" width={22} height={22} />
            <div><span className="font-saira" style={{ display: "block", fontWeight: 900, fontSize: 14, color: V.ink, letterSpacing: ".04em" }}>PILOT WORKSPACE</span><span style={{ display: "block", color: V.inkFaint, fontSize: 8, letterSpacing: ".13em", marginTop: 2 }}>DRONE OPERATION MANAGEMENT</span></div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand pilot menu" : "Collapse pilot menu"}
          style={{ background: "transparent", border: `1px solid ${V.line}`, color: V.inkDim, borderRadius: 7, width: 30, height: 30, cursor: "pointer", flexShrink: 0 }}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 8px 10px", flex: 1, overflowY: "auto" }}>
        {SECTIONS.map((section) => {
          const sectionActive = section.items.some((item) => item.id === tab);
          const open = openSections[section.id];
          return (
            <div key={section.id}>
              <button
                onClick={() => toggleSection(section.id)}
                title={collapsed ? section.label : undefined}
                aria-expanded={!collapsed && open}
                style={{
                  ...navButtonStyle(sectionActive),
                  background: sectionActive ? "rgba(244,90,30,.10)" : "transparent",
                  border: sectionActive ? "1px solid rgba(244,90,30,.25)" : "1px solid transparent",
                  color: sectionActive ? "#F1F4F7" : V.inkDim,
                }}
              >
                <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>{section.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{section.label}</span>
                    <span style={{ color: V.inkFaint, fontSize: 11 }}>{open ? "⌄" : "›"}</span>
                  </>
                )}
              </button>

              {!collapsed && open && (
                <div style={{ display: "grid", gap: 2, marginTop: 2, marginBottom: 4 }}>
                  {section.items.map((item) => {
                    const active = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => go(item)}
                        style={navButtonStyle(active, true)}
                      >
                        <span style={{ width: 13, textAlign: "center", color: active ? "#F45A1E" : V.inkFaint }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ height: 1, background: V.line, margin: "5px 4px" }} />

        {DIRECT_ITEMS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => go(item)}
              title={collapsed ? item.label : undefined}
              style={navButtonStyle(active)}
            >
              <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: 10, borderTop: `1px solid ${V.line}`, background: V.raised }}>
        <button
          onClick={() => setTab("profile")}
          title={collapsed ? pilot.fullName : "Open my profile"}
          aria-label="Open my pilot profile"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10,
            padding: collapsed ? "7px 0 9px" : "8px",
            borderRadius: 9,
            border: tab === "profile" ? "1px solid rgba(244,90,30,.38)" : "1px solid transparent",
            background: tab === "profile" ? "rgba(244,90,30,.08)" : "transparent",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
              border: "1px solid rgba(244,90,30,.42)",
              background: pilot.photoUrl
                ? `center / cover no-repeat url("${pilot.photoUrl.replace(/"/g, "%22")}")`
                : "linear-gradient(145deg,#3A444D,#20272D)",
              color: V.ink,
              fontFamily: "Saira, sans-serif",
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {!pilot.photoUrl && pilot.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
          </span>
          {!collapsed && (
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="font-saira" style={{ display: "block", color: V.ink, fontWeight: 800, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pilot.fullName}
              </span>
              <span style={{ display: "block", color: pilot.part107Verified ? V.telemetry : V.warn, fontSize: 9, marginTop: 1 }}>
                {pilot.part107Verified ? "Part 107 verified" : "Pilot profile"}
              </span>
            </span>
          )}
        </button>
        {!collapsed && <div style={{ color: V.inkFaint, fontSize: 9, padding: "0 8px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pilot.email}</div>}
        <button
          onClick={onSignOut}
          title={collapsed ? "Sign out" : undefined}
          style={{ width: "100%", background: "transparent", border: "none", color: V.inkFaint, padding: "8px 10px", fontSize: 12, cursor: "pointer", textAlign: collapsed ? "center" : "left" }}
        >
          {collapsed ? "⏻" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
