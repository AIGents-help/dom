import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { InspectionFinding } from "@/lib/dominicInspectionEvidence";

export async function GET(req: NextRequest, { params }: { params: Promise<{ inspectionId: string }> }) {
  const admin = getSupabaseAdmin();
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const userId = data.user.id;
  const { inspectionId } = await params;
  const { data: inspection, error: inspectionError } = await admin.from("dominic_inspections")
    .select("id,asset_id,inspection_type,objective,status,summary").eq("id", inspectionId).eq("user_id", userId).maybeSingle();
  if (inspectionError) return NextResponse.json({ error: "Inspection could not be loaded." }, { status: 500 });
  if (!inspection) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  const mediaColumns = "id,original_filename,captured_at,created_at,sensor_mode,storage_path";
  const [assetResult, findingResult, mediaResult] = await Promise.all([
    admin.from("dominic_assets").select("id,name,asset_type").eq("id", inspection.asset_id).eq("user_id", userId).maybeSingle(),
    admin.from("dominic_findings").select("id,title,description,severity,review_status,confidence,sensor_mode,spatial_anchor,detector,observed_at")
      .eq("inspection_id", inspectionId).eq("asset_id", inspection.asset_id).eq("user_id", userId).order("observed_at"),
    admin.from("dominic_inspection_media").select(mediaColumns).eq("inspection_id", inspectionId).eq("asset_id", inspection.asset_id).eq("user_id", userId).order("created_at"),
  ]);
  if (assetResult.error || findingResult.error || mediaResult.error) return NextResponse.json({ error: "Inspection evidence could not be loaded." }, { status: 500 });
  if (!assetResult.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const findings = (findingResult.data ?? []) as InspectionFinding[];
  const baselineIds = [...new Set(findings.map((finding) => finding.detector?.baselineSourceMediaId).filter((id): id is string => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id)))];
  const baselineResult = baselineIds.length ? await admin.from("dominic_inspection_media").select(mediaColumns)
    .in("id", baselineIds).eq("asset_id", inspection.asset_id).eq("user_id", userId) : { data: [], error: null };
  if (baselineResult.error) return NextResponse.json({ error: "Previous evidence could not be loaded." }, { status: 500 });
  const sign = async (rows: NonNullable<typeof mediaResult.data>) => Promise.all(rows.map(async ({ storage_path, ...row }) => {
    const safePath = storage_path?.startsWith(`${userId}/`) && !storage_path.split("/").includes("..") && !/[\\%]/.test(storage_path);
    const result = safePath ? await admin.storage.from("pilot-media").createSignedUrl(storage_path, 900) : null;
    return { ...row, url: result?.data?.signedUrl ?? null };
  }));
  const [media, baselineMedia] = await Promise.all([sign(mediaResult.data ?? []), sign(baselineResult.data ?? [])]);
  return NextResponse.json({ inspection, asset: assetResult.data, findings, media, baselineMedia, generatedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
