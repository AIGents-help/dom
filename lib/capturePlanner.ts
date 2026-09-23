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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
