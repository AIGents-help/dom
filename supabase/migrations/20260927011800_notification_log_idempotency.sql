alter table public.notification_log
  add column if not exists idempotency_key text;

create unique index if not exists notification_log_idempotency_key_uidx
  on public.notification_log(idempotency_key)
  where idempotency_key is not null;

comment on column public.notification_log.idempotency_key is
  'Stable application-level notification key. Repeated sends with the same key reuse one log record and one Resend idempotency key.';
