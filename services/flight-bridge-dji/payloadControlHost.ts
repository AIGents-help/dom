import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { BridgeServerSessionOptions } from "../../lib/aircraft/bridgeServer";
import { createDjiFlightBridgeHost, type DjiFlightBridgeHost } from "./host";
import {
  DjiPayloadControlDriver,
  type DjiPayloadControlSource,
} from "./payloadControlDriver";

export function createDjiPayloadControlFlightBridgeHost(
  source: DjiPayloadControlSource,
  socket: BridgeTextSocket,
  options: BridgeServerSessionOptions,
): DjiFlightBridgeHost {
  const driver = new DjiPayloadControlDriver(source);
  return createDjiFlightBridgeHost(driver, socket, options);
}
