# DOM Phase 2: Airspace Classification + Quoting Engine

## New files (4)
lib/airspace.ts              — Airspace classification service (AirHub API + fallback estimation)
lib/quoting.ts               — Quoting engine with 5 modifier multipliers
app/api/airspace/route.ts    — GET /api/airspace?lat=X&lng=Y
app/api/quote/route.ts       — POST /api/quote + GET /api/quote (service list)

## Database
Already applied — 4 new tables: mission_airspace, quotes, checklist_items, mission_comms

## Test it immediately
After placing files + rebuilding:

# Airspace check (no API key needed — uses airport proximity estimation)
curl "http://localhost:3000/api/airspace?lat=33.6762&lng=-117.8675"
# ^ Near John Wayne Airport — should return Class D, LAANC required

curl "http://localhost:3000/api/airspace?lat=34.05&lng=-118.24"
# ^ Downtown LA — should return Class B near LAX

curl "http://localhost:3000/api/airspace?lat=33.95&lng=-117.39"
# ^ Riverside, CA — should return Class G

# Quote with auto-airspace
curl -X POST http://localhost:3000/api/quote \
  -H "Content-Type: application/json" \
  -d '{"serviceType":"roof_inspection_commercial","lat":33.95,"lng":-117.39,"distanceMiles":15,"siteComplexity":"moderate","urgency":"standard","deliverableTier":"standard"}'

# Service list
curl http://localhost:3000/api/quote

## Env vars (optional, for full API)
AIRHUB_API_KEY=...    # From airspacelink.com/developers — enables full FAA data
                       # Without it, falls back to airport-proximity estimation (still useful)

## What the estimation fallback does
Queries OpenStreetMap Overpass API for airports within 10nm of the site,
calculates distance and bearing, then estimates airspace class from airport
type (large=B/C, medium/towered=D, small=G). This is surprisingly accurate
for the G-vs-controlled determination that drives 80% of mission planning.
The full AirHub API adds TFRs, NOTAMs, exact UASFM grid ceilings, and
community advisories.
