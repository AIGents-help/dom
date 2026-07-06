"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export default function PilotLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/pilot/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");

      // Hydrate the browser client's own session (access + refresh token) so
      // it persists and auto-refreshes via the SDK, same as every other
      // portal in this app — sessionStorage-ing just the access token would
      // silently log pilots out after ~1hr with no way to refresh.
      const sb = getSupabaseBrowser();
      const { error: sessionError } = await sb.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) throw new Error(sessionError.message);

      router.push("/pilot");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: V.ground, padding: 24 }}>
      <div style={{ width: 380, padding: 32, border: `1px solid ${V.line}`, borderRadius: 16, background: V.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ width: 28, height: 28, border: `1.5px solid ${V.signal}`, borderRadius: 7, display: "grid", placeItems: "center", color: V.signal, fontSize: 12, background: "rgba(255,138,61,.08)" }}>◤</span>
          <span className="font-saira" style={{ fontWeight: 800, letterSpacing: ".04em", color: V.ink }}>DOM</span>
        </div>
        <h1 className="font-saira" style={{ fontSize: 22, color: V.ink, marginTop: 12 }}>Pilot Portal</h1>
        <p style={{ color: V.inkDim, fontSize: 13, marginBottom: 22 }}>
          Access your missions, SOPs, and payout history.
        </p>

        <label style={{ fontSize: 12, color: V.inkDim }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />

        <label style={{ fontSize: 12, color: V.inkDim, marginTop: 12, display: "block" }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()} style={inputStyle} />

        {error && <p style={{ color: V.signal, fontSize: 13, marginTop: 12 }}>{error}</p>}

        <button onClick={handleLogin} disabled={loading} style={btnPrimary}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 16, textAlign: "center" }}>
          Not a DOM pilot yet?{" "}
          <a href="/fly-for-dom" style={{ color: V.signal }}>Apply here</a>
        </p>
      </div>
    </div>
  );
}

const V = { ground: "#0A0E14", surface: "#11161F", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D" };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 14, outline: "none" };
const btnPrimary: React.CSSProperties = { width: "100%", marginTop: 20, padding: 12, borderRadius: 9, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" };
