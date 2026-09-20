-- DOMINIC deliverable revision chain.
-- A corrected mapping output is a new immutable deliverable row that points
-- back to the client-rejected/revision-requested version it replaces.
alter table public.deliverables
  add column if not exists supersedes_deliverable_id uuid references public.deliverables(id),
  add column if not exists revision_number integer not null default 1;

create index if not exists idx_deliverables_supersedes_deliverable_id
  on public.deliverables(supersedes_deliverable_id);

create index if not exists idx_deliverables_job_type_revision
  on public.deliverables(job_id, type, revision_number desc);

comment on column public.deliverables.supersedes_deliverable_id is
  'Previous deliverable version replaced by this corrected output.';
comment on column public.deliverables.revision_number is
  '1-based revision number for a job/type output lineage.';
