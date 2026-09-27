export type CaptureCameraProfile = {
  id: string;
  label: string;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  sourceUrl: string;
  mappingRecommended: boolean;
};

const verticalFovForAspect = (horizontalFovDeg: number, width: number, height: number) => {
  const horizontalRad = horizontalFovDeg * Math.PI / 180;
  return 2 * Math.atan(Math.tan(horizontalRad / 2) * (height / width)) * 180 / Math.PI;
};

const enterprise43 = (id: string, label: string, horizontalFovDeg: number, sourceUrl: string): CaptureCameraProfile => ({
  id,
  label,
  horizontalFovDeg,
  verticalFovDeg: Number(verticalFovForAspect(horizontalFovDeg, 4, 3).toFixed(1)),
  sourceUrl,
  mappingRecommended: true,
});

// Optics are intentionally limited to models for which DOM has an authoritative
// built-in wide-camera profile. Payload-dependent airframes (M300/M350, etc.)
// remain manual because their field of view depends on the installed camera.
const CAPTURE_CAMERA_PROFILES: Array<{ match: RegExp; profile: CaptureCameraProfile }> = [
  {
    match: /\b(matrice\s*4e|m4e)\b/i,
    profile: enterprise43(
      "dji-matrice-4e-wide",
      "DJI Matrice 4E · Wide camera",
      84,
      "https://enterprise.dji.com/matrice-4-series/specs",
    ),
  },
  {
    match: /\b(matrice\s*4t|m4t)\b/i,
    profile: enterprise43(
      "dji-matrice-4t-wide",
      "DJI Matrice 4T · Wide camera",
      82,
      "https://enterprise.dji.com/matrice-4-series/specs",
    ),
  },
  {
    match: /\b(mavic\s*3\s*(enterprise|e)|m3e)\b/i,
    profile: enterprise43(
      "dji-mavic-3e-wide",
      "DJI Mavic 3E · Wide camera",
      84,
      "https://enterprise.dji.com/mavic-3-enterprise/specs",
    ),
  },
  {
    match: /\b(mavic\s*3\s*(thermal|t|ta)|m3t|m3ta)\b/i,
    profile: enterprise43(
      "dji-mavic-3t-wide",
      "DJI Mavic 3T/3TA · Wide camera",
      84,
      "https://enterprise.dji.com/mavic-3-enterprise/specs",
    ),
  },
];

export function resolveCaptureCameraProfile(input: {
  manufacturer?: string | null;
  model?: string | null;
  display_name?: string | null;
}): CaptureCameraProfile | null {
  const identity = [input.manufacturer, input.model, input.display_name]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!identity) return null;
  return CAPTURE_CAMERA_PROFILES.find(({ match }) => match.test(identity))?.profile ?? null;
}

export function deriveVerticalFovDeg(horizontalFovDeg: number, aspectWidth = 4, aspectHeight = 3) {
  if (!Number.isFinite(horizontalFovDeg) || horizontalFovDeg <= 0 || horizontalFovDeg >= 180) return null;
  if (!Number.isFinite(aspectWidth) || !Number.isFinite(aspectHeight) || aspectWidth <= 0 || aspectHeight <= 0) return null;
  return verticalFovForAspect(horizontalFovDeg, aspectWidth, aspectHeight);
}
