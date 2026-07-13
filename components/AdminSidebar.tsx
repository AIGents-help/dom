"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Collapsible left nav for the whole /admin section. Hidden on /admin/login
// (that page renders its own centered full-screen form). Collapsed state
// persists in localStorage so it doesn't reset on every navigation.

const V = { surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D" };

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "◧" },
  { href: "/admin/missions", label: "Missions", icon: "▤" },
  { href: "/admin/contractors", label: "Contractors", icon: "◎" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("dom_admin_sidebar_collapsed");
    if (stored) setCollapsed(stored === "1");
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
            <img src="/brand/dom-icon-mark.png" alt="" style={{ height: 20, width: "auto" }} />
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
          const active = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                textDecoration: "none", color: active ? V.signal : V.inkDim,
                background: active ? "rgba(255,138,61,.10)" : "transparent",
                fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13,
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
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
