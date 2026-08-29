// Mirrors the ODM_STAGE_BREAKPOINTS heuristic in the main app's
// lib/mapperPipeline.ts (PROCESSING_STAGES/odmProgressToStage) — duplicated
// rather than imported across the package boundary, same as this worker
// already duplicates its own Supabase client setup instead of reaching into
// the Next.js app's lib/. Keep the two lists in sync by hand if either
// changes; both are covered by lib/mapperPipeline.test.ts on the app side.

export type ProcessingStage =
  | "Preparing Images"
  | "Reading Metadata"
  | "Uploading to Processor"
  | "Feature Matching"
  | "Camera Alignment"
  | "Building Point Cloud"
  | "Generating Surface"
  | "Building 3D Model"
  | "Generating Orthomosaic"
  | "Preparing Deliverables"
  | "Complete";

const ODM_STAGE_BREAKPOINTS: { upTo: number; stage: ProcessingStage }[] = [
  { upTo: 20, stage: "Feature Matching" },
  { upTo: 40, stage: "Camera Alignment" },
  { upTo: 60, stage: "Building Point Cloud" },
  { upTo: 75, stage: "Generating Surface" },
  { upTo: 85, stage: "Building 3D Model" },
  { upTo: 100, stage: "Generating Orthomosaic" },
];

export function odmProgressToStage(odmProgress: number): ProcessingStage {
  const clamped = Math.max(0, Math.min(100, odmProgress));
  return ODM_STAGE_BREAKPOINTS.find((b) => clamped <= b.upTo)?.stage ?? "Generating Orthomosaic";
}
