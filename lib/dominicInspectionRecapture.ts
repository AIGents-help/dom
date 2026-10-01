import type { ImageQualityAssessment } from "@/lib/imageQuality";

export type InspectionRecaptureDecision = {
  retry: boolean;
  refocus: boolean;
  unlockExposure: boolean;
  reason: "soft" | "exposure" | "soft_and_exposure" | null;
  message: string;
};

export function decideInspectionQualityRecapture(input: {
  quality: ImageQualityAssessment;
  attempts: number;
  maxAttempts?: number;
}): InspectionRecaptureDecision {
  const maxAttempts = input.maxAttempts ?? 1;
  const { quality } = input;

  if (input.attempts >= maxAttempts) {
    return {
      retry: false,
      refocus: false,
      unlockExposure: false,
      reason: null,
      message: "Automatic quality retry limit reached.",
    };
  }

  const soft = quality.sharpnessScore < 0.45;
  const exposure =
    quality.exposureScore < 0.45 ||
    quality.shadowClipPct > 20 ||
    quality.highlightClipPct > 20;

  if (!soft && !exposure) {
    return {
      retry: false,
      refocus: false,
      unlockExposure: false,
      reason: null,
      message: quality.usable
        ? "Capture quality passed."
        : "Capture quality issue is not correctable by an automatic camera retry.",
    };
  }

  const reason =
    soft && exposure
      ? "soft_and_exposure"
      : soft
        ? "soft"
        : "exposure";

  return {
    retry: true,
    refocus: soft,
    unlockExposure: exposure,
    reason,
    message:
      reason === "soft_and_exposure"
        ? "Image is soft and exposure is outside tolerance; retry once after refocus and exposure reset."
        : reason === "soft"
          ? "Image is soft; retry once after refocus."
          : "Exposure is outside tolerance; retry once after releasing AE lock.",
  };
}
