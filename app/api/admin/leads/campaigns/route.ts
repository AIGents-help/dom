import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { listCampaigns } from "@/lib/smartlead";

// Lists Smartlead campaigns for the enrollment picker in the Outreach tab.
// Same not-configured contract as smartlead-enroll: 200 with configured:false
// when SMARTLEAD_API_KEY is unset, so the UI can render a polished
// "not configured" state instead of an error.
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.SMARTLEAD_API_KEY) {
    return NextResponse.json({ ok: false, configured: false, campaigns: [] });
  }

  try {
    const campaigns = await listCampaigns();
    return NextResponse.json({ ok: true, configured: true, campaigns });
  } catch (err) {
    console.error("Smartlead listCampaigns error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, configured: true, message: "Failed to load campaigns.", campaigns: [] }, { status: 502 });
  }
}
