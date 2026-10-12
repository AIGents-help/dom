"use client";

/* eslint-disable @next/next/no-img-element -- interactive raster map tiles are rendered directly */

import { useEffect, useId, useMemo, useRef, useState } from "react";

type LatLng = { latitude: number; longitude: number };

type RoutePoint = LatLng & {
  id: string;
};

type BoundaryPoint = LatLng & {
  xPct?: number;
  yPct?: number;
};

type Props = {
  focusLatitude: number;
  focusLongitude: number;
  drawing: boolean;
  boundary: BoundaryPoint[];
  route: RoutePoint[];
  routeVisible: boolean;
  selectedWaypointId?: string | null;
  onBoundaryPoint: (point: Required<BoundaryPoint>) => void;
  onWaypointSelect: (id: string | null) => void;
  onWaypointMove: (id: string, latitude: number, longitude: number) => void;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 15;
const MAX_ZOOM = 21;
const INITIAL_ZOOM = 19;

function clampLat(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function latLngToWorld(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = clampLat(latitude);
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function worldToLatLng(x: number, y: number, zoom: number): LatLng {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { latitude, longitude };
}

export default function CapturePlanningMap({
  focusLatitude,
  focusLongitude,
  drawing,
  boundary,
  route,
  routeVisible,
  selectedWaypointId,
  onBoundaryPoint,
  onWaypointSelect,
  onWaypointMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const helpId = useId();
  const [imageryError, setImageryError] = useState(false);
  const [imageryRevision, setImageryRevision] = useState(0);
  const [size, setSize] = useState({ width: 1200, height: 480 });
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [viewCenter, setViewCenter] = useState<LatLng>({
    latitude: focusLatitude,
    longitude: focusLongitude,
  });
  const [pointerState, setPointerState] = useState<{
    id: number;
    startX: number;
    startY: number;
    startCenterX: number;
    startCenterY: number;
    moved: boolean;
  } | null>(null);
  const [dragWaypointId, setDragWaypointId] = useState<string | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () =>
      setSize({
        width: Math.max(1, node.clientWidth),
        height: Math.max(1, node.clientHeight),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const centerWorld = useMemo(
    () => latLngToWorld(viewCenter.latitude, viewCenter.longitude, zoom),
    [viewCenter, zoom],
  );
  const topLeft = {
    x: centerWorld.x - size.width / 2,
    y: centerWorld.y - size.height / 2,
  };

  const screenToLatLng = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return worldToLatLng(
      topLeft.x + clientX - rect.left,
      topLeft.y + clientY - rect.top,
      zoom,
    );
  };

  const project = (point: LatLng) => {
    const world = latLngToWorld(point.latitude, point.longitude, zoom);
    return {
      x: world.x - topLeft.x,
      y: world.y - topLeft.y,
    };
  };

  const tiles = useMemo(() => {
    const scaleTiles = 2 ** zoom;
    const minX = Math.floor(topLeft.x / TILE_SIZE) - 1;
    const maxX = Math.floor((topLeft.x + size.width) / TILE_SIZE) + 1;
    const minY = Math.max(0, Math.floor(topLeft.y / TILE_SIZE) - 1);
    const maxY = Math.min(
      scaleTiles - 1,
      Math.floor((topLeft.y + size.height) / TILE_SIZE) + 1,
    );
    const result: Array<{ key: string; x: number; y: number; urlX: number }> = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const urlX = ((x % scaleTiles) + scaleTiles) % scaleTiles;
        result.push({ key: `${zoom}-${x}-${y}`, x, y, urlX });
      }
    }
    return result;
  }, [zoom, topLeft.x, topLeft.y, size.width, size.height]);

  const boundaryScreen = boundary.map(project);
  const routeScreen = route.map((point) => ({ ...point, ...project(point) }));
  const fitRoute = () => {
    const points = [...boundary, ...route];
    if (!points.length) return;
    for (let candidate = MAX_ZOOM; candidate >= MIN_ZOOM; candidate -= 1) {
      const projected = points.map((point) => latLngToWorld(point.latitude, point.longitude, candidate));
      const x = projected.map((point) => point.x), y = projected.map((point) => point.y);
      const left = Math.min(...x), right = Math.max(...x), top = Math.min(...y), bottom = Math.max(...y);
      if ((right - left <= size.width - 100 && bottom - top <= size.height - 80) || candidate === MIN_ZOOM) {
        setZoom(candidate);
        setViewCenter(worldToLatLng((left + right) / 2, (top + bottom) / 2, candidate));
        return;
      }
    }
  };

  const finishPointer = (clientX: number, clientY: number) => {
    if (dragWaypointId) {
      const point = screenToLatLng(clientX, clientY);
      if (point) onWaypointMove(dragWaypointId, point.latitude, point.longitude);
      setDragWaypointId(null);
      return;
    }

    if (drawing && pointerState && !pointerState.moved) {
      const point = screenToLatLng(clientX, clientY);
      const rect = containerRef.current?.getBoundingClientRect();
      if (point && rect) {
        onBoundaryPoint({
          ...point,
          xPct: ((clientX - rect.left) / rect.width) * 100,
          yPct: ((clientY - rect.top) / rect.height) * 100,
        });
      }
    }
    setPointerState(null);
  };

  return (
    <>
    <p id={helpId} style={{ margin: "0 18px 12px", color: "#60707b", fontSize: 13 }}>
      Drag to pan; use the zoom buttons for a closer view. Keyboard: arrow keys pan, Enter adds a corner while drawing. Select a waypoint and use arrow keys to adjust it.
    </p>
    {imageryError && <div role="alert" style={{ padding: 12, background: "#fff3e9", color: "#89370c", fontSize: 13 }}>
      Satellite imagery could not load. Confirm the site using reliable imagery before planning a flight.
      <button type="button" onClick={() => { setImageryError(false); setImageryRevision((value) => value + 1); }} style={{ marginLeft: 8, padding: 10, borderRadius: 8, background: "white", border: "1px solid #cbd3d9" }}>Retry satellite imagery</button>
    </div>}
    <div
      ref={containerRef}
      role="region"
      tabIndex={0}
      aria-describedby={helpId}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const delta = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40] }[event.key];
        if (delta) {
          event.preventDefault();
          setViewCenter(worldToLatLng(centerWorld.x + delta[0], centerWorld.y + delta[1], zoom));
        } else if (event.key === "Enter" && drawing) {
          event.preventDefault();
          onBoundaryPoint({ ...viewCenter, xPct: 50, yPct: 50 });
        }
      }}
      onPointerDown={(event) => {
        if (dragWaypointId) return;
        const world = latLngToWorld(viewCenter.latitude, viewCenter.longitude, zoom);
        setPointerState({
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startCenterX: world.x,
          startCenterY: world.y,
          moved: false,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        if (!drawing) onWaypointSelect(null);
      }}
      onPointerMove={(event) => {
        if (dragWaypointId) {
          const point = screenToLatLng(event.clientX, event.clientY);
          if (point) onWaypointMove(dragWaypointId, point.latitude, point.longitude);
          return;
        }
        if (!pointerState || pointerState.id !== event.pointerId) return;
        const dx = event.clientX - pointerState.startX;
        const dy = event.clientY - pointerState.startY;
        const moved = pointerState.moved || Math.hypot(dx, dy) > 4;
        if (moved) {
          setViewCenter(
            worldToLatLng(
              pointerState.startCenterX - dx,
              pointerState.startCenterY - dy,
              zoom,
            ),
          );
        }
        if (moved !== pointerState.moved) {
          setPointerState((current) => (current ? { ...current, moved } : current));
        }
      }}
      onPointerUp={(event) => finishPointer(event.clientX, event.clientY)}
      onPointerCancel={() => {
        setPointerState(null);
        setDragWaypointId(null);
      }}
      onWheel={(event) => {
        event.preventDefault();
        const nextZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, zoom + (event.deltaY < 0 ? 1 : -1)),
        );
        if (nextZoom !== zoom) setZoom(nextZoom);
      }}
      style={{
        position: "relative",
        height: "clamp(320px, 50vh, 520px)",
        overflow: "hidden",
        background: "#10161C",
        cursor: drawing ? "crosshair" : pointerState?.moved ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
      }}
      aria-label="DOMINIC satellite mission planning map"
    >
      {tiles.map((tile) => (
        <img
          key={`${imageryRevision}-${tile.key}`}
          alt=""
          onError={() => setImageryError(true)}
          draggable={false}
          src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tile.y}/${tile.urlX}`}
          style={{
            position: "absolute",
            width: TILE_SIZE,
            height: TILE_SIZE,
            left: tile.x * TILE_SIZE - topLeft.x,
            top: tile.y * TILE_SIZE - topLeft.y,
            pointerEvents: "none",
          }}
        />
      ))}

      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {boundaryScreen.length > 1 ? (
          <polygon
            points={boundaryScreen.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="rgba(244,90,30,.16)"
            stroke="#F45A1E"
            strokeWidth="2"
          />
        ) : null}

        {routeVisible && routeScreen.length > 1 ? (
          <polyline
            points={routeScreen.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="#F45A1E"
            strokeWidth="2"
          />
        ) : null}
      </svg>

      {boundaryScreen.map((point, index) => (
        <div
          key={`boundary-${index}`}
          style={{
            position: "absolute",
            left: point.x,
            top: point.y,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: "50%",
            background: "#F45A1E",
            border: "2px solid white",
            pointerEvents: "none",
            zIndex: 4,
          }}
        />
      ))}

      {routeVisible
        ? routeScreen.map((point, index) => {
            const selected = point.id === selectedWaypointId;
            return (
              <button
                key={point.id}
                type="button"
                data-waypoint={index + 1}
                aria-label={`Waypoint ${index + 1}`}
                aria-pressed={selected}
                title={`Waypoint ${index + 1} — drag to edit`}
                onClick={() => onWaypointSelect(point.id)}
                onKeyDown={(event) => {
                  const delta = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[event.key];
                  if (!delta) return;
                  event.preventDefault(); event.stopPropagation();
                  const world = latLngToWorld(point.latitude, point.longitude, zoom);
                  const next = worldToLatLng(world.x + delta[0], world.y + delta[1], zoom);
                  onWaypointMove(point.id, next.latitude, next.longitude);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragWaypointId(point.id);
                  onWaypointSelect(point.id);
                }}
                onPointerMove={(event) => {
                  if (dragWaypointId !== point.id) return;
                  event.stopPropagation();
                  const next = screenToLatLng(event.clientX, event.clientY);
                  if (next) onWaypointMove(point.id, next.latitude, next.longitude);
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  const next = screenToLatLng(event.clientX, event.clientY);
                  if (next) onWaypointMove(point.id, next.latitude, next.longitude);
                  setDragWaypointId(null);
                }}
                style={{
                  position: "absolute",
                  left: point.x,
                  top: point.y,
                  width: 28,
                  height: 28,
                  marginLeft: -14,
                  marginTop: -14,
                  borderRadius: "50%",
                  border: 0,
                  background: "transparent",
                  cursor: "grab",
                  zIndex: selected ? 8 : 6,
                  padding: 0,
                }}
              ><span aria-hidden="true" style={{ display: "block", width: selected ? 18 : 14, height: selected ? 18 : 14, margin: "auto", border: "2px solid #F45A1E", borderRadius: "50%", background: selected ? "#70D6A0" : "white", pointerEvents: "none" }} /></button>
            );
          })
        : null}

      <div
        style={{
          position: "absolute",
          right: 10,
          bottom: 8,
          padding: "4px 6px",
          borderRadius: 5,
          background: "rgba(8,12,16,.72)",
          color: "#D7DEE5",
          fontSize: 12,
          pointerEvents: "none",
        }}
      >
        Satellite imagery © Esri · Zoom {zoom}
      </div>
      <div onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}
        style={{ position: "absolute", right: 12, top: 12, display: "grid", gap: 8, zIndex: 20 }}>
        {([
          ["Zoom in", zoom >= MAX_ZOOM, () => setZoom((value) => Math.min(MAX_ZOOM, value + 1))],
          ["Zoom out", zoom <= MIN_ZOOM, () => setZoom((value) => Math.max(MIN_ZOOM, value - 1))],
          ["Recenter site", false, () => setViewCenter({ latitude: focusLatitude, longitude: focusLongitude })],
          ["Fit flight path", !routeVisible || !route.length, fitRoute],
        ] as const).map(([label, disabled, action]) => <button key={label} type="button" aria-label={label} title={label} disabled={disabled} onClick={action}
          style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd3d9", borderRadius: 8, background: "white", color: "#25313a", fontSize: 22 }}><span aria-hidden="true">{label === "Zoom in" ? "+" : label === "Zoom out" ? "−" : label === "Fit flight path" ? "⛶" : "◎"}</span></button>)}
      </div>
    </div>
    </>
  );
}
