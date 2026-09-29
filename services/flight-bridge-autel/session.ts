import {
  AutelAircraftAdapter,
  type AutelSdkDriver,
} from "../../lib/aircraft/autelAdapter";
import {
  FlightBridgeServerSession,
  type BridgeServerSessionOptions,
} from "../../lib/aircraft/bridgeServer";

export type AutelFlightBridgeSession = {
  adapter: AutelAircraftAdapter;
  session: FlightBridgeServerSession;
};

export function createAutelFlightBridgeSession(
  driver: AutelSdkDriver,
  options: BridgeServerSessionOptions,
): AutelFlightBridgeSession {
  const adapter = new AutelAircraftAdapter(driver);
  const session = new FlightBridgeServerSession(adapter, options);
  return { adapter, session };
}
