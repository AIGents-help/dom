"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

const V = {
  surface: "#172033",
  line: "rgba(255,255,255,0.08)",
  ink: "#FFFFFF",
  inkDim: "#AEB7C4",
  inkFaint: "#8A95A7",
  signal: "#FFFFFF",
};

export type PilotTab =
  | "missions"
  | "crm"
  | "support"
  | "queue"
  | "create"
  | "mapping"
  | "assets"
  | "publicprofile"
  | "resources"
  | "sops"
  | "payouts"
  | "profile";

const QUEUE_ENABLED = process.env.NEXT_PUBLIC_MISSION_QUEUE_ENABLED === "true";

type SectionId = "missions" | "dominic" | "business" | "operations" | "help";
type Item = { id: PilotTab; label: string; icon: string; href?: string };
type Section = { id: SectionId; label: string; icon: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    id: "missions",
    label: "Missions",
    icon: "▤",
    items: [
      { id: "missions", label: "Mission Dashboard", icon: "•" },
      { id: "create", label: "Create New", icon: "+" },
      ...(QUEUE_ENABLED ? [{ id: "queue" as PilotTab, label: "Mission Queue", icon: "◫" }] : []),
    ],
  },
  {
    id: "dominic",
    label: "DOMINIC",
    icon: "◉",
    items: [
      { id: "mapping", label: "Open Workspace", icon: "◉", href: "/dominic" },
      { id: "mapping", label: "New Project", icon: "+", href: "/dominic?new=1" },
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
      { id: "assets", label: "Assets", icon: "✈" },
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
}: {
  tab: PilotTab;
  setTab: (t: PilotTab) => void;
  onSignOut: () => void;
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
    if (item.href) router.push(item.href);
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
      color: active ? V.signal : V.inkDim,
      background: active ? "rgba(244,90,30,.22)" : "transparent",
      fontFamily: "Saira, sans-serif",
      fontWeight: active ? 700 : 600,
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: "18px 14px 14px" }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Image src="/brand/dom-icon-mark.png" alt="" width={20} height={20} />
            <span className="font-saira" style={{ fontWeight: 700, fontSize: 16, color: V.ink }}>DOM Pilot</span>
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
                  background: sectionActive ? "rgba(244,90,30,.12)" : "transparent",
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

      <div style={{ padding: 10, borderTop: `1px solid ${V.line}` }}>
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
