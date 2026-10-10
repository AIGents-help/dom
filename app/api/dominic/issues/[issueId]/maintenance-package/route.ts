import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { loadDominicMaintenancePackage } from "@/lib/dominicMaintenancePackageServer";
import { abortableRequest } from "@/lib/abortableRequest";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ issueId: string }> },
) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { issueId } = await context.params;

  const deadline = abortableRequest(req.signal, 30_000);
  try {
    const maintenancePackage = await loadDominicMaintenancePackage(
      data.user.id,
      issueId,
      deadline.signal,
    );
    if (!maintenancePackage) {
      return NextResponse.json(
        { error: "Issue maintenance package not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(maintenancePackage, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (loadError) {
    console.error("DOMINIC maintenance package load failed", loadError);
    return NextResponse.json(
      { error: "DOMINIC could not assemble the maintenance package. Retry before printing." },
      { status: 500 },
    );
  } finally {
    deadline.dispose();
  }
}
