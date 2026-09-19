-- Auto-create a notification_preferences row (default opt-in) whenever a
-- new client or contractor is created, so review_request / mission_available
-- sends have a preference row to check against from day one — no app-layer
-- backfill needed later.

create or replace function seed_client_notification_pref()
returns trigger as $$
begin
  if NEW.email is not null then
    insert into notification_preferences (email, recipient_type)
    values (NEW.email, 'customer')
    on conflict (email) do nothing;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create or replace function seed_contractor_notification_pref()
returns trigger as $$
begin
  if NEW.email is not null then
    insert into notification_preferences (email, recipient_type)
    values (NEW.email, 'pilot')
    on conflict (email) do nothing;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_seed_client_notification_pref
  after insert on clients
  for each row execute function seed_client_notification_pref();

create trigger trg_seed_contractor_notification_pref
  after insert on contractors
  for each row execute function seed_contractor_notification_pref();