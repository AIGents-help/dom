import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { BridgeServerSessionOptions } from "../../lib/aircraft/bridgeServer";
import { createDjiFlightBridgeHost, type DjiFlightBridgeHost } from "./host";
import {
  DjiTelemetryOnlyDriver,
  type DjiReadOnlyTelemetrySource,
} from "./telemetryOnlyDriver";

export function createDjiReadOnlyFlightBridgeHost(
  source: DjiReadOnlyTelemetrySource,
  socket: BridgeTextSocket,
  options: BridgeServerSessionOptions,
): DjiFlightBridgeHost {
  const driver = new DjiTelemetryOnlyDriver(source);
  return createDjiFlightBridgeHost(driver, socket, options);
}
