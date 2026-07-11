"use client";

import { use, useEffect, useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripeClient";

// Client payment page: /pay/<assignmentId>
// Loads the mission's PaymentIntent from /api/checkout, then collects payment.
export default function PayPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [desc, setDesc] = useState<string>("");
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not start checkout.");
        setAmount(data.amount);
        setDesc(data.description ?? "Drone mission");
        if (data.alreadyPaid) {
          setAlreadyPaid(true);
        } else {
          setClientSecret(data.clientSecret);
        }
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [assignmentId]);

  return (
    <div style={wrap}>
      <div style={card}>
        <p style={eyebrow}>◆ DOM · Secure Checkout</p>
        <h1 style={h1}>{desc || "Mission payment"}</h1>
        {amount != null && <p style={amt}>${(amount / 100).toFixed(2)} USD</p>}

        {error && <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>}

        {alreadyPaid ? (
          <p style={{ color: "#4FD1C5", fontSize: 14, marginTop: 18 }}>
            ✓ Payment received — thank you! A receipt has been sent to your email.
          </p>
        ) : clientSecret ? (
          <Elements
            stripe={getStripePromise()}
            options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#FF8A3D" } } }}
          >
            <PayForm />
          </Elements>
        ) : (
          !error && <p style={{ color: "#8A95A7", fontSize: 14 }}>Loading secure checkout…</p>
        )}
      </div>
    </div>
  );
}

function PayForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErr(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/pay/success` },
    });
    if (error) {
      setErr(error.message ?? "Payment failed.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <PaymentElement />
      {err && <p style={{ color: "#FF8A3D", fontSize: 13, marginTop: 12 }}>{err}</p>}
      <button onClick={pay} disabled={!stripe || submitting} style={btn}>
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", background: "#0A0E14", padding: 24 };
const card: React.CSSProperties = { width: "100%", maxWidth: 440, padding: 32, border: "1px solid #232C3B", borderRadius: 16, background: "#11161F", color: "#E8ECF2", fontFamily: "Inter, system-ui, sans-serif" };
const eyebrow: React.CSSProperties = { fontFamily: "IBM Plex Mono, monospace", fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: "#FF8A3D" };
const h1: React.CSSProperties = { fontFamily: "Saira, sans-serif", fontSize: 23, marginTop: 10 };
const amt: React.CSSProperties = { fontFamily: "IBM Plex Mono, monospace", fontSize: 28, color: "#4FD1C5", margin: "6px 0 18px" };
const btn: React.CSSProperties = { width: "100%", marginTop: 20, padding: 13, borderRadius: 10, border: "none", background: "#FF8A3D", color: "#0A0E14", fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer" };
