import type { RangefinderTarget } from "@/lib/aircraft/contract";

export type NormalizedImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function matchRangefinderTargetToCapture(
  target: RangefinderTarget | undefined,
  capturedAtMs: number,
  maxDeltaMs = 2500,
): RangefinderTarget | null {
  if (!target) return null;
  if (
    !Number.isFinite(target.latitude) ||
    !Number.isFinite(target.longitude) ||
    target.latitude < -90 ||
    target.latitude > 90 ||
    target.longitude < -180 ||
    target.longitude > 180
  ) {
    return null;
  }
  if (!Number.isFinite(target.updatedAtMs)) return null;
  if (Math.abs(capturedAtMs - target.updatedAtMs) > maxDeltaMs) return null;
  if (
    target.distanceM !== undefined &&
    (!Number.isFinite(target.distanceM) || target.distanceM < 3)
  ) {
    return null;
  }
  return { ...target };
}

export function rangefinderTargetMatchesRegion(
  target: Pick<RangefinderTarget, "screenX" | "screenY">,
  region: NormalizedImageRegion,
  margin = 0.03,
) {
  if (
    target.screenX === undefined ||
    target.screenY === undefined ||
    !Number.isFinite(target.screenX) ||
    !Number.isFinite(target.screenY)
  ) {
    return false;
  }

  const px = target.screenX / 100;
  const py = target.screenY / 100;
  const left = Math.max(0, region.x - margin);
  const top = Math.max(0, region.y - margin);
  const right = Math.min(1, region.x + region.width + margin);
  const bottom = Math.min(1, region.y + region.height + margin);

  return px >= left && px <= right && py >= top && py <= bottom;
}

export function readStoredRangefinderTarget(
  metadata: unknown,
): RangefinderTarget | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).rangefinderTarget;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const updatedAtMs = Number(record.updatedAtMs);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(updatedAtMs)
  ) {
    return null;
  }

  const optionalNumber = (key: string) => {
    const value = record[key];
    if (value === null || value === undefined || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  };

  return {
    latitude,
    longitude,
    altitudeM: optionalNumber("altitudeM"),
    distanceM: optionalNumber("distanceM"),
    screenX: optionalNumber("screenX"),
    screenY: optionalNumber("screenY"),
    status: typeof record.status === "string" ? record.status : undefined,
    updatedAtMs,
  };
}
