export const SHOP_PRODUCTS = {
  "drone-operation-safety-vest": {
    name: "Drone Operation Safety Vest",
    unitAmount: 1500,
    description: "Orange high-visibility safety vest with reflective striping and DRONE OPERATION identification.",
    variants: ["S", "M", "L", "XL"] as const,
  },
  "portable-landing-pad": {
    name: "Portable Drone Landing Pad",
    unitAmount: 1500,
    description: "High-visibility foldable landing pad for drone takeoffs and landings.",
  },
  "barrier-1": { name: "Drone Operation Retractable Barrier — Single", unitAmount: 6900, description: "One high-visibility retractable barrier post with 6 ft DRONE OPERATION webbing." },
  "barrier-3": { name: "Drone Operation Barrier Kit — 3 Pack", unitAmount: 17900, description: "Three high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit." },
  "barrier-4": { name: "Drone Operation Barrier Kit — 4 Pack", unitAmount: 22900, description: "Four high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit." },
  "barrier-6": { name: "Drone Operation Barrier Kit — 6 Pack", unitAmount: 31900, description: "Six high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit." },
  "barrier-12": { name: "Drone Operation Barrier Kit — 12 Pack", unitAmount: 59900, description: "Twelve high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit." },
  "barrier-24": { name: "Drone Operation Corporate Barrier Kit — 24 Pack", unitAmount: 109900, description: "Twenty-four high-visibility retractable barrier posts with 6 ft DRONE OPERATION webbing on each unit." },
} as const;

export type ShopProductKey = keyof typeof SHOP_PRODUCTS;

export function getShopProduct(value: unknown) {
  if (typeof value !== "string" || !(value in SHOP_PRODUCTS)) return null;
  return { key: value as ShopProductKey, ...SHOP_PRODUCTS[value as ShopProductKey] };
}

export function validateShopVariant(productKey: ShopProductKey, value: unknown): string {
  if (productKey !== "drone-operation-safety-vest") return "";
  const size = typeof value === "string" ? value : "";
  return SHOP_PRODUCTS[productKey].variants.includes(size as "S" | "M" | "L" | "XL") ? size : "";
}

export function calculateShipping(quantity: number, baseCents: number, additionalCents: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Invalid quantity");
  return Math.max(0, baseCents) + Math.max(0, quantity - 1) * Math.max(0, additionalCents);
}
