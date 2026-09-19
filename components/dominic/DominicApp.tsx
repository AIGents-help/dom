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
  MapPinned,
  Ruler,
  Settings,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import MappingTab from "@/components/mapper/MappingTab";

const ORANGE = "#F45A1E";
const ORANGE_DARK = "#D9480F";
const BG = "#090D11";
const PANEL = "#10161D";
const PANEL_2 = "#151C24";
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
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 280 }}>
          <Image src="/brand/dom-propeller-3fin.png" alt="DOM propeller" width={52} height={52} priority />
          <div>
            <div style={{ fontFamily: "Saira, Inter, sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: ".03em", lineHeight: 1 }}>
              DOM<span style={{ color: ORANGE }}>INIC</span>
            </div>
            <div style={{ color: MUTED, fontSize: 10, letterSpacing: ".22em", marginTop: 5 }}>INTELLIGENT MAPPING BY DOM</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22, color: "#E8EDF2", fontSize: 15, whiteSpace: "nowrap" }}>
          <span>Map</span><span>Measure</span><span>Analyze</span><span>Deliver</span>
        </div>

        <button
          onClick={() => router.push("/pilot")}
          style={{
            border: `1px solid ${LINE}`,
            background: PANEL,
            color: TEXT,
            borderRadius: 10,
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Back to DOM
        </button>
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
          <button
            style={{
              width: "100%",
              border: "none",
              background: `linear-gradient(90deg, ${ORANGE_DARK}, ${ORANGE})`,
              color: "#160A02",
              borderRadius: 10,
              padding: "12px 14px",
              fontWeight: 900,
              cursor: "default",
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <MapPinned size={18} /> Mapping Workspace
          </button>

          <nav style={{ display: "grid", gap: 4 }}>
            {nav.map(({ label, icon: Icon }, index) => (
              <div
                key={label}
                title={index === 0 ? "Active workspace" : "DOMINIC module — being connected in upcoming passes"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  borderRadius: 9,
                  padding: "10px 11px",
                  color: index === 0 ? TEXT : "#A7B2BE",
                  background: index === 0 ? PANEL_2 : "transparent",
                  border: index === 0 ? `1px solid ${LINE}` : "1px solid transparent",
                  fontSize: 13,
                }}
              >
                <Icon size={17} color={index === 0 ? ORANGE : "#798694"} />
                {label}
              </div>
            ))}
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
              borderRadius: 12,
              padding: 14,
              background: "radial-gradient(circle at 50% 0%, rgba(244,90,30,.16), transparent 62%)",
              textAlign: "center",
            }}
          >
            <Image src="/brand/dom-propeller-3fin.png" alt="" width={76} height={76} />
            <div style={{ fontFamily: "Saira, sans-serif", fontSize: 18, fontWeight: 800, marginTop: 4 }}>
              DOM<span style={{ color: ORANGE }}>INIC</span>
            </div>
            <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>Same Higher Perspective.</div>
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

          <section style={{ padding: 18 }}>
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 14,
                background: PANEL,
                minHeight: "calc(100vh - 190px)",
                boxShadow: "0 24px 80px rgba(0,0,0,.24)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${LINE}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#111820",
                }}
              >
                <div>
                  <div style={{ fontFamily: "Saira, sans-serif", fontSize: 17, fontWeight: 800 }}>DOMINIC Workspace</div>
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Existing DOM Mapper projects, processing and deliverables — now inside the product shell.</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: MUTED }}>
                  <UploadCloud size={16} color={ORANGE} />
                  Map · Measure · Analyze · Deliver
                </div>
              </div>

              <div style={{ padding: 18, color: "#111827", background: "#F6F8FA", minHeight: 620 }}>
                <MappingTab accessToken={accessToken} />
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
