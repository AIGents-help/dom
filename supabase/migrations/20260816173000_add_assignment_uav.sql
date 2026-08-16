alter table public.mission_assignments
  add column if not exists assigned_uav text;

comment on column public.mission_assignments.assigned_uav is
  'Aircraft selected by the assigned pilot from equipment listed in the pilot profile.';
