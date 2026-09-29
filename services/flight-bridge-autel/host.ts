import type { BridgeTextSocket } from "../../lib/aircraft/bridgeWireHost";
import { FlightBridgeWireHost } from "../../lib/aircraft/bridgeWireHost";
import type { AutelSdkDriver } from "../../lib/aircraft/autelAdapter";
import type { BridgeServerSessionOptions } from "../../lib/aircraft/bridgeServer";
import { createAutelFlightBridgeSession } from "./session";

export type AutelFlightBridgeHost = {
  wireHost: FlightBridgeWireHost;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export function createAutelFlightBridgeHost(
  driver: AutelSdkDriver,
  socket: BridgeTextSocket,
  options: BridgeServerSessionOptions,
): AutelFlightBridgeHost {
  const { session } = createAutelFlightBridgeSession(driver, options);
  const wireHost = new FlightBridgeWireHost(session, socket);

  return {
    wireHost,
    start: () => wireHost.start(),
    stop: () => wireHost.stop(),
  };
}
