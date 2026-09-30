export type TrackableFinding = {
  findingType: string;
  title: string;
  spatialAnchor?: Record<string, unknown> | null;
  detector?: Record<string, unknown> | null;
};

function slug(value: string, max = 80) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, max);
}

function regionBucket(anchor?: Record<string, unknown> | null) {
  const region = anchor?.imageRegion;
  if (!region || typeof region !== "object") return null;

  const record = region as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;

  const cx = Math.max(0, Math.min(0.999999, x + width / 2));
  const cy = Math.max(0, Math.min(0.999999, y + height / 2));
  const col = Math.min(2, Math.floor(cx * 3));
  const row = Math.min(2, Math.floor(cy * 3));
  return `r${row + 1}c${col + 1}`;
}

export function deriveIssueTrackingKey(input: TrackableFinding) {
  const detectorTrackingKey = input.detector?.trackingKey;
  if (typeof detectorTrackingKey === "string" && detectorTrackingKey.trim()) {
    return slug(detectorTrackingKey, 120);
  }

  const type = slug(input.findingType || "visual_anomaly", 60) || "visual_anomaly";
  const location = regionBucket(input.spatialAnchor);
  const title = slug(input.title, 60);

  return [type, location, title]
    .filter(Boolean)
    .join(":")
    .slice(0, 180);
}

export function severityRank(value: string) {
  switch (value) {
    case "critical": return 5;
    case "high": return 4;
    case "medium": return 3;
    case "low": return 2;
    case "info": return 1;
    default: return 0;
  }
}
