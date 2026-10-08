export type ArRegistration = {
  coordinateFrameId: string;
  calibration: {
    id: string; aircraftId: string; model: "rectified-pinhole"; width: number; height: number;
    cameraSource: "wide" | "zoom"; zoomRatio: number;
    fx: number; fy: number; cx: number; cy: number; maxReprojectionErrorPx: number;
  };
  pose: {
    timestampMs: number; cameraPositionM: number[]; worldToCameraRotation: number[];
    positionErrorM: number; orientationErrorDeg: number;
  };
  anchors: { id: string; label: string; coordinateFrameId: string; positionM: number[]; positionErrorM: number }[];
};
export type ArMarker = { id: string; label: string; x: number; y: number; errorPx: number };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const vector = (value: unknown, size: number): value is number[] => Array.isArray(value) && value.length === size && value.every(finite);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 120;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Camera axes: right/down/forward. World coordinates must share one surveyed metric frame.
 * Intrinsics describe the exact rectified preview, not a catalog FOV or a raw distorted image.
 */
export function isArRegistration(value: unknown): value is ArRegistration {
  if (!object(value) || !text(value.coordinateFrameId) || !object(value.calibration) || !object(value.pose) || !Array.isArray(value.anchors) || value.anchors.length > 100) return false;
  const c = value.calibration, p = value.pose;
  if (!text(c.id) || !text(c.aircraftId) || c.model !== "rectified-pinhole" || ![c.width, c.height].every((n) => finite(n) && Number.isInteger(n) && n > 0 && n <= 4096) ||
      ![c.fx, c.fy, c.zoomRatio].every((n) => finite(n) && n > 0) || !finite(c.cx) || !finite(c.cy) || c.cx < 0 || c.cy < 0 || c.cx >= Number(c.width) || c.cy >= Number(c.height) ||
      !["wide", "zoom"].includes(String(c.cameraSource)) || !nonnegative(c.maxReprojectionErrorPx) ||
      !finite(p.timestampMs) || p.timestampMs <= 0 || !vector(p.cameraPositionM, 3) || !vector(p.worldToCameraRotation, 9) ||
      !nonnegative(p.positionErrorM) || !nonnegative(p.orientationErrorDeg) || p.orientationErrorDeg > 10) return false;
  const r = p.worldToCameraRotation;
  // Reject scale/shear/reflection matrices: this must be a proper orthonormal rotation.
  for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) {
    const dot = r[a * 3] * r[b * 3] + r[a * 3 + 1] * r[b * 3 + 1] + r[a * 3 + 2] * r[b * 3 + 2];
    if (Math.abs(dot - (a === b ? 1 : 0)) > 0.001) return false;
  }
  const det = r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]);
  if (Math.abs(det - 1) > 0.001) return false;
  const ids = new Set<string>();
  return value.anchors.every((a) => {
    if (!object(a) || !text(a.id) || ids.has(a.id) || !text(a.label) || !text(a.coordinateFrameId) || !vector(a.positionM, 3) || !nonnegative(a.positionErrorM)) return false;
    ids.add(a.id); return true;
  });
}

export function projectArRegistration(value: unknown, frame: {
  aircraftId: string; width: number; height: number; capturedAtMs: number; cameraSource?: string; zoomRatio?: number;
}, nowMs: number): { status: string; markers: ArMarker[]; hiddenCount: number } {
  const blocked = (status: string) => ({ status, markers: [], hiddenCount: 0 });
  if (!isArRegistration(value)) return blocked("AR unavailable — calibrated camera pose required");
  const { calibration: c, pose: p } = value;
  if (![nowMs, frame.capturedAtMs].every(finite) || nowMs - frame.capturedAtMs > 5000 || nowMs < frame.capturedAtMs - 500 || Math.abs(frame.capturedAtMs - p.timestampMs) > 250) return blocked("AR hidden — frame and camera pose are not synchronized");
  if (c.aircraftId !== frame.aircraftId || c.width !== frame.width || c.height !== frame.height || c.cameraSource !== frame.cameraSource || !finite(frame.zoomRatio) || Math.abs(c.zoomRatio - frame.zoomRatio) > 0.001 || c.maxReprojectionErrorPx > 2) return blocked("AR hidden — preview calibration does not match");
  const markers: ArMarker[] = [];
  for (const a of value.anchors) {
    if (a.coordinateFrameId !== value.coordinateFrameId) continue;
    const d = a.positionM.map((n, i) => n - p.cameraPositionM[i]);
    const r = p.worldToCameraRotation;
    const [x, y, z] = [0, 1, 2].map((row) => r[row * 3] * d[0] + r[row * 3 + 1] * d[1] + r[row * 3 + 2] * d[2]);
    const errorM = p.positionErrorM + a.positionErrorM + 2 * Math.hypot(...d) * Math.sin(p.orientationErrorDeg * Math.PI / 360);
    if (!finite(z) || z <= Math.max(0.1, errorM)) continue;
    const u = c.fx * x / z + c.cx, v = c.fy * y / z + c.cy;
    // Conservative pixel displacement bound for bounded position + rotation error.
    const errorPx = c.maxReprojectionErrorPx + Math.hypot(c.fx * errorM * (z + Math.abs(x)) / (z * (z - errorM)), c.fy * errorM * (z + Math.abs(y)) / (z * (z - errorM)));
    if (![u, v, errorPx].every(finite) || errorPx > Math.min(24, Math.min(c.width, c.height) * 0.03) || u - errorPx < 0 || v - errorPx < 0 || u + errorPx >= c.width || v + errorPx >= c.height) continue;
    markers.push({ id: a.id, label: a.label, x: u / c.width, y: v / c.height, errorPx });
  }
  return { status: markers.length ? "AR projections available — verify physical alignment" : "AR hidden — no anchors meet alignment bounds", markers, hiddenCount: value.anchors.length - markers.length };
}
