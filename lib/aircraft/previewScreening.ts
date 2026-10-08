import { PREVIEW_STALE_MS } from "./cameraPreview";

export const PREVIEW_SCREENING_INTERVALS = [5, 10, 30] as const;
export const MAX_AUTOMATIC_PREVIEW_FRAMES = 30;

export type PreviewScreeningBlock = "busy" | "hidden" | "offline" | "disconnected" | "unlinked" | "stale" | "undecoded" | "duplicate" | "limit" | "cadence";

/** Local scheduling only: never authorizes evidence access or sends flight commands. */
export function previewScreeningBlock(input: {
  now: number; receivedAtMs: number | null; connected: boolean; canSave: boolean;
  decoded: boolean; busy: boolean; visible: boolean; online: boolean; duplicate: boolean;
  automatic: boolean; startedFrames: number; lastStartedAt: number; intervalSeconds: number;
}): PreviewScreeningBlock | null {
  if (input.busy) return "busy";
  if (!input.visible) return "hidden";
  if (!input.online) return "offline";
  if (!input.connected) return "disconnected";
  if (!input.canSave) return "unlinked";
  if (input.receivedAtMs === null || !Number.isFinite(input.receivedAtMs) || input.now < input.receivedAtMs || input.now - input.receivedAtMs > PREVIEW_STALE_MS) return "stale";
  if (!input.decoded) return "undecoded";
  if (input.duplicate) return "duplicate";
  if (input.automatic) {
    if (input.startedFrames >= MAX_AUTOMATIC_PREVIEW_FRAMES) return "limit";
    // Invalid settings cannot bypass the minimum cadence.
    const interval = PREVIEW_SCREENING_INTERVALS.includes(input.intervalSeconds as 5 | 10 | 30) ? input.intervalSeconds : 30;
    if (input.now - input.lastStartedAt < interval * 1000) return "cadence";
  }
  return null;
}

export const PREVIEW_SCREENING_BLOCK_LABELS: Record<PreviewScreeningBlock, string> = {
  busy: "Waiting for the current save and screening job",
  hidden: "Paused while this tab is hidden",
  offline: "Paused — internet connection unavailable",
  disconnected: "Paused — aircraft disconnected",
  unlinked: "Select an asset and inspection before saving evidence",
  stale: "Paused — waiting for a current camera frame",
  undecoded: "Waiting for a decoded camera frame",
  duplicate: "Waiting for a new camera frame",
  limit: "Run limit reached — stop and restart to approve another 30 frames",
  cadence: "Waiting for the selected sampling interval",
};
