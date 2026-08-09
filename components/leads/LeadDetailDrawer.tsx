"use client";

import { useState } from "react";
import { inputCls, labelCls, Pill, ActionBtn } from "@/components/adminUi";
import {
  type Lead, type LeadContext, type LeadNextAction, type StatusValue,
  STATUS_OPTIONS, TIER_OPTIONS, TIER_LABELS, VERTICAL_OPTIONS, CONTACT_METHOD_OPTIONS,
  INDUSTRY_OPTIONS, ENGAGEMENT_MODEL_OPTIONS, OWNERSHIP_OPTIONS,
  DJI_OPTIONS, RELATIONSHIP_OPTIONS, RELATIONSHIP_LABELS,
  ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS, EVENT_LABELS, TERMINAL_STATUSES,
  scoreLead, findLikelyDuplicates,
} from "@/lib/leadsPipeline";
import PriorityBadge from "./PriorityBadge";
import DuplicateWarning from "./DuplicateWarning";

export type DrawerTab = "overview" | "next_action" | "activity" | "outreach" | "notes" | "convert";

interface NoteRow { id: string; entity_type: string; entity_id: string; author: string | null; body: string; created_at: string; }
interface LeadContactRow { id: string; lead_id: string; name: string | null; email: string | null; phone: string | null; title: string | null; is_primary: boolean; created_at: string; }
interface LeadLocationRow { id: string; lead_id: string; label: string; address: string | null; notes: string | null; created_at: string; }
interface LeadRelationshipRow { id: string; lead_id: string; related_lead_id: string; relationship_type: string; notes: string | null; created_at: string; }
interface LeadActivityRow { id: string; lead_id: string; activity_type: string; summary: string; amount: number | null; occurred_at: string; created_by: string | null; created_at: string; }
interface OutreachEventRow { id: string; prospect_id: string; event_type: string; intent: string | null; created_at: string; }
interface SmartleadCampaign { id: number; name: string; status: string; }

// SectionDisclosure — collapsible sub-section header. Preserved unchanged
// from the pre-existing (already-committed) LeadsWorkspace.tsx work.
const DISCLOSURE_ACCENT = { blue: "border-l-blue-500", purple: "border-l-purple-500" } as const;
function SectionDisclosure({ id, title, accent, open, onToggle }: { id: string; title: string; accent: keyof typeof DISCLOSURE_ACCENT; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      id={`${id}-trigger`}
      aria-expanded={open}
      aria-controls={`${id}-panel`}
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-3 rounded-r-lg border-l-2 bg-surface2/40 px-3 py-3 text-left transition hover:bg-surface2 ${DISCLOSURE_ACCENT[accent]}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-ink">{title}</span>
      <svg className={`h-4 w-4 flex-shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 7l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

const TABS: { key: DrawerTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "next_action", label: "Next Action" },
  { key: "activity", label: "Activity" },
  { key: "outreach", label: "Outreach" },
  { key: "notes", label: "Notes" },
  { key: "convert", label: "Convert" },
];

export default function LeadDetailDrawer({
  lead, ctx, allLeads, initialTab, busy, onClose,
  editingLead, editDraft, setEditDraft, onStartEdit, onSaveEdit, onCancelEdit,
  onSetLeadField, onSetLeadBooleanField, onSetLeadNumberField, onToggleTier, onSetPriorityOverride,
  onStatusChange, onLogContactNow,
  nextActions, nextActionDraft, setNextActionDraft, onAddNextAction, onCompleteNextAction, onCancelNextAction,
  activities, interactionLogOpen, setInteractionLogOpen, activityDraft, setActivityDraft, onAddActivity, onDeleteActivity,
  smartleadConfigured, smartleadStatusMessage, campaigns, selectedCampaignId, setSelectedCampaignId,
  onApproveForOutreach, onPauseOutreach, onMarkReplied, onCreateOpportunity, onAddToSmartlead, onMarkDoNotContact,
  outreachEvents,
  notes, quickNoteDraft, setQuickNoteDraft, onAddQuickNote,
  contacts, contactDraft, setContactDraft, onAddContact, onDeleteContact,
  locations, locationDraft, setLocationDraft, onAddLocation, onDeleteLocation,
  relationships, relationshipDraft, setRelationshipDraft, onAddRelationship, onDeleteRelationship,
  contactsOpen, setContactsOpen,
  onConvert,
}: {
  lead: Lead; ctx: LeadContext; allLeads: Lead[]; initialTab: DrawerTab; busy: boolean; onClose: () => void;
  editingLead: boolean; editDraft: { name: string; company: string; email: string; phone: string; address: string; source: string; message: string };
  setEditDraft: React.Dispatch<React.SetStateAction<{ name: string; company: string; email: string; phone: string; address: string; source: string; message: string }>>;
  onStartEdit: () => void; onSaveEdit: () => void; onCancelEdit: () => void;
  onSetLeadField: (field: keyof Lead, value: string) => void;
  onSetLeadBooleanField: (field: keyof Lead, value: boolean | null) => void;
  onSetLeadNumberField: (field: keyof Lead, value: string) => void;
  onToggleTier: (tierValue: string) => void;
  onSetPriorityOverride: (value: "high" | "medium" | "low" | null) => void;
  onStatusChange: (status: StatusValue) => void; onLogContactNow: () => void;
  nextActions: LeadNextAction[]; nextActionDraft: { action_type: string; due_at: string; notes: string };
  setNextActionDraft: React.Dispatch<React.SetStateAction<{ action_type: string; due_at: string; notes: string }>>;
  onAddNextAction: () => void; onCompleteNextAction: (id: string) => void; onCancelNextAction: (id: string) => void;
  activities: LeadActivityRow[]; interactionLogOpen: boolean; setInteractionLogOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  activityDraft: { activity_type: string; summary: string; amount: string; occurred_at: string };
  setActivityDraft: React.Dispatch<React.SetStateAction<{ activity_type: string; summary: string; amount: string; occurred_at: string }>>;
  onAddActivity: () => void; onDeleteActivity: (id: string) => void;
  smartleadConfigured: boolean; smartleadStatusMessage?: string; campaigns: SmartleadCampaign[];
  selectedCampaignId: number | null; setSelectedCampaignId: (id: number | null) => void;
  onApproveForOutreach: () => void; onPauseOutreach: () => void; onMarkReplied: () => void;
  onCreateOpportunity: () => void; onAddToSmartlead: () => void; onMarkDoNotContact: () => void;
  outreachEvents: OutreachEventRow[];
  notes: NoteRow[]; quickNoteDraft: string; setQuickNoteDraft: (v: string) => void; onAddQuickNote: () => void;
  contacts: LeadContactRow[]; contactDraft: { name: string; email: string; phone: string; title: string };
  setContactDraft: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string; title: string }>>;
  onAddContact: () => void; onDeleteContact: (c: LeadContactRow) => void;
  locations: LeadLocationRow[]; locationDraft: { label: string; address: string; notes: string };
  setLocationDraft: React.Dispatch<React.SetStateAction<{ label: string; address: string; notes: string }>>;
  onAddLocation: () => void; onDeleteLocation: (id: string) => void;
  relationships: LeadRelationshipRow[]; relationshipDraft: { related_lead_id: string; relationship_type: string };
  setRelationshipDraft: React.Dispatch<React.SetStateAction<{ related_lead_id: string; relationship_type: string }>>;
  onAddRelationship: () => void; onDeleteRelationship: (id: string) => void;
  contactsOpen: boolean; setContactsOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  onConvert: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const status = lead.status;
  const isTerminal = TERMINAL_STATUSES.includes(status);
  const score = scoreLead(ctx);
  const openActions = nextActions.filter((n) => n.status === "open");
  const conversionDuplicates = tab === "convert" ? findLikelyDuplicates(allLeads, lead) : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-surface2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Lead details for ${lead.company ?? lead.name ?? "lead"}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface2 p-4">
          <div>
            <div className="text-sm font-semibold text-ink">{lead.company ?? lead.name ?? "Unnamed"}</div>
            <div className="text-xs text-muted">{lead.name ?? "No contact name"} · {lead.email ?? "—"}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border bg-surface2 px-4 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-t-lg px-3 py-2 text-xs font-medium transition ${tab === t.key ? "border-b-2 border-accent text-accent" : "text-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "overview" && (
            <div className="space-y-4 text-sm text-ink">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contact Info</p>
                {editingLead ? (
                  <div className="flex gap-2">
                    <ActionBtn disabled={busy} onClick={onSaveEdit}>{busy ? "Saving…" : "Save"}</ActionBtn>
                    <ActionBtn onClick={onCancelEdit}>Cancel</ActionBtn>
                  </div>
                ) : (
                  <ActionBtn onClick={onStartEdit}>Edit</ActionBtn>
                )}
              </div>

              {editingLead ? (
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
                  <p><span className="text-muted">Company:</span> {lead.company ?? "—"}</p>
                  <p><span className="text-muted">Contact:</span> {lead.name ?? "—"}</p>
                  <p><span className="text-muted">Email:</span> {lead.email ?? "—"}</p>
                  <p><span className="text-muted">Phone:</span> {lead.phone ?? "—"}</p>
                  <p><span className="text-muted">Address:</span> {lead.address ?? "—"}</p>
                  <p><span className="text-muted">Source:</span> {lead.source ?? "—"}</p>
                  <p><span className="text-muted">Last contacted:</span> {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleString() : "Never"}</p>
                  {lead.message && <p><span className="text-muted">Message:</span> {lead.message}</p>}
                  <p className="text-xs text-muted">Submitted {new Date(lead.created_at).toLocaleDateString()}</p>
                </>
              )}

              <div className="border-t border-border pt-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Classification &amp; Opportunity</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Industry</label>
                    <select className={inputCls} value={lead.industry ?? ""} disabled={busy} onChange={(e) => onSetLeadField("industry", e.target.value)}>
                      <option value="">—</option>
                      {INDUSTRY_OPTIONS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Engagement model</label>
                    <select className={inputCls} value={lead.engagement_model ?? ""} disabled={busy} onChange={(e) => onSetLeadField("engagement_model", e.target.value)}>
                      <option value="">—</option>
                      {ENGAGEMENT_MODEL_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Opportunity ownership</label>
                    <select className={inputCls} value={lead.opportunity_ownership ?? ""} disabled={busy} onChange={(e) => onSetLeadField("opportunity_ownership", e.target.value)}>
                      <option value="">—</option>
                      {OWNERSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>DJI permitted</label>
                    <select className={inputCls} value={lead.dji_permitted ?? ""} disabled={busy} onChange={(e) => onSetLeadField("dji_permitted", e.target.value)}>
                      <option value="">—</option>
                      {DJI_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>Service opportunity</label><input className={inputCls} defaultValue={lead.service_opportunity ?? ""} disabled={busy} onBlur={(e) => onSetLeadField("service_opportunity", e.target.value)} /></div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={!!lead.ndaa_required} disabled={busy} onChange={(e) => onSetLeadBooleanField("ndaa_required", e.target.checked)} />
                      NDAA required
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={!!lead.blue_uas_required} disabled={busy} onChange={(e) => onSetLeadBooleanField("blue_uas_required", e.target.checked)} />
                      Blue UAS required
                    </label>
                  </div>
                  <div><label className={labelCls}>Total project value ($)</label><input type="number" step="0.01" className={inputCls} defaultValue={lead.total_project_value ?? ""} disabled={busy} onBlur={(e) => onSetLeadNumberField("total_project_value", e.target.value)} /></div>
                  <div><label className={labelCls}>Expected DOM revenue ($)</label><input type="number" step="0.01" className={inputCls} defaultValue={lead.expected_dom_revenue ?? ""} disabled={busy} onBlur={(e) => onSetLeadNumberField("expected_dom_revenue", e.target.value)} /></div>
                  <div><label className={labelCls}>Prime contractor</label><input className={inputCls} defaultValue={lead.prime_contractor ?? ""} disabled={busy} onBlur={(e) => onSetLeadField("prime_contractor", e.target.value)} /></div>
                  <div><label className={labelCls}>End client</label><input className={inputCls} defaultValue={lead.end_client ?? ""} disabled={busy} onBlur={(e) => onSetLeadField("end_client", e.target.value)} /></div>
                  <div><label className={labelCls}>Source URL</label><input className={inputCls} defaultValue={lead.source_url ?? ""} disabled={busy} onBlur={(e) => onSetLeadField("source_url", e.target.value)} /></div>
                  <div className="sm:col-span-2"><label className={labelCls}>Verification notes</label><textarea className={inputCls} rows={2} defaultValue={lead.verification_notes ?? ""} disabled={busy} onBlur={(e) => onSetLeadField("verification_notes", e.target.value)} /></div>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Priority</p>
                <div className="flex items-center gap-3">
                  <PriorityBadge score={score} />
                  <select
                    className={inputCls + " w-auto"}
                    value={lead.priority_override ?? ""}
                    disabled={busy}
                    onChange={(e) => onSetPriorityOverride(e.target.value ? (e.target.value as "high" | "medium" | "low") : null)}
                  >
                    <option value="">Computed automatically</option>
                    <option value="high">Manual override: High</option>
                    <option value="medium">Manual override: Medium</option>
                    <option value="low">Manual override: Low</option>
                  </select>
                </div>
                {score.label && <p className="mt-1 text-xs text-muted">{score.reasons.join(" · ")}</p>}
              </div>

              <div className="border-t border-border pt-3">
                <label className={labelCls}>Tier <span className="text-muted">(a client can require more than one)</span></label>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS.map((t) => {
                    const active = (lead.tier ?? []).includes(t.value);
                    return (
                      <button key={t.value} type="button" disabled={busy} onClick={() => onToggleTier(t.value)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-muted hover:text-ink"}`}>
                        {active ? "☑" : "☐"} {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Vertical <span className="text-muted">(legacy)</span></label>
                  <select className={inputCls} value={lead.vertical ?? ""} disabled={busy} onChange={(e) => onSetLeadField("vertical", e.target.value)}>
                    <option value="">—</option>
                    {VERTICAL_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Preferred contact method</label>
                  <select className={inputCls} value={lead.preferred_contact_method ?? ""} disabled={busy} onChange={(e) => onSetLeadField("preferred_contact_method", e.target.value)}>
                    <option value="">—</option>
                    {CONTACT_METHOD_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <label className={labelCls}>Status</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((s) => {
                    const active = lead.status === s.value;
                    return (
                      <button key={s.value} type="button" disabled={busy} onClick={() => onStatusChange(s.value)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${active ? s.color : "border-border bg-surface text-muted hover:text-ink"}`}>
                        <span className={`h-2.5 w-2.5 rounded-full border ${active ? "border-current bg-current" : "border-slate-600"}`} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                {!isTerminal && <p className="mt-1 text-xs text-muted">Selecting &quot;Won&quot; also creates a client record.</p>}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <ActionBtn disabled={busy} onClick={onLogContactNow}>Log contact now</ActionBtn>
              </div>

              <div className="border-t border-border pt-3">
                <SectionDisclosure id={`contacts-${lead.id}`} title="Contacts, Branches & Related Companies" accent="purple" open={contactsOpen} onToggle={() => setContactsOpen((o) => !o)} />
                {contactsOpen && (
                  <div id={`contacts-${lead.id}-panel`} role="region" aria-labelledby={`contacts-${lead.id}-trigger`} className="grid gap-6 pt-3 sm:grid-cols-1">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Contacts</p>
                      {contacts.length === 0 ? <p className="mb-2 text-xs text-muted">No contacts yet.</p> : (
                        <ul className="mb-2 space-y-2">
                          {contacts.map((c) => (
                            <li key={c.id} className="rounded border border-border bg-surface p-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-ink">{c.name ?? "Unnamed"} {c.is_primary && <span className="text-accent">(primary)</span>}</p>
                                  {c.title && <p className="text-muted">{c.title}</p>}
                                  {c.email && <p className="text-muted">{c.email}</p>}
                                  {c.phone && <p className="text-muted">{c.phone}</p>}
                                </div>
                                <button className="text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => onDeleteContact(c)}>✕</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="space-y-2">
                        <input className={inputCls} placeholder="Name" value={contactDraft.name} onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))} />
                        <input className={inputCls} placeholder="Title" value={contactDraft.title} onChange={(e) => setContactDraft((d) => ({ ...d, title: e.target.value }))} />
                        <input className={inputCls} placeholder="Email" value={contactDraft.email} onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))} />
                        <input className={inputCls} placeholder="Phone" value={contactDraft.phone} onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))} />
                        <ActionBtn disabled={busy} onClick={onAddContact}>+ Add Contact</ActionBtn>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Branches / Locations</p>
                      {locations.length === 0 ? <p className="mb-2 text-xs text-muted">No branches added.</p> : (
                        <ul className="mb-2 space-y-2">
                          {locations.map((loc) => (
                            <li key={loc.id} className="rounded border border-border bg-surface p-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-ink">{loc.label}</p>
                                  {loc.address && <p className="text-muted">{loc.address}</p>}
                                  {loc.notes && <p className="text-muted">{loc.notes}</p>}
                                </div>
                                <button className="text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => onDeleteLocation(loc.id)}>✕</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="space-y-2">
                        <input className={inputCls} placeholder="Label (e.g. HQ, Newark Branch)" value={locationDraft.label} onChange={(e) => setLocationDraft((d) => ({ ...d, label: e.target.value }))} />
                        <input className={inputCls} placeholder="Address" value={locationDraft.address} onChange={(e) => setLocationDraft((d) => ({ ...d, address: e.target.value }))} />
                        <input className={inputCls} placeholder="Notes" value={locationDraft.notes} onChange={(e) => setLocationDraft((d) => ({ ...d, notes: e.target.value }))} />
                        <ActionBtn disabled={busy} onClick={onAddLocation}>+ Add Branch</ActionBtn>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Related Companies</p>
                      {relationships.length === 0 ? <p className="mb-2 text-xs text-muted">No related companies linked.</p> : (
                        <ul className="mb-2 space-y-2">
                          {relationships.map((r) => {
                            const related = allLeads.find((x) => x.id === r.related_lead_id);
                            return (
                              <li key={r.id} className="rounded border border-border bg-surface p-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-ink">{related?.company ?? related?.name ?? "Unknown lead"}</p>
                                    <p className="text-muted">{RELATIONSHIP_LABELS[r.relationship_type] ?? r.relationship_type}</p>
                                  </div>
                                  <button className="text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => onDeleteRelationship(r.id)}>✕</button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="space-y-2">
                        <select className={inputCls} value={relationshipDraft.related_lead_id} onChange={(e) => setRelationshipDraft((d) => ({ ...d, related_lead_id: e.target.value }))}>
                          <option value="">Select a lead…</option>
                          {allLeads.filter((x) => x.id !== lead.id).map((x) => <option key={x.id} value={x.id}>{x.company ?? x.name ?? x.id}</option>)}
                        </select>
                        <select className={inputCls} value={relationshipDraft.relationship_type} onChange={(e) => setRelationshipDraft((d) => ({ ...d, relationship_type: e.target.value }))}>
                          {RELATIONSHIP_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <ActionBtn disabled={busy} onClick={onAddRelationship}>+ Link Company</ActionBtn>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "next_action" && (
            <div className="space-y-3 text-sm text-ink">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Open next actions</p>
              {openActions.length === 0 ? <p className="text-xs text-muted">No open next action. Add one below.</p> : (
                <ul className="space-y-2">
                  {openActions.map((n) => (
                    <li key={n.id} className="rounded border border-border bg-surface p-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-ink">{n.action_type}</p>
                          {n.due_at && <p className="text-muted">Due {new Date(n.due_at).toLocaleString()}</p>}
                          {n.notes && <p className="text-muted">{n.notes}</p>}
                          {n.assigned_to && <p className="text-muted">Assigned to {n.assigned_to}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button className="text-emerald-400 hover:text-emerald-300" onClick={() => onCompleteNextAction(n.id)}>Complete</button>
                          <button className="text-muted hover:text-rose-400" onClick={() => onCancelNextAction(n.id)}>Cancel</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_180px]">
                <input className={inputCls} placeholder='Action, e.g. "Call to follow up"' value={nextActionDraft.action_type} onChange={(e) => setNextActionDraft((d) => ({ ...d, action_type: e.target.value }))} />
                <input type="datetime-local" className={inputCls} value={nextActionDraft.due_at} onChange={(e) => setNextActionDraft((d) => ({ ...d, due_at: e.target.value }))} />
                <textarea className={inputCls + " sm:col-span-2"} rows={2} placeholder="Notes (optional)" value={nextActionDraft.notes} onChange={(e) => setNextActionDraft((d) => ({ ...d, notes: e.target.value }))} />
                <div className="sm:col-span-2"><ActionBtn disabled={busy} onClick={onAddNextAction}>+ Add Next Action</ActionBtn></div>
              </div>

              {nextActions.filter((n) => n.status !== "open").length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">History</p>
                  <ul className="space-y-1 text-xs text-muted">
                    {nextActions.filter((n) => n.status !== "open").map((n) => (
                      <li key={n.id}>{n.action_type} — {n.status}{n.completed_at ? ` (${new Date(n.completed_at).toLocaleDateString()})` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-3">
              <SectionDisclosure id={`interaction-log-${lead.id}`} title={`Interaction Log (${activities.length})`} accent="blue" open={interactionLogOpen} onToggle={() => setInteractionLogOpen((o) => !o)} />
              {interactionLogOpen && (
                <div id={`interaction-log-${lead.id}-panel`} role="region" aria-labelledby={`interaction-log-${lead.id}-trigger`} className="pt-1">
                  {activities.length === 0 ? <p className="mb-3 text-xs text-muted">No interactions logged yet.</p> : (
                    <div className="mb-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted">
                            <th className="py-2 pr-4 font-medium">Date</th>
                            <th className="py-2 pr-4 font-medium">Type</th>
                            <th className="py-2 pr-4 font-medium">Description</th>
                            <th className="py-2 pr-4 font-medium">Amount</th>
                            <th className="py-2 pr-4 font-medium">Logged by</th>
                            <th className="py-2 pr-2 font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {activities.map((a) => (
                            <tr key={a.id} className="border-b border-border/60 last:border-0">
                              <td className="py-2 pr-4 whitespace-nowrap text-muted">{new Date(a.occurred_at).toLocaleDateString()}</td>
                              <td className="py-2 pr-4 whitespace-nowrap"><Pill>{ACTIVITY_TYPE_LABELS[a.activity_type] ?? a.activity_type}</Pill></td>
                              <td className="py-2 pr-4 text-ink">{a.summary}</td>
                              <td className="py-2 pr-4 whitespace-nowrap text-muted">{a.amount != null ? `$${a.amount.toFixed(2)}` : "—"}</td>
                              <td className="py-2 pr-4 whitespace-nowrap text-muted">{a.created_by ?? "—"}</td>
                              <td className="py-2 pr-2 text-right">
                                <button className="text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => onDeleteActivity(a.id)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-[140px_1fr_120px_160px_auto]">
                <select className={inputCls} value={activityDraft.activity_type} onChange={(e) => setActivityDraft((d) => ({ ...d, activity_type: e.target.value }))}>
                  {ACTIVITY_TYPE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <input className={inputCls} placeholder='What happened?' value={activityDraft.summary} onChange={(e) => setActivityDraft((d) => ({ ...d, summary: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") onAddActivity(); }} />
                <input className={inputCls} placeholder="Amount" type="number" step="0.01" value={activityDraft.amount} onChange={(e) => setActivityDraft((d) => ({ ...d, amount: e.target.value }))} />
                <input className={inputCls} type="date" value={activityDraft.occurred_at} onChange={(e) => setActivityDraft((d) => ({ ...d, occurred_at: e.target.value }))} />
                <ActionBtn disabled={busy} onClick={onAddActivity}>Log</ActionBtn>
              </div>
            </div>
          )}

          {tab === "outreach" && (
            <div className="space-y-4 text-sm text-ink">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Smartlead &amp; Outreach Workflow</p>
                <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                  <span>Outreach approved: {lead.outreach_approved_at ? new Date(lead.outreach_approved_at).toLocaleString() : "Not approved"}</span>
                  <span>Outreach paused: {lead.outreach_paused_at ? new Date(lead.outreach_paused_at).toLocaleString() : "Not paused"}</span>
                  <span>Smartlead campaign: {lead.smartlead_campaign_id ?? "Not enrolled"}</span>
                  <span>Smartlead lead ID: {lead.smartlead_lead_id ?? "Unknown"}</span>
                </div>

                {ctx.smartlead && (
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><div className="text-[10px] uppercase text-muted">Opens</div><div className="text-ink">{ctx.smartlead.open_count}</div></div>
                    <div><div className="text-[10px] uppercase text-muted">Clicks</div><div className="text-ink">{ctx.smartlead.click_count}</div></div>
                    <div><div className="text-[10px] uppercase text-muted">Last replied</div><div className="text-ink">{ctx.smartlead.last_replied_at ? new Date(ctx.smartlead.last_replied_at).toLocaleDateString() : "—"}</div></div>
                    <div><div className="text-[10px] uppercase text-muted">Reply category</div><div className="text-ink">{ctx.smartlead.reply_category ?? "—"}</div></div>
                  </div>
                )}

                {!smartleadConfigured ? (
                  <div className="mb-3 rounded-lg border border-border bg-surface p-3 text-xs text-muted">
                    Smartlead isn&apos;t configured yet. Set <code className="text-ink">SMARTLEAD_API_KEY</code> to enable campaign enrollment. Internal outreach tracking below still works normally.
                  </div>
                ) : (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <select className={inputCls + " w-auto"} value={selectedCampaignId ?? ""} onChange={(e) => setSelectedCampaignId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Select a campaign…</option>
                      {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
                    </select>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <ActionBtn disabled={busy} onClick={onApproveForOutreach}>Approve for Outreach</ActionBtn>
                  <ActionBtn disabled={busy} onClick={onPauseOutreach}>Pause Outreach</ActionBtn>
                  <ActionBtn disabled={busy} onClick={onMarkReplied}>Mark Replied</ActionBtn>
                  <ActionBtn disabled={busy} onClick={onCreateOpportunity}>Create Opportunity</ActionBtn>
                  {smartleadConfigured && <ActionBtn disabled={busy || !selectedCampaignId} onClick={onAddToSmartlead}>Add to Smartlead</ActionBtn>}
                  <ActionBtn disabled={busy} onClick={onMarkDoNotContact}>Do Not Contact</ActionBtn>
                </div>
                {smartleadStatusMessage && <p className="mt-2 text-xs text-amber-400">{smartleadStatusMessage}</p>}
              </div>

              {lead.external_prospect_id && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Outreach activity</p>
                  {outreachEvents.length === 0 ? <p className="text-xs text-muted">No events recorded yet.</p> : (
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                      {outreachEvents.map((ev) => (
                        <li key={ev.id} className="flex items-center justify-between text-xs">
                          <span className="text-ink">
                            {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                            {ev.intent && ev.intent !== "unknown" && <span className="ml-2 text-muted">({ev.intent})</span>}
                          </span>
                          <span className="text-muted">{new Date(ev.created_at).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "notes" && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Notes</p>
              {notes.length === 0 ? <p className="mb-2 text-xs text-muted">No notes yet.</p> : (
                <ul className="mb-2 max-h-96 space-y-2 overflow-y-auto">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded border border-border bg-surface p-2 text-xs">
                      <p className="text-ink">{n.body}</p>
                      <p className="mt-1 text-muted">{n.author ?? "Unknown"} · {new Date(n.created_at).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Add a quick note…" value={quickNoteDraft} onChange={(e) => setQuickNoteDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAddQuickNote(); }} />
                <ActionBtn disabled={busy} onClick={onAddQuickNote}>Add</ActionBtn>
              </div>
            </div>
          )}

          {tab === "convert" && (
            <div className="space-y-3 text-sm text-ink">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Convert to Customer</p>
              {isTerminal && status === "won" ? (
                <p className="text-xs text-emerald-400">This lead has already been converted to a client.</p>
              ) : (
                <>
                  <p className="text-xs text-muted">
                    Converting creates a client record linked back to this lead, sets status to &quot;Won,&quot; and preserves the full activity/note history here.
                  </p>
                  <DuplicateWarning matches={conversionDuplicates} />
                  <ActionBtn disabled={busy} onClick={onConvert}>{busy ? "Converting…" : "Convert to Customer"}</ActionBtn>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
