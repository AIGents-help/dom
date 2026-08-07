import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Service-role client — bypasses RLS entirely, same as lib/supabaseAdmin.ts
// in the main app. Never construct this with anything but the service-role
// key, and never run this file in a browser context.
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
