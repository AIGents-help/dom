export interface WorkflowResourceLink {
  label: string;
  href: string;
  external?: boolean;
}

export const WORKFLOW_RESOURCE_LINKS: Record<string, readonly WorkflowResourceLink[]> = {
  scope_reviewed: [{ label: "View client scope", href: "#mission-scope" }],
  uav_assigned: [{ label: "View aircraft", href: "#mission-aircraft" }],
  insurance_verified: [{ label: "View insurance status", href: "#mission-insurance" }],
  schedule_confirmed: [{ label: "View schedule", href: "#mission-schedule" }],
  airspace_reviewed: [
    { label: "View mission airspace", href: "#mission-airspace" },
    { label: "Check FAA resources", href: "https://www.faa.gov/uas/getting_started/b4ufly", external: true },
  ],
  weather_reviewed: [{ label: "View mission weather", href: "#mission-schedule" }],
  access_confirmed: [{ label: "View site access", href: "#mission-access" }],
  ppe_perimeter_ready: [
    { label: "Safety equipment", href: "/safety-equipment", external: true },
    { label: "DOM Shop", href: "/shop", external: true },
  ],
  site_walk_complete: [{ label: "View cautions", href: "#mission-cautions" }],
  weather_go_no_go: [{ label: "View mission weather", href: "#mission-schedule" }],
  authorization_active: [
    { label: "View authorization files", href: "#mission-documents" },
    { label: "Open FAA DroneZone", href: "https://faadronezone-access.faa.gov/", external: true },
  ],
  capture_complete: [{ label: "View capture plan", href: "#mission-capture-plan" }],
  coverage_quality_reviewed: [{ label: "Review capture plan", href: "#mission-capture-plan" }],
  media_backed_up: [{ label: "View mission files", href: "#mission-documents" }],
  deliverables_uploaded: [{ label: "Open deliverables", href: "#mission-deliverables" }],
  mission_submitted: [{ label: "Review submission", href: "#mission-deliverables" }],
};

export function workflowResourcesFor(itemKey: string): readonly WorkflowResourceLink[] {
  return WORKFLOW_RESOURCE_LINKS[itemKey] ?? [];
}
