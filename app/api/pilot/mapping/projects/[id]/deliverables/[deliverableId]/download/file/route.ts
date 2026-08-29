import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyDownloadToken } from "@/lib/downloadToken";
import { getDriveFileStream } from "@/lib/googleDrive";

export const runtime = "nodejs";

// GET .../download/file?exp=...&sig=...
// Streams a Google-Drive-backed deliverable's bytes through this server,
// authorized by a short-lived HMAC token (minted by the sibling
// download/route.ts, which does the real Bearer-token pilot auth) instead
// of a header -- a window.open() navigation can't carry an Authorization
// header, so the signed query-string token stands in for it. Only used for
// one-shot whole-file downloads (Master LAZ / GLB / GeoTIFF, tens of MB);
// the Potree point-cloud viewer's many small partial reads go straight to
// Supabase Storage signed URLs instead (see potree/route.ts) specifically
// to avoid routing large, repeated range-requested data through here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { deliverableId } = await params;
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!verifyDownloadToken(deliverableId, exp, sig)) {
    return NextResponse.json({ error: "Link expired or invalid." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: deliverable } = await admin
    .from("deliverables")
    .select("id, name, storage_provider, external_file_id")
    .eq("id", deliverableId)
    .maybeSingle();
  if (!deliverable || deliverable.storage_provider !== "google_drive" || !deliverable.external_file_id) {
    return NextResponse.json({ error: "File unavailable." }, { status: 404 });
  }

  try {
    const file = await getDriveFileStream(deliverable.external_file_id);
    const webStream = Readable.toWeb(file.stream) as ReadableStream;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${(file.name || deliverable.name || "download").replace(/"/g, "")}"`,
        ...(file.size ? { "Content-Length": String(file.size) } : {}),
      },
    });
  } catch (err) {
    console.error(`[mapping/deliverables/download/file] Drive stream failed for ${deliverableId}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "File unavailable." }, { status: 502 });
  }
}
