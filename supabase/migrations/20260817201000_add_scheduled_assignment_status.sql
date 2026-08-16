-- Pilot-facing lifecycle must represent the date milestone directly.
alter type public.assignment_status add value if not exists 'scheduled' after 'accepted';
