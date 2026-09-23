import { destinationPoint, type CaptureMissionType } from "@/lib/capturePlanner";

export type PatternCheckpoint = {
  id: string;
  sequence: number;
  passId: string;
  xFt: number;
  yFt: number;
  relativeAltitudeFt: number;
  cameraAngle: number;
  action: "capture_photo";
};

export type GeographicPatternCheckpoint = PatternCheckpoint & {
  latitude: number;
  longitude: number;
};

export type CaptureGeometryPlan = {
  missionType: Exclude<CaptureMissionType, "object">;
  checkpoints: PatternCheckpoint[];
  passCount: number;
  estimatedMinutes: number;
  warnings: string[];
  metrics: Record<string, number>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function footprint(distanceFt: number, fovDeg: number) {
  return 2 * distanceFt * Math.tan((clamp(fovDeg, 20, 140) * Math.PI) / 360);
}

function axisPositions(spanFt: number, stepFt: number) {
  const span = Math.max(1, spanFt);
  const step = Math.max(0.5, stepFt);
  const count = Math.max(2, Math.ceil(span / step) + 1);
  return Array.from({ length: count }, (_, index) => -span / 2 + (span * index) / (count - 1));
}

function finalize(
  missionType: CaptureGeometryPlan["missionType"],
  raw: Omit<PatternCheckpoint, "sequence">[],
  passCount: number,
  warnings: string[],
  metrics: Record<string, number>,
): CaptureGeometryPlan {
  const checkpoints = raw.map((point, index) => ({ ...point, sequence: index + 1 }));
  return {
    missionType,
    checkpoints,
    passCount,
    estimatedMinutes: Math.max(3, Math.ceil(checkpoints.length * 2.2 / 60 + passCount * 0.45)),
    warnings,
    metrics,
  };
}

export function calculateRoofPlan(input: {
  lengthFt: number;
  widthFt: number;
  altitudeFt: number;
  frontOverlapPct: number;
  sideOverlapPct: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  includeObliques?: boolean;
}): CaptureGeometryPlan {
  const lengthFt = clamp(input.lengthFt, 4, 2000);
  const widthFt = clamp(input.widthFt, 4, 2000);
  const altitudeFt = clamp(input.altitudeFt, 8, 500);
  const front = clamp(input.frontOverlapPct, 40, 95);
  const side = clamp(input.sideOverlapPct, 40, 95);
  const alongFootprint = footprint(altitudeFt, input.verticalFovDeg);
  const crossFootprint = footprint(altitudeFt, input.horizontalFovDeg);
  const shotStep = Math.max(1, alongFootprint * (1 - front / 100));
  const laneStep = Math.max(1, crossFootprint * (1 - side / 100));
  const ys = axisPositions(widthFt, laneStep);
  const xs = axisPositions(lengthFt, shotStep);
  const raw: Omit<PatternCheckpoint, "sequence">[] = [];

  ys.forEach((y, lane) => {
    const ordered = lane % 2 === 0 ? xs : [...xs].reverse();
    ordered.forEach((x, index) => raw.push({
      id: `roof-grid-${lane + 1}-${index + 1}`,
      passId: `grid-${lane + 1}`,
      xFt: x,
      yFt: y,
      relativeAltitudeFt: altitudeFt,
      cameraAngle: -90,
      action: "capture_photo",
    }));
  });

  let passCount = ys.length;
  if (input.includeObliques !== false) {
    const margin = Math.max(8, altitudeFt * 0.35);
    const corners = [
      [-lengthFt / 2 - margin, -widthFt / 2 - margin],
      [ lengthFt / 2 + margin, -widthFt / 2 - margin],
      [ lengthFt / 2 + margin,  widthFt / 2 + margin],
      [-lengthFt / 2 - margin,  widthFt / 2 + margin],
    ];
    corners.forEach(([x, y], index) => raw.push({
      id: `roof-oblique-${index + 1}`,
      passId: "perimeter-oblique",
      xFt: x,
      yFt: y,
      relativeAltitudeFt: Math.max(altitudeFt * 0.7, 8),
      cameraAngle: -45,
      action: "capture_photo",
    }));
    passCount += 1;
  }

  const warnings: string[] = [];
  if (front < 70 || side < 65) warnings.push("Roof photogrammetry is more reliable with at least 70% forward and 65% side overlap.");
  return finalize("roof", raw, passCount, warnings, { shotStepFt: shotStep, laneStepFt: laneStep });
}

export function calculateFacadePlan(input: {
  widthFt: number;
  heightFt: number;
  standoffFt: number;
  overlapPct: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
}): CaptureGeometryPlan {
  const widthFt = clamp(input.widthFt, 4, 2000);
  const heightFt = clamp(input.heightFt, 4, 1000);
  const standoffFt = clamp(input.standoffFt, 5, 500);
  const overlap = clamp(input.overlapPct, 40, 95);
  const xStep = Math.max(1, footprint(standoffFt, input.horizontalFovDeg) * (1 - overlap / 100));
  const zStep = Math.max(1, footprint(standoffFt, input.verticalFovDeg) * (1 - overlap / 100));
  const xs = axisPositions(widthFt, xStep);
  const zs = axisPositions(heightFt, zStep).map((z) => z + heightFt / 2);
  const raw: Omit<PatternCheckpoint, "sequence">[] = [];

  zs.forEach((z, pass) => {
    const ordered = pass % 2 === 0 ? xs : [...xs].reverse();
    ordered.forEach((x, index) => raw.push({
      id: `facade-${pass + 1}-${index + 1}`,
      passId: `facade-${pass + 1}`,
      xFt: x,
      yFt: -standoffFt,
      relativeAltitudeFt: Math.max(2, z),
      cameraAngle: 0,
      action: "capture_photo",
    }));
  });

  const warnings = overlap < 70 ? ["Facade reconstruction is more reliable at 70% or greater overlap."] : [];
  return finalize("facade", raw, zs.length, warnings, { horizontalStepFt: xStep, verticalStepFt: zStep });
}

export function calculateCorridorPlan(input: {
  lengthFt: number;
  widthFt: number;
  altitudeFt: number;
  frontOverlapPct: number;
  sideOverlapPct: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
}): CaptureGeometryPlan {
  const lengthFt = clamp(input.lengthFt, 20, 20000);
  const widthFt = clamp(input.widthFt, 4, 1000);
  const altitudeFt = clamp(input.altitudeFt, 10, 500);
  const front = clamp(input.frontOverlapPct, 40, 95);
  const side = clamp(input.sideOverlapPct, 30, 95);
  const shotStep = Math.max(2, footprint(altitudeFt, input.verticalFovDeg) * (1 - front / 100));
  const laneStep = Math.max(2, footprint(altitudeFt, input.horizontalFovDeg) * (1 - side / 100));
  const xs = axisPositions(lengthFt, shotStep);
  const ys = axisPositions(widthFt, laneStep);
  const raw: Omit<PatternCheckpoint, "sequence">[] = [];

  ys.forEach((y, lane) => {
    const ordered = lane % 2 === 0 ? xs : [...xs].reverse();
    ordered.forEach((x, index) => raw.push({
      id: `corridor-${lane + 1}-${index + 1}`,
      passId: `lane-${lane + 1}`,
      xFt: x,
      yFt: y,
      relativeAltitudeFt: altitudeFt,
      cameraAngle: -90,
      action: "capture_photo",
    }));
  });

  return finalize("corridor", raw, ys.length, [], { shotStepFt: shotStep, laneStepFt: laneStep });
}

export function calculateStockpilePlan(input: {
  lengthFt: number;
  widthFt: number;
  pileHeightFt: number;
  altitudeAboveTopFt: number;
  overlapPct: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
}): CaptureGeometryPlan {
  const lengthFt = clamp(input.lengthFt, 6, 2000);
  const widthFt = clamp(input.widthFt, 6, 2000);
  const pileHeightFt = clamp(input.pileHeightFt, 1, 500);
  const altitude = pileHeightFt + clamp(input.altitudeAboveTopFt, 10, 500);
  const grid = calculateRoofPlan({
    lengthFt,
    widthFt,
    altitudeFt: altitude,
    frontOverlapPct: input.overlapPct,
    sideOverlapPct: input.overlapPct,
    horizontalFovDeg: input.horizontalFovDeg,
    verticalFovDeg: input.verticalFovDeg,
    includeObliques: false,
  });
  const raw = grid.checkpoints.map(({ sequence: _sequence, ...point }) => ({ ...point, id: point.id.replace("roof", "stockpile") }));
  const margin = Math.max(10, Math.min(lengthFt, widthFt) * 0.2);
  const perimeter = [
    [-lengthFt / 2 - margin, -widthFt / 2 - margin],
    [0, -widthFt / 2 - margin],
    [lengthFt / 2 + margin, -widthFt / 2 - margin],
    [lengthFt / 2 + margin, 0],
    [lengthFt / 2 + margin, widthFt / 2 + margin],
    [0, widthFt / 2 + margin],
    [-lengthFt / 2 - margin, widthFt / 2 + margin],
    [-lengthFt / 2 - margin, 0],
  ];
  perimeter.forEach(([x, y], index) => raw.push({
    id: `stockpile-oblique-${index + 1}`,
    passId: "perimeter-oblique",
    xFt: x,
    yFt: y,
    relativeAltitudeFt: Math.max(pileHeightFt + 8, altitude * 0.75),
    cameraAngle: -45,
    action: "capture_photo",
  }));
  return finalize("stockpile", raw, grid.passCount + 1, grid.warnings, grid.metrics);
}

function perimeterPoints(lengthFt: number, widthFt: number, standoffFt: number, stepFt: number) {
  const halfL = lengthFt / 2 + standoffFt;
  const halfW = widthFt / 2 + standoffFt;
  const points: Array<[number, number]> = [];
  const horizontal = axisPositions(halfL * 2, stepFt);
  const vertical = axisPositions(halfW * 2, stepFt);
  horizontal.forEach((x) => points.push([x, -halfW]));
  vertical.slice(1).forEach((y) => points.push([halfL, y]));
  horizontal.slice(0, -1).reverse().forEach((x) => points.push([x, halfW]));
  vertical.slice(1, -1).reverse().forEach((y) => points.push([-halfL, y]));
  return points;
}

export function calculateBuildingPlan(input: {
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  standoffFt: number;
  overlapPct: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
}): CaptureGeometryPlan {
  const lengthFt = clamp(input.lengthFt, 6, 2000);
  const widthFt = clamp(input.widthFt, 6, 2000);
  const heightFt = clamp(input.heightFt, 6, 1000);
  const standoffFt = clamp(input.standoffFt, 6, 500);
  const overlap = clamp(input.overlapPct, 40, 95);
  const aroundStep = Math.max(2, footprint(standoffFt, input.horizontalFovDeg) * (1 - overlap / 100));
  const verticalStep = Math.max(2, footprint(standoffFt, input.verticalFovDeg) * (1 - overlap / 100));
  const levels = axisPositions(heightFt, verticalStep).map((z) => z + heightFt / 2);
  const perimeter = perimeterPoints(lengthFt, widthFt, standoffFt, aroundStep);
  const raw: Omit<PatternCheckpoint, "sequence">[] = [];
  levels.forEach((z, level) => {
    perimeter.forEach(([x, y], index) => raw.push({
      id: `building-${level + 1}-${index + 1}`,
      passId: `orbit-${level + 1}`,
      xFt: x,
      yFt: y,
      relativeAltitudeFt: Math.max(2, z),
      cameraAngle: level === levels.length - 1 ? -25 : -5,
      action: "capture_photo",
    }));
  });
  return finalize("building", raw, levels.length, overlap < 70 ? ["Building reconstruction is more reliable at 70% or greater overlap."] : [], { aroundStepFt: aroundStep, verticalStepFt: verticalStep });
}

export function calculateInteriorPlan(input: {
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  wallStandoffFt?: number;
}): CaptureGeometryPlan {
  const lengthFt = clamp(input.lengthFt, 6, 500);
  const widthFt = clamp(input.widthFt, 6, 500);
  const heightFt = clamp(input.heightFt, 6, 100);
  const inset = clamp(input.wallStandoffFt ?? 4, 2, Math.max(2, Math.min(lengthFt, widthFt) / 3));
  const pathLength = Math.max(2, lengthFt - inset * 2);
  const pathWidth = Math.max(2, widthFt - inset * 2);
  const step = Math.max(3, Math.min(pathLength, pathWidth) / 4);
  const perimeter = perimeterPoints(pathLength, pathWidth, 0, step);
  const levels = [Math.max(3, heightFt * 0.35), Math.max(4, heightFt * 0.7)];
  const raw: Omit<PatternCheckpoint, "sequence">[] = [];
  levels.forEach((z, level) => {
    perimeter.forEach(([x, y], index) => raw.push({
      id: `interior-${level + 1}-${index + 1}`,
      passId: `room-loop-${level + 1}`,
      xFt: x,
      yFt: y,
      relativeAltitudeFt: z,
      cameraAngle: level === 0 ? 0 : -15,
      action: "capture_photo",
    }));
  });
  return finalize("interior", raw, levels.length, ["Interior autonomy requires local positioning/SLAM or another non-GNSS navigation source; GPS waypoints alone are not sufficient."], { wallStandoffFt: inset, pathStepFt: step });
}

export function georeferencePattern(
  plan: CaptureGeometryPlan,
  centerLatitude: number,
  centerLongitude: number,
  headingDeg = 0,
): GeographicPatternCheckpoint[] {
  const headingRad = (headingDeg * Math.PI) / 180;
  return plan.checkpoints.map((point) => {
    const east = point.xFt * Math.cos(headingRad) + point.yFt * Math.sin(headingRad);
    const north = -point.xFt * Math.sin(headingRad) + point.yFt * Math.cos(headingRad);
    const distanceFt = Math.hypot(east, north);
    const bearingDeg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
    const geo = destinationPoint({
      latitude: centerLatitude,
      longitude: centerLongitude,
      bearingDeg,
      distanceFt,
    });
    return { ...point, ...geo };
  });
}
