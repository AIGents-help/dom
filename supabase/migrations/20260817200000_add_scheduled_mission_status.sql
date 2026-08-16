-- A performance date is an operational milestone, while readiness remains a
-- separate concern. Keep the mission in Scheduled even when checklist items
-- still need attention.
alter type public.mission_status add value if not exists 'scheduled' after 'assigned';
