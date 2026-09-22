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

const industries = [
  ["Commercial", "/images/city-night-aerial.jpg"],
  ["Solar", "/images/solar-aerial.jpg"],
  ["Construction", "/images/construction-aerial.jpg"],
  ["Real Estate", "/images/city-night-aerial.jpg"],
  ["Infrastructure", "/images/drone-operation-safety.png"],
];

const benefits = [
  [Zap, "Faster", "Workflow"],
  [Target, "Greater", "Accuracy"],
  [BarChart3, "Actionable", "Insights"],
  [Users, "Built for", "Pilots"],
];

export default function HomePage() {
  return (
    <main className="bg-[#080c10] text-white">
      <div className="sr-only">Uniquely Sophisticated. Intelligent Mapping by DOM. Safety-First Operations. Same Perspective. Higher Purpose. Map. Measure. Analyze. Deliver.</div>
      <section className="grid border-b border-[#f45a1e] bg-black lg:h-[420px] lg:grid-cols-2">
        <div className="relative aspect-[768/420] overflow-hidden lg:aspect-auto lg:h-[420px]">
          <Image
            src="/brand/dom-home-hero-left.webp"
            alt="DOM professional drone operations — Uniquely Sophisticated"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <Link
            href="/request-mission"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Request a Mission"
            className="absolute left-[6.5%] top-[61.5%] h-[10.5%] w-[25%] rounded-md"
          />
          <Link
            href="/safety-equipment"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View Safety Equipment"
            className="absolute left-[33%] top-[61.5%] h-[10.5%] w-[23%] rounded-md"
          />
        </div>

        <div className="relative aspect-[768/420] overflow-hidden lg:aspect-auto lg:h-[420px]">
          <Image
            src="/brand/dom-home-hero-right.webp"
            alt="DOMINIC Intelligent Mapping by DOM"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <Link
            href="/dominic"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="See DOMINIC in Action"
            className="absolute left-[67%] top-[76.5%] h-[9.5%] w-[28%] rounded-md"
          />
        </div>
      </section>

      <section className="grid grid-cols-2 border-b border-[#f45a1e] bg-[#090d11] sm:grid-cols-5 xl:h-[120px]">
        {industries.slice(0, 5).map(([label, image]) => (
          <Link
            href="/industries"
            target="_blank"
            rel="noopener noreferrer"
            key={label}
            className="group relative min-h-[108px] overflow-hidden border-r border-white/10 xl:min-h-0"
          >
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, 20vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/72 px-1 py-2 text-center text-[12px] font-black uppercase tracking-[.02em]">
              {label} <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
      </section>

      <section className="relative overflow-hidden border-b border-[#f45a1e] bg-[radial-gradient(circle_at_17%_42%,rgba(244,90,30,.20),transparent_30%),#080c10] lg:h-[340px]">
        <div className="absolute inset-0 opacity-[.18] [background-image:linear-gradient(rgba(244,90,30,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,90,30,.12)_1px,transparent_1px)] [background-size:34px_34px]" />

        <div className="relative mx-auto grid h-full max-w-[1536px] gap-4 px-6 py-4 lg:grid-cols-[.72fr_.92fr_1.36fr] lg:items-center lg:px-8">
          <div className="relative min-h-[320px] lg:h-[320px] lg:min-h-0">
            <Image
              src="/brand/dominic-home-purpose-built.webp"
              alt="DOMINIC mapping mascot reviewing drone data on a tablet"
              fill
              sizes="(max-width: 1024px) 100vw, 30vw"
              className="object-contain object-center drop-shadow-[0_20px_45px_rgba(0,0,0,.5)]"
            />
          </div>

          <div className="relative z-20 self-center">
            <DominicBrandLockup size="lg" />
            <p className="mt-3 max-w-[470px] text-[13px] leading-5 text-white/84">
              DOMINIC takes your drone data and turns it into clear maps,
              measurements, and professional deliverables — built for
              real-world operations, not just pretty pictures.
            </p>

            <div className="mt-3 rounded-lg border border-[#F45A1E]/35 bg-[#F45A1E]/10 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[.12em] text-[#F45A1E]">Free Pilot Access</p>
              <p className="mt-1 text-[11px] leading-4 text-white/85">
                To view DOMINIC, create or log in to your Pilot account and get free access to the DOMINIC workspace.
              </p>
              <Link href="/pilot/login" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-white hover:text-[#F45A1E]">
                Pilot Login / Get Access <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

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
              target="_blank"
              rel="noopener noreferrer"
              className="mx-auto mt-4 flex h-[42px] w-fit items-center gap-2 rounded-md border border-[#ff641c] bg-transparent px-8 text-[12px] font-black text-[#ff641c] transition hover:bg-[#ff641c] hover:text-black"
            >
              Learn More About DOMINIC <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[.21em] text-white/72">
              Faster insights. Stronger decisions. A higher standard.
            </p>
          </div>

          <div className="relative z-20 rounded-[14px] border border-white/35 bg-[#070b10] p-2 shadow-2xl">
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
        <div className="mx-auto grid min-h-[72px] max-w-[1536px] grid-cols-2 sm:grid-cols-4">
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
