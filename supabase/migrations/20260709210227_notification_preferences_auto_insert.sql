create or replace function public.create_notification_preferences_for_client()
returns trigger language plpgsql as $$
begin
  if new.email is not null then
    insert into notification_preferences (email, recipient_type)
    values (new.email, 'customer')
    on conflict (email) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_notification_preferences on clients;
create trigger trg_client_notification_preferences
  after insert on clients
  for each row execute function create_notification_preferences_for_client();

create or replace function public.create_notification_preferences_for_contractor()
returns trigger language plpgsql as $$
begin
  if new.email is not null then
    insert into notification_preferences (email, recipient_type)
    values (new.email, 'pilot')
    on conflict (email) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contractor_notification_preferences on contractors;
create trigger trg_contractor_notification_preferences
  after insert on contractors
  for each row execute function create_notification_preferences_for_contractor();
