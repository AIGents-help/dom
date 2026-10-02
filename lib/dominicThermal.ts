export type RadiometricPoint = {
  x: number;
  y: number;
  tempC: number;
};

export type RadiometricCaptureSummary = {
  radiometric: true;
  minTempC: number;
  maxTempC: number;
  meanTempC: number;
  centerTempC?: number;
  hotspot?: RadiometricPoint;
  coldspot?: RadiometricPoint;
  emissivity?: number;
  reflectedTempC?: number;
  distanceM?: number;
  humidityPct?: number;
  palette?: string;
};

function finite(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function point(value: unknown): RadiometricPoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const x = finite(record.x);
  const y = finite(record.y);
  const tempC = finite(record.tempC);
  if (x === null || y === null || tempC === null) return undefined;
  if (x < 0 || x > 1 || y < 0 || y > 1) return undefined;
  return { x, y, tempC };
}

export function normalizeRadiometricCapture(
  value: unknown,
): RadiometricCaptureSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.radiometric !== true) return null;

  const minTempC = finite(record.minTempC);
  const maxTempC = finite(record.maxTempC);
  const meanTempC = finite(record.meanTempC);
  if (minTempC === null || maxTempC === null || meanTempC === null) return null;
  if (maxTempC < minTempC) return null;

  const centerTempC = finite(record.centerTempC);
  const emissivity = finite(record.emissivity);
  const reflectedTempC = finite(record.reflectedTempC);
  const distanceM = finite(record.distanceM);
  const humidityPct = finite(record.humidityPct);

  return {
    radiometric: true,
    minTempC,
    maxTempC,
    meanTempC,
    ...(centerTempC !== null ? { centerTempC } : {}),
    ...(point(record.hotspot) ? { hotspot: point(record.hotspot) } : {}),
    ...(point(record.coldspot) ? { coldspot: point(record.coldspot) } : {}),
    ...(emissivity !== null && emissivity > 0 && emissivity <= 1 ? { emissivity } : {}),
    ...(reflectedTempC !== null ? { reflectedTempC } : {}),
    ...(distanceM !== null && distanceM >= 0 ? { distanceM } : {}),
    ...(humidityPct !== null && humidityPct >= 0 && humidityPct <= 100 ? { humidityPct } : {}),
    ...(typeof record.palette === "string" && record.palette.trim()
      ? { palette: record.palette.trim().slice(0, 80) }
      : {}),
  };
}

export function describeRadiometricCapture(
  summary: RadiometricCaptureSummary | null,
) {
  if (!summary) {
    return "No radiometric temperature measurements are attached. Treat the image only as thermal imagery; do not claim exact temperatures from palette colors.";
  }

  const parts = [
    `Measured radiometric range: ${summary.minTempC.toFixed(1)}C to ${summary.maxTempC.toFixed(1)}C; mean ${summary.meanTempC.toFixed(1)}C.`,
  ];
  if (summary.centerTempC !== undefined) {
    parts.push(`Center temperature: ${summary.centerTempC.toFixed(1)}C.`);
  }
  if (summary.hotspot) {
    parts.push(
      `Measured hotspot: ${summary.hotspot.tempC.toFixed(1)}C at normalized image position (${summary.hotspot.x.toFixed(3)}, ${summary.hotspot.y.toFixed(3)}).`,
    );
  }
  if (summary.coldspot) {
    parts.push(
      `Measured coldspot: ${summary.coldspot.tempC.toFixed(1)}C at normalized image position (${summary.coldspot.x.toFixed(3)}, ${summary.coldspot.y.toFixed(3)}).`,
    );
  }
  parts.push(
    "Use measured values descriptively. Do not infer root cause, process condition, electrical failure, leak rate, or safety significance without corroborating evidence.",
  );
  return parts.join(" ");
}
