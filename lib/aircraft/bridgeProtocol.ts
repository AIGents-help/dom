import type {
  AircraftCapabilities,
  AircraftVendor,
  CommandResult,
  UniversalAircraftCommand,
  UniversalAircraftState,
} from "@/lib/aircraft/contract";

export const DOMINIC_BRIDGE_PROTOCOL = "dominic.flight-bridge.v1" as const;

export type BridgeHello = {
  type: "hello";
  protocol: typeof DOMINIC_BRIDGE_PROTOCOL;
  bridgeId: string;
  vendor: AircraftVendor;
  adapterVersion: string;
  aircraftId: string;
  model?: string;
  capabilities: AircraftCapabilities;
};

export type BridgeTelemetry = {
  type: "telemetry";
  protocol: typeof DOMINIC_BRIDGE_PROTOCOL;
  sequence: number;
  state: UniversalAircraftState;
};

export type BridgeCommand = {
  type: "command";
  protocol: typeof DOMINIC_BRIDGE_PROTOCOL;
  requestId: string;
  command: UniversalAircraftCommand;
};

export type BridgeCommandResult = {
  type: "command_result";
  protocol: typeof DOMINIC_BRIDGE_PROTOCOL;
  requestId: string;
  result: CommandResult;
};

export type BridgeHeartbeat = {
  type: "heartbeat";
  protocol: typeof DOMINIC_BRIDGE_PROTOCOL;
  sentAtMs: number;
};

export type BridgeError = {
  type: "error";
  protocol: typeof DOMINIC_BRIDGE_PROTOCOL;
  code: string;
  message: string;
  requestId?: string;
};

export type FlightBridgeMessage =
  | BridgeHello
  | BridgeTelemetry
  | BridgeCommand
  | BridgeCommandResult
  | BridgeHeartbeat
  | BridgeError;

export function isFlightBridgeMessage(value: unknown): value is FlightBridgeMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FlightBridgeMessage> & { protocol?: string; type?: string };
  if (candidate.protocol !== DOMINIC_BRIDGE_PROTOCOL) return false;
  return ["hello", "telemetry", "command", "command_result", "heartbeat", "error"].includes(
    String(candidate.type),
  );
}

export function parseFlightBridgeMessage(raw: string): FlightBridgeMessage {
  const parsed: unknown = JSON.parse(raw);
  if (!isFlightBridgeMessage(parsed)) {
    throw new Error("Invalid or unsupported DOMINIC Flight Bridge message.");
  }
  return parsed;
}
