export const WORKFLOW_ITEMS = [
  ["planning","scope_reviewed","Review client scope and deliverables"],
  ["planning","uav_assigned","Assign the mission UAV"],
  ["planning","insurance_verified","Confirm mission insurance or uninsured responsibility path"],
  ["planning","schedule_confirmed","Confirm performance date and backup window"],
  ["planning","airspace_reviewed","Review airspace, TFRs, NOTAMs, and authorization"],
  ["planning","weather_reviewed","Review forecast, winds, gusts, visibility, and precipitation"],
  ["planning","site_access_confirmed","Confirm site access, parking, check-in, and contacts"],
  ["preflight","credentials_current","Confirm Part 107, insurance, and Remote ID readiness"],
  ["preflight","site_safety_ppe","Confirm site PPE, high-visibility vest, cones, DOM barrier poles, signage, and perimeter controls"],
  ["preflight","aircraft_inspected","Inspect aircraft, props, payload, storage, firmware, and controller"],
  ["preflight","batteries_ready","Confirm charged flight/controller batteries and reserves"],
  ["preflight","rth_lost_link","Set RTH altitude and lost-link behavior for the site"],
  ["onsite","site_walk","Complete site walk and identify people, obstacles, wires, animals, and hazards"],
  ["onsite","weather_recheck","Recheck current weather and go/no-go decision"],
  ["onsite","authorization_active","Confirm authorization is active for the operating window"],
  ["flight","capture_complete","Complete the required capture plan"],
  ["flight","coverage_verified","Review coverage and image quality before leaving"],
  ["postflight","aircraft_postflight","Complete postflight aircraft and battery inspection"],
  ["postflight","media_backed_up","Back up and verify all mission media"],
  ["submission","deliverables_uploaded","Upload required files and field notes"],
  ["submission","mission_submitted","Submit mission to DOM for QC"],
] as const;

export type WorkflowItemKey = (typeof WORKFLOW_ITEMS)[number][1];

export const AUTOMATIC_WORKFLOW_KEYS = [
  "uav_assigned",
  "insurance_verified",
  "capture_complete",
  "deliverables_uploaded",
  "mission_submitted",
] as const satisfies readonly WorkflowItemKey[];

export const PROTECTED_WORKFLOW_KEYS = new Set<WorkflowItemKey>([
  "uav_assigned",
  "insurance_verified",
  "mission_submitted",
]);

export interface DeliverableRequirement {
  type: string;
  label: string;
  guidance: string;
  required: boolean;
}

const DELIVERABLE_PLANS: Record<string, DeliverableRequirement[]> = {
  roof_inspection_residential: [
    { type: "raw_images", label: "Inspection photo set", guidance: "Organized overview and detail images covering every inspected roof area.", required: true },
    { type: "report", label: "Findings report", guidance: "Client-ready PDF with annotated findings, locations, severity, and recommended follow-up.", required: true },
  ],
  roof_inspection_commercial: [
    { type: "raw_images", label: "Commercial roof inspection photo set", guidance: "Organized overview and detail images covering every inspected section and observed condition.", required: true },
    { type: "report", label: "Commercial roof findings report", guidance: "Client-ready PDF with annotated findings, locations, severity, limitations, and recommended follow-up.", required: true },
    { type: "orthomosaic", label: "Roof overview / orthomosaic", guidance: "Add when mapping coverage is included in the approved scope.", required: false },
  ],
  construction_progress: [
    { type: "raw_images", label: "Progress photo set", guidance: "Date-organized aerial coverage matching the approved capture plan.", required: true },
    { type: "report", label: "Progress summary", guidance: "Client-ready summary of visible progress, notable changes, and limitations.", required: true },
    { type: "orthomosaic", label: "Current orthomosaic", guidance: "Required when mapping is included in the approved scope.", required: false },
  ],
  thermal_inspection: [
    { type: "raw_images", label: "Radiometric and reference imagery", guidance: "Thermal files plus corresponding visual reference images.", required: true },
    { type: "report", label: "Thermal findings report", guidance: "Client-ready findings with settings, conditions, anomalies, limitations, and follow-up.", required: true },
  ],
  ortho_survey: [
    { type: "orthomosaic", label: "Orthomosaic", guidance: "Processed, georeferenced final mosaic for the approved boundary.", required: true },
    { type: "processing_report", label: "Processing / accuracy report", guidance: "Processing settings, coordinate reference, ground resolution, and accuracy notes.", required: true },
  ],
  powerline_inspection: [
    { type: "raw_images", label: "Inspection image set", guidance: "Organized structure and component imagery matching the approved route and shot list.", required: true },
    { type: "report", label: "Findings report", guidance: "Client-ready PDF with asset references, visible conditions, severity, and limitations.", required: true },
  ],
  real_estate_media: [
    { type: "raw_images", label: "Edited aerial photo set", guidance: "Final color-corrected images in the agreed delivery resolution.", required: true },
    { type: "video", label: "Edited aerial video", guidance: "Add when video is included in the approved scope.", required: false },
  ],
};

export function deliverablePlanFor(serviceType: string | null | undefined): DeliverableRequirement[] {
  return DELIVERABLE_PLANS[serviceType ?? ""] ?? [
    { type: "other", label: "Approved-scope deliverable", guidance: "Upload the finished client-facing output defined in the approved scope.", required: true },
  ];
}

export function missingRequiredDeliverables(
  serviceType: string | null | undefined,
  uploadedTypes: Array<string | null | undefined>,
): DeliverableRequirement[] {
  const uploaded = new Set(uploadedTypes.filter((type): type is string => !!type));
  if (!DELIVERABLE_PLANS[serviceType ?? ""]) {
    return uploaded.size > 0 ? [] : deliverablePlanFor(serviceType);
  }
  return deliverablePlanFor(serviceType).filter((item) => item.required && !uploaded.has(item.type));
}

export function workflowProgress(items: Array<{ item_key: string; completed: boolean }>) {
  const prerequisites = items.filter((item) => item.item_key !== "mission_submitted");
  const submission = items.find((item) => item.item_key === "mission_submitted");
  return {
    prerequisitesCompleted: prerequisites.filter((item) => item.completed).length,
    prerequisitesTotal: prerequisites.length,
    submitted: submission?.completed ?? false,
  };
}
