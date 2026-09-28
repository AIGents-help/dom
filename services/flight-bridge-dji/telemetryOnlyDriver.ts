import type { CameraPayloadProfile } from "../../lib/aircraft/payload";
import type {
  DjiSdkDriver,
  DjiSdkSnapshot,
} from "../../lib/aircraft/djiAdapter";
import type { UniversalMediaCapture } from "../../lib/aircraft/contract";

export interface DjiReadOnlyTelemetrySource {
  readonly payloads?: CameraPayloadProfile[];
  readonly activePayloadId?: string;
  readonly supportsRtk?: boolean;
  readonly supportsObstacleSensing?: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getSnapshot(): DjiSdkSnapshot;
  subscribe(listener: (snapshot: DjiSdkSnapshot) => void): () => void;
}

const READ_ONLY_MESSAGE =
  "DJI bridge is running in read-only telemetry mode; flight and payload commands are disabled.";

export class DjiTelemetryOnlyDriver implements DjiSdkDriver {
  readonly payloads?: CameraPayloadProfile[];
  readonly activePayloadId?: string;
  readonly capabilities;

  constructor(private readonly source: DjiReadOnlyTelemetrySource) {
    this.payloads = source.payloads?.map((payload) => ({ ...payload }));
    this.activePayloadId = source.activePayloadId;
    this.capabilities = {
      telemetry: true,
      arm: false,
      takeoff: false,
      goTo: false,
      velocityControl: false,
      yawControl: false,
      gimbalControl: false,
      photoCapture: false,
      videoCapture: false,
      pauseResume: false,
      returnHome: false,
      land: false,
      obstacleSensing: source.supportsObstacleSensing ?? false,
      rtk: source.supportsRtk ?? false,
    };
  }

  connect() {
    return this.source.connect();
  }

  disconnect() {
    return this.source.disconnect();
  }

  getSnapshot() {
    return { ...this.source.getSnapshot() };
  }

  subscribe(listener: (snapshot: DjiSdkSnapshot) => void) {
    return this.source.subscribe((snapshot) => listener({ ...snapshot }));
  }

  subscribeMedia(_listener: (capture: UniversalMediaCapture) => void) {
    return () => undefined;
  }

  async arm(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async takeoff(_altitudeFt: number): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async goTo(_input: { latitude: number; longitude: number; relativeAltitudeFt: number; speedFps?: number }): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }
  async setVelocity(_input: { northFps: number; eastFps: number; downFps: number }): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }
  async setYaw(_headingDeg: number): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async setGimbal(_input: { pitchDeg: number; yawDeg?: number }): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }
  async capturePhoto(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async startVideo(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async stopVideo(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async pause(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async resume(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async returnHome(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async land(): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
  async abort(_reason: string): Promise<void> { throw new Error(READ_ONLY_MESSAGE); }
}
