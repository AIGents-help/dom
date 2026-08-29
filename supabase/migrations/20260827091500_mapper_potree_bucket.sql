-- Private Storage bucket for Potree 2.x octree derivatives (metadata.json/
-- octree.bin/hierarchy.bin) of a point_cloud deliverable's master LAZ.
-- Deliberately Supabase Storage, not Google Drive, even though the master
-- LAZ itself archives to Drive (see services/mapper-worker/src/googleDrive.ts):
-- the point cloud viewer issues many small, repeated, range-requested reads
-- while panning/loading LOD nodes, and Supabase Storage's signed URLs
-- support HTTP Range natively -- proxying that traffic through a Vercel
-- function per Drive API request would be slow and expensive. The worker
-- uploads here with the service-role client (bypasses RLS); the pilot UI
-- only ever gets short-lived signed URLs minted server-side (see
-- app/api/pilot/mapping/projects/[id]/deliverables/[deliverableId]/potree/
-- route.ts), so no browser-facing RLS policy is required for this bucket to
-- function -- the policy below is defense-in-depth only, matching this
-- repo's existing service-role-table precedent.

insert into storage.buckets (id, name, public)
values ('mapper-potree', 'mapper-potree', false)
on conflict (id) do nothing;

create policy "admins manage mapper potree" on storage.objects
  for all to authenticated using (
    bucket_id = 'mapper-potree' and public.is_admin()
  ) with check (
    bucket_id = 'mapper-potree' and public.is_admin()
  );
