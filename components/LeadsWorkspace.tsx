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
  address: string | null;
}
interface OutreachEvent {
  id: string; prospect_id: string; event_type: string; intent: string | null; created_at: string;
}
interface NoteRow {
  id: string; entity_type: string; entity_id: string; author: string | null; body: string; created_at: string;
}
interface LeadContact {
  id: string; lead_id: string; name: string | null; email: string | null; phone: string | null;
  title: string | null; is_primary: boolean; created_at: string;
}
interface LeadLocation {
  id: string; lead_id: string; label: string; address: string | null; notes: string | null; created_at: string;
}
interface LeadRelationship {
  id: string; lead_id: string; related_lead_id: string; relationship_type: string; notes: string | null; created_at: string;
}
interface LeadActivity {
  id: string; lead_id: string; activity_type: string; summary: string;
  amount: number | null; occurred_at: string; created_by: string | null; created_at: string;
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
const RELATIONSHIP_OPTIONS = [
  { value: "affiliated", label: "Affiliated" },
  { value: "parent_company", label: "Parent company" },
  { value: "subsidiary", label: "Subsidiary" },
  { value: "vendor", label: "Vendor" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
];
const RELATIONSHIP_LABELS: Record<string, string> = Object.fromEntries(RELATIONSHIP_OPTIONS.map((r) => [r.value, r.label]));
const ACTIVITY_TYPE_OPTIONS = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "letter", label: "Letter" },
  { value: "meeting", label: "Meeting" },
  { value: "bill", label: "Bill" },
  { value: "job", label: "Job" },
  { value: "status_change", label: "Status change" },
  { value: "other", label: "Other" },
];
const ACTIVITY_TYPE_LABELS: Record<string, string> = Object.fromEntries(ACTIVITY_TYPE_OPTIONS.map((a) => [a.value, a.label]));

const emptyLeadForm = {
  name: "", email: "", company: "", phone: "", address: "", source: "", message: "",
  tier: "", vertical: "", preferred_contact_method: "", next_follow_up_at: "",
};

export default function LeadsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [eventsByProspect, setEventsByProspect] = useState<Record<string, OutreachEvent[]>>({});
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [locations, setLocations] = useState<LeadLocation[]>([]);
  const [relationships, setRelationships] = useState<LeadRelationship[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);

  const [editingLead, setEditingLead] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", company: "", email: "", phone: "", address: "", source: "", message: "" });

  const [activityDraft, setActivityDraft] = useState<Record<string, { activity_type: string; summary: string; amount: string; occurred_at: string }>>({});

  const [sortKey, setSortKey] = useState<"company" | "name">("company");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [contactDraft, setContactDraft] = useState<Record<string, { name: string; email: string; phone: string; title: string }>>({});
  const [locationDraft, setLocationDraft] = useState<Record<string, { label: string; address: string; notes: string }>>({});
  const [relationshipDraft, setRelationshipDraft] = useState<Record<string, { related_lead_id: string; relationship_type: string }>>({});

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
    const [leadsRes, notesRes, contactsRes, locationsRes, relationshipsRes, activitiesRes] = await Promise.all([
      sb.from("leads").select("*").order("created_at", { ascending: false }),
      sb.from("notes").select("*").eq("entity_type", "lead").order("created_at", { ascending: false }),
      sb.from("lead_contacts").select("*").order("is_primary", { ascending: false }),
      sb.from("lead_locations").select("*").order("created_at", { ascending: true }),
      sb.from("lead_relationships").select("*").order("created_at", { ascending: true }),
      sb.from("lead_activities").select("*").order("occurred_at", { ascending: false }),
    ]);
    const leadRows = (leadsRes.data as Lead[]) ?? [];
    setLeads(leadRows);
    setNotes((notesRes.data as NoteRow[]) ?? []);
    setContacts((contactsRes.data as LeadContact[]) ?? []);
    setLocations((locationsRes.data as LeadLocation[]) ?? []);
    setRelationships((relationshipsRes.data as LeadRelationship[]) ?? []);
    setActivities((activitiesRes.data as LeadActivity[]) ?? []);

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

  async function logActivity(leadId: string, activityType: string, summary: string, amount?: number | null, occurredAt?: string) {
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    await sb.from("lead_activities").insert({
      lead_id: leadId,
      activity_type: activityType,
      summary,
      amount: amount ?? null,
      occurred_at: occurredAt || new Date().toISOString(),
      created_by: session.session?.user.email ?? null,
    });
  }

  async function setLeadField(lead: Lead, field: keyof Lead, value: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    await sb.from("leads").update({ [field]: value || null }).eq("id", lead.id);
    await load();
    setBusy(null);
  }

  function startEditLead(lead: Lead) {
    setEditingLead(lead.id);
    setEditDraft({
      name: lead.name ?? "", company: lead.company ?? "", email: lead.email ?? "",
      phone: lead.phone ?? "", address: lead.address ?? "", source: lead.source ?? "", message: lead.message ?? "",
    });
  }

  async function saveEditLead(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({
      name: editDraft.name || null,
      company: editDraft.company || null,
      email: editDraft.email || null,
      phone: editDraft.phone || null,
      address: editDraft.address || null,
      source: editDraft.source || null,
      message: editDraft.message || null,
    }).eq("id", lead.id);
    setBusy(null);
    if (error) { alert(error.message); return; }
    setEditingLead(null);
    await load();
  }

  async function setLeadStatus(lead: Lead, status: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    await sb.from("leads").update({ status }).eq("id", lead.id);
    await logActivity(lead.id, "status_change", `Status changed to "${status}"`);
    await load();
    setBusy(null);
  }

  async function logContactNow(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    await sb.from("leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", lead.id);
    await logActivity(lead.id, "other", "Contact logged");
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
    await logActivity(lead.id, "status_change", "Converted to client");
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
      address: leadForm.address || null,
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

  async function addContact(leadId: string) {
    const draft = contactDraft[leadId];
    if (!draft || (!draft.name && !draft.email && !draft.phone)) {
      alert("Add at least a name, email, or phone for this contact.");
      return;
    }
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("lead_contacts").insert({
      lead_id: leadId,
      name: draft.name || null,
      email: draft.email || null,
      phone: draft.phone || null,
      title: draft.title || null,
      is_primary: false,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setContactDraft((d) => ({ ...d, [leadId]: { name: "", email: "", phone: "", title: "" } }));
    await load();
  }

  async function deleteContact(contactId: string, leadId: string) {
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    await sb.from("lead_contacts").delete().eq("id", contactId);
    await load();
    setBusy(null);
  }

  async function addLocation(leadId: string) {
    const draft = locationDraft[leadId];
    if (!draft || !draft.label) {
      alert("A branch/location needs at least a label (e.g. \"HQ\", \"Newark Branch\").");
      return;
    }
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("lead_locations").insert({
      lead_id: leadId,
      label: draft.label,
      address: draft.address || null,
      notes: draft.notes || null,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setLocationDraft((d) => ({ ...d, [leadId]: { label: "", address: "", notes: "" } }));
    await load();
  }

  async function deleteLocation(locationId: string, leadId: string) {
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    await sb.from("lead_locations").delete().eq("id", locationId);
    await load();
    setBusy(null);
  }

  async function addRelationship(leadId: string) {
    const draft = relationshipDraft[leadId];
    if (!draft || !draft.related_lead_id) {
      alert("Pick a lead to link to.");
      return;
    }
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("lead_relationships").insert({
      lead_id: leadId,
      related_lead_id: draft.related_lead_id,
      relationship_type: draft.relationship_type || "affiliated",
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setRelationshipDraft((d) => ({ ...d, [leadId]: { related_lead_id: "", relationship_type: "affiliated" } }));
    await load();
  }

  async function deleteRelationship(relationshipId: string, leadId: string) {
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    await sb.from("lead_relationships").delete().eq("id", relationshipId);
    await load();
    setBusy(null);
  }

  async function addActivity(leadId: string) {
    const draft = activityDraft[leadId];
    if (!draft || !draft.summary) {
      alert("Add a description for this interaction.");
      return;
    }
    setBusy(leadId);
    await logActivity(
      leadId,
      draft.activity_type || "other",
      draft.summary,
      draft.amount ? parseFloat(draft.amount) : null,
      draft.occurred_at ? new Date(draft.occurred_at).toISOString() : undefined
    );
    setBusy(null);
    setActivityDraft((d) => ({ ...d, [leadId]: { activity_type: "call", summary: "", amount: "", occurred_at: "" } }));
    await load();
  }

  async function deleteActivity(activityId: string, leadId: string) {
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    await sb.from("lead_activities").delete().eq("id", activityId);
    await load();
    setBusy(null);
  }

  if (loading) return <p className="text-slate-400">Loading leads…</p>;

  const today = new Date().toISOString().slice(0, 10);
  const filtered = leads
    .filter((l) =>
      (!filterTier || l.tier === filterTier) &&
      (!filterVertical || l.vertical === filterVertical) &&
      (!filterStatus || l.status === filterStatus)
    )
    .sort((a, b) => {
      const av = (sortKey === "company" ? a.company : a.name) ?? "";
      const bv = (sortKey === "company" ? b.company : b.name) ?? "";
      const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });

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
            <div><label className={labelCls}>Address</label><input className={inputCls} value={leadForm.address} onChange={(e) => setLeadForm((f) => ({ ...f, address: e.target.value }))} /></div>
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

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">Sort by</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["company", "name"] as const).map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                  else { setSortKey(key); setSortDir("asc"); }
                }}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  sortKey === key ? "bg-accent/10 text-accent" : "bg-surface2 text-slate-400 hover:text-white"
                }`}
              >
                {key === "company" ? "Company" : "Contact"} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>
          <span className="mx-1 h-4 w-px bg-border" />
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
                    <div className="text-sm font-semibold text-white">{l.company ?? l.name ?? "Unnamed"}</div>
                    <div className="text-xs text-slate-500">{l.name ?? "No contact name"} · {l.email ?? "—"}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {l.next_follow_up_at && l.next_follow_up_at <= today && !["converted", "lost"].includes(l.status) && (
                      <Pill><span className="text-rose-400">Follow-up due</span></Pill>
                    )}
                    {contacts.filter((c) => c.lead_id === l.id && !c.is_primary).length > 0 && (
                      <Pill>+{contacts.filter((c) => c.lead_id === l.id && !c.is_primary).length} contact{contacts.filter((c) => c.lead_id === l.id && !c.is_primary).length > 1 ? "s" : ""}</Pill>
                    )}
                    {locations.filter((loc) => loc.lead_id === l.id).length > 0 && (
                      <Pill>{locations.filter((loc) => loc.lead_id === l.id).length} branch{locations.filter((loc) => loc.lead_id === l.id).length > 1 ? "es" : ""}</Pill>
                    )}
                    {l.tier && <Pill>{TIER_LABELS[l.tier] ?? l.tier}</Pill>}
                    {l.vertical && <Pill>{VERTICAL_LABELS[l.vertical] ?? l.vertical}</Pill>}
                    <Pill>{l.status}</Pill>
                  </div>
                </button>

                {open && (
                  <>
                  <div className="grid gap-6 border-t border-border p-4 lg:grid-cols-2">
                    <div className="space-y-3 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact Info</p>
                        {editingLead === l.id ? (
                          <div className="flex gap-2">
                            <ActionBtn disabled={busy === l.id} onClick={() => saveEditLead(l)}>{busy === l.id ? "Saving…" : "Save"}</ActionBtn>
                            <ActionBtn onClick={() => setEditingLead(null)}>Cancel</ActionBtn>
                          </div>
                        ) : (
                          <ActionBtn onClick={() => startEditLead(l)}>Edit</ActionBtn>
                        )}
                      </div>

                      {editingLead === l.id ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div><label className={labelCls}>Contact name</label><input className={inputCls} value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} /></div>
                          <div><label className={labelCls}>Company</label><input className={inputCls} value={editDraft.company} onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))} /></div>
                          <div><label className={labelCls}>Email</label><input className={inputCls} value={editDraft.email} onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))} /></div>
                          <div><label className={labelCls}>Phone</label><input className={inputCls} value={editDraft.phone} onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))} /></div>
                          <div><label className={labelCls}>Address</label><input className={inputCls} value={editDraft.address} onChange={(e) => setEditDraft((d) => ({ ...d, address: e.target.value }))} /></div>
                          <div><label className={labelCls}>Source</label><input className={inputCls} value={editDraft.source} onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))} /></div>
                          <div className="sm:col-span-2"><label className={labelCls}>Message</label><textarea className={inputCls} rows={2} value={editDraft.message} onChange={(e) => setEditDraft((d) => ({ ...d, message: e.target.value }))} /></div>
                        </div>
                      ) : (
                        <>
                          <p><span className="text-slate-500">Company:</span> {l.company ?? "—"}</p>
                          <p><span className="text-slate-500">Contact:</span> {l.name ?? "—"}</p>
                          <p><span className="text-slate-500">Email:</span> {l.email ?? "—"}</p>
                          <p><span className="text-slate-500">Phone:</span> {l.phone ?? "—"}</p>
                          <p><span className="text-slate-500">Address:</span> {l.address ?? "—"}</p>
                          <p><span className="text-slate-500">Source:</span> {l.source ?? "—"}</p>
                          <p><span className="text-slate-500">Last contacted:</span> {l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleString() : "Never"}</p>
                          {l.message && <p><span className="text-slate-500">Message:</span> {l.message}</p>}
                          <p className="text-xs text-slate-500">Submitted {new Date(l.created_at).toLocaleDateString()}</p>
                        </>
                      )}

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

                  <div className="border-t border-border p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Interaction Log</p>
                    {(() => {
                      const leadActivities = activities.filter((a) => a.lead_id === l.id);
                      return leadActivities.length === 0 ? (
                        <p className="mb-3 text-xs text-slate-500">No interactions logged yet.</p>
                      ) : (
                        <div className="mb-3 overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-border text-slate-500">
                                <th className="py-2 pr-4 font-medium">Date</th>
                                <th className="py-2 pr-4 font-medium">Type</th>
                                <th className="py-2 pr-4 font-medium">Description</th>
                                <th className="py-2 pr-4 font-medium">Amount</th>
                                <th className="py-2 pr-4 font-medium">Logged by</th>
                                <th className="py-2 pr-2 font-medium"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {leadActivities.map((a) => (
                                <tr key={a.id} className="border-b border-border/60 last:border-0">
                                  <td className="py-2 pr-4 whitespace-nowrap text-slate-400">{new Date(a.occurred_at).toLocaleDateString()}</td>
                                  <td className="py-2 pr-4 whitespace-nowrap"><Pill>{ACTIVITY_TYPE_LABELS[a.activity_type] ?? a.activity_type}</Pill></td>
                                  <td className="py-2 pr-4 text-slate-300">{a.summary}</td>
                                  <td className="py-2 pr-4 whitespace-nowrap text-slate-400">{a.amount != null ? `$${a.amount.toFixed(2)}` : "—"}</td>
                                  <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{a.created_by ?? "—"}</td>
                                  <td className="py-2 pr-2 text-right">
                                    <button className="text-slate-600 hover:text-rose-400" onClick={() => deleteActivity(a.id, l.id)}>✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}

                    <div className="grid gap-2 sm:grid-cols-[140px_1fr_120px_160px_auto]">
                      <select
                        className={inputCls}
                        value={activityDraft[l.id]?.activity_type ?? "call"}
                        onChange={(e) => setActivityDraft((d) => ({ ...d, [l.id]: { activity_type: e.target.value, summary: d[l.id]?.summary ?? "", amount: d[l.id]?.amount ?? "", occurred_at: d[l.id]?.occurred_at ?? "" } }))}
                      >
                        {ACTIVITY_TYPE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                      <input
                        className={inputCls}
                        placeholder='What happened? e.g. "Called, left voicemail" / "Sent invoice #204" / "Roof job flown"'
                        value={activityDraft[l.id]?.summary ?? ""}
                        onChange={(e) => setActivityDraft((d) => ({ ...d, [l.id]: { activity_type: d[l.id]?.activity_type ?? "call", summary: e.target.value, amount: d[l.id]?.amount ?? "", occurred_at: d[l.id]?.occurred_at ?? "" } }))}
                        onKeyDown={(e) => { if (e.key === "Enter") addActivity(l.id); }}
                      />
                      <input
                        className={inputCls}
                        placeholder="Amount"
                        type="number"
                        step="0.01"
                        value={activityDraft[l.id]?.amount ?? ""}
                        onChange={(e) => setActivityDraft((d) => ({ ...d, [l.id]: { activity_type: d[l.id]?.activity_type ?? "call", summary: d[l.id]?.summary ?? "", amount: e.target.value, occurred_at: d[l.id]?.occurred_at ?? "" } }))}
                      />
                      <input
                        className={inputCls}
                        type="date"
                        value={activityDraft[l.id]?.occurred_at ?? ""}
                        onChange={(e) => setActivityDraft((d) => ({ ...d, [l.id]: { activity_type: d[l.id]?.activity_type ?? "call", summary: d[l.id]?.summary ?? "", amount: d[l.id]?.amount ?? "", occurred_at: e.target.value } }))}
                      />
                      <ActionBtn disabled={busy === l.id} onClick={() => addActivity(l.id)}>Log</ActionBtn>
                    </div>
                  </div>

                  <div className="grid gap-6 border-t border-border p-4 lg:grid-cols-3">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Additional Contacts</p>
                      {contacts.filter((c) => c.lead_id === l.id).length === 0 ? (
                        <p className="mb-2 text-xs text-slate-500">No additional contacts.</p>
                      ) : (
                        <ul className="mb-2 space-y-2">
                          {contacts.filter((c) => c.lead_id === l.id).map((c) => (
                            <li key={c.id} className="rounded border border-border bg-surface p-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-slate-200">
                                    {c.name ?? "Unnamed"} {c.is_primary && <span className="text-accent">(primary)</span>}
                                  </p>
                                  {c.title && <p className="text-slate-500">{c.title}</p>}
                                  {c.email && <p className="text-slate-400">{c.email}</p>}
                                  {c.phone && <p className="text-slate-400">{c.phone}</p>}
                                </div>
                                {!c.is_primary && (
                                  <button className="text-slate-600 hover:text-rose-400" onClick={() => deleteContact(c.id, l.id)}>✕</button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="space-y-2">
                        <input className={inputCls} placeholder="Name" value={contactDraft[l.id]?.name ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] ?? { name: "", email: "", phone: "", title: "" }), name: e.target.value } }))} />
                        <input className={inputCls} placeholder="Title" value={contactDraft[l.id]?.title ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] ?? { name: "", email: "", phone: "", title: "" }), title: e.target.value } }))} />
                        <input className={inputCls} placeholder="Email" value={contactDraft[l.id]?.email ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] ?? { name: "", email: "", phone: "", title: "" }), email: e.target.value } }))} />
                        <input className={inputCls} placeholder="Phone" value={contactDraft[l.id]?.phone ?? ""}
                          onChange={(e) => setContactDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] ?? { name: "", email: "", phone: "", title: "" }), phone: e.target.value } }))} />
                        <ActionBtn disabled={busy === l.id} onClick={() => addContact(l.id)}>+ Add Contact</ActionBtn>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Branches / Locations</p>
                      {locations.filter((loc) => loc.lead_id === l.id).length === 0 ? (
                        <p className="mb-2 text-xs text-slate-500">No branches added.</p>
                      ) : (
                        <ul className="mb-2 space-y-2">
                          {locations.filter((loc) => loc.lead_id === l.id).map((loc) => (
                            <li key={loc.id} className="rounded border border-border bg-surface p-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-slate-200">{loc.label}</p>
                                  {loc.address && <p className="text-slate-400">{loc.address}</p>}
                                  {loc.notes && <p className="text-slate-500">{loc.notes}</p>}
                                </div>
                                <button className="text-slate-600 hover:text-rose-400" onClick={() => deleteLocation(loc.id, l.id)}>✕</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="space-y-2">
                        <input className={inputCls} placeholder="Label (e.g. HQ, Newark Branch)" value={locationDraft[l.id]?.label ?? ""}
                          onChange={(e) => setLocationDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] ?? { label: "", address: "", notes: "" }), label: e.target.value } }))} />
                        <input className={inputCls} placeholder="Address" value={locationDraft[l.id]?.address ?? ""}
                          onChange={(e) => setLocationDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] ?? { label: "", address: "", notes: "" }), address: e.target.value } }))} />
                        <input className={inputCls} placeholder="Notes" value={locationDraft[l.id]?.notes ?? ""}
                          onChange={(e) => setLocationDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] ?? { label: "", address: "", notes: "" }), notes: e.target.value } }))} />
                        <ActionBtn disabled={busy === l.id} onClick={() => addLocation(l.id)}>+ Add Branch</ActionBtn>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Related Companies</p>
                      {relationships.filter((r) => r.lead_id === l.id).length === 0 ? (
                        <p className="mb-2 text-xs text-slate-500">No related companies linked.</p>
                      ) : (
                        <ul className="mb-2 space-y-2">
                          {relationships.filter((r) => r.lead_id === l.id).map((r) => {
                            const related = leads.find((x) => x.id === r.related_lead_id);
                            return (
                              <li key={r.id} className="rounded border border-border bg-surface p-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-slate-200">{related?.company ?? related?.name ?? "Unknown lead"}</p>
                                    <p className="text-slate-500">{RELATIONSHIP_LABELS[r.relationship_type] ?? r.relationship_type}</p>
                                  </div>
                                  <button className="text-slate-600 hover:text-rose-400" onClick={() => deleteRelationship(r.id, l.id)}>✕</button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="space-y-2">
                        <select className={inputCls} value={relationshipDraft[l.id]?.related_lead_id ?? ""}
                          onChange={(e) => setRelationshipDraft((d) => ({ ...d, [l.id]: { relationship_type: d[l.id]?.relationship_type ?? "affiliated", related_lead_id: e.target.value } }))}>
                          <option value="">Select a lead…</option>
                          {leads.filter((x) => x.id !== l.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.company ?? x.name ?? x.id}</option>
                          ))}
                        </select>
                        <select className={inputCls} value={relationshipDraft[l.id]?.relationship_type ?? "affiliated"}
                          onChange={(e) => setRelationshipDraft((d) => ({ ...d, [l.id]: { related_lead_id: d[l.id]?.related_lead_id ?? "", relationship_type: e.target.value } }))}>
                          {RELATIONSHIP_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <ActionBtn disabled={busy === l.id} onClick={() => addRelationship(l.id)}>+ Link Company</ActionBtn>
                      </div>
                    </div>
                  </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
