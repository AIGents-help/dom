import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { parseInspectionReviewQuery } from "@/lib/dominicInspectionReview";
import { abortableRequest } from "@/lib/abortableRequest";

export async function GET(req: NextRequest, { params }: { params: Promise<{ inspectionId: string }> }) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return reply({ error: "Not authenticated" }, 401);
  const query = parseInspectionReviewQuery(req.nextUrl.searchParams);
  const { inspectionId } = await params;
  if (!query || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(inspectionId)) return reply({ error: "Invalid review query." }, 400);
  const deadline = abortableRequest(req.signal, 30_000);
  try {
    const sb = getSupabaseAnonServer(header);
    const { data: auth, error: authError } = await sb.auth.getUser(header.slice(7));
    if (authError || !auth.user) return reply({ error: "Invalid session" }, 401);
    const { data: inspection, error: inspectionError } = await sb.from("dominic_inspections").select("asset_id")
      .eq("id", inspectionId).eq("user_id", auth.user.id).abortSignal(deadline.signal).maybeSingle();
    if (inspectionError) throw inspectionError;
    if (!inspection) return reply({ error: "Inspection not found." }, 404);
    const { data, error } = await sb.rpc("read_dominic_inspection_review", {
      p_inspection_id: inspectionId, p_asset_id: inspection.asset_id, p_media_page: query.mediaPage,
      p_finding_page: query.findingPage, p_filter: query.filter, p_search: query.search,
    }).abortSignal(deadline.signal);
    if (error) throw error;
    if (!data) return reply({ error: "Inspection not found." }, 404);
    return reply(data);
  } catch {
    return reply({ error: "Inspection evidence could not be refreshed. Retry before reviewing." }, 500);
  } finally { deadline.dispose(); }
}
