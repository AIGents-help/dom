export type RealtimeInspectionScreeningDecision = {
  screen: boolean;
  reason:
    | "eligible"
    | "no_inspection"
    | "unsupported_sensor"
    | "unsupported_inspection"
    | "poor_capture_quality"
    | "non_image";
};

const AUTO_SCREEN_INSPECTIONS = new Set([
  "visual",
  "roof",
  "security",
]);

const VISUAL_SENSORS = new Set([
  "rgb",
  "zoom",
]);

export function decideRealtimeInspectionScreening(input: {
  hasInspectionContext: boolean;
  inspectionType?: string | null;
  sensorMode?: string | null;
  mediaType?: string | null;
  qualityUsable?: boolean | null;
}): RealtimeInspectionScreeningDecision {
  if (!input.hasInspectionContext) {
    return { screen: false, reason: "no_inspection" };
  }

  if ((input.mediaType ?? "image") !== "image") {
    return { screen: false, reason: "non_image" };
  }

  if (input.qualityUsable === false) {
    return { screen: false, reason: "poor_capture_quality" };
  }

  const sensor = (input.sensorMode ?? "").trim().toLowerCase();
  if (!VISUAL_SENSORS.has(sensor)) {
    return { screen: false, reason: "unsupported_sensor" };
  }

  const inspectionType = (input.inspectionType ?? "").trim().toLowerCase();
  if (!AUTO_SCREEN_INSPECTIONS.has(inspectionType)) {
    return { screen: false, reason: "unsupported_inspection" };
  }

  return { screen: true, reason: "eligible" };
}

export function realtimeScreeningReasonLabel(
  reason: RealtimeInspectionScreeningDecision["reason"],
) {
  switch (reason) {
    case "eligible":
      return "Queued for DOMINIC visual screening.";
    case "no_inspection":
      return "Capture is not linked to an active inspection.";
    case "unsupported_sensor":
      return "This sensor mode does not use the visual screening model.";
    case "unsupported_inspection":
      return "This inspection type uses a different analysis workflow.";
    case "poor_capture_quality":
      return "Capture quality did not meet the automatic screening threshold.";
    case "non_image":
      return "Only image evidence is screened automatically.";
  }
}
