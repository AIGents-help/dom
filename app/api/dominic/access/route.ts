import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseDominicFeature } from "@/lib/dominicEntitlements";
import { getOrCreateDominicAccess } from "@/lib/dominicEntitlementsServer";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length);
  const admin = getSupabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: contractor } = await admin
    .from("contractors")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    const access = await getOrCreateDominicAccess({
      userId: user.id,
      fullName: contractor?.full_name ?? (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null),
    });

    return NextResponse.json({
      access,
      features: {
        home: canUseDominicFeature(access, "home"),
        capturePlanner: canUseDominicFeature(access, "capture_planner"),
        previews: canUseDominicFeature(access, "preview_modules"),
        mapping: canUseDominicFeature(access, "mapping"),
        hub: canUseDominicFeature(access, "hub"),
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "DOMINIC access could not be resolved.",
    }, { status: 500 });
  }
}
