insert into storage.buckets (id, name, public)
values ('mapper-potree', 'mapper-potree', false)
on conflict (id) do nothing;

create policy "admins manage mapper potree" on storage.objects
  for all to authenticated using (
    bucket_id = 'mapper-potree' and public.is_admin()
  ) with check (
    bucket_id = 'mapper-potree' and public.is_admin()
  );
