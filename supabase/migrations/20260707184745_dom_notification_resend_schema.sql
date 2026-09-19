create type email_notification_type as enum (
  'booking_confirmation',
  'mission_reminder_24h',
  'mission_in_progress',
  'mission_completed',
  'deliverable_ready',
  'invoice_sent',
  'payment_received',
  'mission_rescheduled',
  'review_request',
  'mission_available',
  'mission_assigned',
  'mission_briefing_ready',
  'pilot_mission_reminder_24h',
  'deliverable_submission_reminder',
  'payout_initiated',
  'payout_completed',
  'certification_expiring',
  'admin_new_booking',
  'admin_deliverable_submitted',
  'admin_payment_failed'
);

create type notification_recipient_type as enum ('customer', 'pilot', 'admin');
create type notification_status as enum ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed');

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid references mission_requests(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  assignment_id uuid references mission_assignments(id) on delete set null,
  recipient_type notification_recipient_type not null,
  recipient_email text not null,
  recipient_entity_id uuid,
  email_type email_notification_type not null,
  resend_message_id text unique,
  status notification_status not null default 'queued',
  subject text not null,
  metadata jsonb default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notification_log_mission_request on notification_log(mission_request_id);
create index idx_notification_log_job on notification_log(job_id);
create index idx_notification_log_recipient on notification_log(recipient_email);
create index idx_notification_log_type_status on notification_log(email_type, status);

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  recipient_type notification_recipient_type not null,
  marketing_opt_in boolean not null default true,
  mission_broadcast_opt_in boolean not null default true,
  sms_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

create table resend_webhook_events (
  id uuid primary key default gen_random_uuid(),
  resend_message_id text,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index idx_resend_webhook_message on resend_webhook_events(resend_message_id);

alter table notification_log enable row level security;
alter table notification_preferences enable row level security;
alter table resend_webhook_events enable row level security;

create policy "admin full access - notification_log"
  on notification_log for all
  using (is_admin());

create policy "admin full access - notification_preferences"
  on notification_preferences for all
  using (is_admin());

create policy "admin full access - resend_webhook_events"
  on resend_webhook_events for all
  using (is_admin());