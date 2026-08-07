"use client";

import { V, panelStyle, btnGhost } from "./theme";

// Structure-only for this pass, per the architecture decision — the
// component contract (props in, actions out) is real; the actual map
// rendering (e.g. MapLibre GL over the orthomosaic's tile/COG output) is
// the next checkpoint once a real processed output exists to render.
export default function OrthomosaicViewer({ signedUrl, name }: { signedUrl: string | null; name: string }) {
  return (
    <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em" }}>Orthomosaic</span>
        {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Open full resolution →</a>}
      </div>
      <div style={{ aspectRatio: "16 / 9", background: V.ground, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt={name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <p style={{ color: V.inkFaint, fontSize: 13 }}>Map viewer placeholder — full georeferenced pan/zoom is a follow-up checkpoint.</p>
        )}
      </div>
    </div>
  );
}
