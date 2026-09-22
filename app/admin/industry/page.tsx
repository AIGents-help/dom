"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

type Draft = {
  id?: string;
  content_type: "article" | "event";
  status: "draft" | "published" | "archived";
  category: string;
  title: string;
  slug: string;
  dek: string;
  body: string;
  pilot_impact: string;
  source_name: string;
  source_url: string;
  starts_at: string;
  ends_at: string;
  location: string;
  registration_url: string;
  featured: boolean;
  published_at: string;
};

const empty: Draft = {
  content_type: "article",
  status: "draft",
  category: "Operations",
  title: "",
  slug: "",
  dek: "",
  body: "",
  pilot_impact: "",
  source_name: "",
  source_url: "",
  starts_at: "",
  ends_at: "",
  location: "",
  registration_url: "",
  featured: false,
  published_at: "",
};

const CATEGORIES = ["FAA & Regulation", "Operations", "Safety", "Technology", "Business", "Mapping", "Events & Training"];

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function IndustryAdminPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    if (!session.session) {
      router.push("/admin/login");
      return;
    }
    const { data, error } = await sb.from("industry_posts").select("*").order("created_at", { ascending: false });
    if (error && error.code !== "42P01") setError(error.message);
    setPosts(data ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    draft: posts.filter((p) => p.status === "draft").length,
    published: posts.filter((p) => p.status === "published").length,
    events: posts.filter((p) => p.content_type === "event" && p.status !== "archived").length,
  }), [posts]);

  function edit(post: any) {
    setDraft({
      id: post.id,
      content_type: post.content_type,
      status: post.status,
      category: post.category ?? "Operations",
      title: post.title ?? "",
      slug: post.slug ?? "",
      dek: post.dek ?? "",
      body: post.body ?? "",
      pilot_impact: post.pilot_impact ?? "",
      source_name: post.source_name ?? "",
      source_url: post.source_url ?? "",
      starts_at: post.starts_at ? post.starts_at.slice(0, 16) : "",
      ends_at: post.ends_at ? post.ends_at.slice(0, 16) : "",
      location: post.location ?? "",
      registration_url: post.registration_url ?? "",
      featured: Boolean(post.featured),
      published_at: post.published_at ? post.published_at.slice(0, 16) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(nextStatus?: Draft["status"]) {
    if (!draft.title.trim()) return;
    setSaving(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const status = nextStatus ?? draft.status;
    const payload = {
      content_type: draft.content_type,
      status,
      category: draft.category,
      title: draft.title.trim(),
      slug: (draft.slug || slugify(draft.title)).trim(),
      dek: draft.dek.trim() || null,
      body: draft.body.trim() || null,
      pilot_impact: draft.pilot_impact.trim() || null,
      source_name: draft.source_name.trim() || null,
      source_url: draft.source_url.trim() || null,
      starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null,
      ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
      location: draft.location.trim() || null,
      registration_url: draft.registration_url.trim() || null,
      featured: draft.featured,
      published_at: status === "published" ? (draft.published_at ? new Date(draft.published_at).toISOString() : new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    };

    const result = draft.id
      ? await sb.from("industry_posts").update(payload).eq("id", draft.id)
      : await sb.from("industry_posts").insert(payload);

    if (result.error) setError(result.error.message);
    else {
      setDraft(empty);
      await load();
    }
    setSaving(false);
  }

  async function archive(id: string) {
    const sb = getSupabaseBrowser();
    await sb.from("industry_posts").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    await load();
  }

  return (
    <main className="section">
      <div className="container-app">
        <p className="eyebrow mb-2">Publishing</p>
        <h1 className="heading-lg">Industry Center</h1>
        <p className="body-muted mt-2">Create pilot-facing articles and events, control publication, and connect each item to an authoritative source.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 22 }}>
          <Stat label="Published" value={counts.published} />
          <Stat label="Drafts" value={counts.draft} />
          <Stat label="Events" value={counts.events} />
          <Stat label="Total" value={posts.length} />
        </div>

        {error && <p style={{ color: V.danger, marginTop: 14 }}>{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(360px,.95fr) minmax(460px,1.25fr)", gap: 18, marginTop: 20 }}>
          <section className="card p-6">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h2 className="font-saira" style={{ fontSize: 18 }}>{draft.id ? "Edit item" : "New item"}</h2>
              {draft.id && <button style={mini} onClick={() => setDraft(empty)}>New</button>}
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select style={input} value={draft.content_type} onChange={(e) => setDraft({ ...draft, content_type: e.target.value as Draft["content_type"] })}>
                  <option value="article">Article</option>
                  <option value="event">Event</option>
                </select>
                <select style={input} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>

              <input style={input} placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })} />
              <input style={input} placeholder="URL slug" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} />
              <textarea style={textarea} placeholder="Short summary / deck" value={draft.dek} onChange={(e) => setDraft({ ...draft, dek: e.target.value })} />
              <textarea style={{ ...textarea, minHeight: 150 }} placeholder="Full article / event description" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <textarea style={textarea} placeholder="What this means for pilots" value={draft.pilot_impact} onChange={(e) => setDraft({ ...draft, pilot_impact: e.target.value })} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input style={input} placeholder="Source name" value={draft.source_name} onChange={(e) => setDraft({ ...draft, source_name: e.target.value })} />
                <input style={input} placeholder="Source URL" value={draft.source_url} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} />
              </div>

              {draft.content_type === "event" && <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={label}>Starts<input style={input} type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} /></label>
                  <label style={label}>Ends<input style={input} type="datetime-local" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} /></label>
                </div>
                <input style={input} placeholder="Location / Online" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
                <input style={input} placeholder="Registration URL" value={draft.registration_url} onChange={(e) => setDraft({ ...draft, registration_url: e.target.value })} />
              </>}

              <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} />
                Feature this item
              </label>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={button} disabled={saving || !draft.title.trim()} onClick={() => save("draft")}>{saving ? "Saving…" : "Save Draft"}</button>
                <button style={{ ...button, background: "#F45A1E" }} disabled={saving || !draft.title.trim()} onClick={() => save("published")}>Publish</button>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="font-saira" style={{ fontSize: 18 }}>Content queue</h2>
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {loading && <p className="body-muted">Loading Industry Center…</p>}
              {!loading && !posts.length && <p className="body-muted">No editorial content yet. The public page can still show the automated FAA feed.</p>}
              {posts.map((post) => (
                <div key={post.id} style={{ padding: 14, border: `1px solid ${V.line}`, borderLeft: `5px solid ${post.status === "published" ? "#22c55e" : post.status === "draft" ? "#F59E0B" : "#64748B"}`, borderRadius: 10, background: V.raised }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: V.inkFaint }}>{post.content_type} · {post.category}</div>
                      <strong>{post.title}</strong>
                      <div style={{ color: V.inkDim, fontSize: 12, marginTop: 3 }}>/{post.slug}</div>
                    </div>
                    <span style={{ textTransform: "uppercase", fontSize: 10, color: post.status === "published" ? "#16a34a" : V.warn }}>{post.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                    <button style={mini} onClick={() => edit(post)}>Edit</button>
                    {post.status !== "archived" && <button style={mini} onClick={() => archive(post.id)}>Archive</button>}
                    {post.status === "published" && <a style={{ ...mini, textDecoration: "none" }} href={`/industry/${post.slug}`} target="_blank">View</a>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase" }}>{label}</div><div className="font-saira" style={{ fontSize: 22, fontWeight: 800, marginTop: 3 }}>{value}</div></div>;
}
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.raised, color: V.ink };
const textarea: React.CSSProperties = { ...input, minHeight: 88, resize: "vertical" };
const label: React.CSSProperties = { color: V.inkDim, fontSize: 11, display: "grid", gap: 5 };
const button: React.CSSProperties = { padding: "9px 14px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontWeight: 800, cursor: "pointer" };
const mini: React.CSSProperties = { padding: "5px 9px", borderRadius: 6, border: `1px solid ${V.line}`, background: V.surface, color: V.ink, fontSize: 11, cursor: "pointer" };
