export interface ProjectCapturePlan {
  id: string;
  name: string;
  mission_type: string;
  updated_at: string;
}

export interface ProjectInspection {
  id: string;
  asset_id: string;
  asset_name: string;
  capture_plan_id: string | null;
  inspection_type: string;
  objective: string | null;
  status: string;
  summary: string | null;
}

export interface ProjectFinding {
  id: string;
  inspection_id: string;
  title: string;
  severity: string;
  review_status: string;
}

export interface ProjectRecords {
  capturePlans: ProjectCapturePlan[];
  inspections: ProjectInspection[];
  findings: ProjectFinding[];
  recordsError: string | null;
}
