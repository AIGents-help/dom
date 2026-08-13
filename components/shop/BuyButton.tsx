"use client";

import { useState } from "react";

export default function BuyButton({ productKey, label }: { productKey: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Unable to start checkout");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || "Unable to start checkout");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={checkout}
        disabled={loading}
        className="mt-6 inline-flex w-full justify-center rounded-lg bg-[#f26a1b] px-5 py-3.5 font-bold text-white transition hover:bg-[#d9570c] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening secure checkout…" : label}
      </button>
      {error && <p className="mt-2 text-center text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
