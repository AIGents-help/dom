import { describe, expect, it } from "vitest";
import { calculateQuote, SERVICE_BASE_PRICES } from "./quoting";

describe("custom mission quoting", () => {
  it("produces a usable quote without requiring a pilot-entered base price", () => {
    const quote = calculateQuote({
      serviceType: "custom",
      distanceMiles: 10,
      airspaceClass: "G",
      siteComplexity: "simple",
      urgency: "standard",
      deliverableTier: "standard",
    });

    expect(SERVICE_BASE_PRICES.custom.cents).toBeGreaterThan(0);
    expect(quote.basePriceCents).toBe(SERVICE_BASE_PRICES.custom.cents);
    expect(quote.totalCents).toBeGreaterThan(0);
    expect(quote.canOperate).toBe(true);
  });

  it("still allows an explicit custom base override for internal/admin use", () => {
    const quote = calculateQuote({
      serviceType: "custom",
      distanceMiles: 10,
      airspaceClass: "G",
      siteComplexity: "simple",
      urgency: "standard",
      deliverableTier: "standard",
      customBaseCents: 72500,
    });

    expect(quote.basePriceCents).toBe(72500);
    expect(quote.totalCents).toBe(72500);
  });
});
