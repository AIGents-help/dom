import Link from "next/link";

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
        <div className="container-app py-5 text-sm text-[#5f6b7a]"><Link href="/shop" className="hover:text-[#f26a1b]">Shop</Link><span className="mx-2">/</span>Drone Operation Barriers</div>
      </section>

      <section className="container-app grid gap-10 py-12 md:grid-cols-2 md:py-16">
        <div className="overflow-hidden rounded-2xl bg-[#0b1118] shadow-xl"><img src="/shop/drone-barrier-hero.svg" alt="Drone Operation retractable barrier system" className="h-full min-h-[420px] w-full object-cover" /></div>
        <div className="flex flex-col justify-center">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">DOM Field Equipment</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">Drone Operation Retractable Barrier System</h1>
          <p className="mt-5 text-lg leading-8 text-[#5f6b7a]">A simple, visible way to define your working area during drone operations. The webbing intentionally says only <strong className="text-[#172033]">DRONE OPERATION</strong>, keeping the barrier useful across mapping, inspections, construction, events, training, and other field environments.</p>
          <div className="mt-7 grid grid-cols-2 gap-3">
            {features.map((feature) => <div key={feature} className="flex gap-2 rounded-lg border border-[#d9e0e8] bg-white p-3 text-sm font-medium"><span className="text-[#f26a1b]">✓</span>{feature}</div>)}
          </div>
          <p className="mt-6 text-xs leading-5 text-[#5f6b7a]">These barriers are a field-organization and visibility product. They are not represented as an FAA-required safety device or as a substitute for an operator's required risk assessment, site controls, or regulatory obligations.</p>
        </div>
      </section>

      <section className="border-y border-[#d9e0e8] bg-white py-14 md:py-18">
        <div className="container-app">
          <div className="mb-9"><p className="text-sm font-bold uppercase tracking-[.16em] text-[#f26a1b]">Choose Your Kit</p><h2 className="mt-2 text-3xl font-extrabold">Keep it simple.</h2></div>
          <div className="grid gap-6 md:grid-cols-2">
            <article id="three-pack" className="overflow-hidden rounded-2xl border border-[#d9e0e8] bg-[#f7f8fa]">
              <img src="/shop/drone-barrier-3-pack.svg" alt="Three-pack Drone Operation barrier kit" className="aspect-[9/6.5] w-full object-cover" />
              <div className="p-7">
                <div className="flex items-center justify-between gap-4"><div><span className="rounded-full bg-[#172033] px-3 py-1 text-xs font-bold text-white">FIELD KIT</span><h3 className="mt-4 text-2xl font-extrabold">3-Post Barrier Kit</h3></div><div className="text-4xl font-extrabold text-[#f26a1b]">$149</div></div>
                <p className="mt-4 leading-7 text-[#5f6b7a]">Three retractable posts. Ideal for a compact pilot station, launch point, or temporary work perimeter.</p>
                <a href="mailto:ops@droneopsman.com?subject=Order%20Request%20-%203%20Post%20Drone%20Operation%20Barrier%20Kit&body=I%20would%20like%20to%20order%20the%203-post%20Drone%20Operation%20Barrier%20Kit%20for%20%24149.%0A%0AName%3A%0ACompany%3A%0AQuantity%3A%0AShipping%20ZIP%3A" className="mt-6 inline-flex w-full justify-center rounded-lg bg-[#f26a1b] px-5 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Order 3-Post Kit</a>
              </div>
            </article>

            <article id="four-pack" className="overflow-hidden rounded-2xl border-2 border-[#f26a1b] bg-[#f7f8fa] shadow-lg">
              <img src="/shop/drone-barrier-4-pack.svg" alt="Four-pack Drone Operation barrier kit" className="aspect-[9/6.5] w-full object-cover" />
              <div className="p-7">
                <div className="flex items-center justify-between gap-4"><div><span className="rounded-full bg-[#f26a1b] px-3 py-1 text-xs font-bold text-white">BEST VALUE</span><h3 className="mt-4 text-2xl font-extrabold">4-Post Barrier Kit</h3></div><div className="text-4xl font-extrabold text-[#f26a1b]">$199</div></div>
                <p className="mt-4 leading-7 text-[#5f6b7a]">Four retractable posts for a complete rectangular or square operating perimeter around your crew and equipment.</p>
                <a href="mailto:ops@droneopsman.com?subject=Order%20Request%20-%204%20Post%20Drone%20Operation%20Barrier%20Kit&body=I%20would%20like%20to%20order%20the%204-post%20Drone%20Operation%20Barrier%20Kit%20for%20%24199.%0A%0AName%3A%0ACompany%3A%0AQuantity%3A%0AShipping%20ZIP%3A" className="mt-6 inline-flex w-full justify-center rounded-lg bg-[#172033] px-5 py-3.5 font-bold text-white transition hover:bg-[#0b1118]">Order 4-Post Kit</a>
              </div>
            </article>
          </div>
          <p className="mt-5 text-center text-xs text-[#5f6b7a]">Shipping and delivery timing are confirmed before payment. Product appearance may vary slightly from renderings.</p>
        </div>
      </section>

      <section className="bg-[#0b1118] py-16 text-white">
        <div className="container-app grid gap-8 md:grid-cols-[1.2fr_.8fr] md:items-center">
          <div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Corporate & Fleet Orders</p><h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Need 12, 24, or more?</h2><p className="mt-4 max-w-2xl text-slate-300">For construction firms, inspection companies, public-safety teams, utilities, universities, and other organizations outfitting multiple drone crews, DOM can quote larger quantities directly.</p></div>
          <div className="md:text-right"><a href="mailto:ops@droneopsman.com?subject=Corporate%20Drone%20Barrier%20Order" className="inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Request Corporate Pricing</a></div>
        </div>
      </section>
    </div>
  );
}
