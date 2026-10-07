import { describe, expect, it } from "vitest";
import { DOMINIC_BRIDGE_PROTOCOL } from "@/lib/aircraft/bridgeProtocol";
import { LoopbackFlightBridgeTransport } from "@/lib/aircraft/bridgeTransport";
import { requestBridgeMissionValidation } from "@/lib/aircraft/missionValidationBridge";

describe("Flight Bridge mission validation", () => {
  it("returns the matching controller validation result", async () => {
    const transport = new LoopbackFlightBridgeTransport();
    await transport.connect();

    transport.subscribe((message) => {
      if (message.type !== "mission_validate") return;
      void transport.send({
        type: "mission_validation_result",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        requestId: message.requestId,
        valid: true,
        errors: [],
        raw: "[]",
      });
    });

    const result = await requestBridgeMissionValidation(
      transport,
      { schema: "dominic.dji-mission.v1", checkpoints: [{ id: "wp-1" }] },
      500,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("surfaces bridge validation errors for the same request", async () => {
    const transport = new LoopbackFlightBridgeTransport();
    await transport.connect();

    transport.subscribe((message) => {
      if (message.type !== "mission_validate") return;
      void transport.send({
        type: "mission_validation_result",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        requestId: message.requestId,
        valid: false,
        errors: ["FileParseError"],
        raw: "[-2]",
      });
    });

    const result = await requestBridgeMissionValidation(transport, { schema: "bad" }, 500);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("FileParseError");
  });
});
