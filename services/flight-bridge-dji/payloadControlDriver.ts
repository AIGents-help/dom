import type { UniversalMediaCapture } from "../../lib/aircraft/contract";
import type {
  DjiSdkDriver,
  DjiSdkSnapshot,
} from "../../lib/aircraft/djiAdapter";
import type { CameraPayloadProfile } from "../../lib/aircraft/payload";

export interface DjiPayloadControlSource {
  readonly payloads?: CameraPayloadProfile[];
  readonly activePayloadId?: string;
  readonly supportsRtk?: boolean;
  readonly supportsObstacleSensing?: boolean;
  readonly supportsGimbalControl?: boolean;
  readonly supportsPhotoCapture?: boolean;
  readonly supportsVideoCapture?: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getSnapshot(): DjiSdkSnapshot;
  subscribe(listener: (snapshot: DjiSdkSnapshot) => void): () => void;
  subscribeMedia?(listener: (capture: UniversalMediaCapture) => void): () => void;

  setGimbal(input: { pitchDeg: number; yawDeg?: number }): Promise<void>;
  capturePhoto(): Promise<void>;
  startVideo(): Promise<void>;
  stopVideo(): Promise<void>;
}

const MOVEMENT_DISABLED_MESSAGE =
  "DJI bridge is running in payload-control validation mode; aircraft movement commands are disabled.";

export class DjiPayloadControlDriver implements DjiSdkDriver {
  readonly payloads?: CameraPayloadProfile[];
  readonly activePayloadId?: string;
  readonly capabilities;

  constructor(private readonly source: DjiPayloadControlSource) {
    this.payloads = source.payloads?.map((payload) => ({ ...payload }));
    this.activePayloadId = source.activePayloadId;
    this.capabilities = {
      telemetry: true,
      arm: false,
      takeoff: false,
      goTo: false,
      velocityControl: false,
      yawControl: false,
      gimbalControl: source.supportsGimbalControl ?? false,
      photoCapture: source.supportsPhotoCapture ?? false,
      videoCapture: source.supportsVideoCapture ?? false,
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

  subscribeMedia(listener: (capture: UniversalMediaCapture) => void) {
    if (!this.source.subscribeMedia) return () => undefined;
    return this.source.subscribeMedia((capture) => listener({ ...capture }));
  }

  async setGimbal(input: { pitchDeg: number; yawDeg?: number }) {
    if (!this.capabilities.gimbalControl) {
      throw new Error("DJI payload source does not advertise gimbal control.");
    }
    await this.source.setGimbal(input);
  }

  async capturePhoto() {
    if (!this.capabilities.photoCapture) {
      throw new Error("DJI payload source does not advertise photo capture.");
    }
    await this.source.capturePhoto();
  }

  async startVideo() {
    if (!this.capabilities.videoCapture) {
      throw new Error("DJI payload source does not advertise video capture.");
    }
    await this.source.startVideo();
  }

  async stopVideo() {
    if (!this.capabilities.videoCapture) {
      throw new Error("DJI payload source does not advertise video capture.");
    }
    await this.source.stopVideo();
  }

  async arm(): Promise<void> { throw new Error(MOVEMENT_DISABLED_MESSAGE); }
  async takeoff(altitudeFt: number): Promise<void> {
    void altitudeFt;
    throw new Error(MOVEMENT_DISABLED_MESSAGE);
  }
  async goTo(input: {
    latitude: number;
    longitude: number;
    relativeAltitudeFt: number;
    speedFps?: number;
  }): Promise<void> {
    void input;
    throw new Error(MOVEMENT_DISABLED_MESSAGE);
  }
  async setVelocity(input: {
    northFps: number;
    eastFps: number;
    downFps: number;
  }): Promise<void> {
    void input;
    throw new Error(MOVEMENT_DISABLED_MESSAGE);
  }
  async setYaw(headingDeg: number): Promise<void> {
    void headingDeg;
    throw new Error(MOVEMENT_DISABLED_MESSAGE);
  }
  async pause(): Promise<void> { throw new Error(MOVEMENT_DISABLED_MESSAGE); }
  async resume(): Promise<void> { throw new Error(MOVEMENT_DISABLED_MESSAGE); }
  async returnHome(): Promise<void> { throw new Error(MOVEMENT_DISABLED_MESSAGE); }
  async land(): Promise<void> { throw new Error(MOVEMENT_DISABLED_MESSAGE); }
  async abort(reason: string): Promise<void> {
    void reason;
    throw new Error(MOVEMENT_DISABLED_MESSAGE);
  }
}
