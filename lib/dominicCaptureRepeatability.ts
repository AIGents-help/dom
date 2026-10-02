export type CaptureRepeatabilityInput = {
  current: Record<string, unknown> | null | undefined;
  baseline: Record<string, unknown> | null | undefined;
};

export type CaptureRepeatabilityAssessment = {
  score: number | null;
  comparable: boolean;
  checks: {
    cameraSource: "match" | "mismatch" | "unknown";
    zoom: "match" | "mismatch" | "unknown";
    focusTarget: "match" | "mismatch" | "unknown";
    aeLock: "match" | "mismatch" | "unknown";
    heading: "match" | "mismatch" | "unknown";
    gimbalPitch: "match" | "mismatch" | "unknown";
  };
  warnings: string[];
};

function finite(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function circularDelta(a: number, b: number) {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

export function assessCaptureRepeatability(
  input: CaptureRepeatabilityInput,
): CaptureRepeatabilityAssessment {
  const current = input.current ?? {};
  const baseline = input.baseline ?? {};
  const checks: CaptureRepeatabilityAssessment["checks"] = {
    cameraSource: "unknown",
    zoom: "unknown",
    focusTarget: "unknown",
    aeLock: "unknown",
    heading: "unknown",
    gimbalPitch: "unknown",
  };
  const weighted: Array<{ ok: boolean; weight: number }> = [];
  const warnings: string[] = [];

  const currentSource = typeof current.cameraSource === "string" ? current.cameraSource : null;
  const baselineSource = typeof baseline.cameraSource === "string" ? baseline.cameraSource : null;
  if (currentSource && baselineSource) {
    const ok = currentSource === baselineSource;
    checks.cameraSource = ok ? "match" : "mismatch";
    weighted.push({ ok, weight: 2 });
    if (!ok) warnings.push("Camera source differs from the baseline capture.");
  }

  const currentZoom = finite(current.zoomRatio);
  const baselineZoom = finite(baseline.zoomRatio);
  if (currentZoom !== null && baselineZoom !== null && currentZoom > 0 && baselineZoom > 0) {
    const relativeDelta = Math.abs(currentZoom - baselineZoom) / baselineZoom;
    const ok = relativeDelta <= 0.12;
    checks.zoom = ok ? "match" : "mismatch";
    weighted.push({ ok, weight: 2 });
    if (!ok) warnings.push("Zoom differs materially from the baseline capture.");
  }

  const currentFocus = record(current.focusTarget);
  const baselineFocus = record(baseline.focusTarget);
  const cfx = finite(currentFocus?.x);
  const cfy = finite(currentFocus?.y);
  const bfx = finite(baselineFocus?.x);
  const bfy = finite(baselineFocus?.y);
  if ([cfx, cfy, bfx, bfy].every((value) => value !== null)) {
    const distance = Math.hypot((cfx as number) - (bfx as number), (cfy as number) - (bfy as number));
    const ok = distance <= 0.12;
    checks.focusTarget = ok ? "match" : "mismatch";
    weighted.push({ ok, weight: 1 });
    if (!ok) warnings.push("Autofocus target moved away from the baseline region.");
  }

  if (typeof current.aeLocked === "boolean" && typeof baseline.aeLocked === "boolean") {
    const ok = current.aeLocked === baseline.aeLocked;
    checks.aeLock = ok ? "match" : "mismatch";
    weighted.push({ ok, weight: 1 });
    if (!ok) warnings.push("Exposure-lock state differs from the baseline capture.");
  }

  const currentHeading = finite(current.headingDeg);
  const baselineHeading = finite(baseline.headingDeg);
  if (currentHeading !== null && baselineHeading !== null) {
    const ok = circularDelta(currentHeading, baselineHeading) <= 12;
    checks.heading = ok ? "match" : "mismatch";
    weighted.push({ ok, weight: 1 });
    if (!ok) warnings.push("Aircraft heading differs by more than 12 degrees from baseline.");
  }

  const currentPitch = finite(current.gimbalPitchDeg);
  const baselinePitch = finite(baseline.gimbalPitchDeg);
  if (currentPitch !== null && baselinePitch !== null) {
    const ok = Math.abs(currentPitch - baselinePitch) <= 8;
    checks.gimbalPitch = ok ? "match" : "mismatch";
    weighted.push({ ok, weight: 1 });
    if (!ok) warnings.push("Gimbal pitch differs by more than 8 degrees from baseline.");
  }

  if (!weighted.length) {
    return { score: null, comparable: false, checks, warnings: ["No comparable capture settings were recorded."] };
  }

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const matchedWeight = weighted.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  const score = Math.round((matchedWeight / totalWeight) * 100);

  return {
    score,
    comparable: score >= 75,
    checks,
    warnings,
  };
}
