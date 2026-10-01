export type InspectionCameraDistanceBand = "unknown" | "close" | "medium" | "far" | "long_range";

export type DominicInspectionCameraPreset = {
  name: string;
  distanceBand: InspectionCameraDistanceBand;
  cameraSource: "wide" | "zoom";
  zoomRatio: number;
  focusStrategy: "anomaly" | "center";
  aeLock: boolean;
  rationale: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distanceBand(distanceM?: number | null): InspectionCameraDistanceBand {
  if (distanceM == null || !Number.isFinite(distanceM) || distanceM <= 0) return "unknown";
  if (distanceM <= 12) return "close";
  if (distanceM <= 30) return "medium";
  if (distanceM <= 60) return "far";
  return "long_range";
}

function inspectionZoomCap(inspectionType: string) {
  switch (inspectionType.toLowerCase()) {
    case "security":
      return 3;
    case "stockpile":
      return 4;
    case "thermal":
    case "ldar":
      return 4;
    default:
      return 8;
  }
}

export function buildDominicInspectionCameraPreset(input: {
  inspectionType: string;
  targetDistanceM?: number | null;
  recommendedZoom: number;
  hasFocusTarget: boolean;
}): DominicInspectionCameraPreset {
  const type = input.inspectionType.toLowerCase();
  const band = distanceBand(input.targetDistanceM);
  const cap = inspectionZoomCap(type);
  let zoom = clamp(Number.isFinite(input.recommendedZoom) ? input.recommendedZoom : 1, 1, cap);

  if (band === "medium") zoom = Math.max(zoom, Math.min(2, cap));
  if (band === "far") zoom = Math.max(zoom, Math.min(3, cap));
  if (band === "long_range") zoom = Math.max(zoom, Math.min(4, cap));

  const contextBiased = type === "security" || type === "stockpile";
  const widePreferred =
    band === "close" &&
    zoom <= 1.5 &&
    (contextBiased || !input.hasFocusTarget);

  const cameraSource: "wide" | "zoom" = widePreferred ? "wide" : "zoom";
  if (cameraSource === "wide") zoom = 1;

  const focusStrategy = input.hasFocusTarget ? "anomaly" : "center";
  const rationale: string[] = [];

  if (band !== "unknown") {
    rationale.push(`Target distance is in the ${band.replace("_", " ")} band.`);
  } else {
    rationale.push("Target distance is unavailable; using image-region framing only.");
  }
  if (cameraSource === "wide") {
    rationale.push("Wide camera preserves context at close range.");
  } else {
    rationale.push("Zoom camera is preferred for defect-detail evidence.");
  }
  if (cap < 8) {
    rationale.push(`${type || "inspection"} evidence is capped at ${cap.toFixed(1)}x to preserve context.`);
  }
  rationale.push(
    input.hasFocusTarget
      ? "Autofocus is placed on the anomaly center."
      : "Autofocus falls back to the frame center.",
  );

  return {
    name: `${type || "visual"}-${band}-${cameraSource}`,
    distanceBand: band,
    cameraSource,
    zoomRatio: Math.round(zoom * 10) / 10,
    focusStrategy,
    aeLock: true,
    rationale,
  };
}
