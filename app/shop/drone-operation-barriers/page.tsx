import Link from "next/link";
import BuyButton from "@/components/shop/BuyButton";

const features = [
  "6 ft retractable webbing per post",
  "High-visibility orange finish",
  "DRONE OPERATION printed webbing",
  "Portable weighted-base design",
  "Fast setup and teardown",
  "Useful across commercial drone scenarios",
];

export default function DroneOperationBarriersPage() {
  return (
    <div className="bg-[#f5f7fa] text-[#172033]">
      <section className="border-b border-[#d9e0e8] bg-white">
        <div className="container-app py-5 text-sm text-[#5f6b7a]">
          <Link href="/shop" className="hover:text-[#f26a1b]">Shop</Link>
          <span className="mx-2">/</span>
          <Link href="/safety-equipment" className="hover:text-[#f26a1b]">Safety Equipment</Link>
          <span className="mx-2">/</span>
          Drone Operation Barriers
        </div>
      </section>

      <section className="container-app grid gap-10 py-12 md:grid-cols-2 md:py-16">
        <div className="overflow-hidden rounded-2xl bg-[#0b1118] shadow-xl">
          <img src="/shop/drone-barrier-hero.svg" alt="Drone Operation retractable barrier system" className="h-full min-h-[420px] w-full object-cover" />
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">DOM Field Equipment</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">Drone Operation Retractable Barrier System</h1>
          <p className="mt-5 text-lg leading-8 text-[#5f6b7a]">A simple, visible way to define your working area during drone operations. The webbing intentionally says only <strong className="text-[#172033]">DRONE OPERATION</strong>, keeping the barrier useful across mapping, inspections, construction, events, training, and other field environments.</p>
          <div className="mt-7 grid grid-cols-2 gap-3">
            {features.map((feature) => <div key={feature} className="flex gap-2 rounded-lg border border-[#d9e0e8] bg-white p-3 text-sm font-medium"><span className="text-[#f26a1b]">✓</span>{feature}</div>)}
          </div>
          <p className="mt-6 text-xs leading-5 text-[#5f6b7a]">These barriers are a field-organization and visibility product. They are not represented as an FAA-required safety device or as a substitute for an operator&apos;s required risk assessment, site controls, or regulatory obligations.</p>
        </div>
      </section>

      <section className="border-y border-[#d9e0e8] bg-white py-14 md:py-18">
        <div className="container-app">
          <div className="mb-9">
            <p className="text-sm font-bold uppercase tracking-[.16em] text-[#f26a1b]">Choose Your Kit</p>
            <h2 className="mt-2 text-3xl font-extrabold">Simple pricing. Secure Stripe checkout.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <article id="three-pack" className="overflow-hidden rounded-2xl border border-[#d9e0e8] bg-[#f7f8fa]">
              <img src="/shop/drone-barrier-3-pack.svg" alt="Exactly three Drone Operation barrier posts" className="aspect-[9/6.5] w-full object-cover" />
              <div className="p-7">
                <div className="flex items-center justify-between gap-4">
                  <div><span className="rounded-full bg-[#172033] px-3 py-1 text-xs font-bold text-white">FIELD KIT</span><h3 className="mt-4 text-2xl font-extrabold">3-Post Barrier Kit</h3></div>
                  <div className="text-4xl font-extrabold text-[#f26a1b]">$149</div>
                </div>
                <p className="mt-4 leading-7 text-[#5f6b7a]">Exactly three retractable posts. Ideal for a compact pilot station, launch point, or temporary work perimeter.</p>
                <BuyButton productKey="barrier-3" label="Buy 3-Post Kit — $149" />
              </div>
            </article>

            <article id="four-pack" className="overflow-hidden rounded-2xl border-2 border-[#f26a1b] bg-[#f7f8fa] shadow-lg">
              <img src="/shop/drone-barrier-4-pack.svg" alt="Exactly four Drone Operation barrier posts" className="aspect-[9/6.5] w-full object-cover" />
              <div className="p-7">
                <div className="flex items-center justify-between gap-4">
                  <div><span className="rounded-full bg-[#f26a1b] px-3 py-1 text-xs font-bold text-white">BEST VALUE</span><h3 className="mt-4 text-2xl font-extrabold">4-Post Barrier Kit</h3></div>
                  <div className="text-4xl font-extrabold text-[#f26a1b]">$199</div>
                </div>
                <p className="mt-4 leading-7 text-[#5f6b7a]">Exactly four retractable posts for a complete rectangular or square operating perimeter around your crew and equipment.</p>
                <BuyButton productKey="barrier-4" label="Buy 4-Post Kit — $199" />
              </div>
            </article>
          </div>
          <p className="mt-5 text-center text-xs text-[#5f6b7a]">Stripe securely collects payment, billing details, shipping address, and phone number at checkout. Shipping charges are not added automatically at this time.</p>
        </div>
      </section>

      <section className="bg-[#0b1118] py-16 text-white">
        <div className="container-app grid gap-8 md:grid-cols-[1.2fr_.8fr] md:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Corporate & Fleet Orders</p>
            <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Need 12, 24, or more?</h2>
            <p className="mt-4 max-w-2xl text-slate-300">For organizations outfitting multiple drone crews, DOM can quote larger quantities directly. Corporate pricing is handled separately so freight and quantity pricing can be confirmed correctly.</p>
          </div>
          <div className="md:text-right"><a href="mailto:ops@droneopsman.com?subject=Corporate%20Drone%20Barrier%20Order" className="inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Request Corporate Pricing</a></div>
        </div>
      </section>
    </div>
  );
}
