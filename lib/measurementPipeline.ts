// lib/measurementPipeline.ts
// Pure, framework-free geometry math for DOM Mapper distance/area
// measurements. Feet/square feet by default, per spec. No mapping library
// dependency (turf, proj4, etc.) — drone mission sites are small enough
// (hundreds of meters) that a simple equirectangular local projection
// around the geometry's own centroid latitude is accurate to well under
// 0.1%, which is more than sufficient for field measurement purposes.

export type LngLat = [number, number]; // [lng, lat], matches GeoJSON order

const METERS_PER_FOOT = 0.3048;
const EARTH_RADIUS_METERS = 6371008.8; // mean radius (IUGG)

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great-circle distance between two points, in feet.
export function haversineDistanceFeet(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinDLng * sinDLng;
  const meters = 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
  return meters / METERS_PER_FOOT;
}

// Total length of a path (distance measurement), in feet.
export function lineStringLengthFeet(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineDistanceFeet(points[i - 1], points[i]);
  return total;
}

// Local equirectangular projection around the ring's own centroid
// latitude — accurate at mission-site scale, avoids a proj4/turf
// dependency for something this codebase can compute directly and verify.
function projectToLocalFeet(points: LngLat[]): [number, number][] {
  const centroidLat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS_METERS;
  const metersPerDegLng = metersPerDegLat * Math.cos(toRadians(centroidLat));
  return points.map(([lng, lat]) => [(lng * metersPerDegLng) / METERS_PER_FOOT, (lat * metersPerDegLat) / METERS_PER_FOOT]);
}

// Polygon area (shoelace formula on the local-feet projection above), in
// square feet. Closes the ring automatically if the caller didn't repeat
// the first point as the last.
export function polygonAreaSquareFeet(points: LngLat[]): number {
  if (points.length < 3) return 0;
  const ring = projectToLocalFeet(points);
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push(ring[0]);
  }
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum) / 2;
}

// ---------------------------------------------------------------------------
// Projected (meters) variants — ODM orthophotos are commonly exported in a
// projected CRS (UTM, meters), not geographic lng/lat degrees. The viewer
// detects which one a given GeoTIFF uses from its bounding box coordinate
// magnitude (see OrthomosaicViewer.tsx's isGeographicBbox) and tells this
// module which formula applies; a projected coordinate pair is just plain
// Euclidean distance in meters, no haversine needed.
// ---------------------------------------------------------------------------

export type MeasurementCrs = "geographic" | "projected";

function euclideanDistanceMeters(a: LngLat, b: LngLat): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function projectedLineStringLengthFeet(points: LngLat[]): number {
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) totalMeters += euclideanDistanceMeters(points[i - 1], points[i]);
  return totalMeters / METERS_PER_FOOT;
}

function projectedPolygonAreaSquareFeet(points: LngLat[]): number {
  if (points.length < 3) return 0;
  const ring = points.slice();
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  const squareMeters = Math.abs(sum) / 2;
  return squareMeters / (METERS_PER_FOOT * METERS_PER_FOOT);
}

// ---------------------------------------------------------------------------
// Measurement vocab / row shape
// ---------------------------------------------------------------------------

export const MEASUREMENT_TYPES = [
  { value: "distance", label: "Distance", unit: "ft" },
  { value: "area", label: "Area", unit: "sq ft" },
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number]["value"];

export interface MeasurementGeometry {
  type: "LineString" | "Polygon";
  coordinates: LngLat[]; // Polygon stored as a single unclosed ring for simplicity — closed at compute/render time.
}

export function computeMeasurementValue(type: MeasurementType, geometry: MeasurementGeometry, crs: MeasurementCrs = "geographic"): number {
  if (crs === "projected") {
    return type === "distance" ? projectedLineStringLengthFeet(geometry.coordinates) : projectedPolygonAreaSquareFeet(geometry.coordinates);
  }
  return type === "distance" ? lineStringLengthFeet(geometry.coordinates) : polygonAreaSquareFeet(geometry.coordinates);
}

export function formatMeasurementValue(type: MeasurementType, value: number): string {
  const rounded = value >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(1);
  const unit = MEASUREMENT_TYPES.find((t) => t.value === type)?.unit ?? "";
  return `${rounded} ${unit}`;
}

export function isValidMeasurementGeometry(type: MeasurementType, geometry: MeasurementGeometry): boolean {
  if (type === "distance") return geometry.type === "LineString" && geometry.coordinates.length >= 2;
  return geometry.type === "Polygon" && geometry.coordinates.length >= 3;
}
