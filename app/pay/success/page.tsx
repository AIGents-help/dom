"use client";

// Stripe redirects here after payment. Webhook does the real reconciliation;
// this just confirms to the client.
export default function PaySuccessPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A0E14", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", color: "#E8ECF2", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ fontSize: 40, color: "#4FD1C5" }}>✓</div>
        <h1 style={{ fontFamily: "Saira, sans-serif", fontSize: 26, marginTop: 12 }}>Payment received</h1>
        <p style={{ color: "#8A95A7", marginTop: 10 }}>
          Thanks — your mission is confirmed. DOM will be in touch with scheduling and deliverable timing.
        </p>
        <a href="/" style={{ display: "inline-block", marginTop: 22, color: "#FF8A3D", fontFamily: "Saira, sans-serif", fontWeight: 600 }}>
          Return to DOM →
        </a>
      </div>
    </div>
  );
}
