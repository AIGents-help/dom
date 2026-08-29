"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { fromUrl } from "geotiff";
import { V, panelStyle, btnGhost, btnPrimary, inputStyle } from "./theme";
import {
  MEASUREMENT_TYPES, computeMeasurementValue, formatMeasurementValue, isValidMeasurementGeometry,
  type MeasurementType, type MeasurementCrs, type LngLat,
} from "@/lib/measurementPipeline";

interface Measurement {
  id: string;
  measurement_type: MeasurementType;
  label: string | null;
  value: number;
  unit: string;
  geometry: { type: "LineString" | "Polygon"; coordinates: LngLat[] };
}

// A GeoTIFF's bounding box is in whatever CRS the file was encoded in.
// ODM commonly exports UTM (projected meters); some tools export
// geographic WGS84 (lng/lat degrees). Rather than add a full proj4/EPSG
// dependency for this, coordinate magnitude is enough to tell them apart
// reliably: lng/lat is always within [-180,180]/[-90,90]; a projected CRS's
// eastings/northings are practically always far outside that range (UTM
// eastings ~100,000-900,000; northings up to ~10,000,000). See
// lib/measurementPipeline.ts's geographic vs. projected formulas.
function isGeographicBbox(bbox: [number, number, number, number]): boolean {
  return bbox.every((v) => v >= -180 && v <= 180);
}

// Real interactive GeoTIFF viewer. Reads the orthomosaic directly from its
// signed URL (private either way -- Supabase signed URL or the Drive
// download proxy, same as every other viewer) via geotiff.js, which uses
// HTTP Range requests so this never downloads the whole file just to
// display it. A downsampled overview (capped at MAX_DISPLAY_DIM on the
// long side) is decoded once into a canvas; pan/zoom/fit-to-extent then
// operate on that canvas via CSS transform -- fast and simple, and correct
// for any orthomosaic size since the decode step itself is bounded. If the
// worker's COG tiling step (buildCogOrthomosaic.ts) has run, geotiff.js
// automatically benefits from the file's overviews/tiling for that decode;
// if not, the original GeoTIFF is still read and displayed correctly, just
// with a slower first decode on a very large source file. The original
// full-resolution GeoTIFF is always the one linked by "Download" below --
// this component never re-encodes or replaces it.

const MAX_DISPLAY_DIM = 2048;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

type ViewerState = "loading" | "ready" | "error";

export default function OrthomosaicViewer({
  signedUrl,
  name,
  projectId,
  deliverableId,
  accessToken,
}: {
  signedUrl: string | null;
  name: string;
  projectId?: string;
  deliverableId?: string;
  accessToken?: string;
}) {
  const [state, setState] = useState<ViewerState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [baseScale, setBaseScale] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [crs, setCrs] = useState<MeasurementCrs>("geographic");

  const measurementsEnabled = !!(projectId && deliverableId && accessToken);
  const [drawMode, setDrawMode] = useState<MeasurementType | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]); // image pixel space
  const [pendingLabel, setPendingLabel] = useState("");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);

  // "Fit to Extent" scale — the canvas is decoded at up to MAX_DISPLAY_DIM
  // native pixels, independent of the panel's actual rendered size, so
  // zoom=1 needs a base scale-to-fit underneath it, not a literal 1:1.
  const recomputeBaseScale = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas || canvas.width === 0 || canvas.height === 0) return;
    const fit = Math.min(viewport.clientWidth / canvas.width, viewport.clientHeight / canvas.height);
    setBaseScale(fit > 0 ? fit : 1);
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Image-pixel-space (canvas natural coordinates) <-> geo conversion,
  // using the loaded GeoTIFF's own bounding box — a simple linear
  // interpolation, correct for the standard north-up, non-rotated
  // orthophoto layout every drone mapping tool produces.
  const pixelToGeo = useCallback(
    (px: number, py: number): LngLat => {
      if (!bbox || naturalSize.width === 0 || naturalSize.height === 0) return [0, 0];
      const [west, south, east, north] = bbox;
      return [west + (px / naturalSize.width) * (east - west), north - (py / naturalSize.height) * (north - south)];
    },
    [bbox, naturalSize]
  );

  const geoToPixel = useCallback(
    ([lng, lat]: LngLat): { x: number; y: number } => {
      if (!bbox || naturalSize.width === 0 || naturalSize.height === 0) return { x: 0, y: 0 };
      const [west, south, east, north] = bbox;
      return { x: ((lng - west) / (east - west)) * naturalSize.width, y: ((north - lat) / (north - south)) * naturalSize.height };
    },
    [bbox, naturalSize]
  );

  useEffect(() => {
    if (!signedUrl) return;
    let cancelled = false;
    setState("loading");
    setError(null);

    (async () => {
      try {
        const tiff = await fromUrl(signedUrl);
        const image = await tiff.getImage();
        const fullWidth = image.getWidth();
        const fullHeight = image.getHeight();
        const scale = Math.min(1, MAX_DISPLAY_DIM / Math.max(fullWidth, fullHeight));
        const width = Math.max(1, Math.round(fullWidth * scale));
        const height = Math.max(1, Math.round(fullHeight * scale));

        try {
          const rawBbox = image.getBoundingBox() as [number, number, number, number];
          setBbox(rawBbox);
          setCrs(isGeographicBbox(rawBbox) ? "geographic" : "projected");
        } catch {
          setBbox(null); // no georeferencing on this file -- measurements stay disabled below
        }
        setNaturalSize({ width, height });

        const raster = (await image.readRGB({ width, height, interleave: true })) as unknown as ArrayLike<number> & { width: number; height: number };
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported.");

        const samplesPerPixel = Math.max(1, Math.round(raster.length / (width * height)));
        const imageData = ctx.createImageData(width, height);
        for (let i = 0, out = 0; i < width * height; i++, out += 4) {
          const s = i * samplesPerPixel;
          imageData.data[out] = raster[s] ?? 0;
          imageData.data[out + 1] = samplesPerPixel > 1 ? raster[s + 1] : raster[s];
          imageData.data[out + 2] = samplesPerPixel > 2 ? raster[s + 2] : raster[s];
          imageData.data[out + 3] = samplesPerPixel > 3 ? raster[s + 3] : 255;
        }
        ctx.putImageData(imageData, 0, 0);

        resetView();
        recomputeBaseScale();
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the orthomosaic.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedUrl, resetView, recomputeBaseScale]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === containerRef.current);
      // Layout settles on the next frame after the fullscreen transition.
      requestAnimationFrame(recomputeBaseScale);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [recomputeBaseScale]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => recomputeBaseScale());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [recomputeBaseScale]);

  const reloadMeasurements = useCallback(async () => {
    if (!measurementsEnabled) return;
    const res = await fetch(`/api/pilot/mapping/projects/${projectId}/measurements`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setMeasurements(body.measurements ?? []);
  }, [measurementsEnabled, projectId, accessToken]);

  useEffect(() => {
    reloadMeasurements();
  }, [reloadMeasurements]);

  function startDraw(type: MeasurementType) {
    setDrawMode(type);
    setDrawingPoints([]);
    setPendingLabel("");
    setMeasurementError(null);
  }

  function cancelDraw() {
    setDrawMode(null);
    setDrawingPoints([]);
  }

  const drawGeometry = drawMode
    ? { type: (drawMode === "distance" ? "LineString" : "Polygon") as "LineString" | "Polygon", coordinates: drawingPoints.map((p) => pixelToGeo(p.x, p.y)) }
    : null;
  const canFinishDraw = !!drawMode && !!drawGeometry && isValidMeasurementGeometry(drawMode, drawGeometry);

  async function saveMeasurement() {
    if (!drawMode || !drawGeometry || !measurementsEnabled) return;
    setSavingMeasurement(true);
    setMeasurementError(null);
    const res = await fetch(`/api/pilot/mapping/projects/${projectId}/measurements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ measurement_type: drawMode, geometry: drawGeometry, label: pendingLabel, crs }),
    });
    const body = await res.json().catch(() => ({}));
    setSavingMeasurement(false);
    if (!res.ok) {
      setMeasurementError(body.error ?? "Could not save this measurement.");
      return;
    }
    cancelDraw();
    await reloadMeasurements();
  }

  async function renameMeasurement(id: string) {
    if (!measurementsEnabled) return;
    const res = await fetch(`/api/pilot/mapping/projects/${projectId}/measurements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ label: renameValue }),
    });
    if (res.ok) {
      setRenamingId(null);
      await reloadMeasurements();
    }
  }

  async function deleteMeasurement(id: string) {
    if (!measurementsEnabled) return;
    if (!window.confirm("Delete this measurement?")) return;
    const res = await fetch(`/api/pilot/mapping/projects/${projectId}/measurements/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) await reloadMeasurements();
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen();
  }

  function zoomBy(factor: number) {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
  }

  function onWheel(e: React.WheelEvent) {
    if (state !== "ready") return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  function onMouseDown(e: React.MouseEvent) {
    if (state !== "ready") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }

  // A plain click (no drag movement) while a measurement is being drawn
  // places the next vertex, in image-pixel space, using the canvas's own
  // rendered bounding box -- correct regardless of the current pan/zoom/
  // fullscreen state, since getBoundingClientRect() already reflects
  // whatever CSS transform is currently applied.
  function onMouseUp(e: React.MouseEvent) {
    const wasClick = dragRef.current && !dragRef.current.moved;
    dragRef.current = null;
    if (!wasClick || !drawMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * naturalSize.width;
    const py = ((e.clientY - rect.top) / rect.height) * naturalSize.height;
    setDrawingPoints((pts) => [...pts, { x: px, y: py }]);
  }

  function endDrag() {
    dragRef.current = null;
  }

  const canDraw = measurementsEnabled && !!bbox && state === "ready";
  const canvasTransform = `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${baseScale * zoom})`;

  return (
    <div ref={containerRef} style={{ ...panelStyle, padding: 0, overflow: "hidden", background: fullscreen ? "#000" : undefined }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${V.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="font-mono-ibm" style={{ fontSize: 11, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em" }}>Orthomosaic</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {state === "ready" && (
            <>
              <button onClick={() => zoomBy(1 / 1.3)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>−</button>
              <button onClick={() => zoomBy(1.3)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>+</button>
              <button onClick={resetView} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Fit to Extent</button>
              <button onClick={toggleFullscreen} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>{fullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
            </>
          )}
          {canDraw && !drawMode && (
            <>
              <button onClick={() => startDraw("distance")} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Measure Distance</button>
              <button onClick={() => startDraw("area")} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Measure Area</button>
              {measurements.length > 0 && (
                <button onClick={() => setShowMeasurements((s) => !s)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>
                  {showMeasurements ? "Hide Measurements" : "Show Measurements"}
                </button>
              )}
            </>
          )}
          {signedUrl && <a href={signedUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>Download Original →</a>}
        </div>
      </div>

      {drawMode && (
        <div style={{ padding: "8px 14px", borderBottom: `1px solid ${V.line}`, background: V.ground, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: V.inkDim }}>
            Click the image to add points for this {drawMode}. {drawGeometry ? `Current: ${formatMeasurementValue(drawMode, computeMeasurementValue(drawMode, drawGeometry, crs))}` : ""}
          </span>
          {canFinishDraw && (
            <input
              value={pendingLabel}
              onChange={(e) => setPendingLabel(e.target.value)}
              placeholder="Label (optional)"
              style={{ ...inputStyle, width: 160, padding: "5px 8px", fontSize: 12 }}
            />
          )}
          {canFinishDraw && (
            <button onClick={saveMeasurement} disabled={savingMeasurement} style={{ ...btnPrimary, padding: "5px 12px", fontSize: 12 }}>
              {savingMeasurement ? "Saving…" : "Finish & Save"}
            </button>
          )}
          <button onClick={cancelDraw} style={{ ...btnGhost, padding: "5px 12px", fontSize: 12 }}>Cancel</button>
        </div>
      )}
      {measurementError && <p style={{ color: V.danger, fontSize: 12, padding: "6px 14px" }}>{measurementError}</p>}

      <div
        ref={viewportRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={drawMode ? onMouseUp : endDrag}
        onMouseLeave={endDrag}
        style={{
          position: "relative",
          aspectRatio: fullscreen ? undefined : "16 / 9",
          height: fullscreen ? "calc(100% - 45px)" : undefined,
          background: V.ground,
          overflow: "hidden",
          cursor: drawMode ? "crosshair" : state === "ready" ? (dragRef.current ? "grabbing" : "grab") : "default",
        }}
      >
        {!signedUrl && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: V.inkFaint, fontSize: 13 }}>Orthomosaic not ready yet.</p>
          </div>
        )}
        {signedUrl && state === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: V.inkDim, fontSize: 13 }}>Loading {name}…</p>
          </div>
        )}
        {signedUrl && state === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
            <p style={{ color: V.danger, fontSize: 13 }}>{error}</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            maxWidth: "none",
            transform: canvasTransform,
            visibility: state === "ready" ? "visible" : "hidden",
            imageRendering: zoom > 1.5 ? "pixelated" : "auto",
          }}
        />
        {state === "ready" && naturalSize.width > 0 && (
          <svg
            width={naturalSize.width}
            height={naturalSize.height}
            viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
            style={{ position: "absolute", top: "50%", left: "50%", transform: canvasTransform, pointerEvents: "none", overflow: "visible" }}
          >
            {showMeasurements &&
              measurements.map((m) => {
                const pts = m.geometry.coordinates.map(geoToPixel);
                const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                return m.measurement_type === "distance" ? (
                  <polyline key={m.id} points={pointsAttr} fill="none" stroke={V.signal} strokeWidth={3 / (baseScale * zoom)} />
                ) : (
                  <polygon key={m.id} points={pointsAttr} fill="rgba(244,90,30,.18)" stroke={V.signal} strokeWidth={3 / (baseScale * zoom)} />
                );
              })}
            {drawMode &&
              drawingPoints.length > 0 &&
              (drawMode === "distance" ? (
                <polyline points={drawingPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={V.telemetry} strokeWidth={3 / (baseScale * zoom)} strokeDasharray={`${6 / (baseScale * zoom)}`} />
              ) : (
                <polygon points={drawingPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(22,163,74,.18)" stroke={V.telemetry} strokeWidth={3 / (baseScale * zoom)} strokeDasharray={`${6 / (baseScale * zoom)}`} />
              ))}
            {drawMode &&
              drawingPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4 / (baseScale * zoom)} fill={V.telemetry} />)}
          </svg>
        )}
      </div>

      {measurementsEnabled && measurements.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${V.line}` }}>
          <div className="font-mono-ibm" style={{ fontSize: 10, color: V.inkFaint, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Measurements</div>
          <div style={{ display: "grid", gap: 6 }}>
            {measurements.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, gap: 8 }}>
                {renamingId === m.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && renameMeasurement(m.id)}
                    autoFocus
                    style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, flex: 1 }}
                  />
                ) : (
                  <span style={{ color: V.ink }}>
                    {m.label || `${MEASUREMENT_TYPES.find((t) => t.value === m.measurement_type)?.label}`}{" "}
                    <span className="font-mono-ibm" style={{ color: V.telemetry }}>{formatMeasurementValue(m.measurement_type, m.value)}</span>
                  </span>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  {renamingId === m.id ? (
                    <button onClick={() => renameMeasurement(m.id)} style={{ ...btnGhost, padding: "3px 8px", fontSize: 11 }}>Save</button>
                  ) : (
                    <button onClick={() => { setRenamingId(m.id); setRenameValue(m.label ?? ""); }} style={{ ...btnGhost, padding: "3px 8px", fontSize: 11 }}>Rename</button>
                  )}
                  <button onClick={() => deleteMeasurement(m.id)} style={{ ...btnGhost, padding: "3px 8px", fontSize: 11, color: V.danger, borderColor: V.danger }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
