-- Trigger-only helper: callers should never invoke this SECURITY DEFINER
-- function directly through the Data API.
revoke all on function public.sync_mapping_project_image_summary() from public, anon, authenticated;
grant execute on function public.sync_mapping_project_image_summary() to service_role;
