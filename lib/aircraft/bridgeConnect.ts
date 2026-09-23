import { FlightBridgeAircraftAdapter } from "@/lib/aircraft/bridgeAdapter";
import type { BridgeHello } from "@/lib/aircraft/bridgeProtocol";
import type { FlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";

export async function waitForBridgeHello(
  transport: FlightBridgeTransport,
  timeoutMs = 5000,
): Promise<BridgeHello> {
  return new Promise<BridgeHello>((resolve, reject) => {
    let settled = false;
    const unsubscribe = transport.subscribe((message) => {
      if (settled || message.type !== "hello") return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(message);
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new Error(`DOMINIC Flight Bridge did not send hello within ${timeoutMs} ms.`));
    }, timeoutMs);
  });
}

export async function connectFlightBridgeAdapter(
  transport: FlightBridgeTransport,
  helloTimeoutMs = 5000,
) {
  const helloPromise = waitForBridgeHello(transport, helloTimeoutMs);
  await transport.connect();
  const hello = await helloPromise;
  const adapter = new FlightBridgeAircraftAdapter(transport, hello);
  await adapter.connect();
  return { adapter, hello };
}
