import Link from "next/link";

const products = [
  {
    name: "Drone Operation Barrier Kit — 3 Pack",
    price: "$149",
    image: "/shop/drone-barrier-3-pack.svg",
    href: "/shop/drone-operation-barriers#three-pack",
    badge: "FIELD KIT",
    copy: "Three high-visibility retractable posts with 6 ft DRONE OPERATION webbing on each unit.",
  },
  {
    name: "Drone Operation Barrier Kit — 4 Pack",
    price: "$199",
    image: "/shop/drone-barrier-4-pack.svg",
    href: "/shop/drone-operation-barriers#four-pack",
    badge: "BEST VALUE",
    copy: "Four-post perimeter kit for launch points, pilot stations, client viewing areas, and temporary work zones.",
  },
];

export default function ShopPage() {
  return (
    <div className="bg-[#f5f7fa] text-[#172033]">
      <section className="relative overflow-hidden bg-[#0b1118] text-white">
        <img src="/shop/drone-barrier-hero.svg" alt="DOM Drone Operation retractable barrier system" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1118] via-[#0b1118]/80 to-transparent" />
        <div className="container-app relative py-20 md:py-28">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-bold uppercase tracking-[.2em] text-[#f26a1b]">DOM Shop</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-6xl">Professional gear for real drone operations.</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">Simple field equipment selected for commercial drone crews. We are starting with one product that solves an obvious problem: creating a visible, professional operating perimeter.</p>
            <Link href="/shop/drone-operation-barriers" className="mt-8 inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Shop Drone Operation Barriers →</Link>
          </div>
        </div>
      </section>

      <section className="container-app py-16 md:py-20">
        <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.16em] text-[#f26a1b]">Drone Operations Equipment</p>
            <h2 className="mt-2 text-3xl font-extrabold md:text-4xl">Barrier systems</h2>
          </div>
          <p className="max-w-xl text-sm text-[#5f6b7a]">High-visibility orange retractable posts with simple DRONE OPERATION webbing so the same equipment can work across mapping, inspection, construction, event, public-safety, and training environments.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {products.map((product) => (
            <Link key={product.name} href={product.href} className="group overflow-hidden rounded-2xl border border-[#d9e0e8] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <div className="relative aspect-[9/6] overflow-hidden bg-[#f7f8fa]">
                <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                <span className="absolute left-5 top-5 rounded-full bg-[#172033] px-3 py-1 text-xs font-bold tracking-wider text-white">{product.badge}</span>
              </div>
              <div className="p-6 md:p-7">
                <div className="flex items-start justify-between gap-5">
                  <div><h3 className="text-xl font-extrabold">{product.name}</h3><p className="mt-2 text-sm leading-6 text-[#5f6b7a]">{product.copy}</p></div>
                  <div className="text-2xl font-extrabold text-[#f26a1b]">{product.price}</div>
                </div>
                <div className="mt-6 font-bold text-[#172033]">View product →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-[#d9e0e8] bg-white">
        <div className="container-app grid gap-8 py-12 md:grid-cols-3">
          <div><div className="text-sm font-bold uppercase tracking-wider text-[#f26a1b]">Simple</div><h3 className="mt-2 text-xl font-extrabold">One clear purpose</h3><p className="mt-2 text-sm text-[#5f6b7a]">Create a visible perimeter around a pilot, launch point, command station, or temporary work area.</p></div>
          <div><div className="text-sm font-bold uppercase tracking-wider text-[#f26a1b]">Professional</div><h3 className="mt-2 text-xl font-extrabold">Looks intentional on site</h3><p className="mt-2 text-sm text-[#5f6b7a]">A cleaner field presentation than cones, caution tape, or improvised barriers.</p></div>
          <div><div className="text-sm font-bold uppercase tracking-wider text-[#f26a1b]">Scalable</div><h3 className="mt-2 text-xl font-extrabold">Corporate & fleet orders</h3><p className="mt-2 text-sm text-[#5f6b7a]">Need a dozen or more? DOM can quote multi-crew and fleet quantities.</p></div>
        </div>
      </section>

      <section className="container-app py-16 text-center">
        <p className="text-sm font-bold uppercase tracking-[.16em] text-[#f26a1b]">Corporate Orders</p>
        <h2 className="mt-3 text-3xl font-extrabold">Outfitting multiple drone crews?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-[#5f6b7a]">For 12+ units, multi-location teams, or future custom webbing requests, contact DOM directly for quantity pricing.</p>
        <a href="mailto:ops@droneopsman.com?subject=Corporate%20Drone%20Barrier%20Order" className="mt-7 inline-flex rounded-lg bg-[#172033] px-6 py-3.5 font-bold text-white transition hover:bg-[#0b1118]">Contact Corporate Sales</a>
      </section>
    </div>
  );
}
