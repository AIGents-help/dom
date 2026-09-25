import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyAirspace } from "@/lib/airspace";

const originalKey = process.env.AIRHUB_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.AIRHUB_API_KEY;
  else process.env.AIRHUB_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

describe("classifyAirspace safety behavior", () => {
  it("fails closed when no authoritative provider is configured", async () => {
    delete process.env.AIRHUB_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("UNKNOWN");
    expect(result.operationally_verified).toBe(false);
    expect(result.laanc_status).toBe("unavailable");
    expect(result.max_altitude_ft).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when the provider is unavailable", async () => {
    process.env.AIRHUB_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("UNKNOWN");
    expect(result.operationally_verified).toBe(false);
    expect(result.raw_source).toBe("unavailable");
  });

  it("requires an explicit provider airspace classification", async () => {
    process.env.AIRHUB_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ advisories: [{ type: "airport", properties: { name: "Example" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("UNKNOWN");
    expect(result.operationally_verified).toBe(false);
  });

  it("accepts an explicit controlled-airspace class from the provider", async () => {
    process.env.AIRHUB_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        advisories: [{ type: "controlled airspace", properties: { airspaceClass: "B", ceiling: 100 } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("B");
    expect(result.operationally_verified).toBe(true);
    expect(result.laanc_required).toBe(true);
  });
});
