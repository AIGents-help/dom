import type { BenchReadinessReport } from "@/lib/aircraft/benchReadiness";

export type FlightValidationStage =
  | "simulation"
  | "bench_hitl"
  | "controlled_field"
  | "production";

export type FlightValidationRecord = {
  aircraftFingerprint: string;
  planSignature: string;
  simulationVerifiedAtMs?: number;
  benchVerifiedAtMs?: number;
  controlledFieldVerifiedAtMs?: number;
  controlledFieldNotes?: string;
};

export type FlightValidationStatus = {
  currentStage: FlightValidationStage;
  productionUnlocked: boolean;
  blockers: string[];
};

export function aircraftFingerprint(input: {
  vendor: string;
  aircraftId: string;
  model?: string;
}) {
  return [input.vendor, input.aircraftId, input.model ?? ""].join("|");
}

export function updateSimulationVerification(
  record: FlightValidationRecord,
  atMs = Date.now(),
): FlightValidationRecord {
  return {
    ...record,
    simulationVerifiedAtMs: atMs,
  };
}

export function updateBenchVerification(
  record: FlightValidationRecord,
  report: BenchReadinessReport,
  atMs = Date.now(),
): FlightValidationRecord {
  // This is a handoff of a just-completed check, not a reusable flight certificate.
  const reportAgeMs = atMs - report.generatedAtMs;
  const roundTripsComplete = ["yaw_roundtrip", "gimbal_roundtrip", "media_roundtrip"]
    .every((id) => report.checks.some((check) => check.id === id && check.status === "pass"));
  if (
    !report.readyForPropsOffBench || !report.readyForPropOnFieldTest ||
    report.vendor === "simulator" ||
    aircraftFingerprint(report) !== record.aircraftFingerprint ||
    !Number.isFinite(atMs) || !Number.isFinite(report.generatedAtMs) ||
    report.generatedAtMs <= 0 || reportAgeMs < 0 || reportAgeMs > 30_000 ||
    !roundTripsComplete || report.checks.some((check) => check.status === "fail")
  ) return record;
  return {
    ...record,
    benchVerifiedAtMs: atMs,
  };
}

export function attestControlledFieldValidation(
  record: FlightValidationRecord,
  input: {
    notes: string;
    atMs?: number;
  },
): FlightValidationRecord {
  if (!record.simulationVerifiedAtMs || !record.benchVerifiedAtMs) {
    throw new Error(
      "Simulation and Bench/HITL verification must be completed before controlled field validation.",
    );
  }
  const notes = input.notes.trim();
  if (notes.length < 8) {
    throw new Error("Controlled field validation notes are required.");
  }
  return {
    ...record,
    controlledFieldVerifiedAtMs: input.atMs ?? Date.now(),
    controlledFieldNotes: notes,
  };
}

export function validationStatus(
  record: FlightValidationRecord,
  input: {
    aircraftFingerprint: string;
    planSignature: string;
  },
): FlightValidationStatus {
  const blockers: string[] = [];

  if (record.aircraftFingerprint !== input.aircraftFingerprint) {
    blockers.push("Validation belongs to a different aircraft.");
  }
  if (record.planSignature !== input.planSignature) {
    blockers.push("Capture plan changed after validation.");
  }
  if (!record.simulationVerifiedAtMs) {
    blockers.push("Full simulation has not been verified.");
  }
  if (!record.benchVerifiedAtMs) {
    blockers.push("Bench/HITL field readiness has not been verified.");
  }
  if (!record.controlledFieldVerifiedAtMs) {
    blockers.push("Controlled field validation has not been recorded.");
  }

  const productionUnlocked = blockers.length === 0;
  let currentStage: FlightValidationStage = "simulation";
  if (record.simulationVerifiedAtMs) currentStage = "bench_hitl";
  if (record.simulationVerifiedAtMs && record.benchVerifiedAtMs) {
    currentStage = "controlled_field";
  }
  if (productionUnlocked) currentStage = "production";

  return { currentStage, productionUnlocked, blockers };
}
