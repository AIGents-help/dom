"use client";

import { useEffect, useMemo, useState } from "react";
import { V, panelStyle, btnGhost } from "./theme";

type Position = [number, number];

interface Feature {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: { type: "LineString" | "MultiLineString"; coordinates: Position[] | Position[][] };
}

export default function ContourViewer({ signedUrl, name }: { signedUrl: string | null; name: string }) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(signedUrl);
        if (!res.ok) throw new Error(`Contour download failed (${res.status}).`);
        const geojson = await res.json();
        if (cancelled) return;
        setFeatures(Array.isArray(geojson?.features) ? geojson.features : []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load contours.");
      }
    })();
    return () => { cancelled = true; };
  }, [signedUrl]);

  const lines = useMemo(() => {
    const out: { points: Position[]; elevation: number | null }[] = [];
    for (const feature of features) {
      const geometry = feature.geometry;
      if (!geometry) continue;
      const rawElevation = feature.properties?.elevation;
      const elevation = typeof rawElevation === "number" ? rawElevation : Number(rawElevation);
      const safeElevation = Number.isFinite(elevation) ? elevation : null;
      if (geometry.type === "LineString") out.push({ points: geometry.coordinates as Position[], elevation: safeElevation });
      if (geometry.type === "MultiLineString") {
        for (const part of geometry.coordinates as Position[][]) out.push({ points: part, elevation: safeElevation });
      }
    }
    return out;
  }, [features]);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const line of lines) {
      for (const [x, y] of line.points) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }, [lines]);

  const viewBox = bounds
    ? `${bounds.minX} ${-bounds.maxY} ${Math.max(1, bounds.maxX - bounds.minX)} ${Math.max(1, bounds.maxY - bounds.minY)}`
    : "0 0 100 100";

  return (
    <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".07em" }}>Contours</div>
          <div style={{ color: V.inkDim, fontSize: 11, marginTop: 2 }}>{name} · {lines.length} lines</div>
        </div>
        {signedUrl ? <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 9px", fontSize: 11 }}>Download GeoJSON</a> : null}
      </div>
      <div style={{ position: "relative", aspectRatio: "16 / 9", minHeight: 360, background: "#081016", overflow: "hidden" }}>
        {error ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: V.danger }}>{error}</div> : null}
        {!error && lines.length === 0 ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: V.inkDim }}>Loading contours…</div> : null}
        {bounds && lines.length > 0 ? (
          <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", padding: 18 }}>
            <g transform="scale(1,-1)">
              {lines.map((line, index) => (
                <polyline
                  key={index}
                  points={line.points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={index % 5 === 0 ? V.signal : "#C7D0D9"}
                  strokeWidth={(bounds.maxX - bounds.minX) / 1800 || 0.5}
                  vectorEffect="non-scaling-stroke"
                  opacity={index % 5 === 0 ? 1 : 0.65}
                />
              ))}
            </g>
          </svg>
        ) : null}
      </div>
    </div>
  );
}
