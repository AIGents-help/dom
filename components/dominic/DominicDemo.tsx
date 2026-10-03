"use client";

import { useState } from "react";
import Link from "next/link";
import DominicBrandLockup from "./DominicBrandLockup";
import DominicNavigation from "./DominicNavigation";
import DominicPreviewEnvironment from "./DominicPreviewEnvironment";
import DominicSampleScene from "./DominicSampleScene";
import { V, btnGhost } from "@/components/mapper/theme";

const sampleFindings = [
  { asset: "Tank 17", title: "Coating wear on east rim", severity: "Medium", action: "Review close-range evidence before confirming repair." },
  { asset: "Transfer line", title: "Support bracket needs review", severity: "Medium", action: "Confirm bracket condition during the next inspection." },
  { asset: "B-07", title: "Missing north-face coverage", severity: "Low", action: "Add an oblique pass to complete visual coverage." },
];
const previews = new Set(["Live Flight", "AR View", "AI Copilot"]);

export default function DominicDemo() {
  const [module, setModule] = useState("Projects");
  const [selectedFinding, setSelectedFinding] = useState(0);
  const finding = sampleFindings[selectedFinding];
  return <div style={{ background: "#0B1117", minHeight: "100vh", color: V.ink }}>
    <header style={{ padding: "16px 20px", borderBottom: `1px solid ${V.line}`, background: V.surface, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <Link href="/" aria-label="DOM homepage"><DominicBrandLockup /></Link>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: V.signal }}>VIEW-ONLY SAMPLE</span>
        <Link href="/dominic" style={btnGhost}>Open my workspace</Link>
        <Link href="/dominic/licensing" style={btnGhost}>Free & Premium access</Link>
      </div>
    </header>
    <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b p-4 lg:border-b-0 lg:border-r" style={{ background: V.surface, borderColor: V.line }}>
        <div className="hidden lg:block"><DominicNavigation activeModule={module} hasProject collapsed={false} onOpen={setModule} /></div>
        <details className="lg:hidden"><summary style={{ cursor: "pointer", color: V.signal, fontSize: 13 }}>Browse sample tools</summary>
          <div style={{ paddingTop: 14 }}><DominicNavigation activeModule={module} hasProject collapsed={false} onOpen={(next) => { setModule(next); }} /></div>
        </details>
      </aside>
      <main style={{ padding: "20px clamp(14px,3vw,36px)", minWidth: 0, maxWidth: 1400 }}>
        <p style={{ color: V.inkDim, fontSize: 12, lineHeight: 1.6, marginTop: 0 }}>No account required. Browse fictional project data; this sample cannot upload, save, process imagery, control aircraft or purchase a subscription. Future-tool simulations use local sample interactions.</p>
        {previews.has(module) ? <DominicPreviewEnvironment module={module as "Live Flight" | "AR View" | "AI Copilot"} onOpen={setModule} /> : <>
          <div style={{ color: V.signal, fontSize: 11 }}>SAMPLE PROJECT</div>
          <h1 style={{ fontSize: 27, margin: "7px 0 18px" }}>Demo refinery inspection</h1>
          {module === "Projects" ? <>
            <DominicSampleScene />
            <p style={{ color: V.inkDim, lineHeight: 1.6 }}>Inspect the sample site, review its capture plan and findings, and explore how project tools fit together.</p>
            <button type="button" style={btnGhost} onClick={() => setModule("Map Viewer")}>Open sample project</button>
          </> : module === "Capture Planner" || module === "Project Records" ? <>
            <h2 style={{ fontSize: 19 }}>Sample capture plan</h2>
            <DominicSampleScene position={{ x: 280, y: 110 }} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 py-4 text-sm">
              <dt>Capture type</dt><dd>Building and tank inspection</dd><dt>Planned altitude</dt><dd>120 ft (sample)</dd><dt>Overlap</dt><dd>75%</dd><dt>Inspection targets</dt><dd>Tank 17, transfer line, B-07</dd>
            </dl>
            <p style={{ color: V.inkDim, fontSize: 13 }}>Free accounts can create and save real capture plans. This sample plan is view-only.</p>
            <button type="button" style={btnGhost} onClick={() => setModule("Asset Intelligence")}>Review sample inspections</button>
          </> : module === "Intelligent Inspection" || module === "Asset Intelligence" || module === "Map Viewer" ? <>
            <h2 style={{ fontSize: 19 }}>{module === "Map Viewer" ? "Sample image & inspection overlays" : module === "Intelligent Inspection" ? "Intelligent Inspection sample" : "Assets & inspections"}</h2>
            <DominicSampleScene showFindings selectedAsset={selectedFinding} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>{sampleFindings.map((item, index) => <button key={item.asset} type="button" style={btnGhost} aria-pressed={selectedFinding === index} onClick={() => setSelectedFinding(index)}>{item.asset}</button>)}</div>
            <div aria-live="polite"><h3 style={{ fontSize: 17 }}>{finding.title}</h3><p style={{ color: V.inkDim, fontSize: 13 }}>{finding.severity} priority · Fictional example requiring inspector review</p><p style={{ fontSize: 13 }}>{finding.action}</p></div>
            {module === "Intelligent Inspection" ? <p style={{ color: V.inkDim, fontSize: 13 }}>Vision: incoming flight images produce anomaly callouts, previous-image comparisons and illustrated reports. These findings are scripted sample data. The account workspace reviews saved inspection evidence; continuous live video and automatic image registration are still future capabilities.</p> : null}
            <p style={{ color: V.inkFaint, fontSize: 12 }}>This sample viewer uses an aerial image. Real maps and 3D models come from processed project imagery in the licensed workspace.</p>
          </> : module === "Data Library" ? <>
            <h2 style={{ fontSize: 19 }}>Sample source imagery</h2>
            <DominicSampleScene />
            <p style={{ fontSize: 13, color: V.inkDim }}>refinery-aerial-v1.webp · 1536 × 1024 · AI-generated sample</p>
            <p style={{ fontSize: 13 }}>Real project uploads retain source files and image metadata. Uploads are disabled in this public sample.</p>
          </> : module === "Processing" ? <>
            <h2 style={{ fontSize: 19 }}>Processing example</h2>
            <DominicSampleScene />
            <ol style={{ color: V.inkDim, lineHeight: 2, fontSize: 13 }}><li>Upload and check source imagery.</li><li>Choose a reconstruction profile.</li><li>Queue processing and follow progress.</li><li>Review available map, model and export outputs.</li></ol>
            <p style={{ fontSize: 13 }}>This is a walkthrough. No processing job runs in the public sample.</p>
          </> : module === "Deliverables" ? <>
            <h2 style={{ fontSize: 19 }}>Sample inspection report</h2>
            <DominicSampleScene showFindings selectedAsset={selectedFinding} />
            <ul style={{ color: V.inkDim, fontSize: 13, lineHeight: 2 }}>{sampleFindings.map((item) => <li key={item.asset}>{item.asset}: {item.title} · {item.severity}</li>)}</ul>
            <p style={{ fontSize: 13 }}>A real report includes project evidence, inspector review and available export files. The fictional findings here are view-only.</p>
          </> : <>
            <h2 style={{ fontSize: 19 }}>Refinery operations sample</h2>
            <DominicSampleScene position={{ x: 150, y: 140 }} />
            <p style={{ color: V.inkDim, lineHeight: 1.7, fontSize: 13 }}>A sample dock schedules a tank inspection and tracks a simulated route. DOMINIC HUB in the account workspace provides the operational simulator. Aircraft and sensor integrations remain separate future capabilities.</p>
            <button type="button" style={btnGhost} onClick={() => setModule("Live Flight")}>Explore flight simulation</button>
          </>}
        </>}
      </main>
    </div>
  </div>;
}
