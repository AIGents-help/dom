-- A mapping workspace can be created from a completed flight without a DOM mission.
-- Preserve the job foreign key for projects that are linked to a mission.
ALTER TABLE public.mapping_projects ALTER COLUMN job_id DROP NOT NULL;
COMMENT ON COLUMN public.mapping_projects.job_id IS 'Optional DOM mission link; NULL for imported-flight mapping workspaces.';
