import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveDominicAccess,
  type DominicAccess,
} from "@/lib/dominicEntitlements";

export async function getOrCreateDominicAccess({
  userId,
  fullName,
  company,
}: {
  userId: string;
  fullName?: string | null;
  company?: string | null;
}): Promise<DominicAccess> {
  const admin = getSupabaseAdmin();

  const { data: existingProfile, error } = await admin
    .from("dominic_profiles")
    .select("plan,status,trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`DOMINIC profile could not be loaded: ${error.message}`);

  let profile = existingProfile;

  if (!profile) {
    const { data: created, error: createError } = await admin
      .from("dominic_profiles")
      .upsert(
        {
          user_id: userId,
          full_name: fullName?.trim() || null,
          company: company?.trim() || null,
          plan: "free",
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("plan,status,trial_ends_at")
      .single();

    if (createError) {
      throw new Error(`DOMINIC profile could not be initialized: ${createError.message}`);
    }
    profile = created;
  }

  // Read the protected billing field from the database on every access
  // check. Never accept a subscription claim from user-editable metadata.
  const { data: contractor, error: contractorError } = await admin
    .from("contractors")
    .select("subscription_active,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (contractorError) throw new Error("DOM pilot subscription could not be verified.");
  const included = contractor?.subscription_active === true
    && !["inactive", "suspended"].includes(contractor.status);
  return resolveDominicAccess(profile, Date.now(), included);
}
