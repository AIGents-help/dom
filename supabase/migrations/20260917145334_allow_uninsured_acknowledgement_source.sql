alter table public.mission_assignments
  drop constraint mission_assignments_insurance_source_check;

alter table public.mission_assignments
  add constraint mission_assignments_insurance_source_check
  check (insurance_source = any (array[
    'pilot_policy'::text,
    'dom_gig'::text,
    'pilot_uninsured_acknowledgement'::text
  ]));
