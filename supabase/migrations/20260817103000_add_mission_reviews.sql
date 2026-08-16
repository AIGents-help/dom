create table if not exists public.mission_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('client','pilot','admin')),
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('pilot','dom','client','mission')),
  target_contractor_id uuid references public.contractors(id) on delete set null,
  target_client_id uuid references public.clients(id) on delete set null,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  communication_rating smallint check (communication_rating between 1 and 5),
  preparedness_rating smallint check (preparedness_rating between 1 and 5),
  accuracy_rating smallint check (accuracy_rating between 1 and 5),
  would_work_again boolean,
  comments text,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, reviewer_role, reviewer_user_id, target_type),
  check ((target_type = 'pilot' and target_contractor_id is not null) or target_type <> 'pilot'),
  check ((target_type = 'client' and target_client_id is not null) or target_type <> 'client')
);

create index if not exists mission_reviews_job_idx on public.mission_reviews(job_id);
create index if not exists mission_reviews_contractor_idx on public.mission_reviews(target_contractor_id, overall_rating) where target_contractor_id is not null;
create index if not exists mission_reviews_client_idx on public.mission_reviews(target_client_id, overall_rating) where target_client_id is not null;

alter table public.mission_reviews enable row level security;
revoke all on public.mission_reviews from anon, authenticated;

comment on table public.mission_reviews is 'Mission-linked, server-mediated reviews among clients, pilots, and DOM operations.';
