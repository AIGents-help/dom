import Image from "next/image";
import Link from "next/link";
import QuantityBuyButton from "@/components/shop/QuantityBuyButton";

export default function PortableLandingPadPage() {
  return (
    <div className="min-h-screen bg-[#0b1118] text-white">
      <div className="container-app py-6 text-sm text-slate-400">
        <Link href="/safety-equipment" className="hover:text-[#f26a1b]">Safety Equipment</Link>
        <span className="mx-2">/</span>Portable Drone Landing Pad
      </div>

      <section className="container-app grid gap-10 pb-16 pt-4 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
          <Image src="/shop/safety/portable-landing-pad.jpeg" alt="Orange portable drone landing pad" width={1560} height={1560} className="h-full w-full object-contain" priority />
        </div>
        <div>
          <span className="inline-flex rounded-full bg-[#f26a1b] px-3 py-1 text-xs font-black tracking-wider text-white">LANDING ZONE</span>
          <p className="mt-5 text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">DOM Safety Equipment</p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight md:text-5xl">Portable Drone Landing Pad</h1>
          <div className="mt-4 text-5xl font-black text-[#f26a1b]">$15 <span className="text-xl text-slate-300">each</span></div>
          <p className="mt-6 text-lg leading-8 text-slate-300">A high-visibility foldable landing surface that creates a cleaner, more professional takeoff and landing point while helping protect the aircraft from loose dirt, grass, and debris.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {["Bright orange landing surface", "Folds down for easy transport", "Clear takeoff and landing target", "Pairs with DOM barrier kits"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-[#111923] p-4 text-sm font-semibold text-slate-200"><span className="mr-2 text-[#f26a1b]">✓</span>{item}</div>
            ))}
          </div>
          <QuantityBuyButton productKey="portable-landing-pad" unitPrice={15} />
          <p className="mt-3 text-xs leading-5 text-slate-500">Stripe securely collects payment, billing details, shipping address, and phone number at checkout. Shipping charges are not added automatically at this time.</p>
        </div>
      </section>

      <section className="container-app pb-16">
        <div className="grid gap-8 overflow-hidden rounded-3xl border border-white/10 bg-[#111923] md:grid-cols-2 md:items-center">
          <Image src="/shop/safety/portable-landing-pad-in-use.jpeg" alt="Portable drone landing pad inside a DOM safety barrier perimeter" width={1254} height={1254} className="aspect-square h-full w-full object-cover" />
          <div className="p-7 md:p-10">
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Build a visible landing zone</p>
            <h2 className="mt-3 text-3xl font-extrabold">Pair it with a DOM perimeter.</h2>
            <p className="mt-4 leading-7 text-slate-400">Place the landing pad inside a three- or four-post barrier setup to make the aircraft area obvious and discourage workers, vehicles, and bystanders from entering it.</p>
            <Link href="/safety-equipment/3-post-field-kit" className="mt-6 inline-flex font-bold text-[#f26a1b] hover:underline">View the 3-Post Field Kit →</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
