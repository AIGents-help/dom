// Canonical light "operations/CRM" palette for the inline-style side of the app
// (pilot portal, inline-hex admin, mapper). Previously each of these files
// re-declared its own dark `const V = {...}`; they now import this single
// source so the theme stays consistent. Content surfaces use white cards on a
// light page with dark text; nav shells use `navy` with light text (handled in
// the individual nav components). DOM orange (#F45A1E) is the primary accent;
// status colors keep their semantic meaning (green=success, orange=warning,
// red=error, purple=distinct status).

export const V = {
  ground: "#F5F7FA", // page background
  surface: "#FFFFFF", // cards / panels
  raised: "#FFFFFF", // elevated panels (separated by border/shadow)
  line: "#D9E0E8", // borders / dividers
  lineSoft: "#E8EDF2", // subtle dividers
  ink: "#172033", // primary text
  inkDim: "#5F6B7A", // secondary text
  inkFaint: "#8A95A7", // tertiary / faint text
  signal: "#F45A1E", // PRIMARY action / accent (DOM orange)
  telemetry: "#16A34A", // success / completed / won (green)
  airspace: "#7C3AED", // distinct status (purple)
  danger: "#DC2626", // errors
  warn: "#E5701F", // warnings / overdue (orange)
  navy: "#172033", // nav / sidebar shell
};

export const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
export const btnPrimary: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: "none", background: V.signal, color: "#FFFFFF", fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
export const btnGhost: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
export const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${V.line}`, background: "#FFFFFF", color: V.ink, fontSize: 13, outline: "none" };
export const labelStyle: React.CSSProperties = { fontSize: 12, color: V.inkDim, marginBottom: 5, display: "block" };

export function statusPillStyle(color: string): React.CSSProperties {
  return {
    fontSize: 10, padding: "4px 9px", borderRadius: 20, letterSpacing: ".06em",
    textTransform: "uppercase", display: "inline-block", background: `${color}20`, color,
  };
}
