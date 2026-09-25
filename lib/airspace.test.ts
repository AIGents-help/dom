import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyAirspace } from "@/lib/airspace";

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFaa({
  uasfm,
  classAirspace,
  uasfmStatus = 200,
  classStatus = 200,
}: {
  uasfm?: unknown;
  classAirspace?: unknown;
  uasfmStatus?: number;
  classStatus?: number;
}) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes("FAA_UAS_FacilityMap_Data")) return response(uasfm ?? { features: [] }, uasfmStatus);
    if (value.includes("Class_Airspace")) return response(classAirspace ?? { features: [] }, classStatus);
    throw new Error(`Unexpected URL: ${value}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("classifyAirspace FAA safety behavior", () => {
  it("uses FAA UASFM airspace class and ceiling when present", async () => {
    mockFaa({
      uasfm: {
        features: [{
          attributes: {
            CEILING: 100,
            AIRSPACE_1: "CLASS B",
            APT1_LAANC: 1,
            APT1_Enabled: "Enabled",
          },
        }],
      },
      classAirspace: {
        features: [{
          attributes: { CLASS: "B", LOWER_DESC: "SFC", LOWER_VAL: 0 },
        }],
      },
    });

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("B");
    expect(result.max_altitude_ft).toBe(100);
    expect(result.laanc_required).toBe(true);
    expect(result.laanc_status).toBe("available");
    expect(result.raw_source).toBe("faa_official");
    expect(result.operationally_verified).toBe(true);
  });

  it("chooses the most restrictive intersecting FAA surface class", async () => {
    mockFaa({
      uasfm: { features: [] },
      classAirspace: {
        features: [
          { attributes: { CLASS: "E", LOWER_DESC: "SFC", LOWER_VAL: 0 } },
          { attributes: { CLASS: "C", LOWER_DESC: "SFC", LOWER_VAL: 0 } },
          { attributes: { CLASS: "B", LOWER_DESC: "SFC", LOWER_VAL: 0 } },
        ],
      },
    });

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("B");
    expect(result.max_altitude_ft).toBe(0);
    expect(result.laanc_status).toBe("unavailable");
    expect(result.operationally_verified).toBe(true);
  });

  it("treats a successful FAA class query with no surface controlled polygon as Class G below 400 AGL", async () => {
    mockFaa({
      uasfm: { features: [] },
      classAirspace: {
        features: [
          { attributes: { CLASS: "E", LOWER_DESC: "700 AGL", LOWER_VAL: 700 } },
        ],
      },
    });

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("G");
    expect(result.max_altitude_ft).toBe(400);
    expect(result.laanc_required).toBe(false);
    expect(result.operationally_verified).toBe(true);
  });

  it("fails closed when FAA datasets cannot establish the class", async () => {
    mockFaa({
      uasfm: { error: { message: "unavailable" } },
      classAirspace: { error: { message: "unavailable" } },
      uasfmStatus: 503,
      classStatus: 503,
    });

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("UNKNOWN");
    expect(result.operationally_verified).toBe(false);
    expect(result.max_altitude_ft).toBe(0);
    expect(result.laanc_status).toBe("unavailable");
  });

  it("never promotes an above-surface Class E shelf to the low-altitude operating class", async () => {
    mockFaa({
      uasfm: { features: [] },
      classAirspace: {
        features: [
          { attributes: { CLASS: "E", LOWER_DESC: "1200 AGL", LOWER_VAL: 1200 } },
          { attributes: { CLASS: "C", LOWER_DESC: "SFC", LOWER_VAL: 0 } },
        ],
      },
    });

    const result = await classifyAirspace(39.916, -75.388);

    expect(result.airspace_class).toBe("C");
  });
});
