alter table public.contractors
  add column if not exists insurance_provider text,
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_expires_on date,
  add column if not exists insurance_liability_cents bigint,
  add column if not exists insurance_coi_path text,
  add column if not exists dom_gig_insurance_eligible boolean not null default false;

alter table public.mission_assignments
  add column if not exists insurance_source text check (insurance_source in ('pilot_policy','dom_gig')),
  add column if not exists mission_insurance_verified boolean not null default false,
  add column if not exists mission_insurance_reference text,
  add column if not exists mission_insurance_expires_at timestamptz,
  add column if not exists mission_insurance_coi_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pilot-insurance', 'pilot-insurance', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=excluded.allowed_mime_types;

create index if not exists contractors_insurance_expiry_idx on public.contractors(insurance_verified, insurance_expires_on);
create index if not exists assignments_insurance_gate_idx on public.mission_assignments(mission_insurance_verified, insurance_source);
