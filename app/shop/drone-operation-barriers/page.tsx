import Link from "next/link";
import BuyButton from "@/components/shop/BuyButton";
import BarrierProductVisual from "@/components/shop/BarrierProductVisual";

const features = [
  "6 ft retractable webbing per post",
  "High-visibility orange finish",
  "DRONE OPERATION printed webbing",
  "Portable weighted-base design",
  "Fast setup and teardown",
  "Useful across commercial drone scenarios",
];

const products = [
  { id: "single", key: "barrier-1", count: 1 as const, name: "Single Barrier", price: "$69", badge: "SINGLE", copy: "One retractable post for extending an existing setup or creating a simple visual control point." },
  { id: "three-pack", key: "barrier-3", count: 3 as const, name: "3-Post Field Kit", price: "$179", badge: "FIELD KIT", copy: "Three posts for a compact pilot station, launch point, or temporary work perimeter." },
  { id: "four-pack", key: "barrier-4", count: 4 as const, name: "4-Post Perimeter Kit", price: "$229", badge: "BEST VALUE", copy: "Four posts for a complete square or rectangular operating perimeter around crew and equipment." },
  { id: "six-pack", key: "barrier-6", count: 6 as const, name: "6-Post Jobsite Kit", price: "$319", badge: "JOBSITE", copy: "Six posts for a larger launch zone, client viewing area, or active commercial jobsite." },
  { id: "twelve-pack", key: "barrier-12", count: 12 as const, name: "12-Post Fleet Kit", price: "$599", badge: "FLEET", copy: "Twelve posts for multiple work zones, larger perimeters, or equipping more than one crew." },
  { id: "twenty-four-pack", key: "barrier-24", count: 24 as const, name: "24-Post Corporate Kit", price: "$1,099", badge: "CORPORATE", copy: "Twenty-four posts for corporate, fleet, multi-crew, or multi-location drone operations." },
];

export default function DroneOperationBarriersPage() {
  return (
    <div className="bg-[#f5f7fa] text-[#172033]">
      <section className="border-b border-[#d9e0e8] bg-white">
        <div className="container-app py-5 text-sm text-[#5f6b7a]">
          <Link href="/safety-equipment" className="hover:text-[#f26a1b]">Safety Equipment</Link><span className="mx-2">/</span>Drone Operation Barriers
        </div>
      </section>

      <section className="container-app grid gap-10 py-12 md:grid-cols-2 md:py-16">
        <div className="overflow-hidden rounded-2xl border border-[#d9e0e8] bg-white shadow-xl">
          <BarrierProductVisual count={4} className="h-full min-h-[420px] w-full" label="Four Drone Operation retractable barrier posts" />
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
            <h2 className="mt-2 text-3xl font-extrabold">Exact quantities. Secure Stripe checkout.</h2>
            <p className="mt-3 max-w-2xl text-[#5f6b7a]">Every product visual below is generated from the exact package quantity. What you see is what the listing says.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <article id={product.id} key={product.id} className={`overflow-hidden rounded-2xl bg-[#f7f8fa] ${product.count === 4 ? "border-2 border-[#f26a1b] shadow-lg" : "border border-[#d9e0e8]"}`}>
                <div className="bg-white p-2"><BarrierProductVisual count={product.count} className="aspect-[9/6.5] w-full" label={`Exactly ${product.count} Drone Operation barrier ${product.count === 1 ? "post" : "posts"}`} /></div>
                <div className="p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div><span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${product.count === 4 ? "bg-[#f26a1b]" : "bg-[#172033]"}`}>{product.badge}</span><h3 className="mt-4 text-2xl font-extrabold">{product.name}</h3></div>
                    <div className="text-3xl font-extrabold text-[#f26a1b]">{product.price}</div>
                  </div>
                  <p className="mt-4 leading-7 text-[#5f6b7a]">{product.copy}</p>
                  <BuyButton productKey={product.key} label={`Buy ${product.name} — ${product.price}`} />
                </div>
              </article>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-[#5f6b7a]">Stripe securely collects payment, billing details, U.S. shipping address, and phone number at checkout. Shipping charges are not added automatically at this time.</p>
        </div>
      </section>

      <section className="bg-[#0b1118] py-16 text-white">
        <div className="container-app grid gap-8 md:grid-cols-[1.2fr_.8fr] md:items-center">
          <div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Corporate & Fleet Orders</p><h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Need more than 24 or custom webbing?</h2><p className="mt-4 max-w-2xl text-slate-300">The 24-post corporate kit can be purchased directly above. For larger quantities, freight coordination, or future custom corporate webbing, contact DOM for a direct quote.</p></div>
          <div className="md:text-right"><a href="mailto:ops@droneopsman.com?subject=Corporate%20Drone%20Barrier%20Order" className="inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Contact Corporate Sales</a></div>
        </div>
      </section>
    </div>
  );
}
