import type { CameraPayloadProfile } from "@/lib/aircraft/payload";
import type { UniversalMediaCapture } from "@/lib/aircraft/contract";

export function inspectionSensorMode(
  payload?: Pick<CameraPayloadProfile, "kind"> | null,
) {
  switch (payload?.kind) {
    case "thermal":
      return "thermal";
    case "multispectral":
      return "multispectral";
    case "lidar":
      return "lidar";
    case "zoom":
      return "zoom";
    case "rgb":
      return "rgb";
    case "other":
    default:
      return "rgb";
  }
}

export function sanitizeInspectionStorageSegment(
  value: string | null | undefined,
  fallback = "capture",
) {
  const cleaned = (value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

export function buildInspectionMediaStoragePath(input: {
  userId: string;
  inspectionId: string;
  captureId: string;
  filename?: string | null;
}) {
  const userId = sanitizeInspectionStorageSegment(input.userId, "user");
  const inspectionId = sanitizeInspectionStorageSegment(
    input.inspectionId,
    "inspection",
  );
  const captureId = sanitizeInspectionStorageSegment(input.captureId, "capture");
  const filename = sanitizeInspectionStorageSegment(
    input.filename,
    `${captureId}.jpg`,
  );

  return `${userId}/dominic-inspections/${inspectionId}/bridge-${captureId}-${filename}`;
}

export function bridgeCaptureMetadata(input: {
  capture: UniversalMediaCapture;
  bridge?: {
    bridgeId?: string | null;
    vendor?: string | null;
    model?: string | null;
  } | null;
  payload?: Pick<CameraPayloadProfile, "id" | "name" | "kind"> | null;
}) {
  const { capture, bridge, payload } = input;
  return {
    source: "flight_bridge",
    captureId: capture.id,
    aircraftId: capture.aircraftId,
    checkpointId: capture.checkpointId ?? null,
    headingDeg: capture.headingDeg,
    gimbalPitchDeg: capture.gimbalPitchDeg,
    gimbalYawDeg: capture.gimbalYawDeg ?? null,
    bridgeId: bridge?.bridgeId ?? null,
    vendor: bridge?.vendor ?? null,
    model: bridge?.model ?? null,
    payload: payload
      ? {
          id: payload.id,
          name: payload.name,
          kind: payload.kind,
        }
      : null,
  };
}
