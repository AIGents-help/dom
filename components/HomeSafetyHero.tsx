import Link from "next/link";
import Image from "next/image";

export default function HomeSafetyHero() {
  return (
    <section className="border-b border-[#F45A1E] bg-[#070b0f]">
      <div className="grid min-h-[540px] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative z-10 flex items-center bg-[radial-gradient(circle_at_20%_20%,rgba(244,90,30,.12),transparent_32%),#070b0f] px-7 py-12 md:px-12 lg:px-[6vw]">
          <div className="max-w-[590px]">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[#F45A1E]">
              Professional Drone Operations
            </p>
            <h1 className="mt-5 text-5xl font-black uppercase leading-[0.93] tracking-[-.035em] text-white md:text-6xl xl:text-7xl">
              Higher Insights.
              <span className="mt-2 block text-[#F45A1E]">Real Results.</span>
            </h1>
            <p className="mt-6 max-w-[540px] text-base leading-7 text-white/78 md:text-lg">
              Inspection, mapping, construction, real estate, infrastructure, and field operations
              delivered with professional pilots, disciplined workflows, and DOM safety equipment.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/request-mission" className="inline-flex items-center rounded-md bg-[#F45A1E] px-6 py-4 text-sm font-black text-black transition hover:bg-[#ff7338]">
                Request a Mission →
              </Link>
              <Link href="/services" className="inline-flex items-center rounded-md border border-white/25 px-6 py-4 text-sm font-black text-white transition hover:border-[#F45A1E]">
                Explore Services
              </Link>
            </div>

            <div className="mt-9 grid max-w-[560px] grid-cols-2 gap-x-6 gap-y-3 text-xs font-bold text-white/85 sm:grid-cols-4">
              <span>✓ Safety First</span>
              <span>✓ Trusted Data</span>
              <span>✓ Part 107 Pilots</span>
              <span>✓ Nationwide</span>
            </div>
          </div>
        </div>

        <div className="relative min-h-[420px] overflow-hidden lg:min-h-[540px]">
          <Image
            src="/shop/barriers/dom-4-post-large-drone-zone.webp"
            alt="DOM drone staged inside a Drone Operation landing zone"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070b0f]/35 via-transparent to-transparent lg:from-[#070b0f]/15" />

          <div className="absolute bottom-0 left-[3%] z-20 h-[78%] w-[42%] min-w-[260px]">
            <Image
              src="/brand/dominic-home-kneeling.webp"
              alt="DOM mascot deploying the drone"
              fill
              priority
              sizes="(max-width: 1024px) 42vw, 24vw"
              className="object-contain object-bottom drop-shadow-[0_24px_50px_rgba(0,0,0,.6)]"
            />
          </div>

          <div className="absolute bottom-5 right-5 rounded-lg border border-white/15 bg-black/65 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#F45A1E]">DOM Field Equipment</p>
            <p className="mt-1 text-sm font-bold text-white">Drone Operation Barrier System</p>
          </div>
        </div>
      </div>
    </section>
  );
}
