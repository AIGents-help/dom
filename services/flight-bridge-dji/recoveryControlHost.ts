import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import type { BridgeServerSessionOptions } from "../../lib/aircraft/bridgeServer";
import { createDjiFlightBridgeHost, type DjiFlightBridgeHost } from "./host";
import {
  DjiRecoveryControlDriver,
  type DjiRecoveryControlSource,
} from "./recoveryControlDriver";

export function createDjiRecoveryControlFlightBridgeHost(
  source: DjiRecoveryControlSource,
  socket: BridgeTextSocket,
  options: BridgeServerSessionOptions,
): DjiFlightBridgeHost {
  const driver = new DjiRecoveryControlDriver(source);
  return createDjiFlightBridgeHost(driver, socket, options);
}
