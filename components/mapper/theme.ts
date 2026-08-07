// Shared inline-style tokens for components/mapper/*, matching the existing
// Pilot Dashboard visual system exactly (components/PilotQueue.tsx,
// components/PilotSidebar.tsx, app/pilot/page.tsx all use this same V
// palette + inline React.CSSProperties pattern rather than Tailwind — the
// admin side uses Tailwind, the pilot side doesn't, and mapper lives under
// /pilot).

export const V = {
  ground: "#0A0E14", surface: "#11161F", raised: "#161D29",
  line: "#232C3B", lineSoft: "#1A222F",
  ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678",
  signal: "#FF8A3D", telemetry: "#4FD1C5", danger: "#FF5C5C",
};

export const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
export const btnPrimary: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: "none", background: V.signal, color: "#0A0E14", fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
export const btnGhost: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
export const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 13, outline: "none" };
export const labelStyle: React.CSSProperties = { fontSize: 12, color: V.inkDim, marginBottom: 5, display: "block" };

export function statusPillStyle(color: string): React.CSSProperties {
  return {
    fontSize: 10, padding: "4px 9px", borderRadius: 20, letterSpacing: ".06em",
    textTransform: "uppercase", display: "inline-block", background: `${color}20`, color,
  };
}
