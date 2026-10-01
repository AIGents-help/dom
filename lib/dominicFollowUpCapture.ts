import type { NormalizedImageRegion } from "@/lib/aircraft/rangefinderTarget";

export type FollowUpCapturePrescription = {
  needed: boolean;
  reason: string[];
  targeting: "laser_target" | "image_region";
  targetLocation: { latitude: number; longitude: number; distanceM?: number } | null;
  center: { x: number; y: number } | null;
  estimatedOpticalZoomMultiplier: number;
  desiredSubjectFill: number;
  guidance: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildFollowUpCapturePrescription(input: {
  region: NormalizedImageRegion | null;
  confidence: number;
  comparisonState?: string | null;
  targetLocation?: { latitude: number; longitude: number; distanceM?: number } | null;
}): FollowUpCapturePrescription {
  const area = input.region ? clamp(input.region.width * input.region.height, 0.0001, 1) : 1;
  const desiredSubjectFill = 0.28;
  const rawZoom = input.region ? Math.sqrt(desiredSubjectFill / area) : 1;
  const estimatedOpticalZoomMultiplier = Math.round(clamp(rawZoom, 1, 8) * 10) / 10;
  const center = input.region
    ? {
        x: clamp(input.region.x + input.region.width / 2, 0, 1),
        y: clamp(input.region.y + input.region.height / 2, 0, 1),
      }
    : null;

  const reason: string[] = [];
  if (!input.region) reason.push("Anomaly localization is uncertain.");
  if (input.confidence < 0.8) reason.push("Model confidence is below 80%.");
  if (area < 0.08) reason.push("The candidate occupies a small part of the frame.");
  if (input.comparisonState === "uncertain") reason.push("Change from prior evidence is uncertain.");

  const needed = reason.length > 0;
  const targeting = input.targetLocation ? "laser_target" : "image_region";
  const guidance = needed
    ? [
        input.targetLocation
          ? "Keep the laser-localized target centered before the detail capture."
          : "Re-center the visible candidate region before the detail capture.",
        estimatedOpticalZoomMultiplier > 1
          ? `Prefer optical zoom first; target roughly ${estimatedOpticalZoomMultiplier}x tighter framing before reducing standoff.`
          : "Capture a tighter detail frame without reducing safe standoff.",
        "Capture one context image and one detail image; add an alternate angle when geometry or glare can hide the condition.",
      ]
    : ["Current evidence is sufficiently localized; retain the existing view as the comparison baseline."];

  return {
    needed,
    reason,
    targeting,
    targetLocation: input.targetLocation ?? null,
    center,
    estimatedOpticalZoomMultiplier,
    desiredSubjectFill,
    guidance,
  };
}
