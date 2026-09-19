drop policy if exists "admin manages mission deliverables" on storage.objects;
create policy "admin manages mission deliverables" on storage.objects
  for all to authenticated
  using (bucket_id = 'mission-deliverables' and is_admin())
  with check (bucket_id = 'mission-deliverables' and is_admin());
