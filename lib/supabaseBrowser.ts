"use client";
import { createClient } from "@supabase/supabase-js";

// Public client (anon key) for the browser — safe to ship. RLS protects your data.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
