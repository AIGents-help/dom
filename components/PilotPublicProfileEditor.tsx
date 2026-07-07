"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Pilot > Public Profile tab — lets an approved pilot build a public,
// client-facing portfolio page at /pilots/[slug]. Drafting (bio, photo,
// portfolio, slug) is free for everyone; actually going *live* requires
// subscription_active + both verification flags (checked here for UI and
// re-checked server-side by app/pilots/[slug]/page.tsx before rendering).
//
// Writes go straight through contractor_update_own RLS (same pattern as
// PilotProfileEditor) — no new API route. Images upload directly to the
// public "pilot-media" Storage bucket under {user_id}/... , matching the
// storage.objects RLS policy that scopes writes to the caller's own folder.

const V = { ground: "#0A0E14", surface: "#11161F", raised: "#161D29", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D", telemetry: "#4FD1C5" };
const panelStyle: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 14, outline: "none" };
const labelStyle: React.CSSProperties = { fontSize: 11, color: V.inkFaint, letterSpacing: ".1em", textTransform: "uppercase" };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 9, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

interface PortfolioImage { id: string; image_url: string; caption: string | null; sort_order: number; }

interface Profile {
  id: string;
  full_name: string;
  subscription_active: boolean;
  part107_verified: boolean;
  insurance_verified: boolean;
  slug: string | null;
  bio: string | null;
  tagline: string | null;
  photo_url: string | null;
  website_url: string | null;
  profile_published: boolean;
}

export default function PilotPublicProfileEditor({
  profile,
  portfolio,
  userId,
  onSaved,
}: {
  profile: Profile;
  portfolio: PortfolioImage[];
  userId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    slug: profile.slug ?? slugify(profile.full_name),
    bio: profile.bio ?? "",
    tagline: profile.tagline ?? "",
    website_url: profile.website_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const eligible = profile.subscription_active && profile.part107_verified && profile.insurance_verified;
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function saveDetails() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const sb = getSupabaseBrowser();
      const cleanSlug = slugify(form.slug);
      if (!cleanSlug) throw new Error("Slug can't be empty");

      const { error: updateError } = await sb
        .from("contractors")
        .update({
          slug: cleanSlug,
          bio: form.bio.trim() || null,
          tagline: form.tagline.trim() || null,
          website_url: form.website_url.trim() || null,
        })
        .eq("id", profile.id);

      if (updateError) {
        if (updateError.message.includes("duplicate key")) {
          throw new Error("That URL is already taken by another pilot — try a different one.");
        }
        throw updateError;
      }
      setForm((f) => ({ ...f, slug: cleanSlug }));
      setNotice("Saved.");
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished() {
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: updateError } = await sb
        .from("contractors")
        .update({ profile_published: !profile.profile_published })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to update");
    }
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const path = `${userId}/headshot-${Date.now()}-${file.name}`;
      const { error: uploadError } = await sb.storage.from("pilot-media").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: pub } = sb.storage.from("pilot-media").getPublicUrl(path);
      const { error: updateError } = await sb.from("contractors").update({ photo_url: pub.publicUrl }).eq("id", profile.id);
      if (updateError) throw updateError;
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function uploadPortfolioImage(file: File) {
    setUploadingPortfolio(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const path = `${userId}/portfolio-${Date.now()}-${file.name}`;
      const { error: uploadError } = await sb.storage.from("pilot-media").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: pub } = sb.storage.from("pilot-media").getPublicUrl(path);
      const { error: insertError } = await sb.from("contractor_portfolio_images").insert({
        contractor_id: profile.id,
        image_url: pub.publicUrl,
        sort_order: portfolio.length,
      });
      if (insertError) throw insertError;
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to upload image");
    } finally {
      setUploadingPortfolio(false);
    }
  }

  async function deletePortfolioImage(id: string) {
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const { error: deleteError } = await sb.from("contractor_portfolio_images").delete().eq("id", id);
      if (deleteError) throw deleteError;
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Failed to delete image");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && (
        <div style={{ ...panelStyle, borderColor: "#FF8A3D" }}>
          <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>
        </div>
      )}

      <div style={panelStyle}>
        <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
          Publish Status
        </div>
        <div style={{ display: "grid", gap: 6, marginTop: 12, fontSize: 13 }}>
          <EligibilityRow label="Subscribed to DOM Premium" ok={profile.subscription_active} />
          <EligibilityRow label="Part 107 verified" ok={profile.part107_verified} />
          <EligibilityRow label="Insurance verified" ok={profile.insurance_verified} />
        </div>
        {eligible ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <button onClick={togglePublished} style={btnPrimary}>
              {profile.profile_published ? "Unpublish page" : "Publish page"}
            </button>
            {profile.profile_published && form.slug && (
              <a href={`/pilots/${form.slug}`} target="_blank" rel="noreferrer" style={{ color: V.telemetry, fontSize: 13 }}>
                View your public page → {siteUrl}/pilots/{form.slug}
              </a>
            )}
          </div>
        ) : (
          <p style={{ color: V.inkDim, fontSize: 13, marginTop: 14 }}>
            You can keep building your page below — it just won't go live until all three requirements above are met.
          </p>
        )}
      </div>

      <div style={panelStyle}>
        <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
          Headshot
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
          {profile.photo_url ? (
            <img src={profile.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: 12, background: V.raised, display: "grid", placeItems: "center", color: V.inkFaint, fontSize: 11 }}>
              No photo
            </div>
          )}
          <label style={{ ...btnGhost, display: "inline-block" }}>
            {uploadingPhoto ? "Uploading…" : "Upload photo"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={uploadingPhoto}
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            />
          </label>
        </div>
      </div>

      <div style={panelStyle}>
        <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
          Page Details
        </div>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Public page URL</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <span style={{ color: V.inkFaint, fontSize: 13 }}>{siteUrl}/pilots/</span>
              <input style={{ ...inputStyle, marginTop: 0 }} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Tagline</label>
            <input style={inputStyle} placeholder="e.g. FAA-certified aerial inspection specialist" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Bio</label>
            <textarea
              style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit" }}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Website (optional)</label>
            <input style={inputStyle} placeholder="https://" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button onClick={saveDetails} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Save details"}</button>
          {notice && <span style={{ color: V.telemetry, fontSize: 13 }}>{notice}</span>}
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".12em", color: V.signal, textTransform: "uppercase" }}>
            Portfolio
          </div>
          <label style={{ ...btnGhost, display: "inline-block" }}>
            {uploadingPortfolio ? "Uploading…" : "+ Add photo"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={uploadingPortfolio}
              onChange={(e) => e.target.files?.[0] && uploadPortfolioImage(e.target.files[0])}
            />
          </label>
        </div>
        {portfolio.length === 0 ? (
          <p style={{ color: V.inkDim, fontSize: 13, marginTop: 12 }}>No portfolio photos yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 14 }}>
            {portfolio.map((img) => (
              <div key={img.id} style={{ position: "relative" }}>
                <img src={img.image_url} alt={img.caption ?? ""} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8 }} />
                <button
                  onClick={() => deletePortfolioImage(img.id)}
                  style={{ position: "absolute", top: 4, right: 4, background: "rgba(10,14,20,.8)", border: "none", color: V.ink, borderRadius: 6, width: 22, height: 22, cursor: "pointer", fontSize: 12 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EligibilityRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: ok ? V.telemetry : V.inkFaint }}>
      <span>{ok ? "✓" : "○"}</span>
      <span>{label}</span>
    </div>
  );
}
