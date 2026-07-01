"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Public client (anon key) for the browser — safe to ship. RLS protects your data.
// Lazily constructed so prerendering doesn't crash when env vars aren't set at build time.
let _supabaseBrowser: SupabaseClient | null = null;
export function getSupabaseBrowser(): SupabaseClient {
  if (!_supabaseBrowser) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY not set");
    _supabaseBrowser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabaseBrowser;
}
