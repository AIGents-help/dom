"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Real admin login — replaces the placeholder /api/admin/login the README flagged.
// Auth is handled by Supabase Auth (email + password). Access is gated by the
// admin_users allowlist, so only authorized emails get past the login screen.
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const supabaseBrowser = getSupabaseBrowser();
      const { data, error: signInError } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError || !data.user) {
        throw new Error("Invalid email or password.");
      }

      // Allowlist check: is this user actually an admin?
      const { data: allow } = await supabaseBrowser
        .from("admin_users")
        .select("email")
        .eq("email", data.user.email)
        .maybeSingle();

      if (!allow) {
        await supabaseBrowser.auth.signOut();
        throw new Error("This account is not authorized for the admin console.");
      }

      router.push("/admin/dashboard");
    } catch (e: any) {
      setError(e.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F5F7FA" }}>
      <div style={{ width: 360 }}>
        <Link
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#5F6B7A", fontSize: 13, textDecoration: "none", marginBottom: 14 }}
        >
          ← Back to droneopsman.com
        </Link>
        <div
          style={{
            padding: 32,
            border: "1px solid #D9E0E8",
            borderRadius: 14,
            background: "#FFFFFF",
            color: "#172033",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
        <img src="/brand/dom-lockup-horizontal.png?v=3" alt="DOM — Drone Operation Management" style={{ height: 24, width: "auto", marginBottom: 14 }} />
        <h1 style={{ fontFamily: "Saira, sans-serif", fontSize: 22, marginBottom: 4 }}>
          DOM Admin
        </h1>
        <p style={{ color: "#5F6B7A", fontSize: 13, marginBottom: 22 }}>
          Operations console — authorized access only.
        </p>

        <label style={{ fontSize: 12, color: "#5F6B7A" }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label style={{ fontSize: 12, color: "#5F6B7A", marginTop: 12, display: "block" }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={inputStyle}
        />

        {error && (
          <p style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</p>
        )}

        <button onClick={handleLogin} disabled={loading} style={btnStyle}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  borderRadius: 9,
  border: "1px solid #D9E0E8",
  background: "#FFFFFF",
  color: "#172033",
  fontSize: 14,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 20,
  padding: "12px",
  borderRadius: 9,
  border: "none",
  background: "#F45A1E",
  color: "#FFFFFF",
  fontFamily: "Saira, sans-serif",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};
