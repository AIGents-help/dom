"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Box,
  Database,
  FolderKanban,
  Layers3,
  Map,
  Ruler,
  Settings,
  Sparkles,
  LogOut,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import MappingTab from "@/components/mapper/MappingTab";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicMascotImage from "@/components/dominic/DominicMascotImage";

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const BG = "#090D11";
const PANEL = "#10161D";
const LINE = "#25303B";
const TEXT = "#F5F7FA";
const MUTED = "#8F9CAA";

const workflow = [
  ["1", "Upload", "Your images"],
  ["2", "Process", "With DOMINIC"],
  ["3", "Review", "2D · 3D · Elevation"],
  ["4", "Measure & Markup", "Notes, dimensions, insights"],
  ["5", "Deliver", "Professional results"],
];

const nav = [
  { label: "Projects", icon: FolderKanban },
  { label: "Map Viewer", icon: Map },
  { label: "Processing", icon: Activity },
  { label: "Measure & Markup", icon: Ruler },
  { label: "Analysis", icon: Sparkles },
  { label: "3D & Point Cloud", icon: Box },
  { label: "Deliverables", icon: Layers3 },
  { label: "Data Library", icon: Database },
];

export default function DominicApp() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState("Projects");

  useEffect(() => {
    let active = true;
    getSupabaseBrowser().auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        router.replace("/pilot/login");
        return;
      }
      setAccessToken(data.session.access_token);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Image src="/brand/dom-propeller-3fin.png" alt="DOM" width={74} height={74} priority />
          <p style={{ marginTop: 16, color: MUTED, fontFamily: "Inter, sans-serif" }}>Opening DOMINIC…</p>
        </div>
      </div>
    );
  }

  if (!accessToken) return null;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "Inter, system-ui, sans-serif" }}>
      <header
        style={{
          minHeight: 78,
          borderBottom: `1px solid ${LINE}`,
          background: "linear-gradient(90deg, #11171E 0%, #0B1015 68%, #11171E 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          gap: 18,
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ minWidth: 280 }}>
          <DominicBrandLockup size="md" />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22, color: "#E8EDF2", fontSize: 15, whiteSpace: "nowrap" }}>
          <span>Map</span><span>Measure</span><span>Analyze</span><span>Deliver</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right", lineHeight: 1.15 }}>
            <div style={{ color: TEXT, fontSize: 12, fontWeight: 800 }}>DOM Pilot Workspace</div>
            <div style={{ color: MUTED, fontSize: 9, letterSpacing: ".08em", marginTop: 3 }}>DRONE OPERATION MANAGEMENT</div>
          </div>
          <button
            onClick={() => router.push("/pilot")}
            aria-label="Exit DOMINIC and return to DOM pilot workspace"
            style={{
              border: `1px solid ${LINE}`,
              background: PANEL,
              color: TEXT,
              borderRadius: 10,
              padding: "9px 12px",
              cursor: "pointer",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <LogOut size={15} /> Exit DOMINIC
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", minHeight: "calc(100vh - 78px)" }}>
        <aside
          style={{
            borderRight: `1px solid ${LINE}`,
            background: "linear-gradient(180deg, #0D1218 0%, #0A0F14 100%)",
            padding: 14,
            position: "sticky",
            top: 78,
            alignSelf: "start",
            height: "calc(100vh - 78px)",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              marginBottom: 14,
              padding: "8px 10px",
              color: ORANGE,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: ".16em",
              textTransform: "uppercase",
            }}
          >
            Project Workspace
          </div>

          <nav style={{ display: "grid", gap: 4 }}>
            {nav.map(({ label, icon: Icon }) => {
              const projectRequired = label !== "Projects";
              const disabled = projectRequired && !activeProjectId;
              const active = activeModule === label;
              return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                title={disabled ? "Open a DOMINIC project first" : label}
                onClick={() => {
                  if (disabled) return;
                  setActiveModule(label);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  borderRadius: 9,
                  padding: "10px 11px",
                  color: active ? "#160A02" : disabled ? "#596573" : "#A7B2BE",
                  background: active ? `linear-gradient(90deg, ${ORANGE_DARK}, ${ORANGE})` : "transparent",
                  border: active ? "1px solid rgba(244,90,30,.7)" : "1px solid transparent",
                  fontWeight: active ? 900 : 500,
                  width: "100%",
                  textAlign: "left",
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? .55 : 1,
                  fontSize: 13,
                }}
              >
                <Icon size={17} color={active ? "#160A02" : disabled ? "#596573" : "#798694"} />
                {label}
              </button>
              );
            })}
          </nav>

          <div style={{ marginTop: 18, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", color: MUTED, fontSize: 13 }}>
              <Settings size={17} />
              Settings
            </div>
          </div>

          <div
            style={{
              marginTop: 28,
              border: `1px solid ${LINE}`,
              borderRadius: 14,
              overflow: "hidden",
              background: "radial-gradient(circle at 50% 0%, rgba(244,90,30,.16), transparent 62%), #0A0F14",
              textAlign: "center",
            }}
          >
            <div style={{ position: "relative", aspectRatio: "1 / 1", width: "100%", overflow: "hidden" }}>
              <DominicMascotImage className="object-cover object-[48%_32%]" />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, rgba(9,13,17,.92) 100%)" }} />
            </div>
            <div style={{ padding: "0 12px 14px", marginTop: -16, position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <DominicBrandLockup size="sm" showTagline={false} compact />
              </div>
              <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>Same Perspective. Higher Purpose.</div>
            </div>
          </div>
        </aside>

        <main style={{ minWidth: 0 }}>
          <section
            style={{
              borderBottom: `1px solid ${LINE}`,
              background: "#0E141A",
              padding: "12px 18px",
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(130px, 1fr))",
              gap: 8,
              overflowX: "auto",
            }}
          >
            {workflow.map(([n, title, sub], index) => (
              <div
                key={title}
                style={{
                  minWidth: 140,
                  display: "grid",
                  gridTemplateColumns: "34px 1fr",
                  gap: 9,
                  alignItems: "center",
                  padding: "7px 10px",
                  borderRight: index < workflow.length - 1 ? `1px solid ${LINE}` : "none",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: index === 1 ? ORANGE : "#F1F4F7",
                    color: index === 1 ? "#180A02" : "#111820",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  {n}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{title}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>
                </div>
              </div>
            ))}
          </section>

          <section style={{ padding: "12px 14px 18px" }}>
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 12,
                background: PANEL,
                minHeight: "calc(100vh - 170px)",
                boxShadow: "0 24px 80px rgba(0,0,0,.24)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "12px 14px", color: TEXT, background: "#0B1117", minHeight: 680 }}>
                <MappingTab
                  accessToken={accessToken}
                  focusModule={activeModule}
                  onProjectChange={(projectId) => {
                    setActiveProjectId(projectId);
                    setActiveModule(projectId ? "Map Viewer" : "Projects");
                  }}
                />
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
