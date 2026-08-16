export interface GuidanceSection { title: string; items: string[]; }

export function equipmentChoices(equipment: string | null | undefined): string[] {
  return Array.from(new Set((equipment ?? "").split(/[\n,;|]+/).map((item) => item.trim()).filter(Boolean)));
}

export function missionEquipmentGuidance(serviceType: string, aircraft: string): GuidanceSection[] {
  const mission = serviceType.toLowerCase();
  const uav = aircraft.toLowerCase();
  const mapping = /mapping|survey|construction|orthomosaic/.test(mission);
  const inspection = /inspection|roof|powerline|utility|solar|infrastructure/.test(mission);
  const media = /media|real_estate|photo|video/.test(mission);
  const thermal = /thermal|4t|mavic 3t|h20t|m30t/.test(`${mission} ${uav}`);
  const mechanicalShutter = /matrice 4e|mavic 3e|phantom 4 rtk/.test(uav);

  const sections: GuidanceSection[] = [{
    title: "Aircraft-specific preflight",
    items: [
      `Confirm ${aircraft} firmware, batteries, storage, props, compass/GNSS health, Remote ID, and controller maps before departure.`,
      "Confirm payload, lens, focus behavior, obstacle sensing, RTH altitude, and lost-link action for this site.",
      "Use the manufacturer limits and current conditions as the final authority; these are mission-planning starting points, not automatic flight authorization.",
    ],
  }];

  if (mapping) sections.push({
    title: "Mapping capture starting settings",
    items: [
      "Plan a consistent grid; begin around 75–80% front overlap and 70–75% side overlap, then increase for tall structures, vegetation, or weak surface texture.",
      "Use nadir gimbal (-90°) for the primary orthomosaic. Add an oblique orbit/cross-grid only when the deliverable requires façades or a 3D model.",
      `Use fixed exposure and fixed white balance once lighting is stable.${mechanicalShutter ? " Enable the mechanical shutter for mapping when supported." : " Keep speed conservative enough to prevent rolling-shutter blur."}`,
      "Set altitude from the required GSD, legal limits, obstacles, and site relief—not from a universal preset. Verify the calculated GSD in the mission planner.",
      "Target sharp frames with a fast shutter (commonly 1/800s or faster in daylight), low ISO, infinity/manual focus after verification, and no digital zoom.",
    ],
  });

  if (inspection) sections.push({
    title: "Inspection capture starting settings",
    items: [
      "Capture establishing views first, then systematic medium and detail views. Maintain a repeatable stand-off distance and record every anomaly from multiple angles.",
      "Use manual exposure/white balance where practical, preserve original files and metadata, and avoid digital zoom when optical movement can provide the detail safely.",
      "Set obstacle braking/bypass deliberately for the environment; never rely on sensing around wires, thin branches, reflective surfaces, or low-texture structures.",
      "For façades, begin with the gimbal near level and adjust to keep the surface square; for roofs, combine oblique context with nadir coverage where safe.",
    ],
  });

  if (media) sections.push({
    title: "Photo and video starting settings",
    items: [
      "Photos: RAW+JPEG when available, low ISO, fixed white balance, histogram/highlight warnings on, and bracket high-contrast scenes when needed.",
      "Video: select the contracted resolution/frame rate, use a 180° shutter starting point when motion blur is desired, and use ND filtration only after exposure review.",
      "Fly slow, repeatable movements; capture wide establishing, medium context, and detail sequences with clean starts and stops for editing.",
    ],
  });

  if (thermal) sections.push({
    title: "Thermal starting settings",
    items: [
      "Allow sensor stabilization, run a flat-field correction when required, record emissivity assumptions, reflected temperature, weather, distance, and viewing angle.",
      "Avoid rain, heavy moisture, rapid solar loading changes, and reflective-angle false positives. Capture matching RGB context for every thermal finding.",
      "Use an appropriate temperature span/level and radiometric format when the deliverable requires measurement; do not diagnose solely from a color palette.",
    ],
  });

  sections.push({
    title: "Go / no-go verification",
    items: [
      "Recheck FAA airspace/authorization, TFRs/NOTAMs, visibility, cloud clearance, winds and gusts at operating height, precipitation, temperature, and battery performance on the day of flight.",
      "Document deviations from this starting plan in Mission Operations and stop when conditions exceed the aircraft, authorization, site, or pilot limits.",
    ],
  });
  return sections;
}

export function missionWeatherUrl(location: string, scheduledFor: string | null): string {
  const date = scheduledFor ? new Date(scheduledFor).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "scheduled date";
  return `https://www.google.com/search?q=${encodeURIComponent(`weather forecast ${location} ${date}`)}`;
}
