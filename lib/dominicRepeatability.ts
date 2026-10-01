export type RepeatabilityAlignmentInput = {
  baseline: {
    relativeAltitudeFt?: number | null;
    headingDeg?: number | null;
    gimbalPitchDeg?: number | null;
  };
  current: {
    relativeAltitudeFt?: number | null;
    headingDeg?: number | null;
    gimbalPitchDeg?: number | null;
  };
};

export type RepeatabilityAlignment = {
  score: number;
  ready: boolean;
  altitudeDeltaFt: number | null;
  headingDeltaDeg: number | null;
  gimbalDeltaDeg: number | null;
  guidance: string[];
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function angularDelta(a: number, b: number) {
  const raw = Math.abs(((a - b + 180) % 360) - 180);
  return raw;
}

function axisScore(delta: number, ideal: number, max: number) {
  if (delta <= ideal) return 100;
  if (delta >= max) return 0;
  return Math.round(100 * (1 - (delta - ideal) / (max - ideal)));
}

export function evaluateRepeatabilityAlignment(
  input: RepeatabilityAlignmentInput,
): RepeatabilityAlignment {
  const altitudeDeltaFt =
    finite(input.baseline.relativeAltitudeFt) && finite(input.current.relativeAltitudeFt)
      ? Math.abs(input.current.relativeAltitudeFt - input.baseline.relativeAltitudeFt)
      : null;
  const headingDeltaDeg =
    finite(input.baseline.headingDeg) && finite(input.current.headingDeg)
      ? angularDelta(input.current.headingDeg, input.baseline.headingDeg)
      : null;
  const gimbalDeltaDeg =
    finite(input.baseline.gimbalPitchDeg) && finite(input.current.gimbalPitchDeg)
      ? Math.abs(input.current.gimbalPitchDeg - input.baseline.gimbalPitchDeg)
      : null;

  const scores: number[] = [];
  if (altitudeDeltaFt !== null) scores.push(axisScore(altitudeDeltaFt, 2, 12));
  if (headingDeltaDeg !== null) scores.push(axisScore(headingDeltaDeg, 3, 20));
  if (gimbalDeltaDeg !== null) scores.push(axisScore(gimbalDeltaDeg, 2, 12));

  const score = scores.length
    ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    : 0;
  const ready =
    scores.length > 0 &&
    (altitudeDeltaFt === null || altitudeDeltaFt <= 5) &&
    (headingDeltaDeg === null || headingDeltaDeg <= 8) &&
    (gimbalDeltaDeg === null || gimbalDeltaDeg <= 5);

  const guidance: string[] = [];
  if (altitudeDeltaFt !== null && altitudeDeltaFt > 5) {
    guidance.push(
      input.current.relativeAltitudeFt! > input.baseline.relativeAltitudeFt!
        ? `Descend about ${altitudeDeltaFt.toFixed(1)} ft to match the baseline altitude.`
        : `Climb about ${altitudeDeltaFt.toFixed(1)} ft to match the baseline altitude.`,
    );
  }
  if (headingDeltaDeg !== null && headingDeltaDeg > 8) {
    guidance.push(
      `Adjust aircraft heading by about ${headingDeltaDeg.toFixed(1)}° toward the baseline view.`,
    );
  }
  if (gimbalDeltaDeg !== null && gimbalDeltaDeg > 5) {
    guidance.push(
      `Adjust gimbal pitch by about ${gimbalDeltaDeg.toFixed(1)}° toward the baseline angle.`,
    );
  }
  if (ready) {
    guidance.push("Viewpoint alignment is within DOMINIC's repeat-capture tolerance.");
  } else if (!scores.length) {
    guidance.push("Connect live aircraft telemetry to score baseline alignment.");
  }

  return {
    score,
    ready,
    altitudeDeltaFt,
    headingDeltaDeg,
    gimbalDeltaDeg,
    guidance,
  };
}
