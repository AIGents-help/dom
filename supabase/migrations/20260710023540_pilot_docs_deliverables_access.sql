-- Fix the broken pilot-read policy on mission_documents (was comparing
-- mission_assignments.job_id directly to mission_documents.mission_request_id,
-- two different ID spaces that could never match) and extend to full
-- read/write for the assigned, accepted pilot.
drop policy if exists "pilots read assigned mission docs" on mission_documents;
drop policy if exists "pilot manages assigned mission docs" on mission_documents;
create policy "pilot manages assigned mission docs" on mission_documents
  for all to authenticated
  using (
    is_admin() or exists (
      select 1 from mission_assignments ma
      join jobs j on j.id = ma.job_id
      join contractors c on c.id = ma.contractor_id
      where j.mission_request_id = mission_documents.mission_request_id
        and c.user_id = auth.uid() and ma.status = 'accepted'
    )
  )
  with check (
    is_admin() or exists (
      select 1 from mission_assignments ma
      join jobs j on j.id = ma.job_id
      join contractors c on c.id = ma.contractor_id
      where j.mission_request_id = mission_documents.mission_request_id
        and c.user_id = auth.uid() and ma.status = 'accepted'
    )
  );

-- New pilot policy on deliverables (previously admin-only)
drop policy if exists "pilot manages own job deliverables" on deliverables;
create policy "pilot manages own job deliverables" on deliverables
  for all to authenticated
  using (
    is_admin() or exists (
      select 1 from mission_assignments ma
      join contractors c on c.id = ma.contractor_id
      where ma.job_id = deliverables.job_id
        and c.user_id = auth.uid() and ma.status = 'accepted'
    )
  )
  with check (
    is_admin() or exists (
      select 1 from mission_assignments ma
      join contractors c on c.id = ma.contractor_id
      where ma.job_id = deliverables.job_id
        and c.user_id = auth.uid() and ma.status = 'accepted'
    )
  );

alter table jobs add column if not exists delivery_responsibility text not null default 'admin'
  check (delivery_responsibility in ('admin', 'pilot'));

-- Extend the existing mission-deliverables Storage policy to also cover the
-- assigned, accepted pilot (path scheme: {job_id}/{timestamp}-{filename}).
drop policy if exists "admin manages mission deliverables" on storage.objects;
create policy "manage mission deliverables" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'mission-deliverables' and (
      is_admin() or exists (
        select 1 from mission_assignments ma
        join contractors c on c.id = ma.contractor_id
        where ma.job_id::text = (storage.foldername(name))[1]
          and c.user_id = auth.uid() and ma.status = 'accepted'
      )
    )
  )
  with check (
    bucket_id = 'mission-deliverables' and (
      is_admin() or exists (
        select 1 from mission_assignments ma
        join contractors c on c.id = ma.contractor_id
        where ma.job_id::text = (storage.foldername(name))[1]
          and c.user_id = auth.uid() and ma.status = 'accepted'
      )
    )
  );

-- New private bucket for Mission Briefing documents (path scheme:
-- {mission_request_id}/{timestamp}-{filename}).
insert into storage.buckets (id, name, public) values ('mission-documents', 'mission-documents', false)
  on conflict (id) do nothing;

drop policy if exists "manage mission documents storage" on storage.objects;
create policy "manage mission documents storage" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'mission-documents' and (
      is_admin() or exists (
        select 1 from mission_assignments ma
        join jobs j on j.id = ma.job_id
        join contractors c on c.id = ma.contractor_id
        where j.mission_request_id::text = (storage.foldername(name))[1]
          and c.user_id = auth.uid() and ma.status = 'accepted'
      )
    )
  )
  with check (
    bucket_id = 'mission-documents' and (
      is_admin() or exists (
        select 1 from mission_assignments ma
        join jobs j on j.id = ma.job_id
        join contractors c on c.id = ma.contractor_id
        where j.mission_request_id::text = (storage.foldername(name))[1]
          and c.user_id = auth.uid() and ma.status = 'accepted'
      )
    )
  );
