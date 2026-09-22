import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export default function HomeSafetyHero() {
  return (
    <section className="relative overflow-hidden border-b border-[#F45A1E] bg-[#080c10]">
      <div className="mx-auto grid min-h-[520px] max-w-[1536px] lg:grid-cols-[.92fr_1.08fr]">
        <div className="relative z-10 flex items-center px-8 py-12 lg:px-14">
          <div className="max-w-[650px]">
            <h1 className="text-[54px] font-black leading-[.95] tracking-[-.045em] text-white md:text-[68px]">
              Uniquely <span className="text-[#F45A1E]">Sophisticated.</span>
            </h1>
            <p className="mt-5 text-[22px] font-semibold leading-tight text-white/95 md:text-[27px]">
              Real Data. Real Operations. Real Results.
            </p>

            <div className="mt-7 grid max-w-[620px] gap-x-8 gap-y-3 text-[15px] font-semibold text-white sm:grid-cols-2 lg:grid-cols-3">
              <span><span className="text-[#F45A1E]">✓</span> Safety First</span>
              <span><span className="text-[#F45A1E]">✓</span> Data You Can Trust</span>
              <span><span className="text-[#F45A1E]">✓</span> FAA Part 107 Pilots</span>
              <span><span className="text-[#F45A1E]">✓</span> Local & Nationwide</span>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/request-mission"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-7 py-4 text-[16px] font-black text-black transition hover:bg-[#ff753e]"
              >
                Request a Mission <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href="/safety-equipment"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[#F45A1E] bg-black/30 px-7 py-4 text-[16px] font-black text-white transition hover:bg-white/5"
              >
                View Safety Equipment <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="relative min-h-[440px] lg:min-h-[520px]">
          <Image
            src="/brand/dom-home-hero-right.webp"
            alt="DOM drone operation with DOMINIC mascot, safety barriers, pilot, and aircraft"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 58vw"
            className="object-cover object-center"
          />
        </div>
      </div>
    </section>
  );
}
