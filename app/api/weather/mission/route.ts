import { NextRequest, NextResponse } from "next/server";
import { rateLimitResponse } from "@/lib/rateLimit";

const severeCodes = new Set([65, 67, 71, 73, 75, 77, 82, 85, 86, 95, 96, 99]);

export async function GET(req: NextRequest) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;
  const location = (req.nextUrl.searchParams.get("location") ?? "").trim().slice(0, 300);
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!location || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Location and date are required" }, { status: 400 });
  const daysAway = Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86_400_000);
  if (daysAway < 0 || daysAway > 16) return NextResponse.json({ available: false, reason: daysAway > 16 ? "A dependable forecast is not available more than 16 days out." : "The selected date has passed." });

  try {
    const zip = location.match(/\b\d{5}(?:-\d{4})?\b/)?.[0];
    const search = zip ?? location;
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(search)}&count=1&language=en&format=json`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) });
    const geo = await geoRes.json();
    const point = geo.results?.[0];
    if (!point) return NextResponse.json({ available: false, reason: "The mission location could not be matched to a forecast point." });
    const params = new URLSearchParams({ latitude: String(point.latitude), longitude: String(point.longitude), timezone: "auto", wind_speed_unit: "mph", temperature_unit: "fahrenheit", start_date: date, end_date: date, daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max" });
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(6000) });
    const weather = await weatherRes.json();
    const daily = weather.daily;
    if (!daily?.time?.length) return NextResponse.json({ available: false, reason: "Forecast data is not available for the selected date." });
    const forecast = { weatherCode: daily.weather_code[0] ?? 0, highF: daily.temperature_2m_max[0], lowF: daily.temperature_2m_min[0], precipitationProbability: daily.precipitation_probability_max[0] ?? 0, maxWindMph: daily.wind_speed_10m_max[0] ?? 0, maxGustMph: daily.wind_gusts_10m_max[0] ?? 0 };
    const unfavorable = severeCodes.has(forecast.weatherCode) || forecast.precipitationProbability >= 40 || forecast.maxWindMph >= 18 || forecast.maxGustMph >= 25;
    const caution = !unfavorable && (forecast.precipitationProbability >= 20 || forecast.maxWindMph >= 15 || forecast.maxGustMph >= 20);
    return NextResponse.json({ available: true, location: [point.name, point.admin1].filter(Boolean).join(", "), rating: unfavorable ? "unfavorable" : caution ? "caution" : "favorable", summary: unfavorable ? "Forecast conditions may be unsuitable for the mission. Coordinate a different date with DOM." : caution ? "Marginal conditions are possible. Recheck before launch and consider a backup date." : "The current forecast appears generally favorable for planning.", forecast, source: "Open-Meteo" });
  } catch {
    return NextResponse.json({ available: false, reason: "The forecast service could not be reached. Use the linked aviation forecast and recheck before flight." });
  }
}
