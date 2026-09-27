import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ admin: false }, { status: 403 });
  }
  return NextResponse.json({ admin: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}
