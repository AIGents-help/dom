import Link from "next/link";
import Image from "next/image";

const PILOT_ZONE = "/shop/barriers/dom-4-post-pilot-protection.webp";
const DRONE_ZONE = "/shop/barriers/dom-4-post-large-drone-zone.webp";

export default function HomeSafetyHero() {
  return (
    <section className="relative overflow-hidden border-b border-[#F45A1E] bg-black">
      <div className="relative min-h-[560px] w-full overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-y-0 left-0 w-[62%] overflow-hidden">
            <Image
              src={PILOT_ZONE}
              alt="DOM 4-post Drone Operation pilot protection barrier system"
              fill
              priority
              sizes="62vw"
              className="object-cover object-center"
            />
          </div>

          <div className="absolute inset-y-0 right-0 w-[55%] overflow-hidden [clip-path:polygon(18%_0,100%_0,100%_100%,0_100%)]">
            <Image
              src={DRONE_ZONE}
              alt="DOM 4-post Drone Operation drone landing zone barrier system"
              fill
              priority
              sizes="55vw"
              className="object-cover object-center"
            />
          </div>

          <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/52 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[560px] max-w-[1536px] items-center px-6 py-12 md:px-12 lg:px-[3%]">
          <div className="max-w-[620px]">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#F45A1E]">
              Professional Drone Operations
            </p>
            <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-tight text-white md:text-6xl lg:text-7xl">
              Higher Insights.
              <span className="mt-2 block text-[#F45A1E]">Real Results.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-base leading-relaxed text-white/90 md:text-lg">
              Professional drone operations for inspection, mapping, construction, real estate,
              infrastructure, and more — supported by DOM field-safety equipment built for active operations.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/request-mission" className="rounded-md bg-[#F45A1E] px-6 py-4 font-bold text-black transition hover:bg-[#ff7338]">
                Request a Mission →
              </Link>
              <Link href="/safety-equipment" className="rounded-md border border-[#F45A1E] bg-black/55 px-6 py-4 font-bold text-white backdrop-blur-sm transition hover:bg-black/75">
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
        </div>

        <div className="absolute bottom-5 right-6 z-20 rounded-md border border-white/15 bg-black/65 px-3 py-2 text-[10px] font-black uppercase tracking-[.13em] text-white/85 backdrop-blur-sm">
          Actual DOM Barrier Systems
        </div>
      </div>
    </section>
  );
}
