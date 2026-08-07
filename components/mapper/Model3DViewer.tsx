"use client";

import { V, panelStyle, btnGhost } from "./theme";

// Structure-only for this pass — real rendering (e.g. a glTF/OBJ viewer via
// three.js) is the next checkpoint. The contract (a signed download URL for
// the model artifact in mission-deliverables) is real and won't need to
// change when a real renderer is dropped in here.
export default function Model3DViewer({ signedUrl, name }: { signedUrl: string | null; name: string }) {
  return (
    <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em" }}>3D Model</span>
        {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Download →</a>}
      </div>
      <div style={{ aspectRatio: "16 / 9", background: V.ground, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: V.inkFaint, fontSize: 13, textAlign: "center", padding: 20 }}>
          {signedUrl ? `${name} ready — interactive 3D viewer is a follow-up checkpoint.` : "3D viewer placeholder."}
        </p>
      </div>
    </div>
  );
}
