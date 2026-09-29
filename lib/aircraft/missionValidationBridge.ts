import {
  DOMINIC_BRIDGE_PROTOCOL,
  type BridgeMissionValidationResult,
} from "@/lib/aircraft/bridgeProtocol";
import type { FlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";

export async function requestBridgeMissionValidation(
  transport: FlightBridgeTransport,
  mission: unknown,
  timeoutMs = 10000,
): Promise<BridgeMissionValidationResult> {
  if (!transport.connected) {
    throw new Error("Flight Bridge is not connected.");
  }

  const requestId = `mission-validation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise<BridgeMissionValidationResult>((resolve, reject) => {
    let settled = false;
    const unsubscribe = transport.subscribe((message) => {
      if (settled) return;

      if (
        message.type === "mission_validation_result" &&
        message.requestId === requestId
      ) {
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(message);
        return;
      }

      if (
        message.type === "error" &&
        message.requestId === requestId
      ) {
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        reject(new Error(message.message));
      }
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new Error(`DJI mission validation timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    void transport
      .send({
        type: "mission_validate",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        requestId,
        mission,
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      });
  });
}
