export type DominicInspectionProfile = {
  id: string;
  label: string;
  canonicalFindingTypes: string[];
  visibleConditions: string[];
  exclusions: string[];
  followUpPriorities: string[];
};

const GENERIC_PROFILE: DominicInspectionProfile = {
  id: "generic",
  label: "General visual inspection",
  canonicalFindingTypes: [
    "visible_irregularity",
    "surface_damage",
    "missing_component",
    "debris_or_obstruction",
  ],
  visibleConditions: [
    "surface damage, deformation, missing components, debris, staining, discoloration, or other clearly visible irregularities",
  ],
  exclusions: [
    "Do not infer internal condition, root cause, leak rate, wall thickness, structural integrity, or compliance from appearance alone.",
  ],
  followUpPriorities: [
    "Preserve one context view and one closer detail view when a candidate is small or ambiguous.",
  ],
};

const PROFILES: Array<{
  match: (assetType: string, inspectionType: string) => boolean;
  profile: DominicInspectionProfile;
}> = [
  {
    match: (assetType) => ["tank", "storage_tank", "vessel"].includes(assetType),
    profile: {
      id: "industrial_tank",
      label: "Industrial tank visual inspection",
      canonicalFindingTypes: [
        "corrosion_like_discoloration",
        "coating_damage",
        "staining_or_residue",
        "shell_deformation",
        "roof_or_seam_irregularity",
        "nozzle_or_flange_irregularity",
        "insulation_or_cladding_damage",
        "missing_or_loose_external_component",
        "debris_or_vegetation",
      ],
      visibleConditions: [
        "corrosion-like discoloration or rust-colored surface change",
        "paint or coating loss, peeling, blistering, cracking, or exposed substrate",
        "staining, residue, streaking, wet-looking surface, or other visible evidence that merits closer review",
        "dents, buckling, distortion, or other apparent shell deformation",
        "irregular roof edges, seams, weld-area appearance, penetrations, vents, or appurtenances",
        "visible nozzle, flange, bolting, support, ladder, platform, railing, or attachment irregularities",
        "damaged, displaced, missing, or deteriorated insulation/cladding",
        "debris, vegetation, nesting material, obstruction, or foreign material affecting visible access",
      ],
      exclusions: [
        "Do not diagnose a leak solely from staining or wet-looking pixels; describe the visible evidence and recommend confirmation.",
        "Do not estimate wall thickness, corrosion depth, pressure integrity, remaining life, API compliance, or fitness-for-service from RGB imagery.",
        "Do not call welds defective unless a clearly visible surface irregularity is present; use descriptive language only.",
      ],
      followUpPriorities: [
        "Prefer a wider context frame plus a tighter zoom frame of the same tank feature.",
        "Use the laser-localized target when available so future inspections can return to the same physical location.",
        "Request an alternate oblique angle when glare, shadow, curvature, or occlusion can change appearance.",
      ],
    },
  },
  {
    match: (assetType) => ["pipeline", "pipe", "piping"].includes(assetType),
    profile: {
      id: "industrial_piping",
      label: "Industrial piping visual inspection",
      canonicalFindingTypes: [
        "corrosion_like_discoloration",
        "coating_damage",
        "staining_or_residue",
        "support_irregularity",
        "flange_or_joint_irregularity",
        "insulation_or_cladding_damage",
        "deformation",
        "missing_or_loose_external_component",
      ],
      visibleConditions: [
        "surface discoloration, coating loss, staining, residue, or wet-looking areas",
        "visible irregularities around flanges, joints, valves, supports, hangers, and attachments",
        "damaged or displaced insulation/cladding",
        "apparent bending, denting, sagging, displacement, or unsupported spans",
        "missing, loose-looking, or displaced external hardware",
      ],
      exclusions: [
        "Do not diagnose a process leak, pressure loss, internal corrosion, or remaining wall thickness from RGB imagery.",
        "Do not infer valve operability or joint integrity without direct visible evidence.",
      ],
      followUpPriorities: [
        "Capture both the local detail and enough surrounding piping to identify the exact joint/support location.",
        "Use zoom before reducing safe standoff.",
      ],
    },
  },
  {
    match: (assetType, inspectionType) =>
      assetType === "roof" || inspectionType === "roof",
    profile: {
      id: "roof",
      label: "Roof visual inspection",
      canonicalFindingTypes: [
        "membrane_or_surface_damage",
        "missing_or_damaged_roofing",
        "flashing_irregularity",
        "ponding_or_staining",
        "penetration_irregularity",
        "debris_or_vegetation",
        "edge_or_parapet_damage",
      ],
      visibleConditions: [
        "tears, cracks, punctures, lifted edges, displaced material, missing shingles/panels, or obvious surface damage",
        "flashing, parapet, coping, penetration, drain, curb, or edge irregularities",
        "standing-water appearance, staining patterns, debris, or vegetation",
      ],
      exclusions: [
        "Do not diagnose moisture below the roof assembly from RGB imagery alone.",
        "Do not infer code compliance, warranty status, or structural condition.",
      ],
      followUpPriorities: [
        "Capture one nadir context view and one oblique detail when edge geometry matters.",
      ],
    },
  },
  {
    match: (assetType) => ["solar_array", "solar", "pv"].includes(assetType),
    profile: {
      id: "solar",
      label: "Solar array visual inspection",
      canonicalFindingTypes: [
        "module_damage",
        "soiling_or_debris",
        "vegetation_or_shading",
        "mounting_irregularity",
        "missing_or_displaced_component",
        "visible_connector_or_cable_irregularity",
      ],
      visibleConditions: [
        "cracked-looking or visibly damaged modules, displaced modules, debris, heavy soiling, vegetation, or shading",
        "visible mounting, cable, connector, frame, or component irregularities",
      ],
      exclusions: [
        "Do not claim cell hotspots, electrical faults, string failures, or performance loss from RGB imagery alone.",
      ],
      followUpPriorities: [
        "Preserve row/module context so the exact panel can be identified for maintenance.",
      ],
    },
  },
  {
    match: (assetType) => ["building", "structure", "tower", "facade"].includes(assetType),
    profile: {
      id: "structure",
      label: "Structure visual inspection",
      canonicalFindingTypes: [
        "crack_like_feature",
        "spalling_or_surface_loss",
        "corrosion_like_discoloration",
        "coating_damage",
        "deformation",
        "missing_or_loose_external_component",
        "joint_or_seal_irregularity",
        "staining_or_residue",
      ],
      visibleConditions: [
        "crack-like lines, spalling/surface loss, corrosion-like discoloration, coating damage, deformation, staining, or displaced components",
        "visible joint, sealant, fastener, connection, facade, railing, ladder, or attachment irregularities",
      ],
      exclusions: [
        "Do not determine structural capacity, crack depth, cause, or engineering significance from a single image.",
      ],
      followUpPriorities: [
        "Capture the feature at a perpendicular angle when possible and retain an identifying context frame.",
      ],
    },
  },
  {
    match: (assetType, inspectionType) =>
      assetType === "stockpile" || inspectionType === "stockpile",
    profile: {
      id: "stockpile",
      label: "Stockpile visual inspection",
      canonicalFindingTypes: [
        "surface_change",
        "erosion_or_sloughing",
        "debris_or_contamination",
        "access_obstruction",
      ],
      visibleConditions: [
        "obvious surface change, erosion/sloughing appearance, debris, contamination-like foreign material, or access obstruction",
      ],
      exclusions: [
        "Do not estimate volume or mass from a single inspection image; use mapping/photogrammetry outputs for measurement.",
      ],
      followUpPriorities: [
        "Retain broad context; close zoom is only useful for a localized visible condition.",
      ],
    },
  },
  {
    match: (_assetType, inspectionType) => inspectionType === "thermal",
    profile: {
      id: "thermal_generic",
      label: "Thermal inspection",
      canonicalFindingTypes: [
        "thermal_anomaly",
        "temperature_pattern_irregularity",
      ],
      visibleConditions: [
        "temperature-pattern irregularities only when actual thermal/radiometric evidence is provided",
      ],
      exclusions: [
        "RGB imagery is not thermal evidence. Never create a thermal finding from an RGB-only image.",
        "Do not infer root cause from a temperature anomaly without corroborating evidence.",
      ],
      followUpPriorities: [
        "Preserve both thermal and RGB context at the same physical location when supported.",
      ],
    },
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[s-]+/g, "_");
}

export function resolveDominicInspectionProfile(input: {
  assetType: string;
  inspectionType: string;
}) {
  const assetType = normalize(input.assetType);
  const inspectionType = normalize(input.inspectionType);
  return (
    PROFILES.find(({ match }) => match(assetType, inspectionType))?.profile ??
    GENERIC_PROFILE
  );
}

export function buildInspectionProfilePrompt(profile: DominicInspectionProfile) {
  return [
    `Inspection profile: ${profile.label} (${profile.id}).`,
    `Prefer these canonical finding_type values when applicable: ${profile.canonicalFindingTypes.join(", ")}.`,
    "Look specifically for these visible conditions:",
    ...profile.visibleConditions.map((item) => `- ${item}`),
    "Profile-specific exclusions:",
    ...profile.exclusions.map((item) => `- ${item}`),
    "Follow-up evidence priorities:",
    ...profile.followUpPriorities.map((item) => `- ${item}`),
  ].join("\n");
}
