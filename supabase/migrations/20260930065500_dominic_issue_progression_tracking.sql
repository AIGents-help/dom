alter table public.dominic_issues
  add column if not exists issue_key text;

create index if not exists dominic_issues_tracking_idx
  on public.dominic_issues(user_id, asset_id, issue_key, last_seen_at desc)
  where issue_key is not null;
