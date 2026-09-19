"use client";

import { useState } from "react";

export default function QuantityBuyButton({ productKey, unitPrice, options, maxQuantity = 20 }: { productKey: string; unitPrice: number; options?: string[]; maxQuantity?: number }) {
  const purchaseLimit = Math.max(0, Math.min(20, Math.trunc(maxQuantity)));
  const [quantity, setQuantity] = useState(1);
  const [option, setOption] = useState(options?.[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    if (purchaseLimit < 1) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/shop/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productKey, quantity, size: option || undefined }) });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error ?? "Unable to start checkout");
      window.location.href = result.url;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start checkout");
      setLoading(false);
    }
  }

  if (purchaseLimit < 1) return <p className="mt-5 font-bold text-amber-400">Temporarily out of stock</p>;

  return <div className="mt-5"><div className="flex flex-wrap items-end gap-3">{options && options.length > 0 && <label className="grid gap-1 text-xs font-bold">Option<select value={option} onChange={(event) => setOption(event.target.value)} className="h-11 rounded-lg border border-white/20 bg-[#111923] px-3 text-white">{options.map((value) => <option key={value}>{value}</option>)}</select></label>}<label className="grid gap-1 text-xs font-bold">Quantity<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="h-11 rounded-lg border border-white/20 bg-[#111923] px-3 text-white">{Array.from({ length: purchaseLimit }, (_, index) => index + 1).map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => void buy()} disabled={loading} className="h-11 rounded-lg bg-[#f26a1b] px-5 font-extrabold text-white disabled:opacity-60">{loading ? "Opening checkout…" : `Buy — $${(unitPrice * quantity).toFixed(2)}`}</button></div>{purchaseLimit < 20 && <p className="mt-2 text-xs text-slate-400">{purchaseLimit} currently available.</p>}{error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}</div>;
}
