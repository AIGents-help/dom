import type {
  AircraftCapabilities,
  AircraftVendor,
  CommandResult,
  DominicAircraftAdapter,
  UniversalAircraftCommand,
  UniversalAircraftState,
  UniversalMediaCapture,
} from "@/lib/aircraft/contract";
import {
  DOMINIC_BRIDGE_PROTOCOL,
  type BridgeHello,
  type FlightBridgeMessage,
} from "@/lib/aircraft/bridgeProtocol";
import type { FlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";

type PendingCommand = {
  resolve: (result: CommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class FlightBridgeAircraftAdapter implements DominicAircraftAdapter {
  readonly vendor: AircraftVendor;
  readonly capabilities: AircraftCapabilities;
  private state: UniversalAircraftState;
  private listeners = new Set<(state: UniversalAircraftState) => void>();
  private mediaListeners = new Set<(capture: UniversalMediaCapture) => void>();
  private pending = new Map<string, PendingCommand>();
  private unsubscribeTransport?: () => void;
  private requestSequence = 0;

  constructor(
    private readonly transport: FlightBridgeTransport,
    hello: BridgeHello,
    private readonly commandTimeoutMs = 5000,
  ) {
    this.vendor = hello.vendor;
    this.capabilities = { ...hello.capabilities };
    this.state = {
      aircraftId: hello.aircraftId,
      vendor: hello.vendor,
      model: hello.model,
      connected: false,
      latitude: 0,
      longitude: 0,
      relativeAltitudeFt: 0,
      headingDeg: 0,
      gimbalPitchDeg: 0,
      timestampMs: 0,
    };
  }

  async connect() {
    await this.transport.connect();
    this.unsubscribeTransport = this.transport.subscribe((message) => this.handleMessage(message));
    this.updateState({ connected: true });
  }

  subscribeMedia(listener: (capture: UniversalMediaCapture) => void) {
    this.mediaListeners.add(listener);
    return () => this.mediaListeners.delete(listener);
  }

  async disconnect() {
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = undefined;
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({
        accepted: false,
        command: "abort",
        message: `Flight Bridge disconnected before request ${requestId} completed.`,
      });
    }
    this.pending.clear();
    await this.transport.disconnect();
    this.updateState({ connected: false });
  }

  getState() {
    return { ...this.state };
  }

  subscribe(listener: (state: UniversalAircraftState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  async send(command: UniversalAircraftCommand): Promise<CommandResult> {
    if (!this.transport.connected) {
      return { accepted: false, command: command.type, message: "Flight Bridge is disconnected." };
    }
    this.requestSequence += 1;
    const requestId = `dom-${this.requestSequence}`;

    const resultPromise = new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({
          accepted: false,
          command: command.type,
          message: `Flight Bridge command timed out after ${this.commandTimeoutMs} ms.`,
        });
      }, this.commandTimeoutMs);
      this.pending.set(requestId, { resolve, timer });
    });

    await this.transport.send({
      type: "command",
      protocol: DOMINIC_BRIDGE_PROTOCOL,
      requestId,
      command,
    });

    return resultPromise;
  }

  private handleMessage(message: FlightBridgeMessage) {
    if (message.type === "telemetry") {
      this.state = { ...message.state, connected: true };
      this.emit();
      return;
    }
    if (message.type === "media_capture") {
      for (const listener of this.mediaListeners) listener({ ...message.capture });
      return;
    }
    if (message.type === "command_result") {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      pending.resolve(message.result);
      return;
    }
    if (message.type === "error" && message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      pending.resolve({ accepted: false, command: "abort", message: message.message });
    }
  }

  private updateState(patch: Partial<UniversalAircraftState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}
