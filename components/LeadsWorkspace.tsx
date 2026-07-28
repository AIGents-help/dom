"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { inputCls, labelCls, Pill, Section, Empty, ActionBtn } from "@/components/adminUi";

interface Lead {
  id: string; name: string | null; email: string | null; company: string | null;
  phone: string | null; source: string | null; message: string | null; status: string; created_at: string;
  tier: string | null; vertical: string | null; external_prospect_id: string | null;
  preferred_contact_method: string | null; last_contacted_at: string | null; next_follow_up_at: string | null;
}
interface OutreachEvent {
  id: string; prospect_id: string; event_type: string; intent: string | null; created_at: string;
}
interface NoteRow {
  id: string; entity_type: string; entity_id: string; author: string | null; body: string; created_at: string;
}

const LEAD_STATUS_FLOW: Record<string, string> = { new: "contacted", contacted: "qualified", qualified: "converted" };

const TIER_OPTIONS = [
  { value: "tier_1", label: "Tier 1 — Roof Inspection" },
  { value: "tier_2", label: "Tier 2 — Thermal / Moisture" },
  { value: "tier_3", label: "Tier 3 — Ortho / Mapping" },
];
const VERTICAL_OPTIONS = [
  { value: "roofing", label: "Roofing" },
  { value: "insurance_restoration", label: "Insurance Restoration" },
  { value: "public_adjuster", label: "Public Adjuster" },
  { value: "property_management", label: "Property Management" },
  { value: "general_contractor", label: "General Contractor" },
  { value: "other", label: "Other" },
];
const CONTACT_METHOD_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
  { value: "in_person", label: "In person" },
  { value: "other", label: "Other" },
];
const TIER_LABELS: Record<string, string> = Object.fromEntries(TIER_OPTIONS.map((t) => [t.value, t.label]));
const VERTICAL_LABELS: Record<string, string> = Object.fromEntries(VERTICAL_OPTIONS.map((v) => [v.value, v.label]));
const EVENT_LABELS: Record<string, string> = {
  sent: "Email sent", opened: "Opened", clicked: "Clicked link", replied: "Replied",
  bounced: "Bounced", unsubscribed: "Unsubscribed",
};

const emptyLeadForm = {
  name: "", email: "", company: "", phone: "", source: "", message: "",
  tier: "", vertical: "", preferred_contact_method: "", next_follow_up_at: "",
};

export default function LeadsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [eventsByProspect, setEventsByProspect] = useState<Record<string, OutreachEvent[]>>({});

  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showAddLead, setShowAddLead] = useState(false);
  const [leadForm, setLeadForm] = useState(emptyLeadForm);

  const [filterTier, setFilterTier] = useState("");
  const [filterVertical, setFilterVertical] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [quickNoteDraft, setQuickNoteDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const [leadsRes, notesRes] = await Promise.all([
      sb.from("leads").select("*").order("created_at", { ascending: false }),
      sb.from("notes").select("*").eq("entity_type", "lead").order("created_at", { ascending: false }),
    ]);
    const leadRows = (leadsRes.data as Lead[]) ?? [];
    setLeads(leadRows);
    setNotes((notesRes.data as NoteRow[]) ?? []);

    const prospectIds = leadRows.map((l) => l.external_prospect_id).filter((id): id is string => !!id);
    if (prospectIds.length > 0) {
      const { data: eventsData } = await sb
        .from("outreach_events")
        .select("id, prospect_id, event_type, intent, created_at")
        .in("prospect_id", prospectIds)
        .order("created_at", { ascending: false });
      const grouped: Record<string, OutreachEvent[]> = {};
      for (const ev of (eventsData as OutreachEvent[]) ?? []) {
        (grouped[ev.prospect_id] ??= []).push(ev);
      }
      setEventsByProspect(grouped);
    } else {
      setEventsByProspect({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) { router.push("/admin/login"); return; }
      await load();
    })();
  }, [router, load]);

  // Deep-link support: a note or dashboard stat card can send us here with
  // ?lead=<id> and we'll auto-expand that row once leads have loaded.
  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (leadId && leads.some((l) => l.id === leadId)) {
      setExpandedLead(leadId);
    }
  }, [searchParams, leads]);

  async function setLeadField(lead: Lead, field: keyof Lead, value: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    await sb.from("leads").update({ [field]: value || null }).eq("id", lead.id);
    await load();
    setBusy(null);
  }

  async function setLeadStatus(lead: Lead, status: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    await sb.from("leads").update({ status }).eq("id", lead.id);
    await load();
    setBusy(null);
  }

  async function logContactNow(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    await sb.from("leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", lead.id);
    await load();
    setBusy(null);
  }

  async function convertLead(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("clients").insert({
      company_name: lead.company ?? lead.name ?? "Unnamed",
      contact_name: lead.name,
      email: lead.email,
      phone: lead.phone,
    });
    if (error) { alert(error.message); setBusy(null); return; }
    await sb.from("leads").update({ status: "converted" }).eq("id", lead.id);
    await load();
    setBusy(null);
    router.push("/admin/dashboard");
  }

  async function addLead() {
    if (!leadForm.name && !leadForm.email && !leadForm.company) {
      alert("Add at least a name, email, or company.");
      return;
    }
    setBusy("add-lead");
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").insert({
      name: leadForm.name || null,
      email: leadForm.email || null,
      company: leadForm.company || null,
      phone: leadForm.phone || null,
      source: leadForm.source || null,
      message: leadForm.message || null,
      tier: leadForm.tier || null,
      vertical: leadForm.vertical || null,
      preferred_contact_method: leadForm.preferred_contact_method || null,
      next_follow_up_at: leadForm.next_follow_up_at || null,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setLeadForm(emptyLeadForm);
    setShowAddLead(false);
    await load();
  }

  async function addQuickNote(leadId: string) {
    const body = (quickNoteDraft[leadId] ?? "").trim();
    if (!body) return;
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    const { error } = await sb.from("notes").insert({
      entity_type: "lead",
      entity_id: leadId,
      author: session.session?.user.email ?? null,
      body,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setQuickNoteDraft((d) => ({ ...d, [leadId]: "" }));
    await load();
  }

  if (loading) return <p className="text-slate-400">Loading leads…</p>;

  const today = new Date().toISOString().slice(0, 10);
  const filtered = leads.filter((l) =>
    (!filterTier || l.tier === filterTier) &&
    (!filterVertical || l.vertical === filterVertical) &&
    (!filterStatus || l.status === filterStatus)
  );

  return (
    <div className="card p-6 lg:p-8">
      <Section
        title="Leads"
        desc="Inbound prospects from the website and outreach. Click a lead to view full details, log contact, and take action."
        action={<ActionBtn onClick={() => setShowAddLead((s) => !s)}>{showAddLead ? "Cancel" : "+ Add Lead"}</ActionBtn>}
      >
        {showAddLead && (
          <div className="mb-4 grid gap-3 rounded-lg border border-border bg-surface2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className={labelCls}>Name</label><input className={inputCls} value={leadForm.name} onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className={labelCls}>Company</label><input className={inputCls} value={leadForm.company} onChange={(e) => setLeadForm((f) => ({ ...f, company: e.target.value }))} /></div>
            <div><label className={labelCls}>Email</label><input className={inputCls} value={leadForm.email} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={leadForm.phone} onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className={labelCls}>Source</label><input className={inputCls} placeholder="phone, referral, website…" value={leadForm.source} onChange={(e) => setLeadForm((f) => ({ ...f, source: e.target.value }))} /></div>
            <div>
              <label className={labelCls}>Tier</label>
              <select className={inputCls} value={leadForm.tier} onChange={(e) => setLeadForm((f) => ({ ...f, tier: e.target.value }))}>
                <option value="">—</option>
                {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vertical</label>
              <select className={inputCls} value={leadForm.vertical} onChange={(e) => setLeadForm((f) => ({ ...f, vertical: e.target.value }))}>
                <option value="">—</option>
                {VERTICAL_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Preferred contact method</label>
              <select className={inputCls} value={leadForm.preferred_contact_method} onChange={(e) => setLeadForm((f) => ({ ...f, preferred_contact_method: e.target.value }))}>
                <option value="">—</option>
                {CONTACT_METHOD_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Next follow-up</label>
              <input type="date" className={inputCls} value={leadForm.next_follow_up_at} onChange={(e) => setLeadForm((f) => ({ ...f, next_follow_up_at: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3"><label className={labelCls}>Message</label><textarea className={inputCls} rows={2} value={leadForm.message} onChange={(e) => setLeadForm((f) => ({ ...f, message: e.target.value }))} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><ActionBtn disabled={busy === "add-lead"} onClick={addLead}>{busy === "add-lead" ? "Saving…" : "Save Lead"}</ActionBtn></div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <select className={inputCls + " w-auto"} value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
            <option value="">All tiers</option>
            {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className={inputCls + " w-auto"} value={filterVertical} onChange={(e) => setFilterVertical(e.target.value)}>
            <option value="">All verticals</option>
            {VERTICAL_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <select className={inputCls + " w-auto"} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["new", "contacted", "qualified", "converted", "lost"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(filterTier || filterVertical || filterStatus) && (
            <button className="text-xs text-slate-500 underline" onClick={() => { setFilterTier(""); setFilterVertical(""); setFilterStatus(""); }}>
              Clear filters
            </button>
          )}
        </div>

        {leads.length === 0 && <Empty>No leads yet.</Empty>}
        {leads.length > 0 && filtered.length === 0 && <Empty>No leads match these filters.</Empty>}

        <div className="space-y-3">
          {filtered.map((l) => {
            const open = expandedLead === l.id;
            const events = l.external_prospect_id ? eventsByProspect[l.external_prospect_id] ?? [] : [];
            const leadNotes = notes.filter((n) => n.entity_id === l.id);
            return (
              <div key={l.id} className="rounded-lg border border-border bg-surface2">
                <button
                  onClick={() => setExpandedLead(open ? null : l.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-4 p-4 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{l.name ?? "Unnamed"}</div>
                    <div className="text-xs text-slate-500">{l.company ?? "—"} · {l.email ?? "—"}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {l.next_follow_up_at && l.next_follow_up_at <= today && !["converted", "lost"].includes(l.status) && (
                      <Pill><span className="text-rose-400">Follow-up due</span></Pill>
                    )}
                    {l.tier && <Pill>{TIER_LABELS[l.tier] ?? l.tier}</Pill>}
                    {l.vertical && <Pill>{VERTICAL_LABELS[l.vertical] ?? l.vertical}</Pill>}
                    <Pill>{l.status}</Pill>
                  </div>
                </button>

                {open && (
                  <div className="grid gap-6 border-t border-border p-4 lg:grid-cols-2">
                    <div className="space-y-3 text-sm text-slate-300">
                      <p><span className="text-slate-500">Phone:</span> {l.phone ?? "—"}</p>
                      <p><span className="text-slate-500">Source:</span> {l.source ?? "—"}</p>
                      <p><span className="text-slate-500">Last contacted:</span> {l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleString() : "Never"}</p>
                      {l.message && <p><span className="text-slate-500">Message:</span> {l.message}</p>}
                      <p className="text-xs text-slate-500">Submitted {new Date(l.created_at).toLocaleDateString()}</p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelCls}>Tier</label>
                          <select className={inputCls} value={l.tier ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "tier", e.target.value)}>
                            <option value="">—</option>
                            {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Vertical</label>
                          <select className={inputCls} value={l.vertical ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "vertical", e.target.value)}>
                            <option value="">—</option>
                            {VERTICAL_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Preferred contact method</label>
                          <select className={inputCls} value={l.preferred_contact_method ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "preferred_contact_method", e.target.value)}>
                            <option value="">—</option>
                            {CONTACT_METHOD_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Next follow-up</label>
                          <input type="date" className={inputCls} value={l.next_follow_up_at ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "next_follow_up_at", e.target.value)} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <ActionBtn disabled={busy === l.id} onClick={() => logContactNow(l)}>Log contact now</ActionBtn>
                        {LEAD_STATUS_FLOW[l.status] && (
                          <ActionBtn disabled={busy === l.id} onClick={() => setLeadStatus(l, LEAD_STATUS_FLOW[l.status])}>
                            Mark {LEAD_STATUS_FLOW[l.status]}
                          </ActionBtn>
                        )}
                        {l.status !== "converted" && l.status !== "lost" && (
                          <ActionBtn disabled={busy === l.id} onClick={() => convertLead(l)}>Convert to client</ActionBtn>
                        )}
                        {l.status !== "lost" && l.status !== "converted" && (
                          <ActionBtn disabled={busy === l.id} onClick={() => setLeadStatus(l, "lost")}>Mark lost</ActionBtn>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                        {leadNotes.length === 0 ? (
                          <p className="mb-2 text-xs text-slate-500">No notes yet.</p>
                        ) : (
                          <ul className="mb-2 max-h-64 space-y-2 overflow-y-auto">
                            {leadNotes.map((n) => (
                              <li key={n.id} className="rounded border border-border bg-surface p-2 text-xs">
                                <p className="text-slate-300">{n.body}</p>
                                <p className="mt-1 text-slate-500">{n.author ?? "Unknown"} · {new Date(n.created_at).toLocaleString()}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex gap-2">
                          <input
                            className={inputCls}
                            placeholder="Add a quick note…"
                            value={quickNoteDraft[l.id] ?? ""}
                            onChange={(e) => setQuickNoteDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") addQuickNote(l.id); }}
                          />
                          <ActionBtn disabled={busy === l.id} onClick={() => addQuickNote(l.id)}>Add</ActionBtn>
                        </div>
                      </div>

                      {l.external_prospect_id && (
                        <div className="border-t border-border pt-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Outreach activity</p>
                          {events.length === 0 ? (
                            <p className="text-xs text-slate-500">No events recorded yet.</p>
                          ) : (
                            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                              {events.map((ev) => (
                                <li key={ev.id} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-300">
                                    {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                    {ev.intent && ev.intent !== "unknown" && <span className="ml-2 text-slate-500">({ev.intent})</span>}
                                  </span>
                                  <span className="text-slate-500">{new Date(ev.created_at).toLocaleString()}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
