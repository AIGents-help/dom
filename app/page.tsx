import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Cloud,
  MapPinned,
  Ruler,
  Target,
  Users,
  Zap,
} from "lucide-react";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicHomePresentingMascot from "@/components/dominic/DominicHomePresentingMascot";
import HomeSafetyHero from "@/components/HomeSafetyHero";

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
      <div className="sr-only">Uniquely Sophisticated. Intelligent Mapping by DOM. Safety-First Operations. Same Perspective. Higher Purpose. Map. Measure. Analyze. Deliver.</div>
      <HomeSafetyHero />

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

      <section className="relative overflow-hidden border-b border-[#f45a1e] bg-[#090d11]">
        <div className="absolute inset-0 opacity-[.16] [background-image:linear-gradient(rgba(244,90,30,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,90,30,.12)_1px,transparent_1px)] [background-size:34px_34px]" />

        <div className="relative mx-auto grid max-w-[1536px] gap-8 px-6 py-10 lg:min-h-[430px] lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-10">
          <div className="relative rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_20%_40%,rgba(244,90,30,.18),transparent_30%),#0b1118]">
            <div className="grid min-h-[390px] grid-cols-[0.82fr_1.18fr] items-center gap-4 px-5 py-5 sm:px-7">
              <div className="relative flex min-h-[360px] items-end justify-center self-stretch overflow-visible">
                <DominicHomePresentingMascot />
              </div>

              <div className="relative z-10 py-4">
                <p className="text-[11px] font-black uppercase tracking-[.18em] text-[#F45A1E]">Meet DOM</p>
                <div className="mt-2">
                  <DominicBrandLockup size="lg" />
                </div>
                <p className="mt-4 max-w-[430px] text-[13px] leading-6 text-white/82">
                  DOMINIC takes your drone data and turns it into clear maps, measurements,
                  analysis, and professional deliverables — one workflow built for real operations.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  {[
                    [MapPinned, "Map", "2D & 3D"],
                    [Ruler, "Measure", "Dimensions"],
                    [BarChart3, "Analyze", "Insights"],
                    [Cloud, "Deliver", "Reports"],
                  ].map(([Icon, title, copy]) => {
                    const I = Icon as typeof MapPinned;
                    return (
                      <div key={title as string} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <I className="h-5 w-5 shrink-0 text-[#F45A1E]" />
                        <div>
                          <div className="text-[10px] font-black">{title as string}</div>
                          <div className="text-[9px] text-white/60">{copy as string}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href="/dominic" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-[#F45A1E] px-5 py-3 text-[11px] font-black text-black transition hover:bg-[#ff7338]">
                    Explore DOMINIC <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link href="/pilot/login" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-[11px] font-black text-white hover:border-[#F45A1E]">
                    Pilot Login / Get Access
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="relative rounded-[16px] border border-white/25 bg-[#070b10] p-2 shadow-2xl">
            <div className="rounded-[11px] border border-white/10 bg-[#111923] p-2">
              <div className="flex h-9 items-center justify-between border-b border-white/10 px-2">
                <div className="text-[10px] font-black text-[#F45A1E]">DOMINIC WORKSPACE</div>
                <div className="flex gap-6 text-[8px] font-semibold text-white/78">
                  <span className="border-b-2 border-[#F45A1E] pb-2">Map</span>
                  <span>Measure</span>
                  <span>Analyze</span>
                  <span>Deliver</span>
                </div>
              </div>

              <div className="mt-2 grid h-[270px] grid-cols-[92px_1fr_116px] gap-2">
                <div className="space-y-1">
                  {["Projects", "Map View", "3D View", "Point Cloud", "Elevation", "Analysis", "Deliverables"].map((item, i) => (
                    <div key={item} className={`rounded px-2 py-[7px] text-[8px] font-bold ${i === 1 ? "bg-[#8a3a13] text-white" : "bg-white/5 text-white/70"}`}>
                      {item}
                    </div>
                  ))}
                </div>

                <div className="relative overflow-hidden rounded border border-white/10">
                  <Image src="/images/construction-aerial.jpg" alt="DOMINIC map workspace preview" fill className="object-cover" sizes="40vw" />
                  <div className="absolute inset-[18%_18%_24%_16%] border-2 border-[#F45A1E]">
                    <span className="absolute -top-5 right-0 rounded bg-[#F45A1E] px-1.5 py-1 text-[8px] font-black text-black">
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
