// lib/quoting.ts
// DOM Quoting Engine — prices missions from real cost drivers, not guesswork.
//
// Every modifier is a multiplier against a service-type base price.
// Airspace complexity is factored in automatically from the airspace classification.
// This is margin most competitors leave on the table.

import type { AirspaceResult } from "./airspace";

// ── Service type base prices (cents) ──
// These are your starting anchors. Adjust from real market data.
// Default to higher; underpricing is the more common and more fatal error.

export const SERVICE_BASE_PRICES: Record<string, { label: string; cents: number }> = {
  roof_inspection_residential: { label: "Roof Inspection (Residential)", cents: 35000 },
  roof_inspection_commercial: { label: "Roof Inspection (Commercial)", cents: 55000 },
  construction_progress: { label: "Construction Progress Mapping", cents: 65000 },
  thermal_inspection: { label: "Thermal + Visual Inspection", cents: 85000 },
  ortho_survey: { label: "Orthomosaic Survey", cents: 120000 },
  powerline_inspection: { label: "Powerline / Utility Inspection", cents: 95000 },
  real_estate_media: { label: "Real Estate Aerial Media", cents: 25000 },
  custom: { label: "Custom Mission", cents: 0 }, // manually priced
};

// ── Modifier tables ──

export function locationModifier(distanceMiles: number): { factor: number; label: string } {
  if (distanceMiles <= 30) return { factor: 1.0, label: "Local (≤30 mi)" };
  if (distanceMiles <= 60) return { factor: 1.15, label: "Regional (30-60 mi)" };
  if (distanceMiles <= 100) return { factor: 1.3, label: "Extended (60-100 mi)" };
  return { factor: 1.5, label: "Remote (100+ mi)" };
}

export function airspaceModifier(
  airspaceClass: AirspaceResult["airspace_class"]
): { factor: number; label: string } {
  switch (airspaceClass) {
    case "G": return { factor: 1.0, label: "Class G — No auth required" };
    case "E": return { factor: 1.1, label: "Class E — Possible auth" };
    case "D": return { factor: 1.25, label: "Class D — LAANC required" };
    case "C": return { factor: 1.4, label: "Class C — LAANC required" };
    case "B": return { factor: 1.6, label: "Class B — Further coordination" };
    case "RESTRICTED": return { factor: 0, label: "Restricted — Cannot operate" };
    default: return { factor: 1.0, label: "Unknown — Verify manually" };
  }
}

export type SiteComplexity = "simple" | "moderate" | "complex";
export function complexityModifier(complexity: SiteComplexity): { factor: number; label: string } {
  switch (complexity) {
    case "simple": return { factor: 1.0, label: "Simple (single structure, open)" };
    case "moderate": return { factor: 1.15, label: "Moderate (multiple structures)" };
    case "complex": return { factor: 1.3, label: "Complex (obstacles, terrain)" };
  }
}

export type UrgencyLevel = "standard" | "priority" | "rush";
export function urgencyModifier(urgency: UrgencyLevel): { factor: number; label: string } {
  switch (urgency) {
    case "standard": return { factor: 1.0, label: "Standard (5-7 business days)" };
    case "priority": return { factor: 1.25, label: "Priority (2-3 business days)" };
    case "rush": return { factor: 1.5, label: "Rush (24-48 hours)" };
  }
}

export type DeliverableTier = "standard" | "enhanced" | "full";
export function deliverableModifier(tier: DeliverableTier): { factor: number; label: string } {
  switch (tier) {
    case "standard": return { factor: 1.0, label: "Standard (images + report)" };
    case "enhanced": return { factor: 1.2, label: "Enhanced (ortho + 3D model)" };
    case "full": return { factor: 1.4, label: "Full (all outputs + raw data)" };
  }
}

// ── Quote calculation ──

export interface QuoteInput {
  serviceType: string;
  distanceMiles: number;
  airspaceClass: AirspaceResult["airspace_class"];
  siteComplexity: SiteComplexity;
  urgency: UrgencyLevel;
  deliverableTier: DeliverableTier;
  customBaseCents?: number; // for custom missions
  commissionBps?: number; // override default 2000 (20%)
}

export interface QuoteBreakdown {
  serviceType: string;
  serviceLabel: string;
  basePriceCents: number;
  modifiers: {
    location: { factor: number; label: string };
    airspace: { factor: number; label: string };
    complexity: { factor: number; label: string };
    urgency: { factor: number; label: string };
    deliverable: { factor: number; label: string };
  };
  combinedMultiplier: number;
  totalCents: number;
  commissionCents: number;
  contractorPayoutCents: number;
  commissionRate: string;
  canOperate: boolean; // false if restricted airspace
  warnings: string[];
}

export type PublicQuoteBreakdown = Omit<
  QuoteBreakdown,
  "commissionCents" | "contractorPayoutCents" | "commissionRate"
>;

// Strips DOM's commission structure before a quote leaves the server for an
// unauthenticated caller — commissionCents/contractorPayoutCents/commissionRate
// reveal the exact margin and contractor payout split.
export function toPublicQuote(q: QuoteBreakdown): PublicQuoteBreakdown {
  const { commissionCents, contractorPayoutCents, commissionRate, ...rest } = q;
  return rest;
}

export function calculateQuote(input: QuoteInput): QuoteBreakdown {
  const service = SERVICE_BASE_PRICES[input.serviceType];
  const baseCents = input.customBaseCents ?? service?.cents ?? 0;
  const serviceLabel = service?.label ?? input.serviceType;

  const mods = {
    location: locationModifier(input.distanceMiles),
    airspace: airspaceModifier(input.airspaceClass),
    complexity: complexityModifier(input.siteComplexity),
    urgency: urgencyModifier(input.urgency),
    deliverable: deliverableModifier(input.deliverableTier),
  };

  const warnings: string[] = [];
  let canOperate = true;

  if (mods.airspace.factor === 0) {
    canOperate = false;
    warnings.push("Site is in restricted airspace. Cannot operate without special authorization.");
  }

  if (input.airspaceClass === "B") {
    warnings.push("Class B airspace: LAANC auto-approval unlikely. Further coordination adds 3-5 business days. Budget additional time.");
  }

  if (input.urgency === "rush" && ["B", "C"].includes(input.airspaceClass)) {
    warnings.push("Rush delivery in controlled airspace may not be achievable due to authorization lead time.");
  }

  const combined = canOperate
    ? mods.location.factor * mods.airspace.factor * mods.complexity.factor * mods.urgency.factor * mods.deliverable.factor
    : 0;

  const totalCents = Math.round(baseCents * combined);
  const commissionBps = input.commissionBps ?? Number(process.env.DOM_COMMISSION_BPS ?? 2000);
  const commissionCents = Math.round((totalCents * commissionBps) / 10000);
  const contractorPayoutCents = totalCents - commissionCents;

  return {
    serviceType: input.serviceType,
    serviceLabel,
    basePriceCents: baseCents,
    modifiers: mods,
    combinedMultiplier: Math.round(combined * 1000) / 1000,
    totalCents,
    commissionCents,
    contractorPayoutCents,
    commissionRate: `${commissionBps / 100}%`,
    canOperate,
    warnings,
  };
}

// ── Formatting helpers ──

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function quoteToSummary(q: QuoteBreakdown): string {
  if (!q.canOperate) {
    return `CANNOT QUOTE: ${q.warnings.join(" ")}`;
  }
  const lines = [
    `${q.serviceLabel}`,
    `Base: ${formatCents(q.basePriceCents)}`,
    `  × Location: ${q.modifiers.location.factor}x (${q.modifiers.location.label})`,
    `  × Airspace: ${q.modifiers.airspace.factor}x (${q.modifiers.airspace.label})`,
    `  × Complexity: ${q.modifiers.complexity.factor}x (${q.modifiers.complexity.label})`,
    `  × Urgency: ${q.modifiers.urgency.factor}x (${q.modifiers.urgency.label})`,
    `  × Deliverable: ${q.modifiers.deliverable.factor}x (${q.modifiers.deliverable.label})`,
    `──────────────────`,
    `Total: ${formatCents(q.totalCents)}`,
    `  DOM commission (${q.commissionRate}): ${formatCents(q.commissionCents)}`,
    `  Contractor payout: ${formatCents(q.contractorPayoutCents)}`,
  ];
  if (q.warnings.length) {
    lines.push("", "⚠ WARNINGS:");
    q.warnings.forEach((w) => lines.push(`  ${w}`));
  }
  return lines.join("\n");
}
