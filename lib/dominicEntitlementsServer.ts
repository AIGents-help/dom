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

  return resolveDominicAccess(profile);
}
