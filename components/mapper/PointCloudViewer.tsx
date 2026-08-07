"use client";

import { V, panelStyle, btnGhost } from "./theme";

// Structure-only for this pass — real rendering (e.g. Potree) is the next
// checkpoint. Contract is real: a signed download URL for the point cloud
// artifact in mission-deliverables.
export default function PointCloudViewer({ signedUrl, name }: { signedUrl: string | null; name: string }) {
  return (
    <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em" }}>Point Cloud</span>
        {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Download →</a>}
      </div>
      <div style={{ aspectRatio: "16 / 9", background: V.ground, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: V.inkFaint, fontSize: 13, textAlign: "center", padding: 20 }}>
          {signedUrl ? `${name} ready — interactive point cloud viewer (e.g. Potree) is a follow-up checkpoint.` : "Point cloud viewer placeholder."}
        </p>
      </div>
    </div>
  );
}
