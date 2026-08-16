alter table public.mission_assignments
  add column if not exists site_access_notes text,
  add column if not exists cautions_awareness text,
  add column if not exists client_communications text;

comment on column public.mission_assignments.site_access_notes is 'Pilot-maintained site access, parking, arrival, and check-in details.';
comment on column public.mission_assignments.cautions_awareness is 'Pilot-maintained hazards, sensitivities, weather, airspace, and site-awareness notes.';
comment on column public.mission_assignments.client_communications is 'Pilot-maintained client coordination and communications log.';
