import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side anon-key client — for verifying a caller's own session/token
// (e.g. signInWithPassword, or reading a request's Authorization header to
// resolve the calling user). Distinct from supabaseBrowser.ts (browser-only,
// persists session to localStorage) and supabaseAdmin.ts (service-role,
// bypasses RLS). Throws a clear error if env vars are missing instead of
// the opaque "supabaseKey is required." from the SDK itself.
export function getSupabaseAnonServer(authHeader?: string | null): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined
  );
}
