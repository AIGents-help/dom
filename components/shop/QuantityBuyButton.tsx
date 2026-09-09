"use client";

import { useState } from "react";

export default function QuantityBuyButton({ productKey, unitPrice, options }: { productKey: string; unitPrice: number; options?: string[] }) {
  const [quantity, setQuantity] = useState(1);
  const [option, setOption] = useState(options?.[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey, quantity, size: option || undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "Unable to start checkout");
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout");
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end gap-3">
        {options && (
          <label className="grid gap-2 text-sm font-bold text-slate-200">
            Size
            <select value={option} onChange={(event) => setOption(event.target.value)} className="h-12 rounded-lg border border-white/20 bg-[#111923] px-4 text-base text-white">
              {options.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        <label className="grid gap-2 text-sm font-bold text-slate-200">
          Quantity
          <select
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="h-12 rounded-lg border border-white/20 bg-[#111923] px-4 text-base text-white"
          >
            {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button onClick={buy} disabled={loading} className="h-12 rounded-lg bg-[#f26a1b] px-6 font-extrabold text-white transition hover:bg-[#d9570c] disabled:cursor-wait disabled:opacity-60">
          {loading ? "Opening checkout…" : `Buy ${quantity} — $${unitPrice * quantity}`}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
