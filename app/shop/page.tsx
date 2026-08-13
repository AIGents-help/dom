import Link from "next/link";

const merch = [
  { name: "DOM T-Shirts", type: "Apparel", icon: "T", copy: "Branded everyday shirts for pilots, crews, supporters, and events." },
  { name: "DOM Polos", type: "Professional Apparel", icon: "P", copy: "A cleaner client-facing option for site visits, meetings, and trade events." },
  { name: "DOM Hats", type: "Headwear", icon: "H", copy: "Low-profile branded caps for field crews and everyday wear." },
  { name: "DOM Hoodies", type: "Apparel", icon: "D", copy: "Cold-weather branded gear for field operations and off-site wear." },
  { name: "DOM Sticker & Decal Packs", type: "Accessories", icon: "S", copy: "Equipment-case, laptop, trailer, and hard-surface DOM branding." },
  { name: "DOM Patches", type: "Accessories", icon: "◈", copy: "Velcro-ready and sew-on branding for bags, jackets, and crew gear." },
];

export default function ShopPage() {
  return (
    <div className="bg-[#0b1118] text-white">
      <section className="border-b border-white/10">
        <div className="container-app grid gap-10 py-16 md:grid-cols-[1.1fr_.9fr] md:items-center md:py-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-[#f26a1b]">DOM Shop</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight md:text-6xl">Wear the operation.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">The DOM Shop is for branded merchandise — shirts, hats, hoodies, stickers, patches, and other company gear. Professional field equipment lives separately under Safety Equipment.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#merch" className="rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Browse DOM Merchandise</a>
              <Link href="/safety-equipment" className="rounded-lg border border-white/20 px-6 py-3.5 font-bold text-white transition hover:border-[#f26a1b]">Safety Equipment →</Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#111923] p-8 md:p-10">
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-[#f26a1b]/30 bg-gradient-to-br from-[#101820] to-[#070b10] text-center">
              <img src="/brand/dom-lockup-horizontal.png?v=3" alt="DOM — Drone Operation Management" className="w-[70%] max-w-md" />
              <p className="mt-8 text-sm font-bold uppercase tracking-[.22em] text-[#f26a1b]">Official DOM Merchandise</p>
              <p className="mt-3 max-w-sm px-6 text-sm leading-6 text-slate-400">Field identity, crew apparel, stickers, patches, and branded gear.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="merch" className="container-app py-16 md:py-20">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Merchandise</p>
            <h2 className="mt-2 text-3xl font-extrabold md:text-4xl">DOM branded gear.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">Merchandise is being finalized. These categories are intentionally separated from operational Safety Equipment so customers always know what they are buying.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {merch.map((item) => (
            <article key={item.name} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111923]">
              <div className="flex aspect-[9/5.5] items-center justify-center bg-white p-8">
                <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-[#f26a1b] text-5xl font-black text-[#172033]">{item.icon}</div>
              </div>
              <div className="p-6">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#f26a1b]">{item.type}</p>
                <h3 className="mt-2 text-xl font-extrabold">{item.name}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.copy}</p>
                <div className="mt-5 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-300">Coming Soon</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0e151e]">
        <div className="container-app grid gap-8 py-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Looking for field equipment?</p>
            <h2 className="mt-3 text-3xl font-extrabold">Drone Operation barriers are under Safety Equipment.</h2>
            <p className="mt-3 max-w-xl text-slate-400">Barrier kits, professional operating-perimeter equipment, and future field-safety products are kept in their own operational category.</p>
          </div>
          <div className="md:text-right"><Link href="/safety-equipment" className="inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Go to Safety Equipment →</Link></div>
        </div>
      </section>
    </div>
  );
}
