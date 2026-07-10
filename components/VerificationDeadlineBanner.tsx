"use client";

import { useState } from "react";

// Persistent countdown for unverified pilots on the free-access clock.
// Verified pilots (part107_verified) never see this regardless of deadline
// state — verification always overrides the deadline machinery.

const V = { signal: "#FF8A3D", telemetry: "#4FD1C5", ground: "#0A0E14", ink: "#E8ECF2", inkDim: "#8A95A7" };

interface Props {
  accessToken: string;
  part107Verified: boolean;
  membershipDeadline: string | null;
  resourcesLocked: boolean;
  resourceAccessActive: boolean;
  onGoToProfile: () => void;
}

export default function VerificationDeadlineBanner({
  accessToken,
  part107Verified,
  membershipDeadline,
  resourcesLocked,
  resourceAccessActive,
  onGoToProfile,
}: Props) {
  const [upgrading, setUpgrading] = useState(false);

  if (part107Verified || !membershipDeadline || resourceAccessActive) return null;

  const daysRemaining = Math.ceil((new Date(membershipDeadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  async function startUpgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/pilot/resource-access/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Could not start checkout.");
    } finally {
      setUpgrading(false);
    }
  }

  if (resourcesLocked) {
    return (
      <div style={{ border: `1px solid ${V.signal}`, borderRadius: 12, background: "rgba(255,138,61,.08)", padding: 16, marginBottom: 18 }}>
        <p style={{ color: V.signal, fontSize: 14, fontWeight: 600, margin: 0 }}>
          Your free resource access has paused — your {new Date(membershipDeadline).toLocaleDateString()} deadline passed without a verified Part 107 certificate on file.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={onGoToProfile} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${V.signal}`, background: "transparent", color: V.signal, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Verify now →
          </button>
          <button onClick={startUpgrade} disabled={upgrading} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            {upgrading ? "…" : "Keep studying (paid plan) →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${daysRemaining <= 3 ? V.signal : "#232C3B"}`, borderRadius: 12, background: daysRemaining <= 3 ? "rgba(255,138,61,.06)" : "#11161F", padding: "12px 16px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <p style={{ color: daysRemaining <= 3 ? V.signal : V.inkDim, fontSize: 13, margin: 0 }}>
        {daysRemaining > 0
          ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} of free resource access left — deadline is ${new Date(membershipDeadline).toLocaleDateString()}.`
          : "Your access deadline has passed — a final notice is on its way."}
      </p>
      <button onClick={onGoToProfile} style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #232C3B", background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
        Add Part 107 # →
      </button>
    </div>
  );
}
