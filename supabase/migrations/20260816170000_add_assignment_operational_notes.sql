alter table public.mission_assignments
  add column if not exists operational_notes text;

comment on column public.mission_assignments.operational_notes is
  'Pilot-maintained operational notes for planning and performing the assigned mission.';
