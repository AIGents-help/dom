"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V } from "@/lib/theme";

const CATEGORIES = ["FAA & Regulation", "Operations", "Safety", "Technology", "Business", "Mapping", "Events & Training"];

const empty = { heading: "", question: "", notes: "", source_url: "", category: "Operations" };

export default function IndustryIdeasPage() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    if (!session.session) { router.push("/admin/login"); return; }
    const { data, error } = await sb.from("industry_ideas").select("*").order("created_at", { ascending: false });
    if (error && error.code !== "42P01") setError(error.message);
    setIdeas(data ?? []);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function saveIdea() {
    if (!draft.heading.trim()) return;
    setError(null);
    const sb = getSupabaseBrowser();
    const payload = {
      heading: draft.heading.trim(),
      question: draft.question.trim() || null,
      notes: draft.notes.trim() || null,
      source_url: draft.source_url.trim() || null,
      category: draft.category,
      updated_at: new Date().toISOString(),
    };
    const result = editingId
      ? await sb.from("industry_ideas").update(payload).eq("id", editingId)
      : await sb.from("industry_ideas").insert(payload);
    if (result.error) setError(result.error.message);
    else { setDraft(empty); setEditingId(null); await load(); }
  }

  function editIdea(idea: any) {
    setEditingId(idea.id);
    setDraft({
      heading: idea.heading ?? "",
      question: idea.question ?? "",
      notes: idea.notes ?? "",
      source_url: idea.source_url ?? "",
      category: idea.category ?? "Operations",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generate(idea: any) {
    setBusyId(idea.id);
    setError(null);
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    const token = session.session?.access_token;
    if (!token) { setBusyId(null); router.push("/admin/login"); return; }

    const response = await fetch("/api/admin/industry/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ideaId: idea.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error ?? "Draft generation failed.");
    else router.push("/admin/industry");
    setBusyId(null);
    await load();
  }

  async function dismiss(id: string) {
    const sb = getSupabaseBrowser();
    await sb.from("industry_ideas").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", id);
    await load();
  }

  return (
    <main className="section">
      <div className="container-app">
        <p className="eyebrow mb-2">Industry Center</p>
        <h1 className="heading-lg">Idea Inbox</h1>
        <p className="body-muted mt-2">Drop in rough headings, questions, observations, or source links. AI turns selected ideas into editable drafts; you remain the publisher.</p>

        {error && <p style={{ color: V.danger, marginTop: 14 }}>{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(340px,.8fr) minmax(460px,1.2fr)", gap: 18, marginTop: 22 }}>
          <section className="card p-6">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="font-saira" style={{ fontSize: 18 }}>{editingId ? "Edit idea" : "Capture an idea"}</h2>
              {editingId && <button style={mini} onClick={() => { setEditingId(null); setDraft(empty); }}>Cancel</button>}
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <input style={input} placeholder="Heading / topic" value={draft.heading} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} />
              <input style={input} placeholder="Question the entry should answer" value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
              <select style={input} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              <input style={input} placeholder="Preferred source URL (optional)" value={draft.source_url} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} />
              <textarea style={textarea} placeholder="Notes, angle, points to cover, examples, tone..." value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              <button style={button} onClick={saveIdea} disabled={!draft.heading.trim()}>{editingId ? "Save Changes" : "Add to Idea Inbox"}</button>
            </div>
          </section>

          <section className="card p-6">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="font-saira" style={{ fontSize: 18 }}>Future entries</h2>
              <Link href="/admin/industry" style={{ color: V.signal, fontSize: 12, fontWeight: 700 }}>Published & drafts →</Link>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {!ideas.length && <p className="body-muted">No ideas captured yet.</p>}
              {ideas.map((idea) => (
                <div key={idea.id} style={{ padding: 14, border: `1px solid ${V.line}`, borderLeft: `5px solid ${idea.status === "draft_created" ? "#22c55e" : idea.status === "dismissed" ? "#64748B" : "#F45A1E"}`, borderRadius: 10, background: V.raised }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ color: V.inkFaint, fontSize: 10, textTransform: "uppercase" }}>{idea.category} · {idea.status.replace("_", " ")}</div>
                      <strong>{idea.heading}</strong>
                      {idea.question && <div style={{ color: V.inkDim, fontSize: 12, marginTop: 4 }}>{idea.question}</div>}
                    </div>
                  </div>
                  {idea.notes && <p style={{ color: V.inkDim, fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{idea.notes}</p>}
                  <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                    <button style={mini} onClick={() => editIdea(idea)}>Edit Idea</button>
                    {idea.status !== "dismissed" && <button style={{ ...mini, background: "#F45A1E", color: "#111" }} disabled={busyId === idea.id} onClick={() => generate(idea)}>{busyId === idea.id ? "Generating…" : idea.status === "draft_created" ? "Generate Another Draft" : "Generate AI Draft"}</button>}
                    {idea.generated_post_id && <Link style={{ ...mini, textDecoration: "none" }} href="/admin/industry">Open Draft</Link>}
                    {idea.status !== "dismissed" && <button style={mini} onClick={() => dismiss(idea.id)}>Dismiss</button>}
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

const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.raised, color: V.ink };
const textarea: React.CSSProperties = { ...input, minHeight: 120, resize: "vertical" };
const button: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "none", background: V.signal, color: V.ground, fontWeight: 800, cursor: "pointer" };
const mini: React.CSSProperties = { padding: "5px 9px", borderRadius: 6, border: `1px solid ${V.line}`, background: V.surface, color: V.ink, fontSize: 11, cursor: "pointer" };
