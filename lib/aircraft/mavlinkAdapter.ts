import type {
  AircraftCapabilities,
  CommandResult,
  DominicAircraftAdapter,
  UniversalAircraftCommand,
  UniversalAircraftState,
  UniversalMediaCapture,
} from "@/lib/aircraft/contract";

export type MavlinkVehicleSnapshot = {
  vehicleId: string;
  model?: string;
  connected: boolean;
  latitude: number;
  longitude: number;
  relativeAltitudeFt: number;
  headingDeg: number;
  groundSpeedFps?: number;
  verticalSpeedFps?: number;
  batteryPercent?: number;
  satellites?: number;
  gnssQuality?: "unknown" | "poor" | "fair" | "good" | "excellent";
  rtkState?: "unsupported" | "off" | "float" | "fixed";
  gimbalPitchDeg?: number;
  gimbalYawDeg?: number;
  cameraMode?: "unknown" | "photo" | "video";
  obstacleAlert?: boolean;
  flightMode?: string;
  homeLatitude?: number;
  homeLongitude?: number;
  failsafe?: string | null;
  timestampMs: number;
};

export type MavlinkDriverCapabilities = {
  telemetry: boolean;
  arm: boolean;
  takeoff: boolean;
  gotoGlobal: boolean;
  velocitySetpoint: boolean;
  yawSetpoint: boolean;
  gimbalPitchYaw: boolean;
  imageCapture: boolean;
  videoCapture: boolean;
  pauseResume: boolean;
  returnToLaunch: boolean;
  land: boolean;
  obstacleTelemetry: boolean;
  rtkTelemetry: boolean;
};

export interface MavlinkDriver {
  readonly capabilities: MavlinkDriverCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getSnapshot(): MavlinkVehicleSnapshot;
  subscribe(listener: (snapshot: MavlinkVehicleSnapshot) => void): () => void;
  subscribeMedia?(listener: (capture: UniversalMediaCapture) => void): () => void;

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
  setGimbal(input: { pitchDeg: number; yawDeg?: number }): Promise<void>;
  capturePhoto(): Promise<void>;
  startVideo(): Promise<void>;
  stopVideo(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  returnToLaunch(): Promise<void>;
  land(): Promise<void>;
  abort(reason: string): Promise<void>;
}

export function mapMavlinkCapabilities(
  capabilities: MavlinkDriverCapabilities,
): AircraftCapabilities {
  return {
    telemetry: capabilities.telemetry,
    arm: capabilities.arm,
    takeoff: capabilities.takeoff,
    goTo: capabilities.gotoGlobal,
    velocityControl: capabilities.velocitySetpoint,
    yawControl: capabilities.yawSetpoint,
    gimbalControl: capabilities.gimbalPitchYaw,
    photoCapture: capabilities.imageCapture,
    videoCapture: capabilities.videoCapture,
    pauseResume: capabilities.pauseResume,
    returnHome: capabilities.returnToLaunch,
    land: capabilities.land,
    obstacleSensing: capabilities.obstacleTelemetry,
    rtk: capabilities.rtkTelemetry,
  };
}

export function mapMavlinkSnapshot(
  snapshot: MavlinkVehicleSnapshot,
): UniversalAircraftState {
  return {
    aircraftId: snapshot.vehicleId,
    vendor: "mavlink",
    model: snapshot.model,
    connected: snapshot.connected,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    relativeAltitudeFt: snapshot.relativeAltitudeFt,
    headingDeg: snapshot.headingDeg,
    groundSpeedFps: snapshot.groundSpeedFps,
    verticalSpeedFps: snapshot.verticalSpeedFps,
    batteryPercent: snapshot.batteryPercent,
    satellites: snapshot.satellites,
    gnssQuality: snapshot.gnssQuality,
    rtkState: snapshot.rtkState,
    gimbalPitchDeg: snapshot.gimbalPitchDeg ?? 0,
    gimbalYawDeg: snapshot.gimbalYawDeg,
    cameraMode: snapshot.cameraMode,
    obstacleAlert: snapshot.obstacleAlert,
    flightMode: snapshot.flightMode,
    homeLatitude: snapshot.homeLatitude,
    homeLongitude: snapshot.homeLongitude,
    failsafe: snapshot.failsafe,
    timestampMs: snapshot.timestampMs,
  };
}

export class MavlinkAircraftAdapter implements DominicAircraftAdapter {
  readonly vendor = "mavlink" as const;
  readonly capabilities: AircraftCapabilities;
  private state: UniversalAircraftState;
  private listeners = new Set<(state: UniversalAircraftState) => void>();
  private mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();
  private unsubscribeDriver?: () => void;
  private unsubscribeMediaDriver?: () => void;

  constructor(private readonly driver: MavlinkDriver) {
    this.capabilities = mapMavlinkCapabilities(driver.capabilities);
    this.state = mapMavlinkSnapshot(driver.getSnapshot());
  }

  async connect() {
    await this.driver.connect();
    this.unsubscribeDriver = this.driver.subscribe((snapshot) => {
      this.state = mapMavlinkSnapshot(snapshot);
      this.emit();
    });
    this.unsubscribeMediaDriver = this.driver.subscribeMedia?.((capture) => {
      this.emitMedia(capture);
    });
    this.state = mapMavlinkSnapshot(this.driver.getSnapshot());
    this.emit();
  }

  async disconnect() {
    this.unsubscribeDriver?.();
    this.unsubscribeDriver = undefined;
    this.unsubscribeMediaDriver?.();
    this.unsubscribeMediaDriver = undefined;
    await this.driver.disconnect();
    this.state = mapMavlinkSnapshot(this.driver.getSnapshot());
    this.emit();
  }

  getState() {
    return { ...this.state };
  }

  subscribe(listener: (state: UniversalAircraftState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  subscribeMedia(listener: (capture: UniversalMediaCapture) => void) {
    this.mediaListeners.add(listener);
    return () => this.mediaListeners.delete(listener);
  }

  async send(command: UniversalAircraftCommand): Promise<CommandResult> {
    if (!this.supports(command)) {
      return {
        accepted: false,
        command: command.type,
        message: `MAVLink vehicle/driver does not support ${command.type}.`,
      };
    }

    try {
      switch (command.type) {
        case "arm":
          await this.driver.arm();
          break;
        case "takeoff":
          await this.driver.takeoff(command.altitudeFt);
          break;
        case "goTo":
          await this.driver.goTo(command);
          break;
        case "setVelocity":
          await this.driver.setVelocity(command);
          break;
        case "setYaw":
          await this.driver.setYaw(command.headingDeg);
          break;
        case "setGimbal":
          await this.driver.setGimbal(command);
          break;
        case "capturePhoto":
          await this.driver.capturePhoto();
          break;
        case "startVideo":
          await this.driver.startVideo();
          break;
        case "stopVideo":
          await this.driver.stopVideo();
          break;
        case "pause":
          await this.driver.pause();
          break;
        case "resume":
          await this.driver.resume();
          break;
        case "returnHome":
          await this.driver.returnToLaunch();
          break;
        case "land":
          await this.driver.land();
          break;
        case "abort":
          await this.driver.abort(command.reason);
          break;
      }

      return { accepted: true, command: command.type };
    } catch (error) {
      return {
        accepted: false,
        command: command.type,
        message:
          error instanceof Error ? error.message : "Unknown MAVLink driver error.",
      };
    }
  }

  private supports(command: UniversalAircraftCommand) {
    const c = this.capabilities;
    switch (command.type) {
      case "arm": return c.arm;
      case "takeoff": return c.takeoff;
      case "goTo": return c.goTo;
      case "setVelocity": return c.velocityControl;
      case "setYaw": return c.yawControl;
      case "setGimbal": return c.gimbalControl;
      case "capturePhoto": return c.photoCapture;
      case "startVideo":
      case "stopVideo": return c.videoCapture;
      case "pause":
      case "resume": return c.pauseResume;
      case "returnHome": return c.returnHome;
      case "land": return c.land;
      case "abort": return true;
    }
  }

  private emit() {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  private emitMedia(capture: UniversalMediaCapture) {
    for (const listener of this.mediaListeners) listener({ ...capture });
  }
}
