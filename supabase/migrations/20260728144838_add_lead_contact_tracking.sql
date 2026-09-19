
create type contact_method as enum ('phone', 'email', 'text', 'in_person', 'other');

alter table leads
  add column if not exists preferred_contact_method contact_method,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at date;

comment on column leads.preferred_contact_method is 'How this prospect prefers to be reached';
comment on column leads.last_contacted_at is 'Timestamp of most recent outreach touch, manual or logged';
comment on column leads.next_follow_up_at is 'Date this lead should be followed up with next';
