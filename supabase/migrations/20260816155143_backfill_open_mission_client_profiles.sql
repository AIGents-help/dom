update public.mission_requests mr
set requester_name=c.contact_name,
    requester_email=c.email,
    company=c.company_name
from public.clients c
where mr.client_id=c.id
  and mr.client_profile_sync_enabled=true
  and mr.status::text not in ('delivered','closed','cancelled')
  and (
    mr.requester_name is distinct from c.contact_name or
    mr.requester_email is distinct from c.email or
    mr.company is distinct from c.company_name
  );

comment on column public.mission_requests.client_profile_sync_enabled is
  'Open linked missions follow current client identity/contact fields unless Admin selects a mission-specific override. Delivered, closed, and cancelled records remain frozen.';
