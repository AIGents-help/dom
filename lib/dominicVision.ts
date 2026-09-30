export type DominicVisionSeverity = "info" | "low" | "medium" | "high";

export type DominicVisionRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DominicVisionCandidate = {
  finding_type: string;
  title: string;
  description: string;
  severity: DominicVisionSeverity;
  confidence: number;
  region: DominicVisionRegion | null;
  recommended_action: string;
};

export type DominicVisionScreening = {
  summary: string;
  candidates: DominicVisionCandidate[];
  limitations: string[];
};

const severities = new Set<DominicVisionSeverity>(["info", "low", "medium", "high"]);

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp01(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return round6(Math.max(0, Math.min(1, n)));
}

function cleanString(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanRegion(value: unknown): DominicVisionRegion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const region = {
    x: clamp01(record.x),
    y: clamp01(record.y),
    width: clamp01(record.width),
    height: clamp01(record.height),
  };
  if (region.width <= 0 || region.height <= 0) return null;
  if (region.x + region.width > 1) region.width = round6(Math.max(0, 1 - region.x));
  if (region.y + region.height > 1) region.height = round6(Math.max(0, 1 - region.y));
  return region.width > 0 && region.height > 0 ? region : null;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Vision provider returned an empty response.");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (fenced) return JSON.parse(fenced) as unknown;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error("Vision provider did not return valid JSON.");
  }
}

export function parseDominicVisionScreening(text: string): DominicVisionScreening {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Vision provider returned an invalid screening object.");
  }
  const record = parsed as Record<string, unknown>;
  const rawCandidates = Array.isArray(record.candidates) ? record.candidates : [];
  const candidates: DominicVisionCandidate[] = [];

  for (const value of rawCandidates.slice(0, 12)) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const title = cleanString(item.title, 160);
    const description = cleanString(item.description, 1200);
    if (!title || !description) continue;

    const rawSeverity = cleanString(item.severity, 20).toLowerCase() as DominicVisionSeverity;
    candidates.push({
      finding_type: cleanString(item.finding_type, 80).toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "visual_anomaly",
      title,
      description,
      severity: severities.has(rawSeverity) ? rawSeverity : "info",
      confidence: clamp01(item.confidence),
      region: cleanRegion(item.region),
      recommended_action: cleanString(item.recommended_action, 500),
    });
  }

  return {
    summary: cleanString(record.summary, 1200),
    candidates,
    limitations: Array.isArray(record.limitations)
      ? record.limitations.map((item) => cleanString(item, 300)).filter(Boolean).slice(0, 12)
      : [],
  };
}

export function extractResponsesApiText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Vision provider returned an invalid API response.");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") parts.push(partRecord.text);
    }
  }
  const text = parts.join("\n").trim();
  if (!text) throw new Error("Vision provider returned no text output.");
  return text;
}

export function buildDominicVisionPrompt(input: {
  assetName: string;
  assetType: string;
  inspectionType: string;
  objective: string | null;
  sensorMode: string;
}) {
  return [
    "You are the visual-screening stage of DOMINIC, an industrial drone inspection system.",
    "Review this single inspection image and identify only visible candidate anomalies that merit human review.",
    "Do not claim a hidden condition, root cause, leak, temperature, structural integrity, code compliance, or safety state that cannot be established from visible pixels.",
    "A candidate is not a diagnosis. Prefer zero candidates over inventing a defect.",
    "For corrosion-like discoloration, coating damage, staining, deformation, debris, vegetation, cracks, missing components, loose-looking components, or other visible irregularities, describe what is actually visible.",
    "Severity is triage priority only, not engineering severity. Never output critical from image-only screening.",
    "Return JSON only with this exact shape:",
    '{"summary":"short image-level summary","candidates":[{"finding_type":"snake_case_type","title":"short title","description":"visible evidence only","severity":"info|low|medium|high","confidence":0.0,"region":{"x":0.0,"y":0.0,"width":0.0,"height":0.0},"recommended_action":"human review or additional capture recommendation"}],"limitations":["important limitation"]}',
    "Region values are normalized 0..1 relative to the full image. Use null for region if localization is uncertain.",
    `Asset: ${input.assetName} (${input.assetType})`,
    `Inspection: ${input.inspectionType}`,
    `Objective: ${input.objective ?? "General visual condition screening"}`,
    `Sensor mode: ${input.sensorMode}`,
  ].join("\n");
}
