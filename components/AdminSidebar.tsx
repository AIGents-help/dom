"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Collapsible left nav for the whole /admin section. Hidden on /admin/login
// (that page renders its own centered full-screen form). Collapsed state
// persists in localStorage so it doesn't reset on every navigation.

// Navy nav shell with light text + blue active state (DOM light theme).
const V = { surface: "#172033", line: "rgba(255,255,255,0.08)", ink: "#FFFFFF", inkDim: "#AEB7C4", inkFaint: "#8A95A7", signal: "#FFFFFF" };

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "◧" },
  { href: "/admin/leads", label: "CRM Files", icon: "☍" },
  { href: "/admin/missions", label: "Missions", icon: "▤" },
  { href: "/admin/dashboard#missions", label: "Mission Requests", icon: "↗", child: true },
  { href: "/admin/dashboard#jobs", label: "Jobs", icon: "▣", child: true },
  { href: "/admin/dashboard#schedule", label: "Schedule", icon: "□", child: true },
  { href: "/admin/dashboard#deliverables", label: "Deliverables", icon: "▱", child: true },
  { href: "/admin/dashboard#notes", label: "Notes", icon: "≡", child: true },
  { href: "/admin/dashboard#status", label: "Status Tracking", icon: "⌁", child: true },
  { href: "/admin/contractors", label: "Contractors", icon: "◎" },
];

const NOTIFICATION_NAV = [
  { href: "/admin/relationships", label: "CRM Protection", icon: "◇" },
  { href: "/admin/support", label: "Pilot Support", icon: "✚" },
  { href: "/admin/operations", label: "Exception Center", icon: "⚠" },
  { href: "/admin/programs", label: "Programs & Analytics", icon: "↻" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("dom_admin_sidebar_collapsed");
    if (stored) setCollapsed(stored === "1");
    setNotificationsOpen(NOTIFICATION_NAV.some((item) => window.location.pathname.startsWith(item.href)));
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      window.localStorage.setItem("dom_admin_sidebar_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") return null;

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
            <span className="font-saira" style={{ fontWeight: 700, fontSize: 16, color: V.ink }}>DOM Admin</span>
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
        {NAV.map((item) => {
          const [itemPath, itemHash = ""] = item.href.split("#");
          const active = itemHash
            ? pathname === itemPath && hash === `#${itemHash}`
            : pathname === itemPath && !hash || (!itemHash && (pathname?.startsWith(itemPath + "/") ?? false));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: item.child && !collapsed ? "7px 12px 7px 28px" : "10px 12px", borderRadius: 8,
                textDecoration: "none", color: active ? V.signal : V.inkDim,
                background: active ? "rgba(244,90,30,.22)" : "transparent",
                fontFamily: "Saira, sans-serif", fontWeight: item.child ? 500 : 600, fontSize: item.child ? 12 : 13,
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setNotificationsOpen((open) => !open)}
          aria-expanded={notificationsOpen}
          title={collapsed ? "Notifications" : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
            border: "none", background: "transparent", color: V.inkDim, cursor: "pointer",
            fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13,
            justifyContent: collapsed ? "center" : "flex-start", width: "100%",
          }}
        >
          <span style={{ fontSize: 15 }}>●</span>
          {!collapsed && <><span style={{ flex: 1, textAlign: "left" }}>Notifications</span><span>{notificationsOpen ? "⌃" : "⌄"}</span></>}
        </button>
        {notificationsOpen && NOTIFICATION_NAV.map((item) => {
          const active = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "9px 12px" : "7px 12px 7px 28px", borderRadius: 8,
                textDecoration: "none", color: active ? V.signal : V.inkDim,
                background: active ? "rgba(244,90,30,.22)" : "transparent",
                fontFamily: "Saira, sans-serif", fontWeight: 500, fontSize: 12,
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: 12, borderTop: `1px solid ${V.line}` }}>
        <button
          onClick={signOut}
          style={{ width: "100%", background: "transparent", border: "none", color: V.inkFaint, fontSize: 12, cursor: "pointer", textAlign: collapsed ? "center" : "left" }}
        >
          {collapsed ? "⏻" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
