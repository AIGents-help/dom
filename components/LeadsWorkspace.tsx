"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { inputCls, labelCls, Pill, Section, Empty, ActionBtn } from "@/components/adminUi";

interface Lead {
  id: string; name: string | null; email: string | null; company: string | null;
  phone: string | null; source: string | null; message: string | null; status: string; created_at: string;
  tier: string[]; vertical: string | null; external_prospect_id: string | null;
  preferred_contact_method: string | null; last_contacted_at: string | null; next_follow_up_at: string | null;
  address: string | null;
  // Classification / opportunity fields (additive — see supabase/migrations)
  industry: string | null;
  engagement_model: string | null;
  opportunity_ownership: string | null;
  relationship_type: string | null;
  service_opportunity: string | null;
  dji_permitted: string | null;
  ndaa_required: boolean | null;
  blue_uas_required: boolean | null;
  total_project_value: number | null;
  expected_dom_revenue: number | null;
  prime_contractor: string | null;
  end_client: string | null;
  source_url: string | null;
  verification_notes: string | null;
  next_action: string | null;
  // Smartlead readiness (inbound webhook untouched — these are internal-only)
  smartlead_campaign_id: string | null;
  smartlead_lead_id: string | null;
  outreach_approved_at: string | null;
  outreach_paused_at: string | null;
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

const STATUS_OPTIONS = [
  { value: "cold", label: "Cold", color: "border-slate-500 bg-slate-500/10 text-slate-300" },
  { value: "contacted", label: "Contacted", color: "border-blue-500 bg-blue-500/10 text-blue-400" },
  { value: "qualified", label: "Qualified", color: "border-amber-500 bg-amber-500/10 text-amber-400" },
  { value: "quoted", label: "Quoted", color: "border-purple-500 bg-purple-500/10 text-purple-400" },
  { value: "scheduled", label: "Scheduled", color: "border-cyan-500 bg-cyan-500/10 text-cyan-400" },
  { value: "customer", label: "Customer", color: "border-green-500 bg-green-500/10 text-green-400" },
  { value: "lost", label: "Lost", color: "border-rose-500 bg-rose-500/10 text-rose-400" },
];
const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

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

// --- New classification vocab (additive; see supabase/migrations) ---
const INDUSTRY_OPTIONS = [
  { value: "telecom_towers", label: "Telecom Towers" },
  { value: "refinery_petrochemical", label: "Refinery / Petrochemical" },
  { value: "utilities", label: "Utilities" },
  { value: "construction", label: "Construction" },
  { value: "surveying_engineering", label: "Surveying / Engineering" },
  { value: "commercial_real_estate", label: "Commercial Real Estate" },
  { value: "roofing", label: "Roofing" },
  { value: "solar", label: "Solar" },
  { value: "municipal", label: "Municipal" },
  { value: "public_safety", label: "Public Safety" },
  { value: "environmental", label: "Environmental" },
  { value: "agriculture", label: "Agriculture" },
  { value: "other", label: "Other" },
];
const INDUSTRY_LABELS: Record<string, string> = Object.fromEntries(INDUSTRY_OPTIONS.map((i) => [i.value, i.label]));

const ENGAGEMENT_MODEL_OPTIONS = [
  { value: "direct_project", label: "Direct Project" },
  { value: "subcontracted_project", label: "Subcontracted Project" },
  { value: "joint_project", label: "Joint Project" },
  { value: "staff_augmentation", label: "Staff Augmentation" },
  { value: "white_label_service", label: "White-Label Service" },
  { value: "referral_only", label: "Referral Only" },
  { value: "unknown", label: "Unknown" },
];
const ENGAGEMENT_MODEL_LABELS: Record<string, string> = Object.fromEntries(ENGAGEMENT_MODEL_OPTIONS.map((e) => [e.value, e.label]));

const OWNERSHIP_OPTIONS = [
  { value: "dom_owned", label: "DOM-Owned", color: "border-orange-500 bg-orange-500/10 text-orange-400" },
  { value: "partner_owned", label: "Partner-Owned", color: "border-blue-500 bg-blue-500/10 text-blue-400" },
  { value: "shared", label: "Shared", color: "border-purple-500 bg-purple-500/10 text-purple-400" },
  { value: "unknown", label: "Unknown", color: "border-amber-500 bg-amber-500/10 text-amber-400" },
];
const OWNERSHIP_LABELS: Record<string, string> = Object.fromEntries(OWNERSHIP_OPTIONS.map((o) => [o.value, o.label]));
const OWNERSHIP_COLORS: Record<string, string> = Object.fromEntries(OWNERSHIP_OPTIONS.map((o) => [o.value, o.color]));

const DJI_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
  { value: "project_dependent", label: "Project-dependent" },
];

const DJI_RESTRICTED_COLOR = "border-rose-500 bg-rose-500/10 text-rose-400";
const OUTREACH_READY_STATUSES = ["cold", "contacted", "qualified", "quoted", "scheduled"];

type SavedViewKey = "all" | "direct" | "subcontract" | "partner" | "dji";
const SAVED_VIEWS: { key: SavedViewKey; label: string }[] = [
  { key: "all", label: "All Leads" },
  { key: "direct", label: "Direct Opportunities" },
  { key: "subcontract", label: "Subcontract Work" },
  { key: "partner", label: "Partner Network" },
  { key: "dji", label: "DJI Restricted" },
];

function matchesSavedView(lead: Lead, view: SavedViewKey): boolean {
  switch (view) {
    case "all":
      return true;
    case "direct":
      return lead.opportunity_ownership === "dom_owned" || lead.engagement_model === "direct_project";
    case "subcontract":
      return ["subcontracted_project", "staff_augmentation", "white_label_service"].includes(lead.engagement_model ?? "");
    case "partner":
      return (
        ["partner_owned", "shared"].includes(lead.opportunity_ownership ?? "") ||
        ["joint_project", "referral_only"].includes(lead.engagement_model ?? "")
      );
    case "dji":
      return lead.dji_permitted === "no" || lead.ndaa_required === true || lead.blue_uas_required === true;
    default:
      return true;
  }
}

function isDjiRestricted(lead: Lead): boolean {
  return lead.dji_permitted === "no" || lead.ndaa_required === true || lead.blue_uas_required === true;
}

const emptyLeadForm = {
  name: "", email: "", company: "", phone: "", address: "", source: "", message: "",
  tier: [] as string[], vertical: "", preferred_contact_method: "", next_follow_up_at: "",
  industry: "", engagement_model: "", opportunity_ownership: "unknown", status: "cold", next_action: "",
};

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? `${singular}s`}`;
}

const DISCLOSURE_ACCENT = {
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
} as const;

function SectionDisclosure({
  id,
  title,
  accent,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  accent: keyof typeof DISCLOSURE_ACCENT;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      id={`${id}-trigger`}
      aria-expanded={open}
      aria-controls={`${id}-panel`}
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-3 rounded-r-lg border-l-2 bg-surface2/40 px-3 py-3 text-left transition hover:bg-surface2 ${DISCLOSURE_ACCENT[accent]}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</span>
      <svg
        className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M5 7l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

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
  const [menuLead, setMenuLead] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Interaction Log and Contacts/Branches/Related Companies are collapsed by
  // default and reset every time a (possibly different) lead profile opens —
  // deliberately not keyed by lead id, since only one lead's detail panel is
  // ever expanded at a time.
  const [interactionLogOpen, setInteractionLogOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  useEffect(() => {
    setInteractionLogOpen(false);
    setContactsOpen(false);
  }, [expandedLead]);

  const [showAddLead, setShowAddLead] = useState(false);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [leadForm, setLeadForm] = useState(emptyLeadForm);

  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("");
  const [filterVertical, setFilterVertical] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterEngagement, setFilterEngagement] = useState("");
  const [filterOwnership, setFilterOwnership] = useState("");
  const [activeView, setActiveView] = useState<SavedViewKey>("all");

  const [quickNoteDraft, setQuickNoteDraft] = useState<Record<string, string>>({});
  const [smartleadStatus, setSmartleadStatus] = useState<Record<string, string>>({});

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
    const { error } = await sb.from("leads").update({ [field]: value || null }).eq("id", lead.id);
    setBusy(null);
    if (error) { alert(`Couldn't save: ${error.message}`); return; }
    await load();
  }

  async function setLeadBooleanField(lead: Lead, field: keyof Lead, value: boolean | null) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ [field]: value }).eq("id", lead.id);
    setBusy(null);
    if (error) { alert(`Couldn't save: ${error.message}`); return; }
    await load();
  }

  async function setLeadNumberField(lead: Lead, field: keyof Lead, value: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const parsed = value.trim() === "" ? null : parseFloat(value);
    const { error } = await sb.from("leads").update({ [field]: Number.isNaN(parsed) ? null : parsed }).eq("id", lead.id);
    setBusy(null);
    if (error) { alert(`Couldn't save: ${error.message}`); return; }
    await load();
  }

  async function toggleLeadTier(lead: Lead, tierValue: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const currentTiers = lead.tier ?? [];
    const nextTiers = currentTiers.includes(tierValue)
      ? currentTiers.filter((t) => t !== tierValue)
      : [...currentTiers, tierValue];
    const { error } = await sb.from("leads").update({ tier: nextTiers }).eq("id", lead.id);
    if (error) { alert(`Couldn't save tier: ${error.message}`); setBusy(null); return; }
    await logActivity(
      lead.id,
      "other",
      `Tier ${currentTiers.includes(tierValue) ? "removed" : "added"}: ${TIER_LABELS[tierValue] ?? tierValue}`
    );
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
    const { error } = await sb.from("leads").update({ status }).eq("id", lead.id);
    if (error) { alert(`Couldn't update status: ${error.message}`); setBusy(null); return; }
    await logActivity(lead.id, "status_change", `Status changed to "${status}"`);
    await load();
    setBusy(null);
  }

  async function logContactNow(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { alert(`Couldn't log contact: ${error.message}`); setBusy(null); return; }
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
    await sb.from("leads").update({ status: "customer" }).eq("id", lead.id);
    await logActivity(lead.id, "status_change", "Converted to client (status: Customer)");
    await load();
    setBusy(null);
  }

  function handleStatusChange(lead: Lead, newStatus: string) {
    if (newStatus === lead.status) return;
    if (newStatus === "customer") {
      convertLead(lead);
    } else {
      setLeadStatus(lead, newStatus);
    }
  }

  // --- Smartlead-ready internal workflow -----------------------------------
  // The inbound webhook (app/api/webhooks/smartlead/route.ts) is untouched.
  // These actions only ever write real DOM-internal state (outreach_approved_at,
  // outreach_paused_at, status, activity log). None of them claim a lead was
  // actually sent to Smartlead — that requires a configured outbound credential,
  // which this repo does not have yet (see /api/admin/leads/[id]/smartlead-enroll).

  function isValidEmail(email: string | null): boolean {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async function approveForOutreach(lead: Lead) {
    if (!isValidEmail(lead.email)) {
      alert("This lead needs a valid email before it can be approved for outreach.");
      return;
    }
    if (!OUTREACH_READY_STATUSES.includes(lead.status)) {
      alert(`Leads with status "${STATUS_LABELS[lead.status] ?? lead.status}" aren't eligible for outreach approval.`);
      return;
    }
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ outreach_approved_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { alert(`Couldn't approve: ${error.message}`); setBusy(null); return; }
    await logActivity(lead.id, "other", "Approved for outreach (internal — not yet sent to Smartlead)");
    await load();
    setBusy(null);
  }

  async function pauseOutreach(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ outreach_paused_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { alert(`Couldn't pause: ${error.message}`); setBusy(null); return; }
    const note = lead.smartlead_lead_id
      ? "Outreach paused (internal). Smartlead campaign pause was NOT called — no outbound integration configured."
      : "Outreach paused (internal DOM workflow only — this lead was never enrolled in Smartlead).";
    await logActivity(lead.id, "other", note);
    await load();
    setBusy(null);
  }

  async function markReplied(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const nextStatus = lead.status === "cold" ? "contacted" : lead.status;
    const { error } = await sb.from("leads").update({ status: nextStatus }).eq("id", lead.id);
    if (error) { alert(`Couldn't update: ${error.message}`); setBusy(null); return; }
    await logActivity(lead.id, "email", "Marked as replied (manual entry, not from Smartlead webhook)");
    await load();
    setBusy(null);
  }

  async function createOpportunity(lead: Lead) {
    if ((lead.engagement_model ?? "unknown") === "unknown" || !lead.engagement_model) {
      alert("Set an engagement model before creating an opportunity (Direct, Subcontracted, Joint, etc.).");
      return;
    }
    if (!lead.opportunity_ownership || lead.opportunity_ownership === "unknown") {
      alert("Set opportunity ownership (DOM-Owned, Partner-Owned, or Shared) before creating an opportunity.");
      return;
    }
    setBusy(lead.id);
    const nextStatus = lead.status === "cold" ? "qualified" : lead.status;
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ status: nextStatus }).eq("id", lead.id);
    if (error) { alert(`Couldn't update: ${error.message}`); setBusy(null); return; }
    await logActivity(
      lead.id,
      "other",
      `Marked as active opportunity (${ENGAGEMENT_MODEL_LABELS[lead.engagement_model] ?? lead.engagement_model} / ${OWNERSHIP_LABELS[lead.opportunity_ownership] ?? lead.opportunity_ownership})`
    );
    await load();
    setBusy(null);
  }

  async function markDoNotContact(lead: Lead) {
    if (!window.confirm("Mark this lead Do Not Contact? This sets status to Lost and blocks future outreach approval.")) return;
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ status: "lost", outreach_paused_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { alert(`Couldn't update: ${error.message}`); setBusy(null); return; }
    await logActivity(lead.id, "status_change", "Marked Do Not Contact (status: Lost, outreach blocked)");
    await load();
    setBusy(null);
  }

  async function addToSmartlead(lead: Lead) {
    setBusy(lead.id);
    setSmartleadStatus((s) => ({ ...s, [lead.id]: "Checking…" }));
    try {
      const sb = getSupabaseBrowser();
      const { data: session } = await sb.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`/api/admin/leads/${lead.id}/smartlead-enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const body = await res.json();
      if (body.configured === false) {
        setSmartleadStatus((s) => ({ ...s, [lead.id]: "Smartlead: Pending Configuration" }));
      } else if (res.ok && body.ok) {
        setSmartleadStatus((s) => ({ ...s, [lead.id]: "Enrolled" }));
        await load();
      } else {
        setSmartleadStatus((s) => ({ ...s, [lead.id]: `Failed: ${body.message ?? "unknown error"}` }));
      }
    } catch {
      setSmartleadStatus((s) => ({ ...s, [lead.id]: "Failed: network error" }));
    } finally {
      setBusy(null);
    }
  }

  async function addLead() {
    if (!leadForm.company.trim()) { alert("Company is required."); return; }
    if (!leadForm.name.trim()) { alert("Contact name is required."); return; }
    if (!leadForm.industry) { alert("Industry is required."); return; }
    if (!leadForm.engagement_model) { alert("Engagement model is required."); return; }
    if (!leadForm.opportunity_ownership) { alert("Opportunity ownership is required."); return; }
    if (!leadForm.status) { alert("Status is required."); return; }
    if (!leadForm.next_action.trim()) { alert("Next action is required."); return; }

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
      tier: leadForm.tier,
      vertical: leadForm.vertical || null,
      preferred_contact_method: leadForm.preferred_contact_method || null,
      next_follow_up_at: leadForm.next_follow_up_at || null,
      industry: leadForm.industry,
      engagement_model: leadForm.engagement_model,
      opportunity_ownership: leadForm.opportunity_ownership,
      status: leadForm.status,
      next_action: leadForm.next_action,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    setLeadForm(emptyLeadForm);
    setShowAddLead(false);
    setShowMoreFields(false);
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

  async function deleteContact(contact: LeadContact) {
    const isLast = contacts.filter((c) => c.lead_id === contact.lead_id).length === 1;
    const confirmMsg = contact.is_primary
      ? isLast
        ? "This is the only contact on this lead. Delete it? (The company record and its core email/phone stay, this just removes the contact card.)"
        : "This is the primary contact. Another contact will be promoted to primary. Continue?"
      : "Delete this contact?";
    if (!window.confirm(confirmMsg)) return;

    setBusy(contact.lead_id);
    const sb = getSupabaseBrowser();
    await sb.from("lead_contacts").delete().eq("id", contact.id);

    if (contact.is_primary && !isLast) {
      const nextPrimary = contacts.find((c) => c.lead_id === contact.lead_id && c.id !== contact.id);
      if (nextPrimary) {
        await sb.from("lead_contacts").update({ is_primary: true }).eq("id", nextPrimary.id);
      }
    }

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter((l) => matchesSavedView(l, activeView))
      .filter((l) =>
        (!filterTier || (l.tier ?? []).includes(filterTier)) &&
        (!filterVertical || l.vertical === filterVertical) &&
        (!filterStatus || l.status === filterStatus) &&
        (!filterIndustry || l.industry === filterIndustry) &&
        (!filterEngagement || l.engagement_model === filterEngagement) &&
        (!filterOwnership || l.opportunity_ownership === filterOwnership) &&
        (!q ||
          (l.company ?? "").toLowerCase().includes(q) ||
          (l.name ?? "").toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const av = (sortKey === "company" ? a.company : a.name) ?? "";
        const bv = (sortKey === "company" ? b.company : b.name) ?? "";
        const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [leads, activeView, filterTier, filterVertical, filterStatus, filterIndustry, filterEngagement, filterOwnership, search, sortKey, sortDir]);

  if (loading) return <p className="text-slate-400">Loading leads…</p>;

  const today = new Date().toISOString().slice(0, 10);
  const anyFilterActive = !!(filterTier || filterVertical || filterStatus || filterIndustry || filterEngagement || filterOwnership || search);

  // Deliberately not built on `inputCls` (which is `w-full`) — the filter
  // bar needs compact, independently-sized controls on one row, and mixing
  // a `w-full` base with width overrides here is what caused each control
  // to render at full container width and stack one-per-row.
  const filterInputCls =
    "min-w-[150px] flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-accent/60 focus:outline-none sm:w-52 sm:flex-none lg:w-56";
  const filterSelectCls =
    "min-w-[110px] flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-white focus:border-accent/60 focus:outline-none sm:w-32 sm:flex-none lg:w-32";

  return (
    <div className="card p-6 lg:p-8">
      <Section
        title="Leads"
        desc="Inbound prospects from the website and outreach. Click a lead to view full details, log contact, and take action."
        action={<ActionBtn onClick={() => setShowAddLead((s) => !s)}>{showAddLead ? "Cancel" : "+ Add Lead"}</ActionBtn>}
      >
        {/* Saved views */}
        <div className="mb-4 flex flex-wrap gap-2">
          {SAVED_VIEWS.map((v) => {
            const count = leads.filter((l) => matchesSavedView(l, v.key)).length;
            const active = activeView === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setActiveView(v.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface2 text-slate-400 hover:text-white"
                }`}
              >
                {v.label} <span className="text-slate-600">({count})</span>
              </button>
            );
          })}
        </div>

        {showAddLead && (
          <div className="mb-4 rounded-lg border border-border bg-surface2 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quick Add — company, contact, industry, engagement model, ownership, status, and next action are required.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div><label className={labelCls}>Company *</label><input className={inputCls} value={leadForm.company} onChange={(e) => setLeadForm((f) => ({ ...f, company: e.target.value }))} /></div>
              <div><label className={labelCls}>Contact name *</label><input className={inputCls} value={leadForm.name} onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div>
                <label className={labelCls}>Industry *</label>
                <select className={inputCls} value={leadForm.industry} onChange={(e) => setLeadForm((f) => ({ ...f, industry: e.target.value }))}>
                  <option value="">Select…</option>
                  {INDUSTRY_OPTIONS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Engagement model *</label>
                <select className={inputCls} value={leadForm.engagement_model} onChange={(e) => setLeadForm((f) => ({ ...f, engagement_model: e.target.value }))}>
                  <option value="">Select…</option>
                  {ENGAGEMENT_MODEL_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Opportunity ownership *</label>
                <select className={inputCls} value={leadForm.opportunity_ownership} onChange={(e) => setLeadForm((f) => ({ ...f, opportunity_ownership: e.target.value }))}>
                  {OWNERSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status *</label>
                <select className={inputCls} value={leadForm.status} onChange={(e) => setLeadForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelCls}>Next action *</label>
                <input className={inputCls} placeholder='e.g. "Call Tuesday", "Send quote", "Wait for reply"' value={leadForm.next_action} onChange={(e) => setLeadForm((f) => ({ ...f, next_action: e.target.value }))} />
              </div>
            </div>

            <button type="button" className="mt-3 text-xs text-accent underline" onClick={() => setShowMoreFields((s) => !s)}>
              {showMoreFields ? "Hide additional fields" : "+ Additional fields (email, phone, tier, vertical…)"}
            </button>

            {showMoreFields && (
              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
                <div><label className={labelCls}>Email</label><input className={inputCls} value={leadForm.email} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} /></div>
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={leadForm.phone} onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className={labelCls}>Address</label><input className={inputCls} value={leadForm.address} onChange={(e) => setLeadForm((f) => ({ ...f, address: e.target.value }))} /></div>
                <div><label className={labelCls}>Source</label><input className={inputCls} placeholder="phone, referral, website…" value={leadForm.source} onChange={(e) => setLeadForm((f) => ({ ...f, source: e.target.value }))} /></div>
                <div>
                  <label className={labelCls}>Vertical <span className="text-slate-600">(legacy)</span></label>
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
                <div><label className={labelCls}>Next follow-up</label><input type="date" className={inputCls} value={leadForm.next_follow_up_at} onChange={(e) => setLeadForm((f) => ({ ...f, next_follow_up_at: e.target.value }))} /></div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={labelCls}>Tier <span className="text-slate-600">(a client can require more than one)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {TIER_OPTIONS.map((t) => {
                      const active = leadForm.tier.includes(t.value);
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() =>
                            setLeadForm((f) => ({
                              ...f,
                              tier: active ? f.tier.filter((v) => v !== t.value) : [...f.tier, t.value],
                            }))
                          }
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-slate-400 hover:text-white"
                          }`}
                        >
                          {active ? "☑" : "☐"} {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3"><label className={labelCls}>Message</label><textarea className={inputCls} rows={2} value={leadForm.message} onChange={(e) => setLeadForm((f) => ({ ...f, message: e.target.value }))} /></div>
              </div>
            )}

            <div className="mt-3"><ActionBtn disabled={busy === "add-lead"} onClick={addLead}>{busy === "add-lead" ? "Saving…" : "Save Lead"}</ActionBtn></div>
          </div>
        )}

        {/* Filter bar — one compact row on desktop/laptop (lg:flex-nowrap),
            wraps cleanly on tablet, stacks compactly on mobile. */}
        <div className="mb-2 flex flex-wrap items-center gap-2 lg:flex-nowrap">
          <input
            className={filterInputCls}
            placeholder="Search company, contact, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={filterSelectCls} value={filterIndustry} onChange={(e) => setFilterIndustry(e.target.value)}>
            <option value="">All industries</option>
            {INDUSTRY_OPTIONS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <select className={filterSelectCls} value={filterEngagement} onChange={(e) => setFilterEngagement(e.target.value)}>
            <option value="">All engagement models</option>
            {ENGAGEMENT_MODEL_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <select className={filterSelectCls} value={filterOwnership} onChange={(e) => setFilterOwnership(e.target.value)}>
            <option value="">All ownership</option>
            {OWNERSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className={filterSelectCls} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {anyFilterActive && (
            <button
              className="text-xs text-slate-500 underline"
              onClick={() => { setSearch(""); setFilterTier(""); setFilterVertical(""); setFilterStatus(""); setFilterIndustry(""); setFilterEngagement(""); setFilterOwnership(""); }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Sort by — compact row directly below the filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
        </div>

        {leads.length === 0 && <Empty>No leads yet.</Empty>}
        {leads.length > 0 && filtered.length === 0 && <Empty>No leads match this view/filters.</Empty>}

        <div className="space-y-3">
          {filtered.map((l) => {
            const open = expandedLead === l.id;
            const events = l.external_prospect_id ? eventsByProspect[l.external_prospect_id] ?? [] : [];
            const leadNotes = notes.filter((n) => n.entity_id === l.id);
            const restricted = isDjiRestricted(l);
            const ownershipColor = OWNERSHIP_COLORS[l.opportunity_ownership ?? "unknown"] ?? OWNERSHIP_COLORS.unknown;

            return (
              <div key={l.id} className="rounded-lg border border-border bg-surface2">
                {/* Compact row — Company/contact | Industry | Engagement | Ownership | Status | Next action | Follow-up | menu */}
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button onClick={() => setExpandedLead(open ? null : l.id)} className="flex-1 text-left min-w-[180px]">
                    <div className="text-sm font-semibold text-white">{l.company ?? l.name ?? "Unnamed"}</div>
                    <div className="text-xs text-slate-500">{l.name ?? "No contact name"} · {l.email ?? "—"}</div>
                  </button>

                  <div className="grid flex-1 grid-cols-2 gap-2 text-xs sm:grid-cols-4 sm:text-sm min-w-[240px]">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-600">Industry</div>
                      <div className="text-slate-300">{l.industry ? INDUSTRY_LABELS[l.industry] ?? l.industry : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-600">Engagement</div>
                      <div className="text-slate-300">{l.engagement_model ? ENGAGEMENT_MODEL_LABELS[l.engagement_model] ?? l.engagement_model : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-600">Ownership</div>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ownershipColor}`}>
                        {OWNERSHIP_LABELS[l.opportunity_ownership ?? "unknown"] ?? "Unknown"}
                      </span>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-600">Next action</div>
                      <div className="truncate text-slate-300" title={l.next_action ?? ""}>{l.next_action || "—"}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {restricted && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${DJI_RESTRICTED_COLOR}`}>
                        DJI Restricted
                      </span>
                    )}
                    {l.next_follow_up_at && (
                      <span className={`text-xs ${l.next_follow_up_at <= today && !["customer", "lost"].includes(l.status) ? "text-rose-400" : "text-slate-500"}`}>
                        {l.next_follow_up_at <= today && !["customer", "lost"].includes(l.status) ? "Follow-up due " : "Follow-up "}
                        {new Date(l.next_follow_up_at).toLocaleDateString()}
                      </span>
                    )}
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${STATUS_OPTIONS.find((s) => s.value === l.status)?.color ?? "border-border bg-surface2 text-slate-300"}`}>
                      {STATUS_LABELS[l.status] ?? l.status}
                    </span>

                    <div className="relative">
                      <button
                        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-slate-400 hover:text-white"
                        onClick={() => setMenuLead(menuLead === l.id ? null : l.id)}
                      >
                        ⋯
                      </button>
                      {menuLead === l.id && (
                        <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-border bg-surface shadow-lg">
                          <button disabled={busy === l.id} className="block w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-surface2" onClick={() => { setMenuLead(null); approveForOutreach(l); }}>Approve for Outreach</button>
                          <button disabled={busy === l.id} className="block w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-surface2" onClick={() => { setMenuLead(null); logContactNow(l); }}>Log contact now</button>
                          <button disabled={busy === l.id} className="block w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-surface2" onClick={() => { setMenuLead(null); createOpportunity(l); }}>Create Opportunity</button>
                          <button disabled={busy === l.id} className="block w-full px-3 py-2 text-left text-xs text-rose-400 hover:bg-surface2" onClick={() => { setMenuLead(null); markDoNotContact(l); }}>Do Not Contact</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {open && (
                  <>
                  {/* Classification & Opportunity */}
                  <div className="border-t border-border p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Classification &amp; Opportunity</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className={labelCls}>Industry</label>
                        <select className={inputCls} value={l.industry ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "industry", e.target.value)}>
                          <option value="">—</option>
                          {INDUSTRY_OPTIONS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Engagement model</label>
                        <select className={inputCls} value={l.engagement_model ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "engagement_model", e.target.value)}>
                          <option value="">—</option>
                          {ENGAGEMENT_MODEL_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Opportunity ownership</label>
                        <select className={inputCls} value={l.opportunity_ownership ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "opportunity_ownership", e.target.value)}>
                          <option value="">—</option>
                          {OWNERSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>DJI permitted</label>
                        <select className={inputCls} value={l.dji_permitted ?? ""} disabled={busy === l.id} onChange={(e) => setLeadField(l, "dji_permitted", e.target.value)}>
                          <option value="">—</option>
                          {DJI_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </div>
                      <div className="flex items-end gap-4">
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                          <input type="checkbox" checked={!!l.ndaa_required} disabled={busy === l.id} onChange={(e) => setLeadBooleanField(l, "ndaa_required", e.target.checked)} />
                          NDAA required
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                          <input type="checkbox" checked={!!l.blue_uas_required} disabled={busy === l.id} onChange={(e) => setLeadBooleanField(l, "blue_uas_required", e.target.checked)} />
                          Blue UAS required
                        </label>
                      </div>
                      <div><label className={labelCls}>Total project value ($)</label><input type="number" step="0.01" className={inputCls} defaultValue={l.total_project_value ?? ""} disabled={busy === l.id} onBlur={(e) => setLeadNumberField(l, "total_project_value", e.target.value)} /></div>
                      <div><label className={labelCls}>Expected DOM revenue ($)</label><input type="number" step="0.01" className={inputCls} defaultValue={l.expected_dom_revenue ?? ""} disabled={busy === l.id} onBlur={(e) => setLeadNumberField(l, "expected_dom_revenue", e.target.value)} /></div>
                      <div><label className={labelCls}>Prime contractor</label><input className={inputCls} defaultValue={l.prime_contractor ?? ""} disabled={busy === l.id} onBlur={(e) => setLeadField(l, "prime_contractor", e.target.value)} /></div>
                      <div><label className={labelCls}>End client</label><input className={inputCls} defaultValue={l.end_client ?? ""} disabled={busy === l.id} onBlur={(e) => setLeadField(l, "end_client", e.target.value)} /></div>
                      <div><label className={labelCls}>Source URL</label><input className={inputCls} defaultValue={l.source_url ?? ""} disabled={busy === l.id} onBlur={(e) => setLeadField(l, "source_url", e.target.value)} /></div>
                      <div className="sm:col-span-2"><label className={labelCls}>Next action</label><input className={inputCls} defaultValue={l.next_action ?? ""} disabled={busy === l.id} onBlur={(e) => setLeadField(l, "next_action", e.target.value)} /></div>
                      <div className="sm:col-span-2 lg:col-span-4"><label className={labelCls}>Verification notes</label><textarea className={inputCls} rows={2} defaultValue={l.verification_notes ?? ""} disabled={busy === l.id} onBlur={(e) => setLeadField(l, "verification_notes", e.target.value)} /></div>
                    </div>
                  </div>

                  {/* Smartlead & Outreach workflow */}
                  <div className="border-t border-border p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Smartlead &amp; Outreach Workflow</p>
                    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                      <span>Outreach approved: {l.outreach_approved_at ? new Date(l.outreach_approved_at).toLocaleString() : "Not approved"}</span>
                      <span>Outreach paused: {l.outreach_paused_at ? new Date(l.outreach_paused_at).toLocaleString() : "Not paused"}</span>
                      <span>Smartlead campaign: {l.smartlead_campaign_id ?? "Pending Configuration"}</span>
                      <span>Smartlead lead ID: {l.smartlead_lead_id ?? "Pending Configuration"}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionBtn disabled={busy === l.id} onClick={() => approveForOutreach(l)}>Approve for Outreach</ActionBtn>
                      <ActionBtn disabled={busy === l.id} onClick={() => pauseOutreach(l)}>Pause Outreach</ActionBtn>
                      <ActionBtn disabled={busy === l.id} onClick={() => markReplied(l)}>Mark Replied</ActionBtn>
                      <ActionBtn disabled={busy === l.id} onClick={() => createOpportunity(l)}>Create Opportunity</ActionBtn>
                      <ActionBtn disabled={busy === l.id} onClick={() => addToSmartlead(l)}>Add to Smartlead</ActionBtn>
                      <ActionBtn disabled={busy === l.id} onClick={() => markDoNotContact(l)}>Do Not Contact</ActionBtn>
                    </div>
                    {smartleadStatus[l.id] && <p className="mt-2 text-xs text-amber-400">{smartleadStatus[l.id]}</p>}
                  </div>

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

                      <div>
                        <label className={labelCls}>Tier <span className="text-slate-600">(a client can require more than one)</span></label>
                        <div className="flex flex-wrap gap-2">
                          {TIER_OPTIONS.map((t) => {
                            const active = (l.tier ?? []).includes(t.value);
                            return (
                              <button
                                key={t.value}
                                type="button"
                                disabled={busy === l.id}
                                onClick={() => toggleLeadTier(l, t.value)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                  active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-slate-400 hover:text-white"
                                }`}
                              >
                                {active ? "☑" : "☐"} {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelCls}>Vertical <span className="text-slate-600">(legacy)</span></label>
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

                      <div>
                        <label className={labelCls}>Status</label>
                        <div className="flex flex-wrap gap-2">
                          {STATUS_OPTIONS.map((s) => {
                            const active = l.status === s.value;
                            return (
                              <button
                                key={s.value}
                                type="button"
                                disabled={busy === l.id}
                                onClick={() => handleStatusChange(l, s.value)}
                                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                  active ? s.color : "border-border bg-surface text-slate-400 hover:text-white"
                                }`}
                              >
                                <span className={`h-2.5 w-2.5 rounded-full border ${active ? "border-current bg-current" : "border-slate-600"}`} />
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                        {l.status === "cold" || l.status === "contacted" || l.status === "qualified" || l.status === "quoted" || l.status === "scheduled" ? (
                          <p className="mt-1 text-xs text-slate-600">Selecting "Customer" also creates a client record.</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <ActionBtn disabled={busy === l.id} onClick={() => logContactNow(l)}>Log contact now</ActionBtn>
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
                    {(() => {
                      const leadActivities = activities.filter((a) => a.lead_id === l.id);
                      return (
                      <SectionDisclosure
                        id={`interaction-log-${l.id}`}
                        title={`Interaction Log (${leadActivities.length})`}
                        accent="blue"
                        open={interactionLogOpen}
                        onToggle={() => setInteractionLogOpen((o) => !o)}
                      />
                      );
                    })()}
                    {interactionLogOpen && (() => {
                      const leadActivities = activities.filter((a) => a.lead_id === l.id);
                      return (
                    <div id={`interaction-log-${l.id}-panel`} role="region" aria-labelledby={`interaction-log-${l.id}-trigger`} className="pt-3">
                    {leadActivities.length === 0 ? (
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
                                    <button className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => deleteActivity(a.id, l.id)}>✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
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
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacts</p>
                      {contacts.filter((c) => c.lead_id === l.id).length === 0 ? (
                        <p className="mb-2 text-xs text-slate-500">No contacts yet.</p>
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
                                <button className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => deleteContact(c)}>✕</button>
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
                                <button className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => deleteLocation(loc.id, l.id)}>✕</button>
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
                                  <button className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded px-1.5 py-0.5 font-bold transition" onClick={() => deleteRelationship(r.id, l.id)}>✕</button>
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
