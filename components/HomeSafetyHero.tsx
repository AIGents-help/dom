import Link from "next/link";
import Image from "next/image";

export default function HomeSafetyHero() {
  return (
    <section className="relative overflow-hidden border-b border-[#F45A1E] bg-[#4B535B]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_26%,rgba(244,90,30,.16),transparent_30%),linear-gradient(120deg,rgba(7,11,15,.96)_0%,rgba(25,31,36,.94)_46%,rgba(75,83,91,.88)_100%)]" />
      <div className="relative mx-auto grid min-h-[560px] max-w-[1536px] items-center gap-8 px-6 py-10 lg:grid-cols-[.82fr_1.18fr] lg:px-10">
        <div className="relative z-10 max-w-[610px]">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#F45A1E]">
            Professional Drone Operations
          </p>
          <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-tight text-white md:text-6xl lg:text-7xl">
            Higher Insights.
            <span className="mt-2 block text-[#F45A1E]">Real Results.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-base leading-relaxed text-white/90 md:text-lg">
            Professional drone operations for inspection, mapping, construction, real estate,
            infrastructure, and more — with mission-ready safety equipment built into the workflow.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/request-mission" className="rounded-md bg-[#F45A1E] px-6 py-4 font-bold text-black transition hover:bg-[#ff7338]">
              Request a Mission →
            </Link>
            <Link href="/safety-equipment" className="rounded-md border border-[#F45A1E] bg-black/35 px-6 py-4 font-bold text-white backdrop-blur-sm transition hover:bg-black/55">
              View Safety Equipment
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold text-white">
            <span>✓ Safety First</span>
            <span>✓ Data You Can Trust</span>
            <span>✓ FAA Part 107 Pilots</span>
            <span>✓ Local & Nationwide</span>
          </div>
        </div>

        <div className="relative z-10 grid gap-4 sm:grid-cols-2">
          <Link href="/safety-equipment/4-post-perimeter-kit" className="group relative min-h-[430px] overflow-hidden rounded-2xl border border-white/15 bg-black/25 shadow-2xl">
            <Image
              src="/shop/barriers/dom-4-post-large-drone-zone.webp"
              alt="Actual DOM 4-post Drone Operation barrier kit protecting a drone landing zone"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 36vw"
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/10" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-[#F45A1E]">Actual DOM Equipment</div>
              <div className="mt-1 text-lg font-black text-white">Drone Landing Zone</div>
              <div className="text-xs text-white/75">4-post retractable barrier perimeter</div>
            </div>
          </Link>

          <Link href="/safety-equipment/4-post-perimeter-kit" className="group relative min-h-[430px] overflow-hidden rounded-2xl border border-white/15 bg-black/25 shadow-2xl">
            <Image
              src="/shop/barriers/dom-4-post-pilot-protection.webp"
              alt="Actual DOM 4-post Drone Operation barrier kit protecting a working pilot"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 36vw"
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/10" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-[#F45A1E]">Actual DOM Equipment</div>
              <div className="mt-1 text-lg font-black text-white">Pilot Protection Zone</div>
              <div className="text-xs text-white/75">Keep the operator visible, protected, and uninterrupted</div>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
