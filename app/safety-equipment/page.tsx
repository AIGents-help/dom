import Link from "next/link";

export default function SafetyEquipmentPage() {
  return (
    <div className="bg-[#f5f7fa] text-[#172033]">
      <section className="bg-[#0b1118] text-white">
        <div className="container-app grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Drone Safety Equipment</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">Professional ground-control equipment for drone operations.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">DOM keeps this category intentionally focused. We are starting with one field-ready product: retractable Drone Operation barriers that create a clear, professional perimeter around pilots, launch points, equipment, and client viewing areas.</p>
            <Link href="/shop/drone-operation-barriers" className="mt-7 inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">View Barrier Systems →</Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <img src="/shop/drone-barrier-hero.svg" alt="Drone Operation retractable barriers" className="h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="container-app py-16 md:py-20">
        <div className="mb-10">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-[#f26a1b]">Available Now</p>
          <h2 className="mt-2 text-3xl font-extrabold md:text-4xl">Drone Operation Barrier Systems</h2>
          <p className="mt-3 max-w-2xl text-[#5f6b7a]">High-visibility orange retractable posts with 6 ft webbing printed simply with DRONE OPERATION.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Link href="/shop/drone-operation-barriers#three-pack" className="overflow-hidden rounded-2xl border border-[#d9e0e8] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <img src="/shop/drone-barrier-3-pack.svg" alt="Exactly three Drone Operation barrier posts" className="aspect-[9/6] w-full object-cover" />
            <div className="p-6">
              <div className="flex items-center justify-between gap-4"><h3 className="text-2xl font-extrabold">3-Post Barrier Kit</h3><span className="text-3xl font-extrabold text-[#f26a1b]">$149</span></div>
              <p className="mt-3 text-sm leading-6 text-[#5f6b7a]">Three posts for a compact pilot station, launch point, or temporary work perimeter.</p>
              <div className="mt-5 font-bold">View & buy with Stripe →</div>
            </div>
          </Link>

          <Link href="/shop/drone-operation-barriers#four-pack" className="overflow-hidden rounded-2xl border-2 border-[#f26a1b] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <img src="/shop/drone-barrier-4-pack.svg" alt="Exactly four Drone Operation barrier posts" className="aspect-[9/6] w-full object-cover" />
            <div className="p-6">
              <div className="flex items-center justify-between gap-4"><h3 className="text-2xl font-extrabold">4-Post Barrier Kit</h3><span className="text-3xl font-extrabold text-[#f26a1b]">$199</span></div>
              <p className="mt-3 text-sm leading-6 text-[#5f6b7a]">Four posts for a complete square or rectangular operating perimeter.</p>
              <div className="mt-5 font-bold">View & buy with Stripe →</div>
            </div>
          </Link>
        </div>
      </section>

      <section className="border-y border-[#d9e0e8] bg-white">
        <div className="container-app grid gap-8 py-12 md:grid-cols-3">
          <div><p className="text-sm font-bold uppercase tracking-wider text-[#f26a1b]">Visible</p><h3 className="mt-2 text-xl font-extrabold">Clearly defines the work area</h3><p className="mt-2 text-sm text-[#5f6b7a]">A simple visual cue for crews, clients, pedestrians, and nearby workers.</p></div>
          <div><p className="text-sm font-bold uppercase tracking-wider text-[#f26a1b]">Flexible</p><h3 className="mt-2 text-xl font-extrabold">Generic wording by design</h3><p className="mt-2 text-sm text-[#5f6b7a]">DRONE OPERATION works across mapping, inspections, construction, training, events, and other missions.</p></div>
          <div><p className="text-sm font-bold uppercase tracking-wider text-[#f26a1b]">Scalable</p><h3 className="mt-2 text-xl font-extrabold">Fleet orders available</h3><p className="mt-2 text-sm text-[#5f6b7a]">For 12+ posts or multi-crew orders, contact DOM for direct pricing and freight coordination.</p></div>
        </div>
      </section>
    </div>
  );
}
