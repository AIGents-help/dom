import { NextRequest, NextResponse } from "next/server";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 3 || query.length > 180) {
    return NextResponse.json(
      { error: "Enter a valid street address or place name." },
      { status: 400 },
    );
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "DroneOperationManagement/1.0 (droneopsman.com)",
      "Accept-Language": "en-US,en;q=0.9",
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Location search is temporarily unavailable." },
      { status: 502 },
    );
  }

  const data = (await response.json()) as NominatimResult[];
  const results = data
    .map((item) => ({
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      label: item.display_name,
    }))
    .filter(
      (item) =>
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude),
    );

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
