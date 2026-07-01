import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service-role key.
// This key bypasses RLS — NEVER import this into client components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } }
);
