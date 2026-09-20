import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Check,
  Cloud,
  MapPinned,
  MapPin,
  Ruler,
  ShieldCheck,
  Target,
  Users,
  Zap,
} from "lucide-react";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicMascotImage from "@/components/dominic/DominicMascotImage";

const industries = [
  ["Commercial", "/images/city-night-aerial.jpg"],
  ["Solar", "/images/solar-aerial.jpg"],
  ["Construction", "/images/construction-aerial.jpg"],
  ["Real Estate", "/images/city-night-aerial.jpg"],
  ["Infrastructure", "/images/drone-operation-safety.png"],
  ["Industrial", "/images/construction-aerial.jpg"],
  ["Agriculture", "/images/solar-aerial.jpg"],
  ["Public Safety", "/images/drone-operation-safety.png"],
];

const benefits = [
  [Zap, "Faster", "Workflow"],
  [Target, "Greater", "Accuracy"],
  [BarChart3, "Actionable", "Insights"],
  [Users, "Built for", "Pilots & Teams"],
  [Cloud, "All in One", "Platform"],
];

export default function HomePage() {
  return (
    <main className="bg-[#080c10] text-white">
      {/* Exact desktop composition target: ~420px hero at 1536px viewport */}
      <section className="grid border-b border-[#f45a1e] lg:h-[420px] lg:grid-cols-2">
        <div className="relative min-h-[500px] overflow-hidden lg:min-h-0">
          <Image
            src="/images/construction-aerial.jpg"
            alt="Professional commercial drone operation"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/94 via-[#07111c]/55 to-[#07111c]/12" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/5" />

          <div className="relative flex h-full flex-col justify-center px-7 py-10 sm:px-10 lg:px-[52px] lg:py-8">
            <h1 className="max-w-[610px] text-[42px] font-black uppercase leading-[.98] tracking-[-.025em] sm:text-[50px] lg:text-[44px] xl:text-[48px]">
              Higher insights
              <span className="mt-1 block text-[#ff641c]">Real results</span>
            </h1>

            <p className="mt-3 max-w-[540px] text-[15px] leading-6 text-white/92 lg:text-[14px] xl:text-[15px]">
              Professional drone operations for inspection, mapping,
              construction, real estate, and more.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/request-mission"
                className="inline-flex h-[44px] items-center gap-2 rounded-md bg-[#ff641c] px-6 text-[13px] font-black text-black transition hover:bg-[#ff7a3a]"
              >
                Request a Mission <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/services"
                className="inline-flex h-[44px] items-center rounded-md border border-white/55 bg-black/30 px-7 text-[13px] font-black text-white transition hover:border-[#ff641c]"
              >
                Our Services
              </Link>
            </div>

            <div className="mt-7 grid max-w-[660px] grid-cols-2 gap-x-5 gap-y-4 xl:grid-cols-4">
              {[
                [ShieldCheck, "Safety First", "Always"],
                [BarChart3, "Data You Can Trust", "Actionable Results"],
                [Users, "Professional Pilots", "FAA Part 107"],
                [MapPin, "Local & Nationwide", "Where You Need Us"],
              ].map(([Icon, title, copy]) => {
                const I = Icon as typeof ShieldCheck;
                return (
                  <div key={title as string} className="flex items-center gap-2.5">
                    <I className="h-7 w-7 shrink-0 text-[#ff641c]" />
                    <div className="min-w-0">
                      <div className="whitespace-nowrap text-[11px] font-black">{title as string}</div>
                      <div className="whitespace-nowrap text-[10px] text-white/72">{copy as string}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative min-h-[560px] overflow-hidden bg-[radial-gradient(circle_at_38%_42%,rgba(244,90,30,.22),transparent_31%),linear-gradient(125deg,#080a0c_0%,#121212_48%,#07090b_100%)] lg:min-h-0">
          <div className="absolute inset-0 opacity-[.18] [background-image:linear-gradient(rgba(244,90,30,.20)_1px,transparent_1px),linear-gradient(90deg,rgba(244,90,30,.20)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative grid h-full grid-cols-[.9fr_1.1fr] items-center">
            <div className="relative h-[390px] self-end">
              <DominicMascotImage priority className="object-contain object-bottom" />
              <div className="absolute left-2 top-8 -rotate-3 text-[17px] italic leading-7 text-white/80">
                “ Map<br />&nbsp;&nbsp;Measure<br />&nbsp;&nbsp;Analyze<br />&nbsp;&nbsp;Deliver ”
              </div>
            </div>

            <div className="relative z-10 pr-8">
              <DominicBrandLockup size="lg" />
              <h2 className="mt-5 text-[23px] font-black uppercase leading-[1.05] xl:text-[25px]">
                Turning images
                <span className="block text-[#ff641c]">into intelligence</span>
              </h2>

              <div className="mt-4 space-y-2">
                {[
                  "2D & 3D Mapping",
                  "Accurate Measurements",
                  "Contours & Elevations",
                  "Professional Reports",
                  "Built for Real-World Operations",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-[11px] font-semibold text-white/92 xl:text-[12px]">
                    <Check className="h-4 w-4 text-[#ff641c]" />
                    {item}
                  </div>
                ))}
              </div>

              <Link
                href="/dominic"
                className="mt-4 inline-flex h-[40px] items-center gap-2 rounded-md bg-[#ff641c] px-5 text-[12px] font-black text-black transition hover:bg-[#ff7a3a]"
              >
                See DOMINIC in Action <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              <p className="mt-3 text-[11px] italic text-white/70">“Same Perspective. Higher Purpose.”</p>
            </div>
          </div>
        </div>
      </section>

      {/* Thin industry ribbon */}
      <section className="grid grid-cols-2 border-b border-[#f45a1e] bg-[#090d11] sm:grid-cols-4 xl:h-[120px] xl:grid-cols-8">
        {industries.map(([label, image]) => (
          <Link
            href="/industries"
            key={label}
            className="group relative min-h-[108px] overflow-hidden border-r border-white/10 xl:min-h-0"
          >
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 12.5vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 bg-black/72 px-1 py-2 text-center text-[10px] font-black uppercase tracking-[.04em]">
              {label}
            </div>
          </Link>
        ))}
      </section>

      {/* DOMINIC showcase, intentionally compact so the full composition fits a desktop viewport */}
      <section className="relative overflow-hidden border-b border-[#f45a1e] bg-[radial-gradient(circle_at_22%_42%,rgba(244,90,30,.20),transparent_30%),#080c10] lg:h-[340px]">
        <div className="mx-auto grid h-full max-w-[1536px] gap-4 px-6 py-4 lg:grid-cols-[.68fr_.92fr_1.35fr] lg:items-center lg:px-8">
          <div className="relative min-h-[320px] lg:h-[320px] lg:min-h-0">
            <DominicMascotImage className="object-contain object-bottom" />
            <p className="absolute bottom-2 left-0 text-[12px] italic leading-5 text-white/75">
              “Same<br />Perspective.<br />Higher Purpose.”
            </p>
          </div>

          <div className="self-center">
            <DominicBrandLockup size="lg" />
            <p className="mt-3 max-w-[470px] text-[13px] leading-5 text-white/84">
              DOMINIC takes your drone data and turns it into clear maps,
              measurements, and professional deliverables — built for
              real-world operations, not just pretty pictures.
            </p>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                [MapPinned, "Map", "2D & 3D"],
                [Ruler, "Measure", "Dimensions"],
                [BarChart3, "Analyze", "AI-Powered"],
                [Cloud, "Deliver", "Reports"],
              ].map(([Icon, title, copy]) => {
                const I = Icon as typeof MapPinned;
                return (
                  <div key={title as string} className="text-center">
                    <I className="mx-auto h-7 w-7 text-[#ff641c]" />
                    <div className="mt-1 text-[11px] font-black">{title as string}</div>
                    <div className="text-[9px] text-white/70">{copy as string}</div>
                  </div>
                );
              })}
            </div>

            <Link
              href="/dominic"
              className="mx-auto mt-4 flex h-[38px] w-fit items-center gap-2 rounded-md bg-[#ff641c] px-8 text-[12px] font-black text-black transition hover:bg-[#ff7a3a]"
            >
              Explore DOMINIC <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[.21em] text-white/72">
              Faster insights. Stronger decisions. A higher standard.
            </p>
          </div>

          <div className="rounded-[14px] border border-white/35 bg-[#070b10] p-2 shadow-2xl">
            <div className="rounded-[10px] border border-white/10 bg-[#111923] p-2">
              <div className="flex h-8 items-center justify-between border-b border-white/10 px-2">
                <div className="text-[9px] font-black text-[#ff641c]">DOM</div>
                <div className="flex gap-6 text-[8px] font-semibold text-white/78">
                  <span className="border-b-2 border-[#ff641c] pb-2">Map</span>
                  <span>Measure</span>
                  <span>Analyze</span>
                  <span>Deliver</span>
                </div>
              </div>

              <div className="mt-2 grid h-[210px] grid-cols-[88px_1fr_110px] gap-2">
                <div className="space-y-1">
                  {["Projects", "Map View", "3D View", "Point Cloud", "Elevation", "Analysis", "Deliverables"].map((item, i) => (
                    <div
                      key={item}
                      className={`rounded px-2 py-[6px] text-[8px] font-bold ${i === 1 ? "bg-[#8a3a13] text-white" : "bg-white/5 text-white/70"}`}
                    >
                      {item}
                    </div>
                  ))}
                </div>

                <div className="relative overflow-hidden rounded border border-white/10">
                  <Image src="/images/construction-aerial.jpg" alt="" fill className="object-cover" sizes="35vw" />
                  <div className="absolute inset-[18%_18%_24%_16%] border-2 border-[#ff641c]">
                    <span className="absolute -top-5 right-0 rounded bg-[#ff641c] px-1.5 py-1 text-[8px] font-black text-black">
                      Roof Area 12,842 ft²
                    </span>
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-black/25 p-2">
                  <div className="text-[9px] font-black">Project Tools</div>
                  <div className="mt-2 space-y-1 text-[8px] text-white/72">
                    {["Area", "Distance", "Height", "Volume", "Roof Outline", "Annotations"].map((item) => (
                      <div key={item} className="rounded bg-white/5 px-2 py-1.5">{item}</div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-6 gap-1">
                {["Orthomosaic", "DSM", "DTM", "Contours", "3D Model", "Point Cloud"].map((item) => (
                  <div key={item} className="rounded border border-white/10 bg-black/25 px-1 py-2 text-center text-[7px] font-bold text-white/70">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#070b0f]">
        <div className="mx-auto grid min-h-[72px] max-w-[1536px] grid-cols-2 sm:grid-cols-5">
          {benefits.map(([Icon, a, b]) => {
            const I = Icon as typeof Zap;
            return (
              <div key={a as string} className="flex items-center justify-center gap-3 border-r border-white/10 px-4 py-3">
                <I className="h-7 w-7 text-[#ff641c]" />
                <div className="text-[10px] font-black uppercase leading-4 text-white/85">
                  {a as string}<br />{b as string}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
