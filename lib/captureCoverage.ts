import {
  bearingAndDistanceBetween,
  signedAngularDelta,
  type GeographicCheckpoint,
} from "@/lib/capturePlanner";
import type { GeographicPatternCheckpoint } from "@/lib/capturePatterns";

export type CoverageCheckpoint = GeographicCheckpoint | GeographicPatternCheckpoint;

export type CaptureObservation = {
  id: string;
  capturedAtMs: number;
  latitude: number;
  longitude: number;
  relativeAltitudeFt: number;
  cameraAngle: number;
  checkpointId?: string;
  sharpnessScore?: number;
  exposureScore?: number;
  usable?: boolean;
};

export type CoverageStatus = "covered" | "weak" | "missing";

export type CoverageAssessment = {
  checkpointId: string;
  status: CoverageStatus;
  bestObservationId?: string;
  positionErrorFt?: number;
  bearingErrorDeg?: number;
  altitudeErrorFt?: number;
  cameraAngleErrorDeg?: number;
  qualityScore?: number;
  reason: string;
};

export type CoverageSummary = {
  total: number;
  covered: number;
  weak: number;
  missing: number;
  coveragePct: number;
  assessments: CoverageAssessment[];
};

export type RepairCheckpoint = CoverageCheckpoint & {
  repairReason: string;
  priority: number;
  sourceCheckpointId: string;
};

export type CoveragePolicy = {
  maxPositionErrorFt: number;
  maxBearingErrorDeg: number;
  maxAltitudeErrorFt: number;
  maxCameraAngleErrorDeg: number;
  minimumQualityScore: number;
  weakQualityScore: number;
};

export const defaultCoveragePolicy: CoveragePolicy = {
  maxPositionErrorFt: 8,
  maxBearingErrorDeg: 8,
  maxAltitudeErrorFt: 6,
  maxCameraAngleErrorDeg: 6,
  minimumQualityScore: 0.72,
  weakQualityScore: 0.55,
};

function observationQuality(observation: CaptureObservation) {
  if (observation.usable === false) return 0;
  const sharpness = observation.sharpnessScore ?? 1;
  const exposure = observation.exposureScore ?? 1;
  return Math.max(0, Math.min(1, Math.min(sharpness, exposure)));
}

function compareObservation(
  checkpoint: CoverageCheckpoint,
  observation: CaptureObservation,
  centerLatitude: number,
  centerLongitude: number,
) {
  const position = bearingAndDistanceBetween({
    fromLatitude: checkpoint.latitude,
    fromLongitude: checkpoint.longitude,
    toLatitude: observation.latitude,
    toLongitude: observation.longitude,
  });
  const expectedBearing = "bearingDeg" in checkpoint
    ? checkpoint.bearingDeg
    : bearingAndDistanceBetween({
        fromLatitude: centerLatitude,
        fromLongitude: centerLongitude,
        toLatitude: checkpoint.latitude,
        toLongitude: checkpoint.longitude,
      }).bearingDeg;
  const actualBearing = bearingAndDistanceBetween({
    fromLatitude: centerLatitude,
    fromLongitude: centerLongitude,
    toLatitude: observation.latitude,
    toLongitude: observation.longitude,
  }).bearingDeg;

  return {
    observation,
    positionErrorFt: position.distanceFt,
    bearingErrorDeg: Math.abs(signedAngularDelta(expectedBearing, actualBearing)),
    altitudeErrorFt: Math.abs(
      checkpoint.relativeAltitudeFt - observation.relativeAltitudeFt,
    ),
    cameraAngleErrorDeg: Math.abs(checkpoint.cameraAngle - observation.cameraAngle),
    qualityScore: observationQuality(observation),
  };
}

export function assessCoverage(input: {
  checkpoints: CoverageCheckpoint[];
  observations: CaptureObservation[];
  centerLatitude: number;
  centerLongitude: number;
  policy?: Partial<CoveragePolicy>;
}): CoverageSummary {
  const policy: CoveragePolicy = { ...defaultCoveragePolicy, ...input.policy };
  const assessments = input.checkpoints.map<CoverageAssessment>((checkpoint) => {
    const explicit = input.observations.filter(
      (observation) => observation.checkpointId === checkpoint.id,
    );
    const candidates = explicit.length ? explicit : input.observations;

    const scored = candidates
      .map((observation) =>
        compareObservation(
          checkpoint,
          observation,
          input.centerLatitude,
          input.centerLongitude,
        ),
      )
      .filter(
        (candidate) =>
          candidate.positionErrorFt <= policy.maxPositionErrorFt * 2 &&
          candidate.bearingErrorDeg <= policy.maxBearingErrorDeg * 2 &&
          candidate.altitudeErrorFt <= policy.maxAltitudeErrorFt * 2 &&
          candidate.cameraAngleErrorDeg <= policy.maxCameraAngleErrorDeg * 2,
      )
      .sort((a, b) => {
        const aScore =
          a.positionErrorFt / policy.maxPositionErrorFt +
          a.bearingErrorDeg / policy.maxBearingErrorDeg +
          a.altitudeErrorFt / policy.maxAltitudeErrorFt +
          a.cameraAngleErrorDeg / policy.maxCameraAngleErrorDeg -
          a.qualityScore;
        const bScore =
          b.positionErrorFt / policy.maxPositionErrorFt +
          b.bearingErrorDeg / policy.maxBearingErrorDeg +
          b.altitudeErrorFt / policy.maxAltitudeErrorFt +
          b.cameraAngleErrorDeg / policy.maxCameraAngleErrorDeg -
          b.qualityScore;
        return aScore - bScore;
      });

    const best = scored[0];
    if (!best) {
      return {
        checkpointId: checkpoint.id,
        status: "missing",
        reason: "No captured image sufficiently matches this planned view.",
      };
    }

    const geometryGood =
      best.positionErrorFt <= policy.maxPositionErrorFt &&
      best.bearingErrorDeg <= policy.maxBearingErrorDeg &&
      best.altitudeErrorFt <= policy.maxAltitudeErrorFt &&
      best.cameraAngleErrorDeg <= policy.maxCameraAngleErrorDeg;

    if (geometryGood && best.qualityScore >= policy.minimumQualityScore) {
      return {
        checkpointId: checkpoint.id,
        status: "covered",
        bestObservationId: best.observation.id,
        positionErrorFt: best.positionErrorFt,
        bearingErrorDeg: best.bearingErrorDeg,
        altitudeErrorFt: best.altitudeErrorFt,
        cameraAngleErrorDeg: best.cameraAngleErrorDeg,
        qualityScore: best.qualityScore,
        reason: "Capture geometry and image quality meet the coverage policy.",
      };
    }

    if (
      best.qualityScore >= policy.weakQualityScore &&
      best.positionErrorFt <= policy.maxPositionErrorFt * 1.5 &&
      best.bearingErrorDeg <= policy.maxBearingErrorDeg * 1.5
    ) {
      return {
        checkpointId: checkpoint.id,
        status: "weak",
        bestObservationId: best.observation.id,
        positionErrorFt: best.positionErrorFt,
        bearingErrorDeg: best.bearingErrorDeg,
        altitudeErrorFt: best.altitudeErrorFt,
        cameraAngleErrorDeg: best.cameraAngleErrorDeg,
        qualityScore: best.qualityScore,
        reason: geometryGood
          ? "View was captured but image quality is below the preferred threshold."
          : "View is close to the planned geometry but falls outside one or more preferred tolerances.",
      };
    }

    return {
      checkpointId: checkpoint.id,
      status: "missing",
      bestObservationId: best.observation.id,
      positionErrorFt: best.positionErrorFt,
      bearingErrorDeg: best.bearingErrorDeg,
      altitudeErrorFt: best.altitudeErrorFt,
      cameraAngleErrorDeg: best.cameraAngleErrorDeg,
      qualityScore: best.qualityScore,
      reason: "Available capture is too far from the planned geometry or quality threshold.",
    };
  });

  const covered = assessments.filter((assessment) => assessment.status === "covered").length;
  const weak = assessments.filter((assessment) => assessment.status === "weak").length;
  const missing = assessments.filter((assessment) => assessment.status === "missing").length;
  const total = assessments.length;
  const coveragePct = total
    ? Math.round(((covered + weak * 0.5) / total) * 100)
    : 100;

  return { total, covered, weak, missing, coveragePct, assessments };
}

export function buildRepairPlan(input: {
  checkpoints: CoverageCheckpoint[];
  coverage: CoverageSummary;
  includeWeak?: boolean;
}): RepairCheckpoint[] {
  const includeWeak = input.includeWeak ?? true;
  const checkpointById = new Map(
    input.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
  );

  return input.coverage.assessments
    .filter(
      (assessment) =>
        assessment.status === "missing" ||
        (includeWeak && assessment.status === "weak"),
    )
    .map((assessment) => {
      const checkpoint = checkpointById.get(assessment.checkpointId);
      if (!checkpoint) return null;
      return {
        ...checkpoint,
        repairReason: assessment.reason,
        priority: assessment.status === "missing" ? 2 : 1,
        sourceCheckpointId: checkpoint.id,
      };
    })
    .filter((checkpoint): checkpoint is RepairCheckpoint => checkpoint !== null)
    .sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
}

export function summarizeCoverageByRing(
  checkpoints: CoverageCheckpoint[],
  coverage: CoverageSummary,
) {
  const checkpointById = new Map(
    checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
  );
  const groups = new Map<
    string,
    { total: number; covered: number; weak: number; missing: number }
  >();

  for (const assessment of coverage.assessments) {
    const checkpoint = checkpointById.get(assessment.checkpointId);
    const key = checkpoint
      ? ("ringId" in checkpoint ? checkpoint.ringId : checkpoint.passId)
      : "unknown";
    const current = groups.get(key) ?? {
      total: 0,
      covered: 0,
      weak: 0,
      missing: 0,
    };
    current.total += 1;
    current[assessment.status] += 1;
    groups.set(key, current);
  }

  return Object.fromEntries(groups);
}
