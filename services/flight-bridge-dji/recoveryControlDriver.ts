import {
  DjiPayloadControlDriver,
  type DjiPayloadControlSource,
} from "./payloadControlDriver";

export interface DjiRecoveryControlSource extends DjiPayloadControlSource {
  readonly supportsPauseResume?: boolean;
  readonly supportsReturnHome?: boolean;
  readonly supportsLand?: boolean;
  readonly supportsAbort?: boolean;

  pause(): Promise<void>;
  resume(): Promise<void>;
  returnHome(): Promise<void>;
  land(): Promise<void>;
  abort(reason: string): Promise<void>;
}

export class DjiRecoveryControlDriver extends DjiPayloadControlDriver {
  constructor(private readonly recoverySource: DjiRecoveryControlSource) {
    super(recoverySource);
    Object.assign(this.capabilities, {
      pauseResume: recoverySource.supportsPauseResume ?? false,
      returnHome: recoverySource.supportsReturnHome ?? false,
      land: recoverySource.supportsLand ?? false,
    });
  }

  async pause() {
    if (!this.capabilities.pauseResume) {
      throw new Error("DJI recovery source does not advertise pause/resume.");
    }
    await this.recoverySource.pause();
  }

  async resume() {
    if (!this.capabilities.pauseResume) {
      throw new Error("DJI recovery source does not advertise pause/resume.");
    }
    await this.recoverySource.resume();
  }

  async returnHome() {
    if (!this.capabilities.returnHome) {
      throw new Error("DJI recovery source does not advertise return-home.");
    }
    await this.recoverySource.returnHome();
  }

  async land() {
    if (!this.capabilities.land) {
      throw new Error("DJI recovery source does not advertise landing.");
    }
    await this.recoverySource.land();
  }

  async abort(reason: string) {
    if (!(this.recoverySource.supportsAbort ?? false)) {
      throw new Error("DJI recovery source does not advertise emergency abort.");
    }
    await this.recoverySource.abort(reason);
  }
}
