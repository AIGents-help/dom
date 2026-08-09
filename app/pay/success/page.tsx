"use client";

// Stripe redirects here after payment. Webhook does the real reconciliation;
// this just confirms to the client.
export default function PaySuccessPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F5F7FA", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", color: "#172033", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ fontSize: 40, color: "#16A34A" }}>✓</div>
        <h1 style={{ fontFamily: "Saira, sans-serif", fontSize: 26, marginTop: 12 }}>Payment received</h1>
        <p style={{ color: "#5F6B7A", marginTop: 10 }}>
          Thanks — your mission is confirmed. DOM will be in touch with scheduling and deliverable timing.
        </p>
        <a href="/" style={{ display: "inline-block", marginTop: 22, color: "#2563EB", fontFamily: "Saira, sans-serif", fontWeight: 600 }}>
          Return to DOM →
        </a>
      </div>
    </div>
  );
}
