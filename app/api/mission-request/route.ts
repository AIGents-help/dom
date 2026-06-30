import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendMissionRequestEmails } from "@/lib/resend";
import { createNotionMissionRequest } from "@/lib/notion";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      contactName,
      contactEmail,
      contactPhone,
      company,
      industry,
      serviceType,
      location,
      preferredDate,
      budgetRange,
      details,
    } = body;

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
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          company,
          industry,
          service_type: serviceType,
          location,
          preferred_date: preferredDate || null,
          budget_range: budgetRange,
          details,
          status: "pending",
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
        details,
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
          details,
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
