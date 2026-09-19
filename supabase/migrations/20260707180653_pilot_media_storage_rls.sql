drop policy if exists "pilot manages own media" on storage.objects;
create policy "pilot manages own media" on storage.objects
  for all to authenticated
  using (bucket_id = 'pilot-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pilot-media' and (storage.foldername(name))[1] = auth.uid()::text);
