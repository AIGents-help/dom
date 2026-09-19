import { describe, expect, it } from "vitest";
import { calculateShipping, getShopProduct, validateShopVariant } from "./catalog";

describe("shop catalog", () => {
  it("rejects unknown products and accepts catalog products", () => {
    expect(getShopProduct("not-real")).toBeNull();
    expect(getShopProduct("portable-landing-pad")?.unitAmount).toBe(1500);
  });

  it("requires a supported vest size and ignores variants elsewhere", () => {
    expect(validateShopVariant("drone-operation-safety-vest", "XL")).toBe("XL");
    expect(validateShopVariant("drone-operation-safety-vest", "XXL")).toBe("");
    expect(validateShopVariant("portable-landing-pad", "XL")).toBe("");
  });

  it("calculates base plus per-additional-item shipping", () => {
    expect(calculateShipping(1, 995, 500)).toBe(995);
    expect(calculateShipping(3, 995, 500)).toBe(1995);
    expect(() => calculateShipping(0, 995, 500)).toThrow("Invalid quantity");
  });
});
