import { NextRequest, NextResponse } from "next/server";
import { isContactHoneypotFilled, parseContactMessage } from "@/lib/contactMessage";
import { rateLimitResponse } from "@/lib/rateLimit";
import { sendContactMessageEmails } from "@/lib/resend";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req); if (limited) return limited;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (isContactHoneypotFilled(body)) return NextResponse.json({ success: true });
  const parsed = parseContactMessage(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const message = parsed.value;
  try {
    const { error } = await getSupabaseAdmin().from("admin_messages").insert({ source: "website_contact", sender_name: message.name, sender_email: message.email, sender_phone: message.phone, company: message.company, category: message.category, subject: message.subject, message: message.message, status: "unread" });
    if (error) throw error;
    if (process.env.RESEND_API_KEY) await sendContactMessageEmails({ ...message, phone: message.phone ?? undefined, company: message.company ?? undefined });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("contact message error", error);
    return NextResponse.json({ error: "Your message could not be sent. Please try again." }, { status: 500 });
  }
}
