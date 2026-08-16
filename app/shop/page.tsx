import Link from "next/link";

const merch = [
  { name: "DOM T-Shirts", type: "Apparel", image: "/shop/merch/dom-merch-tshirt-v2.webp", alt: "DOM branded black crew-neck T-shirt worn during a commercial drone mapping operation", copy: "Branded everyday shirts for pilots, crews, supporters, and events." },
  { name: "DOM Performance Polos", type: "Professional Apparel", image: "/shop/merch/dom-merch-polo-v2.webp", alt: "DOM embroidered black performance polo at a professional drone command station", copy: "A clean client-facing option for site visits, meetings, and trade events." },
  { name: "DOM Hats", type: "Headwear", image: "/shop/merch/dom-merch-hat-action.webp", alt: "DOM embroidered black performance cap on a drone equipment case", copy: "Low-profile branded caps for field crews and everyday wear." },
  { name: "DOM Hoodies", type: "Apparel", image: "/shop/merch/dom-merch-hoodie-action.webp", alt: "DOM branded black zip hoodie displayed beside a drone field trailer", copy: "Cold-weather branded gear for field operations and off-site wear." },
  { name: "DOM Sticker & Decal Packs", type: "Accessories", image: "/shop/merch/dom-merch-decals-action.webp", alt: "Assorted DOM die-cut stickers and decals for drone equipment", copy: "Equipment-case, laptop, trailer, and hard-surface DOM branding." },
  { name: "DOM Patches", type: "Accessories", image: "/shop/merch/dom-merch-patches-action.webp", alt: "DOM embroidered rectangular and circular patches on a tactical drone bag", copy: "Velcro-ready and sew-on branding for bags, jackets, and crew gear." },
];

export default function ShopPage() {
  return (
    <div className="bg-[#090f16] text-white">
      <section className="border-b border-white/10 bg-[linear-gradient(135deg,#090f16_0%,#0d1722_55%,#111923_100%)]">
        <div className="container-app grid gap-10 py-14 lg:grid-cols-[.95fr_1.05fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-black uppercase tracking-[.22em] text-[#f26a1b]">DOM Shop</p>
            <h1 className="mt-3 max-w-xl text-5xl font-black leading-[.95] md:text-7xl">Wear the operation.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Official DOM merchandise for pilots, crews, supporters, and events. Operational barriers and field equipment remain under Safety Equipment.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#merch" className="rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Browse DOM Merchandise</a>
              <Link href="/safety-equipment" className="rounded-lg border border-white/20 px-6 py-3.5 font-bold text-white transition hover:border-[#f26a1b]">Safety Equipment →</Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 overflow-hidden rounded-3xl border border-white/10 bg-[#111923] p-3 shadow-2xl">
            <div className="relative min-h-[420px] overflow-hidden rounded-2xl">
              <img src="/shop/merch/dom-merch-tshirt-v2.webp" alt="DOM branded crew-neck T-shirt worn during a live drone field operation" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 pt-24">
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#f26a1b]">Field Apparel</p>
                <p className="mt-1 text-xl font-black">DOM T-Shirt</p>
              </div>
            </div>
            <div className="relative min-h-[420px] overflow-hidden rounded-2xl">
              <img src="/shop/merch/dom-merch-polo-v2.webp" alt="DOM branded performance polo worn at a professional drone command station" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 pt-24">
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#f26a1b]">Client Facing</p>
                <p className="mt-1 text-xl font-black">DOM Performance Polo</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="merch" className="container-app py-14 md:py-20">
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-[#f26a1b]">Merchandise</p>
            <h2 className="mt-2 text-3xl font-black md:text-4xl">DOM branded gear in the field.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">Live-action merchandise concepts are shown below. Final sizes, inventory, and pricing will be added as the actual merchandise is finalized.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {merch.map((item) => (
            <article key={item.name} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111923] transition hover:-translate-y-1 hover:border-[#f26a1b]/70 hover:shadow-2xl">
              <div className="relative aspect-[4/3] overflow-hidden bg-[#0b1118]">
                <img
                  src={item.image}
                  alt={item.alt}
                  className="h-full w-full object-cover object-center transition duration-300 hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
              </div>
              <div className="p-6">
                <p className="text-xs font-black uppercase tracking-[.16em] text-[#f26a1b]">{item.type}</p>
                <h3 className="mt-2 text-xl font-black">{item.name}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.copy}</p>
                <div className="mt-5 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-300">Coming Soon</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0e151e]">
        <div className="container-app grid gap-8 py-12 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[.18em] text-[#f26a1b]">Looking for field equipment?</p>
            <h2 className="mt-3 text-3xl font-black">Drone Operation barriers are under Safety Equipment.</h2>
            <p className="mt-3 max-w-xl text-slate-400">Barrier kits and operational field equipment stay separate from DOM merchandise.</p>
          </div>
          <Link href="/safety-equipment" className="inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Go to Safety Equipment →</Link>
        </div>
      </section>
    </div>
  );
}
