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
    checks: ["yaw_roundtrip", "gimbal_roundtrip", "media_roundtrip"].map((id) => ({
      id, label: id, status: "pass", message: "Controlled fixture evidence, not hardware validation.",
    })),
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

  it.each([
    ["different aircraft", { aircraftId: "aircraft-2" }],
    ["different model", { model: "Matrice 4T" }],
    ["future report", { generatedAtMs: 3000 }],
    ["invalid report time", { generatedAtMs: NaN }],
    ["missing report time", { generatedAtMs: 0 }],
    ["failed props-off bench", { readyForPropsOffBench: false }],
    ["no round-trip evidence", { checks: [] }],
  ] as Array<[string, Partial<BenchReadinessReport>]>) ("does not transfer a %s into bench verification", (_, patch) => {
    const current = updateBenchVerification(record(), { ...bench(), ...patch }, 2000);
    expect(current.benchVerifiedAtMs).toBeUndefined();
  });

  it("does not promote a simulator even when its readiness booleans claim success", () => {
    const current = { ...record(), aircraftFingerprint: "simulator|aircraft-1|Matrice 4E" };
    const result = updateBenchVerification(current, { ...bench(), vendor: "simulator" }, 2000);
    expect(result.benchVerifiedAtMs).toBeUndefined();
  });

  it("rejects stale handoff reports and an invalid acceptance clock", () => {
    expect(updateBenchVerification(record(), bench(), 30_101).benchVerifiedAtMs).toBeUndefined();
    expect(updateBenchVerification(record(), bench(), NaN).benchVerifiedAtMs).toBeUndefined();
  });

  it("rejects a failed check even when all required round-trips and flags claim success", () => {
    const report = bench();
    report.checks.push({ id: "final_connection", label: "Connection", status: "fail", message: "Disconnected" });
    expect(updateBenchVerification(record(), report, 2000).benchVerifiedAtMs).toBeUndefined();
  });

  it("rejects a skipped required media round-trip", () => {
    const report = bench();
    report.checks[2].status = "skipped";
    expect(updateBenchVerification(record(), report, 2000).benchVerifiedAtMs).toBeUndefined();
  });
});
