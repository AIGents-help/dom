export type CaptureMissionType =
  | "object"
  | "roof"
  | "building"
  | "facade"
  | "interior"
  | "stockpile"
  | "corridor";

export type CaptureRing = {
  id: "low" | "mid" | "high";
  label: string;
  altitudeRatio: number;
  cameraAngle: number;
  shots: number;
  radiusFt: number;
};



export type CaptureTelemetry = {
  bearingDeg: number;
  distanceFt: number;
  cameraAngle: number;
};

export type CaptureTolerance = {
  bearingDeg: number;
  distanceFt: number;
  cameraAngle: number;
};

export type CaptureGuidance = {
  bearingErrorDeg: number;
  distanceErrorFt: number;
  cameraAngleError: number;
  bearingReady: boolean;
  distanceReady: boolean;
  cameraReady: boolean;
  ready: boolean;
  instruction: string;
};

export type GeographicCheckpoint = {
  id: string;
  sequence: number;
  ringId: CaptureRing["id"];
  latitude: number;
  longitude: number;
  relativeAltitudeFt: number;
  cameraAngle: number;
  bearingDeg: number;
  radiusFt: number;
  action: "capture_photo";
};

export type AutonomousCheckpoint = {
  id: string;
  sequence: number;
  ringId: CaptureRing["id"];
  bearingDeg: number;
  radiusFt: number;
  cameraAngle: number;
  altitudeRatio: number;
  action: "capture_photo";
};

export type NoFlySector = {
  id: string;
  label: string;
  startBearingDeg: number;
  endBearingDeg: number;
};

export type MissionCalibration = {
  homeLatitude: number;
  homeLongitude: number;
  minRelativeAltitudeFt: number;
  maxRelativeAltitudeFt: number;
  minStandoffFt: number;
  maxStandoffFt: number;
  noFlySectors: NoFlySector[];
};

export type CalibrationIssue = {
  severity: "blocker" | "warning";
  code: string;
  message: string;
  checkpointIds: string[];
};

export type CalibrationValidation = {
  ready: boolean;
  issues: CalibrationIssue[];
};

export type CapturePlan = {
  missionType: CaptureMissionType;
  rings: CaptureRing[];
  totalShots: number;
  estimatedMinutes: number;
  footprintWidthFt: number;
  stepWidthFt: number;
  warnings: string[];
};

export const missionProfiles: Record<
  CaptureMissionType,
  {
    label: string;
    summary: string;
    status: "ready" | "guided";
  }
> = {
  object: {
    label: "Object Scan",
    summary: "Three concentric capture rings around a discrete subject.",
    status: "ready",
  },
  roof: {
    label: "Roof",
    summary: "Perimeter obliques plus a structured overhead grid.",
    status: "guided",
  },
  building: {
    label: "Building",
    summary: "Multi-level facade orbits with roof-transition coverage.",
    status: "guided",
  },
  facade: {
    label: "Facade",
    summary: "Parallel passes that hold distance and camera incidence.",
    status: "guided",
  },
  interior: {
    label: "Interior",
    summary: "Slow room-by-room loops with doorway and corner transitions.",
    status: "guided",
  },
  stockpile: {
    label: "Stockpile",
    summary: "Nadir grid plus perimeter obliques for complete pile geometry.",
    status: "guided",
  },
  corridor: {
    label: "Corridor",
    summary: "Linear out-and-back lanes with consistent side overlap.",
    status: "guided",
  },
};

export function calculateObjectScanPlan(input: {
  objectDiameterFt: number;
  objectHeightFt: number;
  standoffFt: number;
  overlapPct: number;
  horizontalFovDeg: number;
  ringAngles?: [number, number, number];
}): CapturePlan {
  const objectDiameterFt = clamp(input.objectDiameterFt, 1, 500);
  const objectHeightFt = clamp(input.objectHeightFt, 1, 500);
  const standoffFt = clamp(input.standoffFt, 3, 500);
  const overlapPct = clamp(input.overlapPct, 40, 95);
  const horizontalFovDeg = clamp(input.horizontalFovDeg, 25, 120);
  const angles = input.ringAngles ?? [-35, -15, 5];

  const subjectRadius = objectDiameterFt / 2;
  const radiusFt = subjectRadius + standoffFt;
  const fovRad = (horizontalFovDeg * Math.PI) / 180;
  const footprintWidthFt = 2 * standoffFt * Math.tan(fovRad / 2);
  const stepWidthFt = Math.max(0.5, footprintWidthFt * (1 - overlapPct / 100));
  const circumferenceFt = 2 * Math.PI * radiusFt;
  const shotsPerRing = clamp(Math.ceil(circumferenceFt / stepWidthFt), 12, 96);

  const rings: CaptureRing[] = [
    { id: "low", label: "Lower ring", altitudeRatio: 0.28, cameraAngle: angles[2], shots: shotsPerRing, radiusFt },
    { id: "mid", label: "Middle ring", altitudeRatio: 0.55, cameraAngle: angles[1], shots: shotsPerRing, radiusFt },
    { id: "high", label: "Upper ring", altitudeRatio: 0.82, cameraAngle: angles[0], shots: shotsPerRing, radiusFt },
  ];

  const warnings: string[] = [];
  if (standoffFt < Math.max(6, objectDiameterFt * 0.35)) {
    warnings.push("Stand-off is tight for this subject size. Increase distance if obstacle clearance or prop wash is a concern.");
  }
  if (overlapPct < 70) {
    warnings.push("Photogrammetry quality is more reliable at 70% or greater overlap.");
  }
  if (shotsPerRing >= 90) {
    warnings.push("This plan is frame-dense. Consider a wider field of view or slightly lower overlap if image count is excessive.");
  }
  if (objectHeightFt > standoffFt * 2.5) {
    warnings.push("Tall-subject ratio is high. Add an additional upper pass if the roof/top surface is important.");
  }

  const totalShots = rings.reduce((sum, ring) => sum + ring.shots, 0);
  const estimatedMinutes = Math.max(3, Math.ceil(totalShots * 2.3 / 60 + 2));

  return {
    missionType: "object",
    rings,
    totalShots,
    estimatedMinutes,
    footprintWidthFt,
    stepWidthFt,
    warnings,
  };
}

export function buildCaptureSequence(plan: CapturePlan) {
  return plan.rings.flatMap((ring) =>
    Array.from({ length: ring.shots }, (_, index) => ({
      id: `${ring.id}-${index + 1}`,
      ringId: ring.id,
      ringLabel: ring.label,
      shotNumber: index + 1,
      totalInRing: ring.shots,
      bearingDeg: Math.round((index / ring.shots) * 360),
      cameraAngle: ring.cameraAngle,
      radiusFt: ring.radiusFt,
    })),
  );
}


export function signedAngularDelta(targetDeg: number, actualDeg: number) {
  const target = normalizeDegrees(targetDeg);
  const actual = normalizeDegrees(actualDeg);
  return ((target - actual + 540) % 360) - 180;
}

export function evaluateCaptureGuidance(
  checkpoint: ReturnType<typeof buildCaptureSequence>[number],
  telemetry: CaptureTelemetry,
  tolerance: CaptureTolerance = { bearingDeg: 5, distanceFt: 3, cameraAngle: 4 },
): CaptureGuidance {
  const bearingErrorDeg = signedAngularDelta(checkpoint.bearingDeg, telemetry.bearingDeg);
  const distanceErrorFt = checkpoint.radiusFt - telemetry.distanceFt;
  const cameraAngleError = checkpoint.cameraAngle - telemetry.cameraAngle;

  const bearingReady = Math.abs(bearingErrorDeg) <= tolerance.bearingDeg;
  const distanceReady = Math.abs(distanceErrorFt) <= tolerance.distanceFt;
  const cameraReady = Math.abs(cameraAngleError) <= tolerance.cameraAngle;
  const ready = bearingReady && distanceReady && cameraReady;

  const instructions: string[] = [];
  if (!bearingReady) {
    instructions.push(
      bearingErrorDeg > 0
        ? `move clockwise ${Math.abs(Math.round(bearingErrorDeg))}°`
        : `move counter-clockwise ${Math.abs(Math.round(bearingErrorDeg))}°`,
    );
  }
  if (!distanceReady) {
    instructions.push(
      distanceErrorFt > 0
        ? `move out ${Math.abs(distanceErrorFt).toFixed(1)} ft`
        : `move in ${Math.abs(distanceErrorFt).toFixed(1)} ft`,
    );
  }
  if (!cameraReady) {
    instructions.push(
      cameraAngleError > 0
        ? `tilt camera up ${Math.abs(Math.round(cameraAngleError))}°`
        : `tilt camera down ${Math.abs(Math.round(cameraAngleError))}°`,
    );
  }

  return {
    bearingErrorDeg,
    distanceErrorFt,
    cameraAngleError,
    bearingReady,
    distanceReady,
    cameraReady,
    ready,
    instruction: ready ? "Hold position and capture." : instructions.join(" · "),
  };
}

export function buildAutonomousCheckpoints(plan: CapturePlan): AutonomousCheckpoint[] {
  const ringById = new Map(plan.rings.map((ring) => [ring.id, ring]));
  return buildCaptureSequence(plan).map((checkpoint, index) => ({
    id: checkpoint.id,
    sequence: index + 1,
    ringId: checkpoint.ringId,
    bearingDeg: checkpoint.bearingDeg,
    radiusFt: checkpoint.radiusFt,
    cameraAngle: checkpoint.cameraAngle,
    altitudeRatio: ringById.get(checkpoint.ringId)?.altitudeRatio ?? 0,
    action: "capture_photo",
  }));
}


export function destinationPoint(input: {
  latitude: number;
  longitude: number;
  bearingDeg: number;
  distanceFt: number;
}) {
  const earthRadiusM = 6378137;
  const distanceM = input.distanceFt * 0.3048;
  const angularDistance = distanceM / earthRadiusM;
  const bearing = (normalizeDegrees(input.bearingDeg) * Math.PI) / 180;
  const lat1 = (input.latitude * Math.PI) / 180;
  const lon1 = (input.longitude * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function buildGeographicCheckpoints(input: {
  plan: CapturePlan;
  centerLatitude: number;
  centerLongitude: number;
  objectHeightFt: number;
  baseRelativeAltitudeFt?: number;
}): GeographicCheckpoint[] {
  const ringById = new Map(input.plan.rings.map((ring) => [ring.id, ring]));
  return buildCaptureSequence(input.plan).map((checkpoint, index) => {
    const position = destinationPoint({
      latitude: input.centerLatitude,
      longitude: input.centerLongitude,
      bearingDeg: checkpoint.bearingDeg,
      distanceFt: checkpoint.radiusFt,
    });
    const altitudeRatio = ringById.get(checkpoint.ringId)?.altitudeRatio ?? 0;
    return {
      id: checkpoint.id,
      sequence: index + 1,
      ringId: checkpoint.ringId,
      latitude: position.latitude,
      longitude: position.longitude,
      relativeAltitudeFt:
        (input.baseRelativeAltitudeFt ?? 0) + Math.max(0, input.objectHeightFt) * altitudeRatio,
      cameraAngle: checkpoint.cameraAngle,
      bearingDeg: checkpoint.bearingDeg,
      radiusFt: checkpoint.radiusFt,
      action: "capture_photo",
    };
  });
}


export function bearingInSector(bearingDeg: number, startBearingDeg: number, endBearingDeg: number) {
  const bearing = normalizeDegrees(bearingDeg);
  const start = normalizeDegrees(startBearingDeg);
  const end = normalizeDegrees(endBearingDeg);
  if (start === end) return false;
  return start < end ? bearing >= start && bearing <= end : bearing >= start || bearing <= end;
}

export function validateMissionCalibration(input: {
  checkpoints: GeographicCheckpoint[];
  calibration: MissionCalibration;
}): CalibrationValidation {
  const issues: CalibrationIssue[] = [];
  const { checkpoints, calibration } = input;

  const altitudeLow = checkpoints.filter(
    (point) => point.relativeAltitudeFt < calibration.minRelativeAltitudeFt,
  );
  if (altitudeLow.length) {
    issues.push({
      severity: "blocker",
      code: "altitude_below_min",
      message: `${altitudeLow.length} checkpoint(s) fall below the configured minimum relative altitude.`,
      checkpointIds: altitudeLow.map((point) => point.id),
    });
  }

  const altitudeHigh = checkpoints.filter(
    (point) => point.relativeAltitudeFt > calibration.maxRelativeAltitudeFt,
  );
  if (altitudeHigh.length) {
    issues.push({
      severity: "blocker",
      code: "altitude_above_max",
      message: `${altitudeHigh.length} checkpoint(s) exceed the configured maximum relative altitude.`,
      checkpointIds: altitudeHigh.map((point) => point.id),
    });
  }

  const tooClose = checkpoints.filter((point) => point.radiusFt < calibration.minStandoffFt);
  if (tooClose.length) {
    issues.push({
      severity: "blocker",
      code: "standoff_below_min",
      message: `${tooClose.length} checkpoint(s) are inside the minimum stand-off distance.`,
      checkpointIds: tooClose.map((point) => point.id),
    });
  }

  const tooFar = checkpoints.filter((point) => point.radiusFt > calibration.maxStandoffFt);
  if (tooFar.length) {
    issues.push({
      severity: "warning",
      code: "standoff_above_max",
      message: `${tooFar.length} checkpoint(s) exceed the preferred maximum stand-off distance.`,
      checkpointIds: tooFar.map((point) => point.id),
    });
  }

  for (const sector of calibration.noFlySectors) {
    const blocked = checkpoints.filter((point) =>
      bearingInSector(point.bearingDeg, sector.startBearingDeg, sector.endBearingDeg),
    );
    if (blocked.length) {
      issues.push({
        severity: "blocker",
        code: `no_fly_sector:${sector.id}`,
        message: `${blocked.length} checkpoint(s) intersect no-fly sector "${sector.label}".`,
        checkpointIds: blocked.map((point) => point.id),
      });
    }
  }

  const invalidHome =
    !Number.isFinite(calibration.homeLatitude) ||
    !Number.isFinite(calibration.homeLongitude) ||
    calibration.homeLatitude < -90 ||
    calibration.homeLatitude > 90 ||
    calibration.homeLongitude < -180 ||
    calibration.homeLongitude > 180;

  if (invalidHome) {
    issues.push({
      severity: "blocker",
      code: "invalid_home",
      message: "Launch/home coordinates are invalid.",
      checkpointIds: [],
    });
  }

  return {
    ready: !issues.some((issue) => issue.severity === "blocker"),
    issues,
  };
}

function normalizeDegrees(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
