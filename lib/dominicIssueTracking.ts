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


function targetLocationBucket(anchor?: Record<string, unknown> | null) {
  const target = anchor?.targetLocation;
  if (!target || typeof target !== "object") return null;

  const record = target as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  // Five decimal places is roughly meter-scale in latitude and gives a stable
  // issue identity across repeat laser-localized inspections without storing
  // full raw coordinates in the key.
  return `geo_${latitude.toFixed(5).replace("-", "m").replace(".", "_")}_${longitude.toFixed(5).replace("-", "m").replace(".", "_")}`;
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
  const type = slug(input.findingType || "visual_anomaly", 60) || "visual_anomaly";
  const targetLocation = targetLocationBucket(input.spatialAnchor);
  const detectorTrackingKey = input.detector?.trackingKey;
  const detectorKey =
    typeof detectorTrackingKey === "string" && detectorTrackingKey.trim()
      ? slug(detectorTrackingKey, 90)
      : null;

  if (targetLocation) {
    return [type, targetLocation, detectorKey]
      .filter(Boolean)
      .join(":")
      .slice(0, 180);
  }

  if (detectorKey) return detectorKey;

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
