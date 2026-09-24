import type { GeographicCheckpoint } from "@/lib/capturePlanner";
import { bearingAndDistanceBetween } from "@/lib/capturePlanner";
import type {
  DominicAircraftAdapter,
  UniversalAircraftState,
  UniversalAircraftCommand,
  CommandResult,
} from "@/lib/aircraft/contract";
import {
  evaluateFlightSafety,
  type FlightSafetyIssue,
  type FlightSafetyPolicy,
} from "@/lib/aircraft/flightSafety";

export type MissionPhase =
  | "IDLE"
  | "CONNECTING"
  | "PREFLIGHT"
  | "ARMING"
  | "TAKEOFF"
  | "TRANSIT"
  | "AIMING"
  | "CAPTURING"
  | "RETURNING"
  | "LANDING"
  | "COMPLETE"
  | "PAUSED"
  | "ABORTED"
  | "FAILED";

export type MissionEvent = {
  atMs: number;
  phase: MissionPhase;
  message: string;
  checkpointId?: string;
};

export type MissionExecutionSnapshot = {
  phase: MissionPhase;
  checkpointIndex: number;
  checkpointCount: number;
  completedCheckpointIds: string[];
  currentCheckpointId?: string;
  lastAircraftState?: UniversalAircraftState;
  events: MissionEvent[];
  error?: string;
  safetyIssues: FlightSafetyIssue[];
};

export type AutonomousMissionInput = {
  centerLatitude: number;
  centerLongitude: number;
  checkpoints: GeographicCheckpoint[];
  takeoffAltitudeFt?: number;
  transitSpeedFps?: number;
  safetyPolicy?: Partial<FlightSafetyPolicy>;
  arrivalTimeoutMs?: number;
  positionToleranceFt?: number;
  altitudeToleranceFt?: number;
  headingToleranceDeg?: number;
  gimbalToleranceDeg?: number;
  commandTimeoutMs?: number;
  emergencyCommandTimeoutMs?: number;
  connectTimeoutMs?: number;
};

const requiredCapabilities = [
  "telemetry",
  "arm",
  "takeoff",
  "goTo",
  "yawControl",
  "gimbalControl",
  "photoCapture",
  "returnHome",
  "land",
] as const;

export class DominicMissionEngine {
  private snapshot: MissionExecutionSnapshot;
  private listeners = new Set<(snapshot: MissionExecutionSnapshot) => void>();
  private paused = false;
  private aborted = false;
  private safetyActionInFlight = false;
  private unsubscribeSafety?: () => void;

  constructor(
    private readonly adapter: DominicAircraftAdapter,
    private readonly mission: AutonomousMissionInput,
  ) {
    this.snapshot = {
      phase: "IDLE",
      checkpointIndex: 0,
      checkpointCount: mission.checkpoints.length,
      completedCheckpointIds: [],
      events: [],
      safetyIssues: [],
    };
  }

  getSnapshot() {
    return structuredClone(this.snapshot);
  }

  subscribe(listener: (snapshot: MissionExecutionSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async pause() {
    if (!["TRANSIT", "AIMING", "CAPTURING"].includes(this.snapshot.phase)) return;
    if (!this.adapter.capabilities.pauseResume) {
      throw new Error("Connected aircraft does not support pause/resume.");
    }
    this.paused = true;
    await this.requireAccepted(await this.sendCommand({ type: "pause" }));
    this.transition("PAUSED", "Mission paused by operator.");
  }

  async resume() {
    if (!this.paused) return;
    if (!this.adapter.capabilities.pauseResume) {
      throw new Error("Connected aircraft does not support pause/resume.");
    }

    const safety = evaluateFlightSafety({
      state: this.adapter.getState(),
      phase: "flight",
      policy: this.mission.safetyPolicy,
    });
    this.snapshot.safetyIssues = safety.issues;
    if (safety.highestAction !== "continue") {
      this.emit();
      throw new Error(
        safety.issues.map((issue) => issue.message).join(" ") ||
          "DOMINIC safety checks are not clear for resume.",
      );
    }

    this.paused = false;
    await this.requireAccepted(await this.sendCommand({ type: "resume" }));
    this.transition("TRANSIT", "Mission resumed by operator.");
  }

  async abort(reason = "Operator abort") {
    if (this.aborted) return;
    this.aborted = true;
    this.transition("ABORTED", reason);
    await this.sendCommand({ type: "abort", reason }, this.mission.emergencyCommandTimeoutMs ?? 3000).catch(() => undefined);
  }

  async execute() {
    try {
      this.transition("CONNECTING", "Connecting to aircraft.");
      if (!this.adapter.getState().connected) {
        await this.withTimeout(
          this.adapter.connect(),
          this.mission.connectTimeoutMs ?? 10_000,
          "Aircraft connection timed out.",
        );
      }
      this.captureState();

      this.transition("PREFLIGHT", "Checking aircraft capabilities and flight safety.");
      this.assertCapabilities();
      this.assertPreflightSafety();
      this.startSafetySupervisor();

      if (!this.mission.checkpoints.length) {
        throw new Error("Mission contains no checkpoints.");
      }

      this.transition("ARMING", "Arming aircraft.");
      await this.requireAccepted(await this.sendCommand({ type: "arm" }));

      const first = this.mission.checkpoints[0];
      const takeoffAltitudeFt =
        this.mission.takeoffAltitudeFt ??
        Math.max(10, Math.min(first.relativeAltitudeFt, 40));

      this.transition("TAKEOFF", `Taking off to ${takeoffAltitudeFt.toFixed(1)} ft.`);
      await this.requireAccepted(
        await this.sendCommand({ type: "takeoff", altitudeFt: takeoffAltitudeFt }),
      );
      this.captureState();

      for (let index = 0; index < this.mission.checkpoints.length; index += 1) {
        if (this.aborted) return this.getSnapshot();
        await this.waitIfPaused();

        const checkpoint = this.mission.checkpoints[index];
        this.snapshot.checkpointIndex = index;
        this.snapshot.currentCheckpointId = checkpoint.id;

        this.transition(
          "TRANSIT",
          `Flying to checkpoint ${index + 1} of ${this.mission.checkpoints.length}.`,
          checkpoint.id,
        );
        await this.requireAccepted(
          await this.sendCommand({
            type: "goTo",
            latitude: checkpoint.latitude,
            longitude: checkpoint.longitude,
            relativeAltitudeFt: checkpoint.relativeAltitudeFt,
            speedFps: this.mission.transitSpeedFps,
          }),
        );
        await this.waitForCheckpointArrival(checkpoint);

        const yawToSubject = bearingAndDistanceBetween({
          fromLatitude: checkpoint.latitude,
          fromLongitude: checkpoint.longitude,
          toLatitude: this.mission.centerLatitude,
          toLongitude: this.mission.centerLongitude,
        }).bearingDeg;

        this.transition("AIMING", "Aiming aircraft and camera.", checkpoint.id);
        await this.requireAccepted(
          await this.sendCommand({ type: "setYaw", headingDeg: yawToSubject }),
        );
        await this.requireAccepted(
          await this.sendCommand({
            type: "setGimbal",
            pitchDeg: checkpoint.cameraAngle,
          }),
        );
        await this.waitForCaptureOrientation(yawToSubject, checkpoint.cameraAngle);

        this.transition("CAPTURING", "Capturing image.", checkpoint.id);
        await this.requireAccepted(await this.sendCommand({ type: "capturePhoto", checkpointId: checkpoint.id }));

        this.snapshot.completedCheckpointIds = [
          ...this.snapshot.completedCheckpointIds,
          checkpoint.id,
        ];
        this.captureState();
        this.emit();
      }

      if (this.aborted) return this.getSnapshot();

      this.transition("RETURNING", "Returning aircraft to home.");
      await this.requireAccepted(await this.sendCommand({ type: "returnHome" }));

      this.transition("LANDING", "Landing aircraft.");
      await this.requireAccepted(await this.sendCommand({ type: "land" }));
      this.captureState();

      this.snapshot.currentCheckpointId = undefined;
      this.snapshot.checkpointIndex = this.mission.checkpoints.length;
      this.transition("COMPLETE", "Mission complete.");
      this.stopSafetySupervisor();
      return this.getSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown mission failure.";
      const phaseAtFailure = this.snapshot.phase;
      this.stopSafetySupervisor();
      if (this.aborted) {
        this.snapshot.error = undefined;
        if (this.snapshot.phase !== "ABORTED") this.transition("ABORTED", message);
        return this.getSnapshot();
      }

      if (
        ["TAKEOFF", "TRANSIT", "AIMING", "CAPTURING", "PAUSED", "RETURNING"].includes(
          phaseAtFailure,
        )
      ) {
        await this.attemptEmergencyRecovery(message);
        return this.getSnapshot();
      }

      this.snapshot.error = message;
      this.transition("FAILED", message);
      return this.getSnapshot();
    }
  }

  private async waitForCheckpointArrival(checkpoint: GeographicCheckpoint) {
    const positionToleranceFt = this.mission.positionToleranceFt ?? 5;
    const altitudeToleranceFt = this.mission.altitudeToleranceFt ?? 4;
    const timeoutMs = this.mission.arrivalTimeoutMs ?? 45_000;

    await this.waitForState(
      (state) => {
        const positionErrorFt = bearingAndDistanceBetween({
          fromLatitude: checkpoint.latitude,
          fromLongitude: checkpoint.longitude,
          toLatitude: state.latitude,
          toLongitude: state.longitude,
        }).distanceFt;
        const altitudeErrorFt = Math.abs(
          checkpoint.relativeAltitudeFt - state.relativeAltitudeFt,
        );
        return (
          positionErrorFt <= positionToleranceFt &&
          altitudeErrorFt <= altitudeToleranceFt
        );
      },
      timeoutMs,
      `Aircraft did not converge on checkpoint ${checkpoint.id} within ${timeoutMs} ms.`,
    );
  }

  private async waitForCaptureOrientation(
    targetHeadingDeg: number,
    targetGimbalPitchDeg: number,
  ) {
    const headingToleranceDeg = this.mission.headingToleranceDeg ?? 8;
    const gimbalToleranceDeg = this.mission.gimbalToleranceDeg ?? 5;
    const timeoutMs = Math.min(this.mission.arrivalTimeoutMs ?? 45_000, 20_000);

    await this.waitForState(
      (state) => {
        const headingError = Math.abs(
          ((state.headingDeg - targetHeadingDeg + 540) % 360) - 180,
        );
        const gimbalError = Math.abs(
          state.gimbalPitchDeg - targetGimbalPitchDeg,
        );
        return (
          headingError <= headingToleranceDeg &&
          gimbalError <= gimbalToleranceDeg
        );
      },
      timeoutMs,
      `Aircraft/camera did not settle within capture tolerances in ${timeoutMs} ms.`,
    );
  }

  private async waitForState(
    predicate: (state: UniversalAircraftState) => boolean,
    timeoutMs: number,
    timeoutMessage: string,
  ) {
    if (predicate(this.adapter.getState())) return;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup: {
        unsubscribe?: () => void;
        timer?: ReturnType<typeof setTimeout>;
        abortPoll?: ReturnType<typeof setInterval>;
      } = {};

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (cleanup.timer) clearTimeout(cleanup.timer);
        if (cleanup.abortPoll) clearInterval(cleanup.abortPoll);
        cleanup.unsubscribe?.();
        if (error) reject(error);
        else resolve();
      };

      cleanup.timer = setTimeout(
        () => finish(new Error(timeoutMessage)),
        timeoutMs,
      );
      cleanup.abortPoll = setInterval(() => {
        if (this.aborted) {
          finish(new Error("Mission interrupted while waiting for aircraft convergence."));
        }
      }, 50);

      cleanup.unsubscribe = this.adapter.subscribe((state) => {
        if (predicate(state)) finish();
      });
    });
  }

  private assertPreflightSafety() {
    const assessment = evaluateFlightSafety({
      state: this.adapter.getState(),
      phase: "preflight",
      policy: this.mission.safetyPolicy,
    });
    this.snapshot.safetyIssues = assessment.issues;
    if (!assessment.safeToLaunch) {
      throw new Error(
        assessment.issues.map((issue) => issue.message).join(" ") ||
          "Aircraft failed DOMINIC preflight safety checks.",
      );
    }
  }

  private startSafetySupervisor() {
    this.unsubscribeSafety?.();
    this.unsubscribeSafety = this.adapter.subscribe((state) => {
      if (
        ["IDLE", "CONNECTING", "PREFLIGHT", "COMPLETE", "ABORTED", "FAILED"].includes(
          this.snapshot.phase,
        )
      ) {
        return;
      }

      const assessment = evaluateFlightSafety({
        state,
        phase: "flight",
        policy: this.mission.safetyPolicy,
      });
      this.snapshot.safetyIssues = assessment.issues;
      this.captureState();
      this.emit();

      if (
        assessment.highestAction !== "continue" &&
        !this.safetyActionInFlight &&
        !this.aborted
      ) {
        this.safetyActionInFlight = true;
        void this.applySafetyAction(assessment.highestAction, assessment.issues)
          .finally(() => {
            this.safetyActionInFlight = false;
          });
      }
    });
  }

  private stopSafetySupervisor() {
    this.unsubscribeSafety?.();
    this.unsubscribeSafety = undefined;
  }

  private async applySafetyAction(
    action: "pause" | "return_home" | "abort",
    issues: FlightSafetyIssue[],
  ) {
    const reason =
      issues.find((issue) => issue.action === action)?.message ??
      issues[0]?.message ??
      "DOMINIC flight safety intervention.";

    if (action === "pause" && this.adapter.capabilities.pauseResume) {
      this.paused = true;
      await this.sendCommand({ type: "pause" }).catch(() => undefined);
      this.transition("PAUSED", `Safety hold: ${reason}`);
      return;
    }

    if (action === "return_home") {
      this.aborted = true;
      this.transition("ABORTED", `Safety return-home: ${reason}`);
      await this.sendCommand({ type: "returnHome" }, this.mission.emergencyCommandTimeoutMs ?? 3000).catch(() => undefined);
      return;
    }

    await this.abort(`Safety abort: ${reason}`);
  }

  private async attemptEmergencyRecovery(reason: string) {
    this.aborted = true;
    this.snapshot.error = reason;
    this.transition("ABORTED", `Emergency recovery: ${reason}`);

    const timeoutMs = this.mission.emergencyCommandTimeoutMs ?? 3000;
    try {
      const result = await this.sendCommand(
        { type: "abort", reason: `DOMINIC emergency recovery: ${reason}` },
        timeoutMs,
      );
      if (result.accepted) return;
    } catch {
      // Fall through to an explicit return-home attempt.
    }

    try {
      await this.sendCommand({ type: "returnHome" }, timeoutMs);
    } catch {
      // Mission remains ABORTED; aircraft/vendor failsafes are now authoritative.
    }
  }

  private async sendCommand(
    command: UniversalAircraftCommand,
    timeoutMs = this.mission.commandTimeoutMs ?? 8000,
  ): Promise<CommandResult> {
    return this.withTimeout(
      this.adapter.send(command),
      timeoutMs,
      `Aircraft command ${command.type} timed out after ${timeoutMs} ms.`,
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    const cleanup: { timer?: ReturnType<typeof setTimeout> } = {};
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          cleanup.timer = setTimeout(
            () => reject(new Error(message)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (cleanup.timer) clearTimeout(cleanup.timer);
    }
  }

  private assertCapabilities() {
    const missing = requiredCapabilities.filter(
      (capability) => !this.adapter.capabilities[capability],
    );
    if (missing.length) {
      throw new Error(
        `Connected aircraft is missing required autonomous capabilities: ${missing.join(", ")}.`,
      );
    }
  }

  private async requireAccepted(result: { accepted: boolean; message?: string }) {
    if (!result.accepted) {
      throw new Error(result.message ?? "Aircraft rejected mission command.");
    }
  }

  private async waitIfPaused() {
    while (this.paused && !this.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private captureState() {
    this.snapshot.lastAircraftState = this.adapter.getState();
  }

  private transition(phase: MissionPhase, message: string, checkpointId?: string) {
    this.snapshot.phase = phase;
    this.snapshot.events = [
      ...this.snapshot.events,
      { atMs: Date.now(), phase, message, checkpointId },
    ];
    this.captureState();
    this.emit();
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
