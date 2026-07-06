import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Determines whether a request carries a valid admin session, for endpoints
// that serve both an internal admin caller (full data) and the public
// (sanitized data). Only does DB work if a bearer token is actually present —
// the overwhelming majority of callers are anonymous.
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice("Bearer ".length);
  if (!token) return false;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user?.email) return false;

    const { data: allow } = await supabaseAdmin
      .from("admin_users")
      .select("email")
      .eq("email", userData.user.email)
      .maybeSingle();

    return !!allow;
  } catch {
    return false;
  }
}
