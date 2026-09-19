"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { fromUrl } from "geotiff";
import { V, panelStyle, btnGhost } from "./theme";

const MAX_DISPLAY_DIM = 2048;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

interface Sample {
  elevation: number;
  x: number;
  y: number;
}

export default function ElevationRasterViewer({
  signedUrl,
  name,
  label,
}: {
  signedUrl: string | null;
  name: string;
  label: "DSM" | "DTM";
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [baseScale, setBaseScale] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [range, setRange] = useState<{ min: number; max: number } | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rasterRef = useRef<Float64Array | Float32Array | Int32Array | Uint32Array | Uint16Array | Int16Array | Uint8Array | Int8Array | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);

  const recomputeBaseScale = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas?.width || !canvas.height) return;
    const fit = Math.min(viewport.clientWidth / canvas.width, viewport.clientHeight / canvas.height);
    setBaseScale(fit > 0 ? fit : 1);
  }, []);

  useEffect(() => {
    if (!signedUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const tiff = await fromUrl(signedUrl);
        const image = await tiff.getImage();
        const fullWidth = image.getWidth();
        const fullHeight = image.getHeight();
        const scale = Math.min(1, MAX_DISPLAY_DIM / Math.max(fullWidth, fullHeight));
        const width = Math.max(1, Math.round(fullWidth * scale));
        const height = Math.max(1, Math.round(fullHeight * scale));
        const rasters = await image.readRasters({ width, height, samples: [0] });
        if (cancelled) return;

        const band = rasters[0] as typeof rasterRef.current;
        if (!band) throw new Error("No elevation band found.");
        rasterRef.current = band;

        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < band.length; i++) {
          const value = Number(band[i]);
          if (!Number.isFinite(value)) continue;
          if (value < min) min = value;
          if (value > max) max = value;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("Elevation raster contains no numeric values.");
        setRange({ min, max });
        setNaturalSize({ width, height });
        try { setBbox(image.getBoundingBox() as [number, number, number, number]); } catch { setBbox(null); }

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable.");
        const imageData = ctx.createImageData(width, height);
        const span = Math.max(0.000001, max - min);

        for (let i = 0, out = 0; i < band.length; i++, out += 4) {
          const value = Number(band[i]);
          const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / span)) : 0;
          // DOMINIC elevation ramp: dark low terrain to bright high terrain.
          const r = Math.round(18 + normalized * 225);
          const g = Math.round(42 + normalized * 130);
          const b = Math.round(65 + normalized * 45);
          imageData.data[out] = r;
          imageData.data[out + 1] = g;
          imageData.data[out + 2] = b;
          imageData.data[out + 3] = Number.isFinite(value) ? 255 : 0;
        }
        ctx.putImageData(imageData, 0, 0);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setState("ready");
        requestAnimationFrame(recomputeBaseScale);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : `Could not load ${label}.`);
        setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [signedUrl, label, recomputeBaseScale]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(recomputeBaseScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [recomputeBaseScale]);

  function zoomBy(factor: number) {
    setZoom((current) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor)));
  }

  function onMouseDown(e: React.MouseEvent) {
    if (state !== "ready") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  }

  function onMouseMove(e: React.MouseEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    setPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function onMouseUp(e: React.MouseEvent) {
    const wasClick = dragRef.current && !dragRef.current.moved;
    dragRef.current = null;
    const canvas = canvasRef.current;
    const band = rasterRef.current;
    if (!wasClick || !canvas || !band) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(naturalSize.width - 1, Math.floor(((e.clientX - rect.left) / rect.width) * naturalSize.width)));
    const y = Math.max(0, Math.min(naturalSize.height - 1, Math.floor(((e.clientY - rect.top) / rect.height) * naturalSize.height)));
    const elevation = Number(band[y * naturalSize.width + x]);
    if (!Number.isFinite(elevation)) return;
    setSample({ elevation, x, y });
  }

  const transform = `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${baseScale * zoom})`;
  const coordinate = sample && bbox
    ? {
        x: bbox[0] + (sample.x / naturalSize.width) * (bbox[2] - bbox[0]),
        y: bbox[3] - (sample.y / naturalSize.height) * (bbox[3] - bbox[1]),
      }
    : null;

  return (
    <div ref={containerRef} style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".07em" }}>{label} Elevation</div>
          <div style={{ color: V.inkDim, fontSize: 11, marginTop: 2 }}>{name}</div>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {range ? <span className="font-mono-ibm" style={{ color: V.inkDim, fontSize: 10 }}>{range.min.toFixed(2)} m → {range.max.toFixed(2)} m</span> : null}
          <button onClick={() => zoomBy(1 / 1.3)} style={{ ...btnGhost, padding: "5px 9px", fontSize: 11 }}>−</button>
          <button onClick={() => zoomBy(1.3)} style={{ ...btnGhost, padding: "5px 9px", fontSize: 11 }}>+</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={{ ...btnGhost, padding: "5px 9px", fontSize: 11 }}>Fit</button>
          {signedUrl ? <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 9px", fontSize: 11 }}>Download GeoTIFF</a> : null}
        </div>
      </div>

      {sample ? (
        <div style={{ padding: "8px 14px", borderBottom: `1px solid ${V.line}`, background: "#0B1117", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11 }}>
          <strong style={{ color: V.signal }}>Elevation {sample.elevation.toFixed(2)} m</strong>
          {coordinate ? <span style={{ color: V.inkDim }}>X {coordinate.x.toFixed(2)} · Y {coordinate.y.toFixed(2)}</span> : null}
          <span style={{ color: V.inkFaint }}>Click anywhere on the raster for elevation.</span>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        onWheel={(e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragRef.current = null; }}
        style={{ position: "relative", aspectRatio: "16 / 9", minHeight: 360, background: V.ground, overflow: "hidden", cursor: state === "ready" ? "crosshair" : "default" }}
      >
        {state === "loading" ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: V.inkDim }}>Loading {label}…</div> : null}
        {state === "error" ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: V.danger, padding: 20 }}>{error}</div> : null}
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", top: "50%", left: "50%", transform, maxWidth: "none", visibility: state === "ready" ? "visible" : "hidden" }}
        />
      </div>
    </div>
  );
}
