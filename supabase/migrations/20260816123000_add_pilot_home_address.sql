-- Private pilot dispatch origin used to calculate mission travel.
-- Contractors can only select/update their own row under the existing
-- contractor_select_own / contractor_update_own RLS policies. Public pilot
-- profiles use an explicit field list and never expose this column.
alter table public.contractors
  add column if not exists home_address text;

comment on column public.contractors.home_address is
  'Private pilot home/dispatch address used as the default mission travel origin; never publish on public profiles.';
