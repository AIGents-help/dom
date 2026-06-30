import { NextRequest, NextResponse } from "next/server";

/**
 * Simple admin login placeholder. In production, replace this with
 * Supabase Auth (supabase.auth.signInWithPassword) and session cookies.
 */
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const adminEmail = process.env.ADMIN_EMAIL || "admin@droneopsman.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  if (!adminPassword) {
    return NextResponse.json(
      { error: "Admin auth not configured. Connect Supabase Auth for production." },
      { status: 501 }
    );
  }

  if (email === adminEmail && password === adminPassword) {
    const res = NextResponse.json({ success: true });
    res.cookies.set("dom_admin_session", "authenticated", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }

  return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
}
