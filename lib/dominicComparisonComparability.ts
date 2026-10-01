import { evaluateRepeatabilityAlignment } from "@/lib/dominicRepeatability";

export type ComparisonCaptureGeometry = {
  relativeAltitudeFt?: number | null;
  headingDeg?: number | null;
  gimbalPitchDeg?: number | null;
  cameraSource?: "wide" | "zoom" | null;
  zoomRatio?: number | null;
};

export type ComparisonComparability = {
  score: number | null;
  level: "high" | "moderate" | "low" | "unknown";
  viewpointScore: number | null;
  cameraSourceMatch: boolean | null;
  zoomRatioDelta: number | null;
  comparableDimensions: number;
  limitations: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateComparisonComparability(input: {
  baseline: ComparisonCaptureGeometry;
  current: ComparisonCaptureGeometry;
}): ComparisonComparability {
  const alignment = evaluateRepeatabilityAlignment({
    baseline: {
      relativeAltitudeFt: input.baseline.relativeAltitudeFt,
      headingDeg: input.baseline.headingDeg,
      gimbalPitchDeg: input.baseline.gimbalPitchDeg,
    },
    current: {
      relativeAltitudeFt: input.current.relativeAltitudeFt,
      headingDeg: input.current.headingDeg,
      gimbalPitchDeg: input.current.gimbalPitchDeg,
    },
  });

  const components: number[] = [];
  const limitations: string[] = [];
  const hasViewpoint =
    alignment.altitudeDeltaFt !== null ||
    alignment.headingDeltaDeg !== null ||
    alignment.gimbalDeltaDeg !== null;
  if (hasViewpoint) {
    components.push(alignment.score);
    if (!alignment.ready) {
      limitations.push(
        `Viewpoint differs from baseline (alignment ${alignment.score}%).`,
      );
    }
  }

  const cameraSourceMatch =
    input.baseline.cameraSource && input.current.cameraSource
      ? input.baseline.cameraSource === input.current.cameraSource
      : null;
  if (cameraSourceMatch !== null) {
    components.push(cameraSourceMatch ? 100 : 25);
    if (!cameraSourceMatch) {
      limitations.push("Baseline and current evidence use different camera sources.");
    }
  }

  const zoomRatioDelta =
    finite(input.baseline.zoomRatio) &&
    finite(input.current.zoomRatio) &&
    input.baseline.zoomRatio > 0 &&
    input.current.zoomRatio > 0
      ? Math.abs(input.current.zoomRatio - input.baseline.zoomRatio) /
        input.baseline.zoomRatio
      : null;
  if (zoomRatioDelta !== null) {
    const zoomScore =
      zoomRatioDelta <= 0.05
        ? 100
        : zoomRatioDelta >= 0.5
          ? 0
          : Math.round(100 * (1 - (zoomRatioDelta - 0.05) / 0.45));
    components.push(zoomScore);
    if (zoomRatioDelta > 0.15) {
      limitations.push(
        `Framing scale differs from baseline by about ${Math.round(zoomRatioDelta * 100)}%.`,
      );
    }
  }

  if (!components.length) {
    return {
      score: null,
      level: "unknown",
      viewpointScore: hasViewpoint ? alignment.score : null,
      cameraSourceMatch,
      zoomRatioDelta,
      comparableDimensions: 0,
      limitations: [
        "Capture geometry is insufficient to verify before/after comparability.",
      ],
    };
  }

  const score = Math.round(
    components.reduce((sum, value) => sum + value, 0) / components.length,
  );
  const level = score >= 80 ? "high" : score >= 55 ? "moderate" : "low";

  if (level === "low") {
    limitations.push(
      "Before/after change classification should be treated as uncertain unless the visible change is robust to viewpoint and scale differences.",
    );
  }

  return {
    score,
    level,
    viewpointScore: hasViewpoint ? alignment.score : null,
    cameraSourceMatch,
    zoomRatioDelta,
    comparableDimensions: components.length,
    limitations,
  };
}

export function effectiveComparisonState<T extends string>(
  state: T,
  comparability: ComparisonComparability | null,
): T | "uncertain" {
  if (!comparability || comparability.level !== "low") return state;
  if (state === "improving" || state === "worsening" || state === "unchanged") {
    return "uncertain";
  }
  return state;
}
