import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.VERCEL_DEPLOYMENT_ID
    ?? "local";

  return NextResponse.json(
    { buildId },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    },
  );
}
