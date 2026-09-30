export const INSPECTION_CAPABILITIES = {
  rgbImagery: "rgb_imagery",
  video: "video",
  liveVideo: "live_video",
  mappingPhotogrammetry: "mapping_photogrammetry",
  zoomInspection: "zoom_inspection",
  mechanicalShutter: "mechanical_shutter",
  laserRangefinder: "laser_rangefinder",
  rtk: "rtk",
  obstacleAvoidance: "obstacle_avoidance",
  radiometricThermal: "thermal_radiometric",
  thermalSpotMeter: "thermal_spot_meter",
  thermalAreaMeter: "thermal_area_meter",
  lidar: "lidar",
  gasDetection: "gas_detection",
  multispectral: "multispectral",
  psdkPayload: "psdk_payload",
  onboardCompute: "onboard_compute",
  dockAutomation: "dock_automation",
} as const;

export type KnownInspectionCapabilityId =
  (typeof INSPECTION_CAPABILITIES)[keyof typeof INSPECTION_CAPABILITIES];

export type InspectionCapabilityId =
  | KnownInspectionCapabilityId
  | (string & {});

export type InspectionType =
  | "visual"
  | "thermal"
  | "ldar"
  | "roof"
  | "construction"
  | "stockpile"
  | "security"
  | "mapping";

export type CapabilitySource = "catalog" | "inventory" | "bridge" | "payload";

export type CapabilityEvidence = {
  capability: InspectionCapabilityId;
  source: CapabilitySource;
  detail?: string;
};

export type AircraftInspectionIdentity = {
  manufacturer?: string | null;
  model?: string | null;
  displayName?: string | null;
};

export type InspectionRequirements = {
  required: InspectionCapabilityId[];
  optional: InspectionCapabilityId[];
};

export type InspectionReadiness = {
  ready: boolean;
  required: InspectionCapabilityId[];
  optional: InspectionCapabilityId[];
  available: InspectionCapabilityId[];
  missingRequired: InspectionCapabilityId[];
  availableOptional: InspectionCapabilityId[];
  evidence: CapabilityEvidence[];
};

const LEGACY_CAPABILITY_MAP: Record<string, InspectionCapabilityId> = {
  thermal: INSPECTION_CAPABILITIES.radiometricThermal,
  thermal_imaging: INSPECTION_CAPABILITIES.radiometricThermal,
  radiometric_thermal: INSPECTION_CAPABILITIES.radiometricThermal,
  zoom: INSPECTION_CAPABILITIES.zoomInspection,
  rangefinder: INSPECTION_CAPABILITIES.laserRangefinder,
  photogrammetry: INSPECTION_CAPABILITIES.mappingPhotogrammetry,
  rgb: INSPECTION_CAPABILITIES.rgbImagery,
  gas: INSPECTION_CAPABILITIES.gasDetection,
};

export const inspectionRequirements: Record<InspectionType, InspectionRequirements> = {
  visual: {
    required: [INSPECTION_CAPABILITIES.rgbImagery],
    optional: [
      INSPECTION_CAPABILITIES.zoomInspection,
      INSPECTION_CAPABILITIES.laserRangefinder,
      INSPECTION_CAPABILITIES.liveVideo,
    ],
  },
  thermal: {
    required: [INSPECTION_CAPABILITIES.radiometricThermal],
    optional: [
      INSPECTION_CAPABILITIES.rgbImagery,
      INSPECTION_CAPABILITIES.thermalSpotMeter,
      INSPECTION_CAPABILITIES.thermalAreaMeter,
      INSPECTION_CAPABILITIES.laserRangefinder,
      INSPECTION_CAPABILITIES.liveVideo,
    ],
  },
  ldar: {
    required: [INSPECTION_CAPABILITIES.gasDetection],
    optional: [
      INSPECTION_CAPABILITIES.rgbImagery,
      INSPECTION_CAPABILITIES.zoomInspection,
      INSPECTION_CAPABILITIES.laserRangefinder,
      INSPECTION_CAPABILITIES.liveVideo,
    ],
  },
  roof: {
    required: [INSPECTION_CAPABILITIES.rgbImagery],
    optional: [
      INSPECTION_CAPABILITIES.mappingPhotogrammetry,
      INSPECTION_CAPABILITIES.radiometricThermal,
      INSPECTION_CAPABILITIES.zoomInspection,
      INSPECTION_CAPABILITIES.rtk,
    ],
  },
  construction: {
    required: [INSPECTION_CAPABILITIES.rgbImagery],
    optional: [
      INSPECTION_CAPABILITIES.mappingPhotogrammetry,
      INSPECTION_CAPABILITIES.rtk,
      INSPECTION_CAPABILITIES.laserRangefinder,
      INSPECTION_CAPABILITIES.zoomInspection,
    ],
  },
  stockpile: {
    required: [INSPECTION_CAPABILITIES.mappingPhotogrammetry],
    optional: [
      INSPECTION_CAPABILITIES.rtk,
      INSPECTION_CAPABILITIES.laserRangefinder,
    ],
  },
  security: {
    required: [INSPECTION_CAPABILITIES.rgbImagery],
    optional: [
      INSPECTION_CAPABILITIES.liveVideo,
      INSPECTION_CAPABILITIES.zoomInspection,
      INSPECTION_CAPABILITIES.radiometricThermal,
    ],
  },
  mapping: {
    required: [INSPECTION_CAPABILITIES.mappingPhotogrammetry],
    optional: [
      INSPECTION_CAPABILITIES.rtk,
      INSPECTION_CAPABILITIES.mechanicalShutter,
    ],
  },
};

type CatalogProfile = {
  id: string;
  match: RegExp;
  capabilities: InspectionCapabilityId[];
  notes?: Partial<Record<InspectionCapabilityId, string>>;
};

const DJI_MATRICE_4_COMMON: InspectionCapabilityId[] = [
  INSPECTION_CAPABILITIES.rgbImagery,
  INSPECTION_CAPABILITIES.video,
  INSPECTION_CAPABILITIES.liveVideo,
  INSPECTION_CAPABILITIES.zoomInspection,
  INSPECTION_CAPABILITIES.laserRangefinder,
  INSPECTION_CAPABILITIES.rtk,
  INSPECTION_CAPABILITIES.obstacleAvoidance,
  INSPECTION_CAPABILITIES.psdkPayload,
];

const CATALOG: CatalogProfile[] = [
  {
    id: "dji-matrice-4e",
    match: /\b(matrice\s*4e|m4e)\b/i,
    capabilities: [
      ...DJI_MATRICE_4_COMMON,
      INSPECTION_CAPABILITIES.mappingPhotogrammetry,
      INSPECTION_CAPABILITIES.mechanicalShutter,
    ],
    notes: {
      [INSPECTION_CAPABILITIES.mappingPhotogrammetry]:
        "20 MP 4/3 wide camera with mechanical shutter is suitable for mapping workflows.",
      [INSPECTION_CAPABILITIES.zoomInspection]:
        "Includes medium tele and telephoto cameras for close visual inspection.",
      [INSPECTION_CAPABILITIES.laserRangefinder]:
        "Built-in laser rangefinding module is available.",
      [INSPECTION_CAPABILITIES.rtk]:
        "Aircraft platform supports RTK positioning.",
    },
  },
  {
    id: "dji-matrice-4t",
    match: /\b(matrice\s*4t|m4t)\b/i,
    capabilities: [
      ...DJI_MATRICE_4_COMMON,
      INSPECTION_CAPABILITIES.radiometricThermal,
      INSPECTION_CAPABILITIES.thermalSpotMeter,
      INSPECTION_CAPABILITIES.thermalAreaMeter,
    ],
    notes: {
      [INSPECTION_CAPABILITIES.radiometricThermal]:
        "Integrated thermal imager supports temperature measurement workflows.",
      [INSPECTION_CAPABILITIES.thermalSpotMeter]:
        "Integrated thermal camera supports spot temperature measurement.",
      [INSPECTION_CAPABILITIES.thermalAreaMeter]:
        "Integrated thermal camera supports area temperature measurement.",
    },
  },
  {
    id: "dji-matrice-300",
    match: /\b(matrice\s*300|m300)\b/i,
    capabilities: [
      INSPECTION_CAPABILITIES.rtk,
      INSPECTION_CAPABILITIES.obstacleAvoidance,
      INSPECTION_CAPABILITIES.psdkPayload,
    ],
    notes: {
      [INSPECTION_CAPABILITIES.psdkPayload]:
        "Camera/sensor capability is payload-dependent on this aircraft.",
    },
  },
  {
    id: "dji-matrice-350",
    match: /\b(matrice\s*350|m350)\b/i,
    capabilities: [
      INSPECTION_CAPABILITIES.rtk,
      INSPECTION_CAPABILITIES.obstacleAvoidance,
      INSPECTION_CAPABILITIES.psdkPayload,
    ],
    notes: {
      [INSPECTION_CAPABILITIES.psdkPayload]:
        "Camera/sensor capability is payload-dependent on this aircraft.",
    },
  },
];

function normalizeIdentity(input: AircraftInspectionIdentity) {
  return [input.manufacturer, input.model, input.displayName]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInspectionCapability(value: string): InspectionCapabilityId | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  const canonical = Object.values(INSPECTION_CAPABILITIES).find((item) => item === normalized);
  if (canonical) return canonical;
  return LEGACY_CAPABILITY_MAP[normalized] ?? normalized;
}

export function resolveCatalogCapabilities(
  identity: AircraftInspectionIdentity,
): CapabilityEvidence[] {
  const text = normalizeIdentity(identity);
  if (!text) return [];
  const profile = CATALOG.find((candidate) => candidate.match.test(text));
  if (!profile) return [];
  return profile.capabilities.map((capability) => ({
    capability,
    source: "catalog" as const,
    detail: profile.notes?.[capability],
  }));
}

export function mergeInspectionCapabilities(input: {
  identity?: AircraftInspectionIdentity;
  inventoryCapabilities?: string[];
  bridgeCapabilities?: string[];
  payloadCapabilities?: string[];
}) {
  const evidence: CapabilityEvidence[] = [];
  if (input.identity) evidence.push(...resolveCatalogCapabilities(input.identity));

  const append = (values: string[] | undefined, source: CapabilitySource) => {
    for (const value of values ?? []) {
      const capability = normalizeInspectionCapability(value);
      if (!capability) continue;
      evidence.push({ capability, source });
    }
  };

  append(input.inventoryCapabilities, "inventory");
  append(input.bridgeCapabilities, "bridge");
  append(input.payloadCapabilities, "payload");

  const byCapability = new Map<InspectionCapabilityId, CapabilityEvidence>();
  for (const item of evidence) {
    const existing = byCapability.get(item.capability);
    if (!existing || existing.source === "catalog") {
      byCapability.set(item.capability, item);
    }
  }

  return Array.from(byCapability.values());
}

export function evaluateInspectionReadiness(input: {
  inspectionType: InspectionType;
  capabilities: CapabilityEvidence[];
}): InspectionReadiness {
  const requirements = inspectionRequirements[input.inspectionType];
  const availableSet = new Set(input.capabilities.map((item) => item.capability));
  const available = Array.from(availableSet);

  return {
    ready: requirements.required.every((capability) => availableSet.has(capability)),
    required: requirements.required,
    optional: requirements.optional,
    available,
    missingRequired: requirements.required.filter((capability) => !availableSet.has(capability)),
    availableOptional: requirements.optional.filter((capability) => availableSet.has(capability)),
    evidence: input.capabilities,
  };
}

export function inspectionCapabilityLabel(capability: InspectionCapabilityId) {
  const labels: Partial<Record<InspectionCapabilityId, string>> = {
    [INSPECTION_CAPABILITIES.rgbImagery]: "RGB imagery",
    [INSPECTION_CAPABILITIES.video]: "video",
    [INSPECTION_CAPABILITIES.liveVideo]: "live video",
    [INSPECTION_CAPABILITIES.mappingPhotogrammetry]: "mapping / photogrammetry",
    [INSPECTION_CAPABILITIES.zoomInspection]: "telephoto / zoom inspection",
    [INSPECTION_CAPABILITIES.mechanicalShutter]: "mechanical shutter",
    [INSPECTION_CAPABILITIES.laserRangefinder]: "laser rangefinder",
    [INSPECTION_CAPABILITIES.rtk]: "RTK",
    [INSPECTION_CAPABILITIES.obstacleAvoidance]: "obstacle sensing",
    [INSPECTION_CAPABILITIES.radiometricThermal]: "radiometric thermal",
    [INSPECTION_CAPABILITIES.thermalSpotMeter]: "thermal spot meter",
    [INSPECTION_CAPABILITIES.thermalAreaMeter]: "thermal area measurement",
    [INSPECTION_CAPABILITIES.lidar]: "LiDAR",
    [INSPECTION_CAPABILITIES.gasDetection]: "gas / LDAR sensor",
    [INSPECTION_CAPABILITIES.multispectral]: "multispectral",
    [INSPECTION_CAPABILITIES.psdkPayload]: "payload SDK support",
    [INSPECTION_CAPABILITIES.onboardCompute]: "onboard compute",
    [INSPECTION_CAPABILITIES.dockAutomation]: "dock automation",
  };
  return labels[capability] ?? capability.replaceAll("_", " ");
}
