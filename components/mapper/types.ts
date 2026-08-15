// Shared types for components/mapper/*. Re-exports the pure data shapes
// from lib/mapperPipeline.ts and adds the couple of UI-only types that
// don't belong in that framework-free module.

export type {
  MappingProject, MappingImage, MappingProcessingJob,
  MappingProjectStatus, ProcessingJobStatus,
} from "@/lib/mapperPipeline";

export interface EligibleJob {
  id: string;
  title: string;
  service_type: string | null;
  location: string | null;
  scheduled_for: string | null;
  status: string;
}

export interface MappingDeliverable {
  id: string;
  name: string;
  type: string | null;
  storage_url: string | null;
  storage_provider?: string | null;
  external_file_id?: string | null;
  qc_passed: boolean | null;
  delivered_at: string | null;
  created_at: string;
}

export interface MappingEvent {
  id: string;
  mapping_project_id: string;
  actor_type: string;
  actor_id: string | null;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
