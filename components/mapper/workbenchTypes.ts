export type DominicWorkbenchTool =
  | "select"
  | "distance"
  | "area"
  | "note"
  | "callout"
  | "pin"
  | "cloud"
  | "shape";

export type DominicMarkupType = Exclude<DominicWorkbenchTool, "select" | "distance" | "area">;

export type DominicMarkupGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][] };

export interface DominicMarkup {
  id: string;
  markup_type: DominicMarkupType;
  label: string | null;
  geometry: DominicMarkupGeometry;
  tool_set: string;
  deliverable_id: string | null;
  created_at: string;
}
