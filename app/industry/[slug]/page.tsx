import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { getIndustryPostBySlug } from "@/lib/industryContent";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getIndustryPostBySlug(slug);
  if (!post) return { title: "Industry Update | Drone Operation Management" };
  return {
    title: `${post.title} | DOM Industry Center`,
    description: post.dek ?? post.pilot_impact ?? "Drone industry update from Drone Operation Management.",
    alternates: { canonical: `/industry/${post.slug}` },
  };
}

function fmt(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function IndustryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getIndustryPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="bg-[#080c10] text-white">
      <header className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(244,90,30,.18),transparent_34%),#080c10]">
        <div className="container-app py-16 lg:py-24">
          <Link href="/industry" className="inline-flex items-center gap-2 text-sm font-black text-[#F45A1E]"><ArrowLeft className="h-4 w-4" /> Industry Center</Link>
          <div className="mt-8 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[.12em] text-[#F45A1E]">
            <span>{post.category}</span><span className="text-white/25">•</span><span>{post.content_type}</span>
          </div>
          <h1 className="mt-4 max-w-5xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">{post.title}</h1>
          {post.dek && <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{post.dek}</p>}
          {post.content_type === "event" && (
            <div className="mt-7 flex flex-wrap gap-5 text-sm text-slate-300">
              {post.starts_at && <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#F45A1E]" />{fmt(post.starts_at)}</span>}
              {post.location && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#F45A1E]" />{post.location}</span>}
            </div>
          )}
        </div>
      </header>

      <div className="container-app grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-20">
        <div>
          {post.body && <div className="whitespace-pre-wrap text-base leading-8 text-slate-300">{post.body}</div>}
          {post.pilot_impact && (
            <section className="mt-10 rounded-2xl border border-[#F45A1E]/30 bg-[#F45A1E]/8 p-7">
              <p className="text-xs font-black uppercase tracking-[.14em] text-[#F45A1E]">What this means for pilots</p>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-200">{post.pilot_impact}</p>
            </section>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-white/10 bg-[#111923] p-6">
          <h2 className="text-lg font-black">Verify the source</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">DOM provides operational context, but pilots should verify requirements at the authoritative source.</p>
          {post.source_url && <a href={post.source_url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#F45A1E]">{post.source_name || "Official source"} <ExternalLink className="h-4 w-4" /></a>}
          {post.content_type === "event" && post.registration_url && <a href={post.registration_url} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-[#F45A1E] px-4 py-3 text-sm font-black text-black">Registration <ExternalLink className="h-4 w-4" /></a>}
        </aside>
      </div>
    </article>
  );
}
