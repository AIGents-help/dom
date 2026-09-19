create index if not exists contractors_uninsured_self_service_authorized_by_idx
  on public.contractors (uninsured_self_service_authorized_by)
  where uninsured_self_service_authorized_by is not null;
