export type PayloadKind =
  | "rgb"
  | "thermal"
  | "multispectral"
  | "lidar"
  | "other";

export type CameraPayloadProfile = {
  id: string;
  label: string;
  kind: PayloadKind;
  imageWidthPx?: number;
  imageHeightPx?: number;
  sensorWidthMm?: number;
  sensorHeightMm?: number;
  focalLengthMm?: number;
  horizontalFovDeg?: number;
  verticalFovDeg?: number;
  supportsPhoto: boolean;
  supportsVideo: boolean;
  zoomMin?: number;
  zoomMax?: number;
};

export type PayloadGeometry = {
  horizontalFovDeg: number;
  verticalFovDeg?: number;
  imageWidthPx?: number;
  imageHeightPx?: number;
};

export function calculateFovDeg(sensorSizeMm: number, focalLengthMm: number) {
  if (!Number.isFinite(sensorSizeMm) || sensorSizeMm <= 0) {
    throw new Error("Sensor size must be greater than zero.");
  }
  if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) {
    throw new Error("Focal length must be greater than zero.");
  }
  return (2 * Math.atan(sensorSizeMm / (2 * focalLengthMm)) * 180) / Math.PI;
}

export function resolvePayloadGeometry(
  profile: CameraPayloadProfile,
  fallbackHorizontalFovDeg = 84,
): PayloadGeometry {
  const horizontalFovDeg =
    profile.horizontalFovDeg ??
    (profile.sensorWidthMm && profile.focalLengthMm
      ? calculateFovDeg(profile.sensorWidthMm, profile.focalLengthMm)
      : fallbackHorizontalFovDeg);

  const verticalFovDeg =
    profile.verticalFovDeg ??
    (profile.sensorHeightMm && profile.focalLengthMm
      ? calculateFovDeg(profile.sensorHeightMm, profile.focalLengthMm)
      : undefined);

  return {
    horizontalFovDeg,
    verticalFovDeg,
    imageWidthPx: profile.imageWidthPx,
    imageHeightPx: profile.imageHeightPx,
  };
}

export function payloadFootprintWidthFt(
  distanceFt: number,
  profile: CameraPayloadProfile,
) {
  if (!Number.isFinite(distanceFt) || distanceFt <= 0) {
    throw new Error("Capture distance must be greater than zero.");
  }
  const geometry = resolvePayloadGeometry(profile);
  return 2 * distanceFt * Math.tan((geometry.horizontalFovDeg * Math.PI) / 360);
}

export function payloadGroundSampleDistanceInchesPerPixel(
  distanceFt: number,
  profile: CameraPayloadProfile,
) {
  const geometry = resolvePayloadGeometry(profile);
  if (!geometry.imageWidthPx || geometry.imageWidthPx <= 0) return null;
  const footprintFt = payloadFootprintWidthFt(distanceFt, profile);
  return (footprintFt * 12) / geometry.imageWidthPx;
}

export const genericRgbPayload: CameraPayloadProfile = {
  id: "generic-rgb",
  label: "Generic RGB Camera",
  kind: "rgb",
  horizontalFovDeg: 84,
  supportsPhoto: true,
  supportsVideo: true,
};
