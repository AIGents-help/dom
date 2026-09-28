import type { DjiSdkSnapshot } from "../../lib/aircraft/djiAdapter";
import {
  DjiRecoveryControlDriver,
  type DjiRecoveryControlSource,
} from "./recoveryControlDriver";

export type DjiAutonomyAuthorization = {
  aircraftId: string;
  controlledFieldValidated: boolean;
  operatorConfirmed: boolean;
  authorizedAtMs: number;
  expiresAtMs: number;
};

export interface DjiAutonomousControlSource extends DjiRecoveryControlSource {
  readonly supportsArm?: boolean;
  readonly supportsTakeoff?: boolean;
  readonly supportsGoTo?: boolean;
  readonly supportsVelocityControl?: boolean;
  readonly supportsYawControl?: boolean;

  arm(): Promise<void>;
  takeoff(altitudeFt: number): Promise<void>;
  goTo(input: {
    latitude: number;
    longitude: number;
    relativeAltitudeFt: number;
    speedFps?: number;
  }): Promise<void>;
  setVelocity(input: {
    northFps: number;
    eastFps: number;
    downFps: number;
  }): Promise<void>;
  setYaw(headingDeg: number): Promise<void>;
}

function authorizationValid(
  snapshot: DjiSdkSnapshot,
  authorization: DjiAutonomyAuthorization,
  nowMs = Date.now(),
) {
  return (
    authorization.controlledFieldValidated === true &&
    authorization.operatorConfirmed === true &&
    authorization.aircraftId === snapshot.aircraftId &&
    authorization.authorizedAtMs <= nowMs &&
    authorization.expiresAtMs > nowMs
  );
}

export class DjiAutonomousControlDriver extends DjiRecoveryControlDriver {
  constructor(
    private readonly autonomousSource: DjiAutonomousControlSource,
    private readonly authorization: DjiAutonomyAuthorization,
  ) {
    super(autonomousSource);
    const unlocked = authorizationValid(
      autonomousSource.getSnapshot(),
      authorization,
    );
    Object.assign(this.capabilities, {
      arm: unlocked && (autonomousSource.supportsArm ?? false),
      takeoff: unlocked && (autonomousSource.supportsTakeoff ?? false),
      goTo: unlocked && (autonomousSource.supportsGoTo ?? false),
      velocityControl:
        unlocked && (autonomousSource.supportsVelocityControl ?? false),
      yawControl: unlocked && (autonomousSource.supportsYawControl ?? false),
    });
  }

  private assertAuthorization() {
    const snapshot = this.autonomousSource.getSnapshot();
    if (!authorizationValid(snapshot, this.authorization)) {
      throw new Error(
        "DJI autonomous movement authorization is missing, expired, belongs to another aircraft, or lacks controlled-field/operator confirmation.",
      );
    }
  }

  async arm() {
    this.assertAuthorization();
    if (!this.capabilities.arm) {
      throw new Error("DJI autonomy source does not advertise arm.");
    }
    await this.autonomousSource.arm();
  }

  async takeoff(altitudeFt: number) {
    this.assertAuthorization();
    if (!this.capabilities.takeoff) {
      throw new Error("DJI autonomy source does not advertise takeoff.");
    }
    await this.autonomousSource.takeoff(altitudeFt);
  }

  async goTo(input: {
    latitude: number;
    longitude: number;
    relativeAltitudeFt: number;
    speedFps?: number;
  }) {
    this.assertAuthorization();
    if (!this.capabilities.goTo) {
      throw new Error("DJI autonomy source does not advertise go-to.");
    }
    await this.autonomousSource.goTo(input);
  }

  async setVelocity(input: {
    northFps: number;
    eastFps: number;
    downFps: number;
  }) {
    this.assertAuthorization();
    if (!this.capabilities.velocityControl) {
      throw new Error("DJI autonomy source does not advertise velocity control.");
    }
    await this.autonomousSource.setVelocity(input);
  }

  async setYaw(headingDeg: number) {
    this.assertAuthorization();
    if (!this.capabilities.yawControl) {
      throw new Error("DJI autonomy source does not advertise aircraft yaw control.");
    }
    await this.autonomousSource.setYaw(headingDeg);
  }
}
