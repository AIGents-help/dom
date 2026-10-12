/** Compare saved geometry without depending on JSON object key order. Runtime
 * preflight/flight approval is deliberately not part of this presentation state. */
export function capturePlanSignature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(capturePlanSignature).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).filter((key) => row[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${capturePlanSignature(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
