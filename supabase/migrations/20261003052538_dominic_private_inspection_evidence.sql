-- Keep inspection source imagery separate from public pilot profile images.
insert into storage.buckets (id, name, public)
values ('dominic-inspection-evidence', 'dominic-inspection-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists "Users manage own DOMINIC inspection images" on storage.objects;
create policy "Users manage own DOMINIC inspection images"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'dominic-inspection-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'dominic-inspection-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
