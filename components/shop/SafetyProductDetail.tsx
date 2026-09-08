import Link from "next/link";
import BarrierProductVisual from "@/components/shop/BarrierProductVisual";
import BuyButton from "@/components/shop/BuyButton";

type Count = 1 | 3 | 4 | 6 | 12 | 24;

type Props = {
  count: Count;
  name: string;
  price: string;
  productKey: string;
  badge: string;
  description: string;
};

export default function SafetyProductDetail({ count, name, price, productKey, badge, description }: Props) {
  return (
    <div className="min-h-screen bg-[#0b1118] text-white">
      <div className="container-app py-6 text-sm text-slate-400">
        <Link href="/safety-equipment" className="hover:text-[#f26a1b]">Safety Equipment</Link>
        <span className="mx-2">/</span>
        {name}
      </div>

      <section className="container-app grid gap-10 pb-16 pt-4 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
          <BarrierProductVisual count={count} className="h-full w-full" label={`${name} — exact quantity shown`} />
        </div>

        <div>
          <span className="inline-flex rounded-full bg-[#f26a1b] px-3 py-1 text-xs font-black tracking-wider text-white">{badge}</span>
          <p className="mt-5 text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">DOM Safety Equipment</p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight md:text-5xl">{name}</h1>
          <div className="mt-4 text-5xl font-black text-[#f26a1b]">{price}</div>
          <p className="mt-6 text-lg leading-8 text-slate-300">{description}</p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {[
              `Exactly ${count} ${count === 1 ? "post" : "posts"} included`,
              "6 ft retractable webbing per post",
              "DRONE OPERATION printed webbing",
              "Black or high-visibility orange posts",
              "Portable stable-base design",
              "Fast setup and teardown",
            ].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-[#111923] p-4 text-sm font-semibold text-slate-200">
                <span className="mr-2 text-[#f26a1b]">✓</span>{item}
              </div>
            ))}
          </div>

          <BuyButton productKey={productKey} label={`Buy ${name} — ${price}`} />
          <p className="mt-3 text-xs leading-5 text-slate-500">Stripe securely collects payment, billing details, shipping address, and phone number at checkout. Shipping charges are not added automatically at this time.</p>
        </div>
      </section>

      {count === 4 && (
        <section className="container-app pb-16">
          <div className="mb-6 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Two protected setups</p>
            <h2 className="mt-2 text-3xl font-extrabold">Protect the pilot or isolate a larger aircraft.</h2>
            <p className="mt-3 leading-7 text-slate-400">Create a dedicated operating space for a pilot maintaining VLOS, or establish a separate landing perimeter that keeps people safely away from the aircraft.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#111923]">
              <BarrierProductVisual count={4} variant="pilot" className="aspect-square w-full" label="Four-post protected pilot operating space" />
              <figcaption className="p-5"><strong className="block text-lg">Pilot protection</strong><span className="mt-1 block text-sm leading-6 text-slate-400">A visible buffer from vehicles, workers, and interruptions while the pilot focuses on the controller and maintains VLOS.</span></figcaption>
            </figure>
            <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#111923]">
              <BarrierProductVisual count={4} variant="drone" className="aspect-square w-full" label="Four-post protected large-drone landing zone" />
              <figcaption className="p-5"><strong className="block text-lg">Large-drone landing zone</strong><span className="mt-1 block text-sm leading-6 text-slate-400">A dedicated, unoccupied perimeter with generous clearance around a powered-down enterprise aircraft.</span></figcaption>
            </figure>
          </div>
        </section>
      )}

      <section className="border-y border-white/10 bg-[#0e151e]">
        <div className="container-app grid gap-6 py-10 md:grid-cols-3">
          <div><h2 className="font-extrabold">Professional field presence</h2><p className="mt-2 text-sm text-slate-400">Create a clear, intentional operating perimeter around your crew and equipment.</p></div>
          <div><h2 className="font-extrabold">Simple wording</h2><p className="mt-2 text-sm text-slate-400">DRONE OPERATION keeps the barrier useful across mapping, inspections, construction, training, and events.</p></div>
          <div><h2 className="font-extrabold">Need a different quantity?</h2><p className="mt-2 text-sm text-slate-400"><Link href="/safety-equipment" className="font-bold text-[#f26a1b] hover:underline">View all barrier packages →</Link></p></div>
        </div>
      </section>
    </div>
  );
}
