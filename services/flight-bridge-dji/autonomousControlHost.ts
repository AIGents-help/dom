import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { BridgeServerSessionOptions } from "../../lib/aircraft/bridgeServer";
import { createDjiFlightBridgeHost, type DjiFlightBridgeHost } from "./host";
import {
  DjiAutonomousControlDriver,
  type DjiAutonomousControlSource,
  type DjiAutonomyAuthorization,
} from "./autonomousControlDriver";

export function createDjiAutonomousControlFlightBridgeHost(
  source: DjiAutonomousControlSource,
  authorization: DjiAutonomyAuthorization,
  socket: BridgeTextSocket,
  options: BridgeServerSessionOptions,
): DjiFlightBridgeHost {
  const driver = new DjiAutonomousControlDriver(source, authorization);
  return createDjiFlightBridgeHost(driver, socket, options);
}
