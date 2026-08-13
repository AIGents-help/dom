import Link from "next/link";

const merch = [
  { name: "DOM T-Shirts", type: "Apparel", icon: "T", copy: "Branded everyday shirts for pilots, crews, supporters, and events." },
  { name: "DOM Performance Polos", type: "Professional Apparel", icon: "P", copy: "A clean client-facing option for site visits, meetings, and trade events." },
  { name: "DOM Hats", type: "Headwear", icon: "H", copy: "Low-profile branded caps for field crews and everyday wear." },
  { name: "DOM Hoodies", type: "Apparel", icon: "D", copy: "Cold-weather branded gear for field operations and off-site wear." },
  { name: "DOM Sticker & Decal Packs", type: "Accessories", icon: "S", copy: "Equipment-case, laptop, trailer, and hard-surface DOM branding." },
  { name: "DOM Patches", type: "Accessories", icon: "◈", copy: "Velcro-ready and sew-on branding for bags, jackets, and crew gear." },
];

function MerchVisual({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#1e2a38_0%,#101820_48%,#070b10_100%)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#f26a1b]" />
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-[#f26a1b]/20" />
      <div className="absolute -left-20 -bottom-20 h-56 w-56 rounded-full border border-white/5" />
      <div className="relative text-center">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#f26a1b] bg-black/25 text-5xl font-black text-white shadow-2xl">{icon}</div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.22em] text-[#f26a1b]">Official DOM Merch</p>
        <p className="mt-2 text-sm font-semibold text-slate-300">{label}</p>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <div className="bg-[#090f16] text-white">
      <section className="border-b border-white/10 bg-[linear-gradient(135deg,#090f16_0%,#0d1722_55%,#111923_100%)]">
        <div className="container-app grid gap-10 py-14 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-black uppercase tracking-[.22em] text-[#f26a1b]">DOM Shop</p>
            <h1 className="mt-3 max-w-xl text-5xl font-black leading-[.95] md:text-7xl">Wear the operation.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Official DOM merchandise for pilots, crews, supporters, and events. Operational barriers and field equipment remain under Safety Equipment.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#merch" className="rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Browse DOM Merchandise</a>
              <Link href="/safety-equipment" className="rounded-lg border border-white/20 px-6 py-3.5 font-bold text-white transition hover:border-[#f26a1b]">Safety Equipment →</Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#111923] p-5 shadow-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#0b1118] p-7">
                <img src="/brand/dom-lockup-horizontal.png?v=3" alt="DOM Drone Operation Management" className="h-12 w-auto" />
                <p className="mt-10 text-xs font-black uppercase tracking-[.2em] text-[#f26a1b]">Field Apparel</p>
                <h2 className="mt-2 text-2xl font-black">DOM T-Shirts</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">Simple black-and-orange field identity that matches the DOM operating setup.</p>
              </div>
              <div className="rounded-2xl border border-[#f26a1b]/35 bg-[linear-gradient(145deg,#151d27,#080d12)] p-7">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#f26a1b] text-2xl font-black">DOM</div>
                <p className="mt-8 text-xs font-black uppercase tracking-[.2em] text-[#f26a1b]">Client Facing</p>
                <h2 className="mt-2 text-2xl font-black">Performance Polos</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">A cleaner professional option for client meetings, inspections, and field presentations.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="merch" className="container-app py-14 md:py-20">
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-[#f26a1b]">Merchandise</p>
            <h2 className="mt-2 text-3xl font-black md:text-4xl">DOM branded gear.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">The merch collection is being finalized. Product photography, sizes, inventory, and final pricing will be added only when the actual merchandise is ready to sell.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {merch.map((item) => (
            <article key={item.name} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111923] transition hover:-translate-y-1 hover:border-[#f26a1b]/70 hover:shadow-2xl">
              <MerchVisual icon={item.icon} label={item.name} />
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
