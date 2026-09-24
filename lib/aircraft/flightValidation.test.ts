import { describe, expect, it } from "vitest";
import {
  aircraftFingerprint,
  attestControlledFieldValidation,
  updateBenchVerification,
  updateSimulationVerification,
  validationStatus,
  type FlightValidationRecord,
} from "@/lib/aircraft/flightValidation";
import type { BenchReadinessReport } from "@/lib/aircraft/benchReadiness";

function record(): FlightValidationRecord {
  return {
    aircraftFingerprint: "dji|aircraft-1|Matrice 4E",
    planSignature: "plan-a",
  };
}

function bench(ready = true): BenchReadinessReport {
  return {
    generatedAtMs: 100,
    aircraftId: "aircraft-1",
    vendor: "dji",
    model: "Matrice 4E",
    readyForPropsOffBench: ready,
    readyForPropOnFieldTest: ready,
    checks: [],
  };
}

describe("DOMINIC flight validation ladder", () => {
  it("builds a stable aircraft fingerprint", () => {
    expect(
      aircraftFingerprint({
        vendor: "dji",
        aircraftId: "aircraft-1",
        model: "Matrice 4E",
      }),
    ).toBe("dji|aircraft-1|Matrice 4E");
  });

  it("requires simulation, bench, and controlled field validation", () => {
    let current = record();
    expect(
      validationStatus(current, {
        aircraftFingerprint: current.aircraftFingerprint,
        planSignature: current.planSignature,
      }).productionUnlocked,
    ).toBe(false);

    current = updateSimulationVerification(current, 1000);
    current = updateBenchVerification(current, bench(true), 2000);
    current = attestControlledFieldValidation(current, {
      notes: "Short controlled route completed with pilot ready to intervene.",
      atMs: 3000,
    });

    const status = validationStatus(current, {
      aircraftFingerprint: current.aircraftFingerprint,
      planSignature: current.planSignature,
    });
    expect(status.productionUnlocked).toBe(true);
    expect(status.currentStage).toBe("production");
  });

  it("does not accept a failed bench report", () => {
    const current = updateBenchVerification(record(), bench(false), 2000);
    expect(current.benchVerifiedAtMs).toBeUndefined();
  });

  it("invalidates production unlock when aircraft or plan changes", () => {
    let current = updateSimulationVerification(record(), 1000);
    current = updateBenchVerification(current, bench(true), 2000);
    current = attestControlledFieldValidation(current, {
      notes: "Controlled proving route completed successfully.",
      atMs: 3000,
    });

    expect(
      validationStatus(current, {
        aircraftFingerprint: "dji|aircraft-2|Matrice 4E",
        planSignature: "plan-a",
      }).productionUnlocked,
    ).toBe(false);

    expect(
      validationStatus(current, {
        aircraftFingerprint: current.aircraftFingerprint,
        planSignature: "plan-b",
      }).productionUnlocked,
    ).toBe(false);
  });

  it("refuses controlled field attestation before prerequisite stages", () => {
    expect(() =>
      attestControlledFieldValidation(record(), {
        notes: "Attempted controlled test.",
      }),
    ).toThrow("Simulation and Bench/HITL verification");
  });
});
