export type PayloadKind =
  | "rgb"
  | "thermal"
  | "multispectral"
  | "lidar"
  | "zoom"
  | "other";

export type CameraPayloadProfile = {
  id: string;
  name: string;
  kind: PayloadKind;
  sensorWidthMm?: number;
  sensorHeightMm?: number;
  focalLengthMm?: number;
  horizontalFovDeg?: number;
  verticalFovDeg?: number;
  imageWidthPx?: number;
  imageHeightPx?: number;
  supportsPhoto: boolean;
  supportsVideo: boolean;
  supportsGimbalPitch: boolean;
  supportsGimbalYaw?: boolean;
  supportsZoom?: boolean;
  minZoom?: number;
  maxZoom?: number;
};

export function deriveFieldOfView(profile: CameraPayloadProfile) {
  let horizontalFovDeg = profile.horizontalFovDeg;
  let verticalFovDeg = profile.verticalFovDeg;

  if (
    (!horizontalFovDeg || !verticalFovDeg) &&
    profile.sensorWidthMm &&
    profile.sensorHeightMm &&
    profile.focalLengthMm
  ) {
    horizontalFovDeg =
      horizontalFovDeg ??
      (2 * Math.atan(profile.sensorWidthMm / (2 * profile.focalLengthMm)) * 180) / Math.PI;
    verticalFovDeg =
      verticalFovDeg ??
      (2 * Math.atan(profile.sensorHeightMm / (2 * profile.focalLengthMm)) * 180) / Math.PI;
  }

  return {
    horizontalFovDeg: horizontalFovDeg ?? null,
    verticalFovDeg: verticalFovDeg ?? null,
  };
}

export function isPhotogrammetryPayload(profile: CameraPayloadProfile) {
  return (
    profile.supportsPhoto &&
    (profile.kind === "rgb" ||
      profile.kind === "multispectral" ||
      profile.kind === "zoom") &&
    deriveFieldOfView(profile).horizontalFovDeg !== null
  );
}

export const genericWideRgbPayload: CameraPayloadProfile = {
  id: "generic-wide-rgb",
  name: "Generic Wide RGB Camera",
  kind: "rgb",
  horizontalFovDeg: 84,
  verticalFovDeg: 60,
  supportsPhoto: true,
  supportsVideo: true,
  supportsGimbalPitch: true,
  supportsGimbalYaw: true,
};
