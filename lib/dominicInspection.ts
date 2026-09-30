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
  inspectionType: string;
  objective: string | null;
  sensorModes: string[];
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  equipment: DominicInspectionEquipmentContext | null;
};
