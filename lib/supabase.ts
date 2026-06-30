import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

/**
 * Public/browser Supabase client.
 * Used for anything that runs client-side (forms, public reads under RLS).
 * Falls back to placeholder values at build time when env vars aren't set;
 * set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY for real usage.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Server-side Supabase client using the service role key.
 * Only ever import this from server components, route handlers, or server actions.
 * Returns null if Supabase isn't configured so callers can skip gracefully.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Suggested Supabase schema (run via SQL editor / migrations):
 *
 * create table leads (
 *   id uuid primary key default gen_random_uuid(),
 *   name text not null,
 *   email text not null,
 *   phone text,
 *   company text,
 *   source text default 'website',
 *   status text default 'new',
 *   created_at timestamptz default now()
 * );
 *
 * create table mission_requests (
 *   id uuid primary key default gen_random_uuid(),
 *   contact_name text not null,
 *   contact_email text not null,
 *   contact_phone text,
 *   company text,
 *   industry text,
 *   service_type text,
 *   location text,
 *   preferred_date date,
 *   budget_range text,
 *   details text,
 *   status text default 'pending',
 *   created_at timestamptz default now()
 * );
 *
 * create table clients (
 *   id uuid primary key default gen_random_uuid(),
 *   name text not null,
 *   company text,
 *   email text,
 *   phone text,
 *   tier text default 'standard',
 *   created_at timestamptz default now()
 * );
 *
 * create table jobs (
 *   id uuid primary key default gen_random_uuid(),
 *   client_id uuid references clients(id),
 *   title text not null,
 *   service_type text,
 *   status text default 'scheduled',
 *   pilot text,
 *   location text,
 *   scheduled_date timestamptz,
 *   created_at timestamptz default now()
 * );
 *
 * create table deliverables (
 *   id uuid primary key default gen_random_uuid(),
 *   job_id uuid references jobs(id),
 *   title text not null,
 *   file_url text,
 *   delivered_at timestamptz,
 *   status text default 'in_progress',
 *   created_at timestamptz default now()
 * );
 *
 * create table notes (
 *   id uuid primary key default gen_random_uuid(),
 *   related_type text not null, -- 'lead' | 'job' | 'client'
 *   related_id uuid not null,
 *   body text not null,
 *   created_at timestamptz default now()
 * );
 */
