import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const gatewayConfigured = Boolean(
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
      process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_AI_GATEWAY_KEY?.trim(),
  );
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const provider = gatewayConfigured
    ? "vercel-ai-gateway"
    : openAiConfigured
      ? "openai"
      : null;
  const model =
    process.env.DOMINIC_VISION_MODEL?.trim() ||
    (provider === "vercel-ai-gateway"
      ? "openai/gpt-5.6-terra"
      : provider === "openai"
        ? "gpt-5.6-terra"
        : null);

  return NextResponse.json(
    {
      configured: Boolean(provider),
      provider,
      model,
      mode: "visual_screening",
      humanReviewRequired: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
