import Link from "next/link";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function ShopSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const sessionId = (await searchParams).session_id;
  let orderNumber = "";
  let paid = false;
  if (sessionId?.startsWith("cs_")) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.order_type === "dom_safety_equipment") {
        orderNumber = session.metadata.order_number ?? "";
        paid = session.payment_status === "paid";
      }
    } catch {
      // Keep the receipt page usable if Stripe is temporarily unavailable.
    }
  }
  return <div className="bg-[#f5f7fa] text-[#172033]"><section className="container-app py-20 md:py-28"><div className="mx-auto max-w-2xl rounded-2xl border border-[#d9e0e8] bg-white p-8 text-center shadow-sm md:p-12">
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f26a1b]/10 text-3xl text-[#f26a1b]">✓</div>
    <p className="mt-6 text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">{paid ? "Order received" : "Payment processing"}</p>
    <h1 className="mt-3 text-4xl font-extrabold">Thank you for your order.</h1>
    {orderNumber && <p className="mt-4 text-lg font-bold">Order {orderNumber}</p>}
    <p className="mt-4 leading-7 text-[#5f6b7a]">{paid ? "Your order is now in DOM’s fulfillment queue. A confirmation email is on its way, and we’ll send tracking details after shipment." : "Stripe is confirming your payment. We’ll email your order confirmation as soon as it clears."}</p>
    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/shop" className="rounded-lg bg-[#172033] px-6 py-3.5 font-bold text-white transition hover:bg-[#0b1118]">Return to Shop</Link><Link href="/safety-equipment" className="rounded-lg border border-[#d9e0e8] px-6 py-3.5 font-bold text-[#172033] transition hover:border-[#f26a1b]">Safety Equipment</Link></div>
  </div></section></div>;
}
