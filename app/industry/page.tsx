import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, ExternalLink, Radar, ShieldCheck, Newspaper, Radio } from "lucide-react";
import { getIndustryFeed, industrySources } from "@/lib/industryFeed";

export const metadata: Metadata = {
  title: "Drone Industry Updates | DOM Pilot Intelligence Center",
  description:
    "Current FAA drone updates, pilot topics, regulation changes, safety notices, technology developments, and industry events curated by Drone Operation Management.",
  alternates: { canonical: "/industry" },
};

function formatDate(value: string | null) {
  if (!value) return "Recent";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

const topicCards = [
  ["FAA & Regulation", "Rules, waivers, Remote ID, enforcement, airspace, and Part 107 changes.", ShieldCheck],
  ["Pilot Operations", "Practical topics that affect how commercial pilots plan and execute missions.", Radar],
  ["Technology", "Aircraft, sensors, mapping, autonomy, BVLOS, and emerging UAS systems.", Radio],
  ["Events & Training", "FAA outreach, webinars, industry events, and continuing pilot education.", CalendarDays],
] as const;

export default async function IndustryPage() {
  const items = await getIndustryFeed();

  return (
    <div className="bg-[#080c10] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(244,90,30,.18),transparent_34%),#080c10]">
        <div className="container-app py-20 lg:py-28">
          <div className="max-w-4xl">
            <p className="eyebrow mb-5">DOM Pilot Intelligence Center</p>
            <h1 className="text-5xl font-black leading-[.98] tracking-tight sm:text-6xl lg:text-7xl">
              Stay current.
              <span className="block text-[#F45A1E]">Fly informed.</span>
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-300">
              A continuously refreshed pilot resource for regulatory changes, safety notices, operational topics,
              technology developments, and industry events. Official-source updates are surfaced first so pilots can
              quickly understand what changed and where to verify it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#latest" className="inline-flex items-center gap-2 rounded-lg bg-[#F45A1E] px-6 py-3 text-sm font-black text-black transition hover:bg-[#ff7338]">
                Latest updates <ArrowRight className="h-4 w-4" />
              </a>
              <Link href="/faa-compliance" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3 text-sm font-black text-white transition hover:border-[#F45A1E]">
                FAA compliance center
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0E151E] py-12">
        <div className="container-app grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topicCards.map(([title, copy, Icon]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-[#111923] p-6">
              <Icon className="h-6 w-6 text-[#F45A1E]" />
              <h2 className="mt-4 text-lg font-black">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="latest" className="container-app py-16 lg:py-24">
        <div className="mb-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="eyebrow mb-3">Automated official-source feed</p>
            <h2 className="text-4xl font-black tracking-tight lg:text-5xl">Latest drone-industry updates</h2>
            <p className="mt-4 max-w-2xl text-slate-400">
              DOM checks the FAA press-release feed automatically and filters for UAS-related developments. The page
              refreshes its source data hourly.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs font-bold text-emerald-300">
            LIVE SOURCE: FAA
          </div>
        </div>

        {items.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {items.map((item) => (
              <article key={item.id} className="group rounded-2xl border border-white/10 bg-[#111923] p-7 transition hover:border-[#F45A1E]/60">
                <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-[#F45A1E]">
                  <span>{item.category}</span>
                  <span className="text-white/25">•</span>
                  <span className="text-slate-500">{formatDate(item.publishedAt)}</span>
                </div>
                <h3 className="mt-4 text-2xl font-black leading-tight group-hover:text-[#F45A1E]">{item.title}</h3>
                <p className="mt-4 line-clamp-4 text-sm leading-7 text-slate-400">{item.summary}</p>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#F45A1E]"
                >
                  Verify at {item.source} <ExternalLink className="h-4 w-4" />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-7">
            <h3 className="font-black text-amber-200">Live FAA feed temporarily unavailable</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              DOM does not invent replacement updates. Use the official-source directory below while the feed reconnects.
            </p>
          </div>
        )}
      </section>

      <section className="border-y border-white/10 bg-[#0E151E] py-16">
        <div className="container-app">
          <div className="mb-9 max-w-3xl">
            <p className="eyebrow mb-3">Events & source watch</p>
            <h2 className="text-3xl font-black lg:text-4xl">Go directly to the authoritative source.</h2>
            <p className="mt-3 text-slate-400">
              The next automation pass will normalize event dates and additional industry feeds into this same timeline.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {industrySources.map((source) => (
              <a
                key={source.name}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start justify-between gap-6 rounded-2xl border border-white/10 bg-[#111923] p-6 transition hover:border-[#F45A1E]/60"
              >
                <div>
                  <h3 className="text-xl font-black group-hover:text-[#F45A1E]">{source.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{source.description}</p>
                </div>
                <ExternalLink className="mt-1 h-5 w-5 shrink-0 text-[#F45A1E]" />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="container-app py-16">
        <div className="rounded-3xl border border-[#F45A1E]/30 bg-[linear-gradient(135deg,rgba(244,90,30,.12),rgba(17,25,35,.96))] p-8 lg:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <Newspaper className="h-7 w-7 text-[#F45A1E]" />
                <p className="text-sm font-black uppercase tracking-[.16em] text-[#F45A1E]">Built for working pilots</p>
              </div>
              <h2 className="mt-4 text-3xl font-black">From “what changed?” to “what do I need to do?”</h2>
              <p className="mt-3 max-w-2xl text-slate-300">
                DOM’s next layer will add pilot-impact summaries, event normalization, source verification, and direct
                DOMINIC workflow flags when a regulatory change affects mission planning.
              </p>
            </div>
            <Link href="/pilot/login" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#F45A1E] px-6 py-4 text-sm font-black text-black">
              Pilot access <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
