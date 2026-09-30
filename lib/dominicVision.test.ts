import { describe, expect, it } from "vitest";
import {
  buildDominicVisionPrompt,
  DOMINIC_VISION_SCHEMA,
  extractResponsesApiText,
  parseDominicVisionScreening,
} from "@/lib/dominicVision";

describe("DOMINIC vision screening safeguards", () => {

  it("defines strict structured output for screening candidates", () => {
    expect(DOMINIC_VISION_SCHEMA.additionalProperties).toBe(false);
    expect(DOMINIC_VISION_SCHEMA.required).toEqual([
      "summary",
      "candidates",
      "limitations",
    ]);
    expect(DOMINIC_VISION_SCHEMA.properties.candidates.maxItems).toBe(12);
    expect(
      DOMINIC_VISION_SCHEMA.properties.candidates.items.properties.severity.enum,
    ).toEqual(["info", "low", "medium", "high"]);
  });

  it("parses bounded candidate findings", () => {
    const result = parseDominicVisionScreening(JSON.stringify({
      summary: "Surface review.",
      candidates: [{
        finding_type: "Coating Damage",
        title: "Possible coating loss",
        description: "A small irregular light-colored patch is visible.",
        severity: "medium",
        confidence: 1.4,
        region: { x: 0.8, y: 0.8, width: 0.5, height: 0.5 },
        recommended_action: "Review the area at closer range.",
      }],
      limitations: ["RGB image only."],
    }));

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].finding_type).toBe("coating_damage");
    expect(result.candidates[0].confidence).toBe(1);
    expect(result.candidates[0].region).toEqual({
      x: 0.8,
      y: 0.8,
      width: 0.2,
      height: 0.2,
    });
  });

  it("defaults unsupported severity to info", () => {
    const result = parseDominicVisionScreening(JSON.stringify({
      summary: "",
      candidates: [{
        finding_type: "other",
        title: "Visible irregularity",
        description: "An irregular patch is visible.",
        severity: "critical",
        confidence: 0.55,
        region: null,
        recommended_action: "Human review.",
      }],
      limitations: [],
    }));
    expect(result.candidates[0].severity).toBe("info");
  });

  it("extracts text from Responses API message content", () => {
    expect(extractResponsesApiText({
      output: [{
        content: [{ type: "output_text", text: '{"summary":"ok","candidates":[],"limitations":[]}' }],
      }],
    })).toContain('"summary":"ok"');
  });

  it("requires visible-only, non-diagnostic language in the prompt", () => {
    const prompt = buildDominicVisionPrompt({
      assetName: "Tank 17",
      assetType: "tank",
      inspectionType: "visual",
      objective: "Look for visible deterioration",
      sensorMode: "rgb",
    });
    expect(prompt).toContain("visible candidate anomalies");
    expect(prompt).toContain("A candidate is not a diagnosis");
    expect(prompt).toContain("Never output critical");
  });
});
