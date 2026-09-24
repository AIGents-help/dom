import type { GeographicCheckpoint } from "@/lib/capturePlanner";
import { bearingAndDistanceBetween } from "@/lib/capturePlanner";
import type {
  DominicAircraftAdapter,
  UniversalAircraftState,
} from "@/lib/aircraft/contract";

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
};

export type AutonomousMissionInput = {
  centerLatitude: number;
  centerLongitude: number;
  checkpoints: GeographicCheckpoint[];
  takeoffAltitudeFt?: number;
  transitSpeedFps?: number;
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
    this.paused = true;
    await this.adapter.send({ type: "pause" });
    this.transition("PAUSED", "Mission paused by operator.");
  }

  async resume() {
    if (!this.paused) return;
    this.paused = false;
    await this.adapter.send({ type: "resume" });
    this.transition("TRANSIT", "Mission resumed by operator.");
  }

  async abort(reason = "Operator abort") {
    if (this.aborted) return;
    this.aborted = true;
    this.transition("ABORTED", reason);
    await this.adapter.send({ type: "abort", reason });
  }

  async execute() {
    try {
      this.transition("CONNECTING", "Connecting to aircraft.");
      await this.adapter.connect();
      this.captureState();

      this.transition("PREFLIGHT", "Checking aircraft capabilities.");
      this.assertCapabilities();

      if (!this.mission.checkpoints.length) {
        throw new Error("Mission contains no checkpoints.");
      }

      this.transition("ARMING", "Arming aircraft.");
      await this.requireAccepted(await this.adapter.send({ type: "arm" }));

      const first = this.mission.checkpoints[0];
      const takeoffAltitudeFt =
        this.mission.takeoffAltitudeFt ??
        Math.max(10, Math.min(first.relativeAltitudeFt, 40));

      this.transition("TAKEOFF", `Taking off to ${takeoffAltitudeFt.toFixed(1)} ft.`);
      await this.requireAccepted(
        await this.adapter.send({ type: "takeoff", altitudeFt: takeoffAltitudeFt }),
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
          await this.adapter.send({
            type: "goTo",
            latitude: checkpoint.latitude,
            longitude: checkpoint.longitude,
            relativeAltitudeFt: checkpoint.relativeAltitudeFt,
            speedFps: this.mission.transitSpeedFps,
          }),
        );

        const yawToSubject = bearingAndDistanceBetween({
          fromLatitude: checkpoint.latitude,
          fromLongitude: checkpoint.longitude,
          toLatitude: this.mission.centerLatitude,
          toLongitude: this.mission.centerLongitude,
        }).bearingDeg;

        this.transition("AIMING", "Aiming aircraft and camera.", checkpoint.id);
        await this.requireAccepted(
          await this.adapter.send({ type: "setYaw", headingDeg: yawToSubject }),
        );
        await this.requireAccepted(
          await this.adapter.send({
            type: "setGimbal",
            pitchDeg: checkpoint.cameraAngle,
          }),
        );

        this.transition("CAPTURING", "Capturing image.", checkpoint.id);
        await this.requireAccepted(await this.adapter.send({ type: "capturePhoto", checkpointId: checkpoint.id }));

        this.snapshot.completedCheckpointIds = [
          ...this.snapshot.completedCheckpointIds,
          checkpoint.id,
        ];
        this.captureState();
        this.emit();
      }

      if (this.aborted) return this.getSnapshot();

      this.transition("RETURNING", "Returning aircraft to home.");
      await this.requireAccepted(await this.adapter.send({ type: "returnHome" }));

      this.transition("LANDING", "Landing aircraft.");
      await this.requireAccepted(await this.adapter.send({ type: "land" }));
      this.captureState();

      this.snapshot.currentCheckpointId = undefined;
      this.snapshot.checkpointIndex = this.mission.checkpoints.length;
      this.transition("COMPLETE", "Mission complete.");
      return this.getSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown mission failure.";
      if (this.aborted) {
        this.snapshot.error = undefined;
        if (this.snapshot.phase !== "ABORTED") this.transition("ABORTED", message);
        return this.getSnapshot();
      }
      this.snapshot.error = message;
      this.transition("FAILED", message);
      return this.getSnapshot();
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
