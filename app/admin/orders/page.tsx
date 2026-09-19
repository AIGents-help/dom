"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

type Item = { id: string; product_name: string; variant: string | null; quantity: number; line_total_cents: number };
type Order = { id: string; order_number: string; status: string; payment_status: string; customer_name: string | null; customer_email: string | null; customer_phone: string | null; total_cents: number; shipping_address: Record<string, string> | null; tracking_carrier: string | null; tracking_number: string | null; tracking_url: string | null; admin_notes: string | null; created_at: string; shop_order_items: Item[] };
type Inventory = { product_key: string; product_name: string; fulfillment_mode: string; available_quantity: number | null; shipping_base_cents: number; shipping_additional_cents: number; active: boolean };

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const request = useCallback(async (init?: RequestInit) => {
    const { data } = await getSupabaseBrowser().auth.getSession();
    if (!data.session) throw new Error("Admin session expired");
    const response = await fetch("/api/admin/orders", { cache: "no-store", ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...(init?.headers ?? {}) } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Order request failed");
    return result;
  }, []);
  const load = useCallback(async () => { try { const result = await request(); setOrders(result.orders); setInventory(result.inventory); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load orders"); } }, [request]);
  useEffect(() => {
    let active = true;
    void request().then((result) => {
      if (!active) return;
      setOrders(result.orders);
      setInventory(result.inventory);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "Unable to load orders");
    });
    return () => { active = false; };
  }, [request]);
  const shown = useMemo(() => filter === "all" ? orders : orders.filter((order) => filter === "open" ? !["delivered", "cancelled", "refunded"].includes(order.status) : order.status === filter), [filter, orders]);

  async function act(payload: Record<string, unknown>, key: string) {
    setBusy(key); setMessage("");
    try { await request({ method: "PATCH", body: JSON.stringify(payload) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Update failed"); }
    finally { setBusy(null); }
  }

  return <main className="section"><div className="container-app">
    <p className="eyebrow mb-2">Shop Operations</p><h1 className="heading-lg">Orders & Fulfillment</h1>
    <p className="body-muted mt-2">Paid orders enter this queue automatically. Add tracking here to notify the customer.</p>
    {message && <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
    <div className="mt-6 flex flex-wrap gap-2">{["open", "new", "processing", "inventory_hold", "shipped", "delivered", "refunded", "all"].map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${filter === value ? "border-[#f26a1b] bg-[#f26a1b] text-white" : "border-slate-300 bg-white"}`}>{value.replaceAll("_", " ")}</button>)}</div>
    <div className="mt-5 grid gap-4">{shown.length === 0 && <div className="card p-8">No orders match this view.</div>}{shown.map((order) => <OrderCard key={order.id} order={order} busy={busy === order.id} act={(payload) => act({ ...payload, orderId: order.id }, order.id)} />)}</div>
    <section className="mt-12"><h2 className="text-2xl font-extrabold">Inventory & Shipping</h2><p className="body-muted mt-1">Use made-to-order when DOM does not maintain a count. Shipping is base plus each additional unit.</p><div className="mt-4 grid gap-3">{inventory.map((item) => <InventoryRow key={item.product_key} item={item} busy={busy === item.product_key} save={(payload) => act({ action: "inventory", productKey: item.product_key, ...payload }, item.product_key)} />)}</div></section>
  </div></main>;
}

function OrderCard({ order, busy, act }: { order: Order; busy: boolean; act: (payload: Record<string, unknown>) => void }) {
  const address = order.shipping_address ? [order.shipping_address.line1, order.shipping_address.line2, order.shipping_address.city, order.shipping_address.state, order.shipping_address.postal_code].filter(Boolean).join(", ") : "No shipping address";
  function ship() { const carrier = window.prompt("Carrier (for example UPS)"); if (!carrier) return; const trackingNumber = window.prompt("Tracking number"); if (!trackingNumber) return; const trackingUrl = window.prompt("Tracking URL (optional)") ?? ""; act({ action: "shipped", carrier, trackingNumber, trackingUrl }); }
  return <article className="card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-[#f26a1b]">{order.status.replaceAll("_", " ")}</div><h2 className="mt-1 text-xl font-extrabold">{order.order_number}</h2><p className="text-sm text-slate-600">{new Date(order.created_at).toLocaleString()}</p></div><strong className="text-xl">{money(order.total_cents)}</strong></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2"><div><strong>{order.customer_name || "Customer"}</strong><p className="text-sm text-slate-600">{order.customer_email}<br />{order.customer_phone}<br />{address}</p></div><ul className="text-sm">{order.shop_order_items.map((item) => <li key={item.id}>{item.quantity} × {item.product_name}{item.variant ? ` — ${item.variant}` : ""}</li>)}</ul></div>
    {order.tracking_number && <p className="mt-3 text-sm"><strong>Tracking:</strong> {order.tracking_carrier} {order.tracking_url ? <a href={order.tracking_url} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-[#f26a1b] underline">{order.tracking_number} ↗</a> : <> {order.tracking_number}</>}</p>}
    <OrderNotes initial={order.admin_notes ?? ""} busy={busy} save={(notes) => act({ action: "notes", notes })} />
    <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || !["new", "inventory_hold"].includes(order.status)} onClick={() => act({ action: "processing" })} className="rounded-lg border px-3 py-2 disabled:opacity-40">Start processing</button><button disabled={busy || !["new", "processing", "inventory_hold"].includes(order.status)} onClick={ship} className="rounded-lg bg-[#f26a1b] px-3 py-2 font-bold text-white disabled:opacity-40">Mark shipped</button><button disabled={busy || order.status !== "shipped"} onClick={() => act({ action: "delivered" })} className="rounded-lg border px-3 py-2 disabled:opacity-40">Mark delivered</button><button disabled={busy || order.payment_status !== "paid" || ["shipped", "delivered"].includes(order.status)} onClick={() => window.confirm(`Refund ${order.order_number}?`) && act({ action: "refund" })} className="rounded-lg border border-red-300 px-3 py-2 text-red-700 disabled:opacity-40">Refund</button><button disabled={busy || order.payment_status !== "pending" || order.status !== "pending_payment"} onClick={() => window.confirm(`Cancel unpaid checkout ${order.order_number} and release reserved stock?`) && act({ action: "cancel" })} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Cancel unpaid checkout</button></div>
  </article>;
}

function OrderNotes({ initial, busy, save }: { initial: string; busy: boolean; save: (notes: string) => void }) {
  const [notes, setNotes] = useState(initial);
  useEffect(() => { setNotes(initial); }, [initial]);
  return <div className="mt-4"><label className="text-xs font-semibold text-slate-600">Admin fulfillment notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Packing notes, customer follow-up, internal fulfillment details…" className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900" /></label><button disabled={busy || notes === initial} onClick={() => save(notes)} className="mt-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40">Save notes</button></div>;
}

function InventoryRow({ item, busy, save }: { item: Inventory; busy: boolean; save: (payload: Record<string, unknown>) => void }) {
  const [mode, setMode] = useState(item.fulfillment_mode); const [quantity, setQuantity] = useState(item.available_quantity ?? 0); const [base, setBase] = useState(item.shipping_base_cents); const [additional, setAdditional] = useState(item.shipping_additional_cents); const [active, setActive] = useState(item.active);
  useEffect(() => { setMode(item.fulfillment_mode); setQuantity(item.available_quantity ?? 0); setBase(item.shipping_base_cents); setAdditional(item.shipping_additional_cents); setActive(item.active); }, [item]);
  return <div className="card grid gap-3 p-4 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end"><strong>{item.product_name}</strong><label className="text-xs">Mode<select value={mode} onChange={(event) => setMode(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm"><option value="made_to_order">Made to order</option><option value="stocked">Stocked</option></select></label><label className="text-xs">Available<input type="number" min="0" step="1" inputMode="numeric" disabled={mode !== "stocked"} value={quantity} onChange={(event) => setQuantity(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className="mt-1 w-full rounded border p-2 text-sm" /></label><label className="text-xs">Base shipping ($)<input type="number" min="0" step="0.01" value={(base / 100).toFixed(2)} onChange={(event) => setBase(Math.round(Number(event.target.value) * 100))} className="mt-1 w-full rounded border p-2 text-sm" /></label><label className="text-xs">Each extra ($)<input type="number" min="0" step="0.01" value={(additional / 100).toFixed(2)} onChange={(event) => setAdditional(Math.round(Number(event.target.value) * 100))} className="mt-1 w-full rounded border p-2 text-sm" /></label><div className="flex items-center gap-3"><label className="text-xs"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label><button disabled={busy} onClick={() => save({ fulfillmentMode: mode, availableQuantity: quantity, shippingBaseCents: base, shippingAdditionalCents: additional, active })} className="rounded bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Save</button></div></div>;
}
