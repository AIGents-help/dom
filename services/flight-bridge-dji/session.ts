import {
  DjiAircraftAdapter,
  type DjiSdkDriver,
} from "../../lib/aircraft/djiAdapter";
import {
  FlightBridgeServerSession,
  type BridgeServerSessionOptions,
} from "../../lib/aircraft/bridgeServer";

export type DjiFlightBridgeSession = {
  adapter: DjiAircraftAdapter;
  session: FlightBridgeServerSession;
};

export function createDjiFlightBridgeSession(
  driver: DjiSdkDriver,
  options: BridgeServerSessionOptions,
): DjiFlightBridgeSession {
  const adapter = new DjiAircraftAdapter(driver);
  const session = new FlightBridgeServerSession(adapter, options);
  return { adapter, session };
}
