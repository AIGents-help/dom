import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Check,
  Cloud,
  MapPinned,
  Ruler,
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
  [MapPinned, "Greater", "Accuracy"],
  [BarChart3, "Actionable", "Insights"],
  [Users, "Built for", "Pilots & Teams"],
  [Cloud, "All in One", "Platform"],
];

export default function HomePage() {
  return (
    <div className="bg-[#090d11] text-white">
      <section className="grid min-h-[560px] border-b border-[#F45A1E] lg:grid-cols-2">
        <div className="relative overflow-hidden">
          <Image
            src="/images/construction-aerial.jpg"
            alt="Professional commercial drone operation"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/58 to-black/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

          <div className="relative flex h-full min-h-[560px] flex-col justify-center px-8 py-14 sm:px-12 lg:px-14 xl:px-16">
            <h1 className="max-w-3xl text-[46px] font-black uppercase leading-[.96] tracking-[-.03em] sm:text-[58px] xl:text-[64px]">
              Higher insights
              <span className="mt-2 block text-[#ff651f]">Real results</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/90 sm:text-lg">
              Professional drone operations for inspection, mapping, construction,
              real estate, and more.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/request-mission"
                className="inline-flex items-center gap-2 rounded-md bg-[#ff651f] px-6 py-3.5 text-sm font-black text-black transition hover:bg-[#ff7a3a]"
              >
                Request a Mission <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/services"
                className="inline-flex items-center gap-2 rounded-md border border-white/55 bg-black/35 px-6 py-3.5 text-sm font-black text-white transition hover:border-[#ff651f]"
              >
                Our Services
              </Link>
            </div>

            <div className="mt-10 grid max-w-2xl gap-5 sm:grid-cols-3">
              {[
                ["Safety First", "Always"],
                ["Data You Can Trust", "Actionable Results"],
                ["Professional Pilots", "FAA Part 107"],
              ].map(([title, copy]) => (
                <div key={title} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-6 w-6 shrink-0 text-[#ff651f]" />
                  <div>
                    <div className="text-sm font-black">{title}</div>
                    <div className="text-xs text-white/75">{copy}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-[radial-gradient(circle_at_38%_48%,rgba(244,90,30,.28),transparent_32%),linear-gradient(125deg,#090b0e_0%,#131313_45%,#07090c_100%)]">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(244,90,30,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(244,90,30,.16)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="relative grid min-h-[560px] grid-cols-[.82fr_1.18fr] items-center gap-2 px-5 py-8 sm:px-8">
            <div className="relative h-[490px] min-w-0">
              <DominicMascotImage priority className="object-contain object-bottom" />
            </div>

            <div className="relative z-10 min-w-0 pr-2">
              <DominicBrandLockup size="lg" />
              <h2 className="mt-8 text-3xl font-black uppercase leading-tight xl:text-4xl">
                Turning images
                <span className="block text-[#ff651f]">into intelligence</span>
              </h2>

              <div className="mt-6 space-y-3">
                {[
                  "2D & 3D Mapping",
                  "Accurate Measurements",
                  "Contours & Elevations",
                  "Professional Reports",
                  "Built for Real-World Operations",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm font-semibold text-white/90">
                    <Check className="h-5 w-5 text-[#ff651f]" />
                    {item}
                  </div>
                ))}
              </div>

              <Link
                href="/dominic"
                className="mt-7 inline-flex items-center gap-2 rounded-md bg-[#ff651f] px-6 py-3.5 text-sm font-black text-black transition hover:bg-[#ff7a3a]"
              >
                See DOMINIC in Action <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-6 text-sm italic text-white/70">“Same Perspective. Higher Purpose.”</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 border-b border-[#F45A1E] bg-[#0b0f14] sm:grid-cols-4 xl:grid-cols-8">
        {industries.map(([label, image]) => (
          <Link
            href="/industries"
            key={label}
            className="group relative min-h-[112px] overflow-hidden border-r border-white/10"
          >
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 12.5vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-2 text-center text-[11px] font-black uppercase tracking-wide">
              {label}
            </div>
          </Link>
        ))}
      </section>

      <section className="relative overflow-hidden border-b border-[#F45A1E] bg-[radial-gradient(circle_at_34%_42%,rgba(244,90,30,.16),transparent_28%),#090d11]">
        <div className="mx-auto grid max-w-[1600px] gap-8 px-6 py-12 lg:grid-cols-[.72fr_.92fr_1.28fr] lg:items-center lg:px-10">
          <div className="relative min-h-[430px]">
            <DominicMascotImage className="object-contain object-bottom" />
          </div>

          <div className="py-4">
            <DominicBrandLockup size="lg" />
            <p className="mt-5 max-w-xl text-base leading-7 text-white/85">
              DOMINIC takes your drone data and turns it into clear maps,
              measurements, and professional deliverables — built for real-world
              operations, not just pretty pictures.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {[
                [MapPinned, "Map", "2D & 3D"],
                [Ruler, "Measure", "Dimensions"],
                [BarChart3, "Analyze", "AI-Powered"],
                [Cloud, "Deliver", "Reports"],
              ].map(([Icon, title, copy]) => {
                const I = Icon as typeof MapPinned;
                return (
                  <div key={title as string} className="text-center">
                    <I className="mx-auto h-8 w-8 text-[#ff651f]" />
                    <div className="mt-2 text-sm font-black">{title as string}</div>
                    <div className="text-xs text-white/70">{copy as string}</div>
                  </div>
                );
              })}
            </div>

            <Link
              href="/dominic"
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-[#ff651f] px-7 py-3.5 text-sm font-black text-black transition hover:bg-[#ff7a3a]"
            >
              Explore DOMINIC <ArrowRight className="h-4 w-4" />
            </Link>

            <p className="mt-5 text-[11px] font-bold uppercase tracking-[.22em] text-white/75">
              Faster insights. Stronger decisions. A higher standard.
            </p>
          </div>

          <div className="rounded-2xl border border-white/20 bg-[#0a1017] p-3 shadow-2xl">
            <div className="rounded-xl border border-white/10 bg-[#101820] p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="text-xs font-black uppercase tracking-[.16em] text-[#ff651f]">DOMINIC Workspace</div>
                <div className="flex gap-5 text-[10px] font-semibold text-white/65">
                  <span>Map</span><span>Measure</span><span>Analyze</span><span>Deliver</span>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[150px_1fr_165px]">
                <div className="space-y-2">
                  {["Projects", "Map View", "3D View", "Point Cloud", "Elevation", "Analysis", "Deliverables"].map((item, i) => (
                    <div key={item} className={`rounded-md px-3 py-2 text-[11px] font-bold ${i === 1 ? "bg-[#8a3a13] text-white" : "bg-white/5 text-white/70"}`}>
                      {item}
                    </div>
                  ))}
                </div>

                <div className="relative min-h-[300px] overflow-hidden rounded-lg border border-white/10">
                  <Image src="/images/construction-aerial.jpg" alt="" fill className="object-cover" sizes="45vw" />
                  <div className="absolute inset-0 bg-[#ff651f]/10" />
                  <div className="absolute left-[20%] top-[25%] h-[42%] w-[58%] border-2 border-[#ff651f]">
                    <span className="absolute -top-7 left-0 rounded bg-[#ff651f] px-2 py-1 text-[10px] font-black text-black">Roof Area 12,842 ft²</span>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="text-xs font-black">Project Tools</div>
                  <div className="mt-3 space-y-2 text-[11px] text-white/70">
                    {["Area", "Distance", "Height", "Volume", "Roof Outline", "Annotations"].map((item) => (
                      <div key={item} className="rounded bg-white/5 px-2 py-2">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {["Orthomosaic", "DSM", "DTM", "Contours", "3D Model", "Point Cloud"].map((item) => (
                  <div key={item} className="rounded-md border border-white/10 bg-black/25 px-2 py-3 text-center text-[9px] font-bold text-white/70">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#080c10]">
          <div className="mx-auto grid max-w-[1600px] grid-cols-2 sm:grid-cols-5">
            {benefits.map(([Icon, a, b]) => {
              const I = Icon as typeof Zap;
              return (
                <div key={a as string} className="flex items-center justify-center gap-3 border-r border-white/10 px-4 py-5">
                  <I className="h-7 w-7 text-[#ff651f]" />
                  <div className="text-xs font-black uppercase leading-5 text-white/85">
                    {a as string}<br />{b as string}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
