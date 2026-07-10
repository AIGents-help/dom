// Reduces a mission's real lat/long to a coarse ~11km grid cell for
// pre-assignment display (open queue + a pilot's own pending claims).
// Naive round(lat,1)/round(lng,1) isn't a uniform physical radius since
// longitude degrees shrink toward the poles, so longitude is snapped to a
// latitude-adjusted step instead. Raw coordinates should never be sent to
// the client — call this server-side and only return the result.

export interface FuzzyArea {
  lat_grid: number;
  lng_grid: number;
}

export function fuzzyGrid(lat: number | null | undefined, lng: number | null | undefined): FuzzyArea | null {
  if (lat == null || lng == null) return null;
  const STEP = 0.1; // ~11km north-south everywhere
  const latGrid = Math.round(lat / STEP) * STEP;
  const lngStep = STEP / Math.cos((lat * Math.PI) / 180);
  const lngGrid = Math.round(lng / lngStep) * lngStep;
  return { lat_grid: Math.round(latGrid * 100) / 100, lng_grid: Math.round(lngGrid * 100) / 100 };
}
