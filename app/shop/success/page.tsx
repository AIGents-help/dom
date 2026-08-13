import Link from "next/link";

export default function ShopSuccessPage() {
  return (
    <div className="bg-[#f5f7fa] text-[#172033]">
      <section className="container-app py-20 md:py-28">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[#d9e0e8] bg-white p-8 text-center shadow-sm md:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f26a1b]/10 text-3xl text-[#f26a1b]">✓</div>
          <p className="mt-6 text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Payment Received</p>
          <h1 className="mt-3 text-4xl font-extrabold">Thank you for your order.</h1>
          <p className="mt-4 leading-7 text-[#5f6b7a]">Stripe has completed your payment. DOM will use the shipping and contact information collected at checkout to process the order.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/shop" className="rounded-lg bg-[#172033] px-6 py-3.5 font-bold text-white transition hover:bg-[#0b1118]">Return to Shop</Link>
            <Link href="/safety-equipment" className="rounded-lg border border-[#d9e0e8] px-6 py-3.5 font-bold text-[#172033] transition hover:border-[#f26a1b]">Safety Equipment</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
