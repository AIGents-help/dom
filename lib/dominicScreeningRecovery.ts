export type ScreeningJob = {
  media_id: string;
  status: "processing" | "succeeded" | "failed";
  lease_expires_at: string;
  attempt_count: number;
  last_error: string | null;
};

export function screeningRecoveryState(job: ScreeningJob | undefined, now: number) {
  if (!job) return { label: "Run AI Screening", active: false, completed: false, note: "" };
  if (job.status === "succeeded") return { label: "Screened", active: false, completed: true, note: "Saved results · human review required" };
  if (job.status === "failed") return { label: "Retry screening", active: false, completed: false, note: job.last_error || "Screening failed. Saved evidence is available." };
  if (Date.parse(job.lease_expires_at) > now) return { label: "Screening…", active: true, completed: false, note: `Attempt ${job.attempt_count} is running. Results refresh automatically.` };
  return { label: "Retry interrupted screening", active: false, completed: false, note: "The previous attempt expired. Retry this saved image when ready." };
}
