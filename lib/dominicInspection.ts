export type DominicInspectionEquipmentContext = {
  pilotAssetId: string;
  manufacturer: string | null;
  model: string | null;
  displayName: string | null;
  capabilities: string[];
  ready: boolean;
  missingRequired: string[];
};

export type DominicInspectionPlanningContext = {
  inspectionId: string;
  assetId: string;
  assetName: string;
  assetType: string;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  targetLocation?: {
    latitude: number;
    longitude: number;
    altitudeM?: number;
    distanceM?: number;
    source: string;
  } | null;
  repeatCapturePreset?: {
    sourceMediaId: string;
    sourceCapturedAt: string | null;
    cameraSource?: "wide" | "zoom" | null;
    zoomRatio?: number | null;
    focusTarget?: { x: number; y: number } | null;
    aeLocked?: boolean | null;
    relativeAltitudeFt?: number | null;
    headingDeg?: number | null;
    gimbalPitchDeg?: number | null;
  } | null;
  followUpCapture?: {
    findingId: string;
    findingTitle: string;
    estimatedOpticalZoomMultiplier: number;
    focusTarget?: { x: number; y: number } | null;
    reasons: string[];
    guidance: string[];
  } | null;
  inspectionType: string;
  objective: string | null;
  sensorModes: string[];
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  equipment: DominicInspectionEquipmentContext | null;
};
