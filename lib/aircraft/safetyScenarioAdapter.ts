import type {
  CommandResult,
  DominicAircraftAdapter,
  UniversalAircraftCommand,
  UniversalAircraftState,
  UniversalMediaCapture,
} from "@/lib/aircraft/contract";

export type SafetyScenario =
  | "none"
  | "battery_rth_on_first_transit"
  | "obstacle_on_first_transit"
  | "telemetry_loss_on_first_transit"
  | "disconnect_on_first_transit"
  | "reject_first_capture";

export class SafetyScenarioAircraftAdapter implements DominicAircraftAdapter {
  readonly vendor;
  readonly capabilities;

  private listeners = new Set<(state: UniversalAircraftState) => void>();
  private mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();
  private unsubscribeState?: () => void;
  private unsubscribeMedia?: () => void;
  private lastState: UniversalAircraftState;
  private firstTransitSeen = false;
  private firstCaptureSeen = false;
  private telemetryFrozen = false;

  constructor(
    private readonly base: DominicAircraftAdapter,
    readonly scenario: SafetyScenario,
  ) {
    this.vendor = base.vendor;
    this.capabilities = { ...base.capabilities };
    this.lastState = { ...base.getState() };
  }

  async connect() {
    if (!this.base.getState().connected) await this.base.connect();
    this.lastState = { ...this.base.getState() };
    this.unsubscribeState = this.base.subscribe((state) => {
      if (this.telemetryFrozen) return;
      this.lastState = { ...state };
      this.emit();
    });
    this.unsubscribeMedia = this.base.subscribeMedia?.((capture) => {
      for (const listener of this.mediaListeners) listener({ ...capture });
    });
  }

  async disconnect() {
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.unsubscribeMedia?.();
    this.unsubscribeMedia = undefined;
    await this.base.disconnect();
    this.lastState = { ...this.base.getState(), connected: false };
    this.emit();
  }

  getState() {
    return { ...this.lastState };
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
    if (command.type === "capturePhoto" && this.scenario === "reject_first_capture") {
      if (!this.firstCaptureSeen) {
        this.firstCaptureSeen = true;
        return {
          accepted: false,
          command: command.type,
          message: "Safety Scenario Lab injected a camera command rejection.",
        };
      }
    }

    const result = await this.base.send(command);

    if (command.type === "goTo" && !this.firstTransitSeen) {
      this.firstTransitSeen = true;
      this.lastState = { ...this.base.getState() };

      if (this.scenario === "battery_rth_on_first_transit") {
        this.lastState = {
          ...this.lastState,
          batteryPercent: 15,
          timestampMs: Date.now(),
        };
        this.emit();
      } else if (this.scenario === "obstacle_on_first_transit") {
        this.lastState = {
          ...this.lastState,
          obstacleAlert: true,
          timestampMs: Date.now(),
        };
        this.emit();
      } else if (this.scenario === "disconnect_on_first_transit") {
        this.lastState = {
          ...this.lastState,
          connected: false,
          timestampMs: Date.now(),
        };
        this.emit();
      } else if (this.scenario === "telemetry_loss_on_first_transit") {
        this.lastState = {
          ...this.lastState,
          timestampMs: Date.now(),
        };
        this.telemetryFrozen = true;
        this.emit();
      }
    }

    if (!this.telemetryFrozen && command.type !== "goTo") {
      this.lastState = { ...this.base.getState() };
    }

    return result;
  }

  private emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}

export const safetyScenarioLabels: Record<SafetyScenario, string> = {
  none: "Nominal flight",
  battery_rth_on_first_transit: "Battery crosses RTH threshold",
  obstacle_on_first_transit: "Obstacle alert during transit",
  telemetry_loss_on_first_transit: "Telemetry feed goes silent",
  disconnect_on_first_transit: "Aircraft link disconnects",
  reject_first_capture: "Camera rejects first capture",
};
