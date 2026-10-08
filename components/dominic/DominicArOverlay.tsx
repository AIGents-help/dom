"use client";
import type { ArMarker } from "@/lib/aircraft/arRegistration";

export default function DominicArOverlay({ markers, width, height }: { markers: ArMarker[]; width: number; height: number }) {
  return <svg role="img" aria-label="Calibrated AR projections" viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
    {markers.map((marker) => <g key={marker.id}>
      <title>{marker.label} · estimated alignment bound {marker.errorPx.toFixed(1)} pixels · occlusion not assessed</title>
      <circle cx={marker.x * width} cy={marker.y * height} r={Math.max(5, marker.errorPx)} fill="rgba(244,90,30,.2)" stroke="#F45A1E" strokeWidth={2} />
      <text x={marker.x * width} y={Math.max(16, marker.y * height - 12)} textAnchor="middle" fontSize={14} fill="white" stroke="#090D12" strokeWidth={4} paintOrder="stroke">{marker.label}</text>
    </g>)}
  </svg>;
}
