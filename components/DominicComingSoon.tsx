import { Box, Layers3, MapPinned, Ruler, Sparkles } from "lucide-react";
import DominicBrandLockup from "@/components/dominic/DominicBrandLockup";
import DominicMascotImage from "@/components/dominic/DominicMascotImage";

const features = [
  [MapPinned, "Orthomosaics", "Turn mission imagery into georeferenced site maps."],
  [Layers3, "Elevation", "DSM, DTM and elevation products in the same workspace."],
  [Ruler, "Measure + Markup", "Dimensions, areas, notes, findings and inspection tool sets."],
  [Box, "3D + Point Cloud", "Review reconstructed sites without leaving the DOM mission."],
];

export default function DominicComingSoon() {
  return (
    <section className="border-y border-white/10 bg-[#090D11] py-20 lg:py-28">
      <div className="container-app">
        <div className="overflow-hidden rounded-3xl border border-[#F45A1E]/35 bg-[radial-gradient(circle_at_78%_8%,rgba(244,90,30,.20),transparent_30%),linear-gradient(135deg,#121922,#090D11)]">
          <div className="grid gap-8 p-7 lg:grid-cols-[.72fr_.9fr_1.08fr] lg:items-center lg:p-12">
            <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(244,90,30,.18),transparent_38%),#0A0F14]">
              <div className="absolute inset-5">
                <DominicMascotImage className="object-contain object-center" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-sm font-black text-white">Same Perspective. Higher Purpose.</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-[#F45A1E]">The official DOMINIC mascot</p>
              </div>
            </div>

            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#F45A1E]/40 bg-[#F45A1E]/10 px-4 py-2 text-[11px] font-black uppercase tracking-[.2em] text-[#F45A1E]">
                <Sparkles className="h-4 w-4" /> Coming to DOM
              </div>
              <DominicBrandLockup size="lg" />
              <h3 className="mt-8 text-3xl font-black leading-tight text-white lg:text-4xl">From captured imagery to client-ready intelligence. One platform.</h3>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                DOMINIC is the mapping, photogrammetry and analysis environment being built directly into DOM — connecting the mission, pilot, processing, measurements, findings and final deliverables without breaking the workflow.
              </p>
              <p className="mt-6 text-sm font-black uppercase tracking-[.18em] text-[#F45A1E]">Map. Measure. Analyze. Deliver.</p>
              <p className="mt-3 text-xs font-black uppercase tracking-[.18em] text-slate-500">Uniquely Sophisticated.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 lg:p-7">
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.16em] text-[#F45A1E]">Pilot advantage</p>
                  <p className="mt-1 text-sm text-slate-400">Built into the mission workflow — not bolted on afterward.</p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.12em] text-slate-400">In Development</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {features.map(([Icon, title, copy]) => {
                  const FeatureIcon = Icon as typeof MapPinned;
                  return (
                    <div key={title as string} className="rounded-xl border border-white/10 bg-[#111923] p-5">
                      <FeatureIcon className="h-5 w-5 text-[#F45A1E]" />
                      <h4 className="mt-4 font-black text-white">{title as string}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{copy as string}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border border-[#F45A1E]/25 bg-[#F45A1E]/5 p-4 text-center">
                <p className="text-sm font-bold text-white">Controller → DOM Mission → DOMINIC → Client Delivery</p>
                <p className="mt-1 text-xs text-slate-400">A connected field-to-deliverable workflow for DOM pilots.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
