import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";
import { rateLimitResponse } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req); if (limited) return limited;
  const auth = req.headers.get("authorization"); if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const sb = getSupabaseAnonServer(auth); const { data: { user } } = await sb.auth.getUser(); if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const admin = getSupabaseAdmin(); const { data: contractor } = await admin.from("contractors").select("id").eq("user_id", user.id).maybeSingle(); if (!contractor) return NextResponse.json({ error: "Pilot profile not found" }, { status: 404 });
  const form = await req.formData(); const provider = String(form.get("provider") ?? "").trim().slice(0, 120); const policyNumber = String(form.get("policyNumber") ?? "").trim().slice(0, 120); const expiresOn = String(form.get("expiresOn") ?? ""); const liability = Math.round(Number(form.get("liabilityDollars") ?? 0) * 100); const file = form.get("coi");
  if (!provider || !policyNumber || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || liability <= 0) return NextResponse.json({ error: "Provider, policy number, expiration, and liability limit are required." }, { status: 400 });
  if (new Date(`${expiresOn}T23:59:59`).getTime() <= Date.now()) return NextResponse.json({ error: "The policy expiration must be in the future." }, { status: 400 });
  let coiPath: string | undefined;
  if (file instanceof File && file.size > 0) { if (file.size > 10_485_760 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return NextResponse.json({ error: "COI must be a PDF, JPG, or PNG no larger than 10 MB." }, { status: 400 }); const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf"; coiPath = `${contractor.id}/${Date.now()}-coi.${ext}`; const { error } = await admin.storage.from("pilot-insurance").upload(coiPath, file, { contentType: file.type, upsert: false }); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); }
  const patch: Record<string, unknown> = { insurance_provider: provider, insurance_policy_number: policyNumber, insurance_expires_on: expiresOn, insurance_liability_cents: liability, insurance_verified: false, insurance_requested: true }; if (coiPath) patch.insurance_coi_path = coiPath;
  const { error } = await admin.from("contractors").update(patch).eq("id", contractor.id); if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Insurance submitted for DOM verification." });
}
