import type { CSSProperties } from "react";

// DOMINIC owns its own product theme. The underlying mapper remains part of
// DOM operationally, but its user-facing workspace is intentionally darker,
// denser, and more map-centric than the light CRM/operations surfaces.
export const V = {
  ground: "#4B535B",
  surface: "#10161D",
  raised: "#151C24",
  line: "#2A3540",
  lineSoft: "#202A34",
  ink: "#F5F7FA",
  inkDim: "#B2BCC7",
  inkFaint: "#7F8B98",
  signal: "#F45A1E",
  telemetry: "#2FB66D",
  airspace: "#A78BFA",
  danger: "#F05A5A",
  warn: "#F59E0B",
  djiGrey: "#4B535B",\n  navy: "#4B535B",
};

export const panelStyle: CSSProperties = {
  border: `1px solid ${V.line}`,
  borderRadius: 12,
  background: V.surface,
  padding: 18,
  boxShadow: "0 18px 42px rgba(0,0,0,.16)",
};

export const btnPrimary: CSSProperties = {
  padding: "9px 16px",
  borderRadius: 9,
  border: "none",
  background: "linear-gradient(135deg, #D9480F, #F45A1E)",
  color: "#FFFFFF",
  fontFamily: "Saira, sans-serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(244,90,30,.18)",
};

export const btnGhost: CSSProperties = {
  padding: "9px 16px",
  borderRadius: 9,
  border: `1px solid ${V.line}`,
  background: "#0D1319",
  color: V.ink,
  fontFamily: "Saira, sans-serif",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 8,
  border: `1px solid ${V.line}`,
  background: "#0B1117",
  color: V.ink,
  fontSize: 13,
  outline: "none",
};

export const labelStyle: CSSProperties = {
  fontSize: 11,
  color: V.inkDim,
  marginBottom: 6,
  display: "block",
  letterSpacing: ".06em",
  textTransform: "uppercase",
};

export function statusPillStyle(color: string): CSSProperties {
  return {
    fontSize: 10,
    padding: "4px 9px",
    borderRadius: 20,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    display: "inline-block",
    background: `${color}20`,
    border: `1px solid ${color}55`,
    color,
  };
}
