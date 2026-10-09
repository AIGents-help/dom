import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isOwnedInspectionStoragePath, type InspectionFinding } from "@/lib/dominicInspectionEvidence";
import { abortableRequest } from "@/lib/abortableRequest";
import { readAllReportRows, reportEvidenceIds, REPORT_PAGE_SIZE } from "@/lib/dominicInspectionReport";

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
  const generatedAt = new Date().toISOString();
  const deadline = abortableRequest(req.signal, 30_000);
  try {
    const [assetResult, findings] = await Promise.all([
      admin.from("dominic_assets").select("id,name,asset_type").eq("id", inspection.asset_id).eq("user_id", userId).abortSignal(deadline.signal).maybeSingle(),
      readAllReportRows<InspectionFinding>((after) => {
        let query = admin.from("dominic_findings").select("id,title,description,severity,review_status,confidence,sensor_mode,spatial_anchor,detector,observed_at")
          .eq("inspection_id", inspectionId).eq("asset_id", inspection.asset_id).eq("user_id", userId)
          .lte("created_at", generatedAt)
          .order("id").limit(REPORT_PAGE_SIZE);
        if (after) query = query.gt("id", after);
        return query.abortSignal(deadline.signal);
      }, deadline.signal),
    ]);
    if (assetResult.error) throw assetResult.error;
    if (!assetResult.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    const evidenceIds = reportEvidenceIds(findings);
    const mediaColumns = "id,original_filename,captured_at,created_at,sensor_mode,storage_path";
    type MediaRow = { id: string; original_filename: string | null; captured_at: string | null; created_at: string; sensor_mode: string; storage_path: string | null };
    const readMedia = async (ids: string[], current: boolean) => {
      const rows: MediaRow[] = [];
      // Small ID batches keep the REST URL bounded. Each batch is also paged so
      // a lower database response cap cannot silently omit referenced evidence.
      for (let start = 0; start < ids.length; start += 100) {
        rows.push(...await readAllReportRows<MediaRow>((after) => {
          let query = admin.from("dominic_inspection_media").select(mediaColumns)
            .in("id", ids.slice(start, start + 100)).eq("asset_id", inspection.asset_id).eq("user_id", userId)
            .order("id").limit(REPORT_PAGE_SIZE);
          if (current) query = query.eq("inspection_id", inspectionId);
          if (after) query = query.gt("id", after);
          return query.abortSignal(deadline.signal);
        }, deadline.signal));
      }
      return rows;
    };
    const [currentRows, baselineRows] = await Promise.all([readMedia(evidenceIds.current, true), readMedia(evidenceIds.baseline, false)]);
    const sign = async (rows: MediaRow[]) => {
      const signed = [];
      // Avoid opening one storage request per finding at the same time.
      for (let start = 0; start < rows.length; start += 8) {
        if (deadline.signal.aborted) throw new Error("Report request cancelled.");
        signed.push(...await Promise.all(rows.slice(start, start + 8).map(async ({ storage_path, ...row }) => {
          const result = isOwnedInspectionStoragePath(storage_path, userId) ? await admin.storage.from("dominic-inspection-evidence").createSignedUrl(storage_path, 900) : null;
          return { ...row, url: result?.data?.signedUrl ?? null };
        })));
      }
      return signed;
    };
    const [media, baselineMedia] = await Promise.all([sign(currentRows), sign(baselineRows)]);
    return NextResponse.json({ inspection, asset: assetResult.data, findings, media, baselineMedia, generatedAt }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "The complete inspection report could not be loaded. Retry before printing." }, { status: 500 });
  } finally {
    deadline.dispose();
  }
}
