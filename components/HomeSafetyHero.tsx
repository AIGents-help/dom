import Link from "next/link";
import Image from "next/image";

export default function HomeSafetyHero() {
  return (
    <section className="relative border-b border-[#f45a1e] bg-black">
      <div className="relative mx-auto min-h-[430px] w-full overflow-hidden md:min-h-[500px] lg:min-h-[560px]">
        <Image
          src="/images/drone-operation-safety.png"
          alt="DOM safety-first drone operation with protected aircraft and pilot zones"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-black/10" />

        <div className="relative z-10 flex min-h-[430px] items-center px-6 py-12 md:min-h-[500px] md:px-12 lg:min-h-[560px] lg:px-[3%]">
          <div className="max-w-[620px]">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#ff641e]">
              Professional Drone Operations
            </p>
            <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-tight text-white md:text-6xl lg:text-7xl">
              Higher Insights.
              <span className="mt-2 block text-[#ff5a1f]">Real Results.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-base leading-relaxed text-white/90 md:text-lg">
              Professional drone operations for inspection, mapping, construction, real estate,
              infrastructure, and more.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/request-mission" className="rounded-md bg-[#ff5a1f] px-6 py-4 font-bold text-black transition hover:bg-[#ff7338]">
                Request a Mission →
              </Link>
              <Link href="/services" className="rounded-md border border-[#ff641e] bg-black/55 px-6 py-4 font-bold text-white backdrop-blur-sm transition hover:bg-black/75">
                Our Services
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
      </div>
    </section>
  );
}
