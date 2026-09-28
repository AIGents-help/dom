import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import { FlightBridgeWireHost } from "../../lib/aircraft/bridgeWireHost";
import type { DjiSdkDriver } from "../../lib/aircraft/djiAdapter";
import type { BridgeServerSessionOptions } from "../../lib/aircraft/bridgeServer";
import { createDjiFlightBridgeSession } from "./session";

export type DjiFlightBridgeHost = {
  wireHost: FlightBridgeWireHost;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export function createDjiFlightBridgeHost(
  driver: DjiSdkDriver,
  socket: BridgeTextSocket,
  options: BridgeServerSessionOptions,
): DjiFlightBridgeHost {
  const { session } = createDjiFlightBridgeSession(driver, options);
  const wireHost = new FlightBridgeWireHost(session, socket);

  return {
    wireHost,
    start: () => wireHost.start(),
    stop: () => wireHost.stop(),
  };
}
