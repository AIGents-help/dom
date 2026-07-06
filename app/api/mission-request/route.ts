import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendMissionRequestEmails } from "@/lib/resend";
import { createNotionMissionRequest } from "@/lib/notion";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Two callers share this endpoint with different naming conventions:
    // the public mission-request form (contactName/details/preferredDate)
    // and the admin Create Mission wizard (requester_name/scope, plus
    // lat/lng + airspace_class from the auto-classification step). Accept
    // either shape and normalize to the mission_requests schema.
    const contactName = body.contactName ?? body.requester_name;
    const contactEmail = body.contactEmail ?? body.requester_email;
    const contactPhone = body.contactPhone;
    const company = body.company;
    const industry = body.industry;
    const serviceType = body.serviceType ?? body.service_type;
    const location = body.location;
    const budgetRange = body.budgetRange ?? body.budget_range;
    const latitude = body.latitude;
    const longitude = body.longitude;
    const airspaceClass = body.airspace_class;
    const timeline = body.timeline;
    const scope = [body.details ?? body.scope, contactPhone ? `Phone: ${contactPhone}` : null]
      .filter(Boolean)
      .join("\n\n") || undefined;

    if (!contactName || !contactEmail) {
      return NextResponse.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    // 1. Persist to Supabase (if configured)
    try {
      const supabaseAdmin = getSupabaseAdmin();
      if (supabaseAdmin) {
        await supabaseAdmin.from("mission_requests").insert({
          requester_name: contactName,
          requester_email: contactEmail,
          company,
          industry,
          service_type: serviceType,
          location,
          latitude,
          longitude,
          airspace_class: airspaceClass,
          timeline,
          scope,
          budget_range: budgetRange,
        });
      }
    } catch (e) {
      console.error("Supabase insert failed:", e);
    }

    // 2. Sync to Notion CRM (if configured)
    try {
      await createNotionMissionRequest({
        contactName,
        contactEmail,
        company,
        industry,
        serviceType,
        details: scope,
      });
    } catch (e) {
      console.error("Notion sync failed:", e);
    }

    // 3. Send email notifications (if configured)
    try {
      if (process.env.RESEND_API_KEY) {
        await sendMissionRequestEmails({
          contactName,
          contactEmail,
          company,
          industry,
          serviceType,
          details: scope,
        });
      }
    } catch (e) {
      console.error("Resend email failed:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission request error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
