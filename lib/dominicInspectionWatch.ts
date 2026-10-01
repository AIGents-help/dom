export type InspectionWatchReadinessInput = {
  enabled: boolean;
  hasInspectionContext: boolean;
  equipmentReady: boolean;
  bridgeConnected: boolean;
  photoCaptureSupported: boolean;
  capturePending: boolean;
};

export type InspectionWatchReadiness = {
  ready: boolean;
  reason:
    | "ready"
    | "disabled"
    | "inspection_required"
    | "equipment_not_ready"
    | "bridge_disconnected"
    | "photo_capture_unavailable"
    | "capture_pending";
};

export const MIN_INSPECTION_WATCH_INTERVAL_SEC = 10;
export const MAX_INSPECTION_WATCH_INTERVAL_SEC = 120;
export const DEFAULT_INSPECTION_WATCH_INTERVAL_SEC = 15;

export function normalizeInspectionWatchInterval(seconds: number) {
  if (!Number.isFinite(seconds)) return DEFAULT_INSPECTION_WATCH_INTERVAL_SEC;
  return Math.min(
    MAX_INSPECTION_WATCH_INTERVAL_SEC,
    Math.max(MIN_INSPECTION_WATCH_INTERVAL_SEC, Math.round(seconds)),
  );
}

export function inspectionWatchReadiness(
  input: InspectionWatchReadinessInput,
): InspectionWatchReadiness {
  if (!input.enabled) return { ready: false, reason: "disabled" };
  if (!input.hasInspectionContext) {
    return { ready: false, reason: "inspection_required" };
  }
  if (!input.equipmentReady) {
    return { ready: false, reason: "equipment_not_ready" };
  }
  if (!input.bridgeConnected) {
    return { ready: false, reason: "bridge_disconnected" };
  }
  if (!input.photoCaptureSupported) {
    return { ready: false, reason: "photo_capture_unavailable" };
  }
  if (input.capturePending) {
    return { ready: false, reason: "capture_pending" };
  }
  return { ready: true, reason: "ready" };
}

export function inspectionWatchReasonLabel(
  reason: InspectionWatchReadiness["reason"],
) {
  switch (reason) {
    case "ready":
      return "Ready to sample inspection evidence.";
    case "disabled":
      return "Inspection Watch is stopped.";
    case "inspection_required":
      return "Start from an Asset Intelligence inspection.";
    case "equipment_not_ready":
      return "Assigned equipment does not satisfy this inspection.";
    case "bridge_disconnected":
      return "Connect the inspection camera bridge.";
    case "photo_capture_unavailable":
      return "The connected bridge cannot capture still evidence.";
    case "capture_pending":
      return "Waiting for the previous aircraft image.";
  }
}
