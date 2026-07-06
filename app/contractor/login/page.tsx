"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Contractor login — Supabase Auth (email + password). Access is gated by
// having a linked contractors.user_id row (set at /fly-for-dom signup, or
// claimed on a later application via /api/contractors/apply).
export default function ContractorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const sb = getSupabaseBrowser();
      const { data, error: signInError } = await sb.auth.signInWithPassword({ email, password });
      if (signInError || !data.user) {
        throw new Error("Invalid email or password.");
      }

      const { data: contractor } = await sb
        .from("contractors")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!contractor) {
        await sb.auth.signOut();
        throw new Error("No contractor profile linked to this account. Apply at /fly-for-dom first.");
      }

      router.push("/contractor/dashboard");
    } catch (e: any) {
      setError(e.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A0E14" }}>
      <div
        style={{
          width: 360,
          padding: 32,
          border: "1px solid #232C3B",
          borderRadius: 14,
          background: "#11161F",
          color: "#E8ECF2",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontFamily: "Saira, sans-serif", fontSize: 22, marginBottom: 4 }}>
          Contractor Portal
        </h1>
        <p style={{ color: "#8A95A7", fontSize: 13, marginBottom: 22 }}>
          Sign in to view and accept missions.
        </p>

        <label style={{ fontSize: 12, color: "#8A95A7" }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />

        <label style={{ fontSize: 12, color: "#8A95A7", marginTop: 12, display: "block" }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={inputStyle}
        />

        {error && <p style={{ color: "#FF8A3D", fontSize: 13, marginTop: 12 }}>{error}</p>}

        <button onClick={handleLogin} disabled={loading} style={btnStyle}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ color: "#5A6678", fontSize: 12, marginTop: 16, textAlign: "center" }}>
          No account yet? <a href="/fly-for-dom" style={{ color: "#FF8A3D" }}>Apply to fly for DOM</a>
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  borderRadius: 9,
  border: "1px solid #232C3B",
  background: "#0A0E14",
  color: "#E8ECF2",
  fontSize: 14,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 20,
  padding: "12px",
  borderRadius: 9,
  border: "none",
  background: "#FF8A3D",
  color: "#0A0E14",
  fontFamily: "Saira, sans-serif",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};
