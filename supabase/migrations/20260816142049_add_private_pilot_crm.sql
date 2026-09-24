create table if not exists public.pilot_crm_accounts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  industry text,
  status text not null default 'prospect' check (status in ('prospect','contacted','qualified','proposal','won','lost','do_not_contact')),
  notes text,
  next_action text,
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  origin text not null default 'pilot_originated' check (origin='pilot_originated'),
  match_status text not null default 'clear' check (match_status in ('clear','coordination_required','approved','blocked')),
  outreach_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pilot_crm_owner_idx on public.pilot_crm_accounts(contractor_id,status,next_follow_up_at);
create unique index if not exists pilot_crm_owner_email_uidx on public.pilot_crm_accounts(contractor_id,lower(email)) where email is not null;

create table if not exists public.crm_ownership_reviews (
  id uuid primary key default gen_random_uuid(),
  pilot_crm_account_id uuid not null unique references public.pilot_crm_accounts(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  match_reason text not null,
  status text not null default 'pending' check (status in ('pending','pilot_owned_approved','dom_protected','shared_approved')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pilot_crm_accounts enable row level security;
alter table public.crm_ownership_reviews enable row level security;
revoke all on public.pilot_crm_accounts from anon,authenticated;
revoke all on public.crm_ownership_reviews from anon,authenticated;

comment on table public.pilot_crm_accounts is 'Private pilot-originated CRM records; server-mediated to prevent DOM-client disclosure and solicitation overlap.';
comment on table public.crm_ownership_reviews is 'Privacy-safe DOM review queue for potential overlaps between pilot prospects and protected DOM relationships.';
