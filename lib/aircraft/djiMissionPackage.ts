export const DOMINIC_DJI_MISSION_SCHEMA = "dominic.dji-mission.v1" as const;

export type DominicDjiMissionCheckpoint = {
  id: string;
  sequence: number;
  latitude: number;
  longitude: number;
  relativeAltitudeM: number;
  gimbalPitchDeg: number;
  takePhoto: boolean;
};

export type DominicDjiMissionPackage = {
  schema: typeof DOMINIC_DJI_MISSION_SCHEMA;
  name: string;
  createdAt: string;
  missionType: string;
  center: {
    latitude: number;
    longitude: number;
  };
  flight: {
    heightMode: "relativeToStartPoint";
    finishAction: "goHome";
    rcLostAction: "goHome";
    cruiseSpeedMps: number;
  };
  checkpoints: DominicDjiMissionCheckpoint[];
};

export function buildDominicDjiMissionPackage(input: {
  name: string;
  missionType: string;
  centerLatitude: number;
  centerLongitude: number;
  cruiseSpeedMps?: number;
  checkpoints: Array<{
    id: string;
    sequence: number;
    latitude: number;
    longitude: number;
    relativeAltitudeFt: number;
    cameraAngle: number;
  }>;
}): DominicDjiMissionPackage {
  return {
    schema: DOMINIC_DJI_MISSION_SCHEMA,
    name: input.name.trim() || "DOMINIC Mission",
    createdAt: new Date().toISOString(),
    missionType: input.missionType,
    center: {
      latitude: input.centerLatitude,
      longitude: input.centerLongitude,
    },
    flight: {
      heightMode: "relativeToStartPoint",
      finishAction: "goHome",
      rcLostAction: "goHome",
      cruiseSpeedMps: input.cruiseSpeedMps ?? 5,
    },
    checkpoints: input.checkpoints.map((checkpoint, index) => ({
      id: checkpoint.id,
      sequence: Number.isFinite(checkpoint.sequence) ? checkpoint.sequence : index + 1,
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      relativeAltitudeM: checkpoint.relativeAltitudeFt * 0.3048,
      gimbalPitchDeg: checkpoint.cameraAngle,
      takePhoto: true,
    })),
  };
}

export function downloadDominicDjiMissionPackage(
  mission: DominicDjiMissionPackage,
) {
  const safeName = mission.name
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "dominic-mission";

  const blob = new Blob([JSON.stringify(mission, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName}.dominic-dji.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
