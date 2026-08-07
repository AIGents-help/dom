import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

// Shared pilot-facing API auth resolver: Bearer token -> authenticated
// Supabase user -> contractors row -> status check. Factored out of
// app/api/pilot/me/route.ts's inline version so every new mapper route
// follows the exact same pattern instead of re-implementing it. Never
// resolves a contractor from anything the browser supplies directly
// (email, contractor_id) — only from the verified auth.uid().

export interface AuthedContractor {
  id: string;
  user_id: string;
  status: string;
  full_name: string;
  email: string;
}

export type ContractorAuthResult = { contractor: AuthedContractor } | { error: string; status: number };

export async function resolveContractor(req: NextRequest): Promise<ContractorAuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { error: "Not authenticated", status: 401 };

  const supabase = getSupabaseAnonServer(authHeader);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: "Invalid session", status: 401 };

  const admin = getSupabaseAdmin();
  const { data: contractor } = await admin
    .from("contractors")
    .select("id, user_id, status, full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contractor) return { error: "No pilot profile found", status: 404 };
  if (contractor.status === "suspended" || contractor.status === "inactive") {
    return { error: "Your pilot account is not active.", status: 403 };
  }

  return { contractor };
}
