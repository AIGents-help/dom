"use client";

import { useState, type CSSProperties } from "react";
import { V } from "@/components/mapper/theme";

type PreviewModule = "Live Flight" | "AR View" | "AI Copilot";
const tools: PreviewModule[] = ["Live Flight", "AR View", "AI Copilot"];
const explanation: Record<PreviewModule, string> = {
  "Live Flight": "The future tool is intended to show connected aircraft position, telemetry, camera feeds and mission alerts alongside the planned route.",
  "AR View": "The future tool is intended to align asset names, prior findings and inspection targets with a live camera view.",
  "AI Copilot": "The future tool is intended to suggest missing coverage and inspection candidates using project imagery and telemetry, with decisions left to the pilot.",
};
const frames = [
  { x: 90, y: 220, altitude: 0, battery: 100, coverage: 0, event: "Sample aircraft at the launch point." },
  { x: 150, y: 140, altitude: 120, battery: 94, coverage: 28, event: "Tank 17 pass complete. Transfer line is next." },
  { x: 280, y: 110, altitude: 120, battery: 88, coverage: 61, event: "Transfer line captured. B-07 requires an oblique pass." },
  { x: 400, y: 180, altitude: 90, battery: 81, coverage: 86, event: "B-07 pass complete. Sample route returns to launch." },
  { x: 90, y: 220, altitude: 0, battery: 76, coverage: 100, event: "Sample mission complete. Aircraft at launch." },
];
const assets = [
  { name: "Tank 17", x: 150, y: 140, finding: "Sample finding: coating wear on the east rim. Capture a closer inspection image." },
  { name: "Transfer line", x: 280, y: 110, finding: "Sample finding: prior inspection recorded a loose support bracket." },
  { name: "B-07", x: 400, y: 180, finding: "Sample finding: the north face lacks oblique imagery." },
];
const recommendations = [
  { title: "Capture the north face of B-07", reason: "The sample dataset has no oblique image of this face. Add a pass before completing coverage." },
  { title: "Review the Tank 17 rim", reason: "This scripted example flags possible coating wear. An inspector would verify it against the source image." },
  { title: "Retake the transfer line image", reason: "The sample frame is marked blurred. A sharper image would improve inspection evidence." },
];
const button: CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 7, padding: "9px 12px", color: V.ink, background: V.surface, cursor: "pointer", fontSize: 12 };

export default function DominicPreviewEnvironment({ module, onOpen }: { module: PreviewModule; onOpen: (module: string) => void }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState(0);
  const [showHistory, setShowHistory] = useState(true);
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  const frame = frames[frameIndex];
  const recommendationIndex = recommendations.findIndex((_, index) => !decisions[index]);
  const recommendation = recommendations[recommendationIndex];
  return <section aria-label="Simulation project" style={{ color: V.ink, maxWidth: 1100, margin: "0 auto", padding: 8 }}>
    <div style={{ color: V.signal, fontSize: 11, fontWeight: 700 }}>SIMULATIONS & PREVIEWS · SAMPLE DATA</div>
    <h1 style={{ fontSize: 23, margin: "8px 0" }}>Demo refinery inspection</h1>
    <p style={{ color: V.inkDim, fontSize: 13, lineHeight: 1.6 }}>Explore future tools using a fictional inspection project. This simulation uses a drawn site and scripted examples; aircraft, camera feeds and AI services are not connected.</p>
    <nav aria-label="Simulation tools" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
      {tools.map((tool) => <button key={tool} type="button" aria-pressed={module === tool} onClick={() => onOpen(tool)}
        style={{ ...button, color: module === tool ? V.signal : V.ink, borderColor: module === tool ? V.signal : V.line }}>{tool}</button>)}
    </nav>
    <h2 style={{ fontSize: 18 }}>{module} simulation</h2>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 20, marginTop: 14 }}>
      <div>
        <svg viewBox="0 0 500 300" role="img" aria-label="Drawn refinery site with Tank 17, Transfer line and B-07" style={{ width: "100%", background: "#141E28", borderRadius: 8 }}>
          <path d="M35 255H465 M60 40V265 M30 70H470" stroke="#354554" strokeWidth="12" fill="none" />
          <circle cx="150" cy="140" r="40" fill="#2B3D4B" stroke="#647887" strokeWidth="3" />
          <path d="M195 110H330" stroke="#647887" strokeWidth="14" />
          <rect x="360" y="145" width="80" height="70" fill="#2B3D4B" stroke="#647887" strokeWidth="3" />
          {module === "Live Flight" ? <>
            <path d="M90 220L150 140L280 110L400 180L90 220" fill="none" stroke={V.signal} strokeDasharray="6 5" />
            <circle cx={frame.x} cy={frame.y} r="9" fill={V.signal} stroke="white" strokeWidth="2" />
          </> : null}
          {assets.map((asset, index) => <g key={asset.name}>
            <text x={asset.x} y={asset.y - 50} textAnchor="middle" fill="#F5F7FA" fontSize="13">{asset.name}</text>
            {module === "AR View" && showHistory ? <circle cx={asset.x} cy={asset.y} r="9" fill={index === selectedAsset ? V.signal : "#E7B45A"} /> : null}
          </g>)}
          <text x="20" y="287" fill="#9BAAB8" fontSize="11">Illustrated sample site · not a live map or camera</text>
        </svg>
        {module === "Live Flight" ? <>
          <p aria-live="polite" style={{ fontSize: 13 }}>{frame.event}</p>
          <p style={{ color: V.inkDim, fontSize: 12 }}>Frame {frameIndex + 1}/{frames.length} · Altitude {frame.altitude} ft · Battery {frame.battery}% · Coverage {frame.coverage}%</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" style={button} disabled={frameIndex === frames.length - 1} onClick={() => setFrameIndex((index) => Math.min(index + 1, frames.length - 1))}>Next sample frame</button>
            <button type="button" style={button} onClick={() => setFrameIndex(0)}>Reset replay</button>
          </div>
        </> : module === "AR View" ? <>
          <label style={{ display: "block", fontSize: 13, margin: "14px 0" }}><input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} /> Show prior findings</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{assets.map((asset, index) => <button key={asset.name} type="button" aria-pressed={selectedAsset === index} style={button} onClick={() => setSelectedAsset(index)}>{asset.name}</button>)}</div>
          <p aria-live="polite" style={{ fontSize: 13, lineHeight: 1.6 }}>{showHistory ? assets[selectedAsset].finding : "Prior findings hidden. Select an asset to highlight its location."}</p>
        </> : <div style={{ marginTop: 14 }}>
          {recommendation ? <>
            <h3 style={{ fontSize: 15 }}>{recommendation.title}</h3>
            <p style={{ color: V.inkDim, fontSize: 13, lineHeight: 1.6 }}>{recommendation.reason}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" style={button} onClick={() => setDecisions((previous) => ({ ...previous, [recommendationIndex]: "Added to sample checklist" }))}>Add to sample checklist</button>
              <button type="button" style={button} onClick={() => setDecisions((previous) => ({ ...previous, [recommendationIndex]: "Dismissed" }))}>Dismiss example</button>
            </div>
          </> : <p>All sample recommendations reviewed.</p>}
          <ul aria-live="polite" style={{ paddingLeft: 20, fontSize: 12 }}>{recommendations.map((item, index) => decisions[index] ? <li key={item.title}>{item.title}: {decisions[index]}</li> : null)}</ul>
          <button type="button" style={button} onClick={() => setDecisions({})}>Reset recommendations</button>
        </div>}
      </div>
      <aside style={{ borderTop: `1px solid ${V.line}`, paddingTop: 12 }}>
        <h3 style={{ fontSize: 15, marginTop: 0 }}>What the future tool will do</h3>
        <p style={{ color: V.inkDim, fontSize: 13, lineHeight: 1.7 }}>{explanation[module]}</p>
        <p style={{ color: V.inkDim, fontSize: 13, lineHeight: 1.7 }}>{module === "Live Flight" ? "Try advancing the sample frames to see position, coverage and battery change together." : module === "AR View" ? "Try selecting an asset and toggling its prior findings. Real camera alignment and change detection remain future capabilities." : "Try accepting or dismissing the examples. These recommendations are scripted, not generated by an AI model."}</p>
        <p style={{ color: V.inkFaint, fontSize: 12, lineHeight: 1.6 }}>Sample actions stay in this preview. They do not create inspection records or control an aircraft. Reset the example to try again.</p>
      </aside>
    </div>
  </section>;
}
