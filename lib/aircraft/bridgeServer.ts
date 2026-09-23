import type { DominicAircraftAdapter } from "@/lib/aircraft/contract";
import {
  DOMINIC_BRIDGE_PROTOCOL,
  type BridgeHello,
  type FlightBridgeMessage,
} from "@/lib/aircraft/bridgeProtocol";

export type BridgeServerSessionOptions = {
  bridgeId: string;
  adapterVersion: string;
  heartbeatIntervalMs?: number;
};

export class FlightBridgeServerSession {
  private listeners = new Set<(message: FlightBridgeMessage) => void>();
  private unsubscribeAircraft?: () => void;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private telemetrySequence = 0;
  private started = false;

  constructor(
    private readonly adapter: DominicAircraftAdapter,
    private readonly options: BridgeServerSessionOptions,
  ) {}

  subscribe(listener: (message: FlightBridgeMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start() {
    if (this.started) return;
    this.started = true;

    await this.adapter.connect();

    const state = this.adapter.getState();
    const hello: BridgeHello = {
      type: "hello",
      protocol: DOMINIC_BRIDGE_PROTOCOL,
      bridgeId: this.options.bridgeId,
      vendor: this.adapter.vendor,
      adapterVersion: this.options.adapterVersion,
      aircraftId: state.aircraftId,
      model: state.model,
      capabilities: { ...this.adapter.capabilities },
    };
    this.emit(hello);

    this.unsubscribeAircraft = this.adapter.subscribe((nextState) => {
      this.telemetrySequence += 1;
      this.emit({
        type: "telemetry",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        sequence: this.telemetrySequence,
        state: nextState,
      });
    });

    const heartbeatIntervalMs = this.options.heartbeatIntervalMs ?? 1000;
    this.heartbeatTimer = setInterval(() => {
      this.emit({
        type: "heartbeat",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        sentAtMs: Date.now(),
      });
    }, heartbeatIntervalMs);
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    this.unsubscribeAircraft?.();
    this.unsubscribeAircraft = undefined;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    await this.adapter.disconnect();
  }

  async receive(message: FlightBridgeMessage) {
    if (!this.started) {
      this.emit({
        type: "error",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        code: "bridge_not_started",
        message: "Flight Bridge session has not been started.",
      });
      return;
    }

    if (message.type !== "command") return;

    try {
      const result = await this.adapter.send(message.command);
      this.emit({
        type: "command_result",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        requestId: message.requestId,
        result,
      });
    } catch (error) {
      this.emit({
        type: "error",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        requestId: message.requestId,
        code: "adapter_command_error",
        message: error instanceof Error ? error.message : "Unknown aircraft adapter error.",
      });
    }
  }

  private emit(message: FlightBridgeMessage) {
    for (const listener of this.listeners) listener(message);
  }
}
