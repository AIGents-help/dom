import type { SupabaseClient } from "@supabase/supabase-js";
import { isAssetActive, type CapabilityRequirement } from "@/lib/pilotAssetsPipeline";

// Server-only Supabase-backed helpers shared by every route that needs a
// pilot's active capability set or a mission's requirements — the queue
// eligibility annotation (read-only, for display) and the claim route
// (the actual enforcement gate) both call these so the two can never
// silently compute eligibility differently.

export async function getContractorActiveCapabilities(admin: SupabaseClient, contractorId: string): Promise<Set<string>> {
  const { data: assets } = await admin
    .from("pilot_assets")
    .select("status, archived_at, pilot_asset_capabilities(capability)")
    .eq("contractor_id", contractorId);

  const set = new Set<string>();
  for (const asset of assets ?? []) {
    if (!isAssetActive(asset)) continue;
    for (const row of (asset.pilot_asset_capabilities ?? []) as { capability: string }[]) set.add(row.capability);
  }
  return set;
}

export async function getServiceTypeRequirements(admin: SupabaseClient, serviceType: string | null | undefined): Promise<CapabilityRequirement[]> {
  if (!serviceType) return [];
  const { data } = await admin.from("mission_capability_requirements").select("capability, required").eq("service_type", serviceType);
  return data ?? [];
}
