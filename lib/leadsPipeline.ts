// lib/leadsPipeline.ts
// Pure, framework-free logic for the DOM Leads sales workspace: pipeline
// stages, saved views, filters, lead scoring, and duplicate detection.
// Nothing here touches Supabase or the DOM — it's all plain data in, plain
// data out, so it can be unit tested and shared between the UI and (where
// relevant) the Smartlead webhook route.

export interface Lead {
  id: string; name: string | null; email: string | null; company: string | null;
  phone: string | null; source: string | null; message: string | null; status: string; created_at: string;
  tier: string[]; vertical: string | null; external_prospect_id: string | null;
  preferred_contact_method: string | null; last_contacted_at: string | null; next_follow_up_at: string | null;
  address: string | null;
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
  smartlead_campaign_id: string | null;
  smartlead_lead_id: string | null;
  outreach_approved_at: string | null;
  outreach_paused_at: string | null;
  priority_override: "high" | "medium" | "low" | null;
  listing_color: string | null;
  logo_url: string | null;
  logo_path: string | null;
}

export interface LeadNextAction {
  id: string; lead_id: string; action_type: string; due_at: string | null;
  status: "open" | "completed" | "cancelled"; assigned_to: string | null;
  notes: string | null; completed_at: string | null; created_at: string; updated_at: string;
}

export interface LeadSmartleadStatus {
  id: string; lead_id: string; campaign_name: string | null; sequence_step: number | null;
  outreach_status: string | null; last_sent_at: string | null; last_opened_at: string | null;
  last_clicked_at: string | null; last_replied_at: string | null; reply_category: string | null;
  bounce_status: string | null; unsubscribed_at: string | null; open_count: number; click_count: number;
  last_synced_at: string | null;
}

// A lead plus the per-lead context saved views / scoring need, computed once
// per render (newest open next-action, latest sync row, whether any activity
// has ever been logged) rather than re-derived inside every predicate.
export interface LeadContext {
  lead: Lead;
  openNextAction: LeadNextAction | null;
  smartlead: LeadSmartleadStatus | null;
  hasActivity: boolean;
}

// ---------------------------------------------------------------------------
// Classification vocab — moved here (unchanged from the original
// LeadsWorkspace.tsx constants) so both the orchestrator and the new
// components/leads/* files share one source instead of duplicating it.
// ---------------------------------------------------------------------------

export const TIER_OPTIONS = [
  { value: "tier_1", label: "Tier 1 — Roof Inspection" },
  { value: "tier_2", label: "Tier 2 — Thermal / Moisture" },
  { value: "tier_3", label: "Tier 3 — Ortho / Mapping" },
];
export const VERTICAL_OPTIONS = [
  { value: "roofing", label: "Roofing" },
  { value: "insurance_restoration", label: "Insurance Restoration" },
  { value: "public_adjuster", label: "Public Adjuster" },
  { value: "property_management", label: "Property Management" },
  { value: "general_contractor", label: "General Contractor" },
  { value: "other", label: "Other" },
];
export const CONTACT_METHOD_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
  { value: "in_person", label: "In person" },
  { value: "other", label: "Other" },
];
export const TIER_LABELS: Record<string, string> = Object.fromEntries(TIER_OPTIONS.map((t) => [t.value, t.label]));

// Numeric priority rank for a lead's tier assignment, used by "Sort by → Priority".
// Tier 1 (highest) → 1, Tier 2 → 2, Tier 3 → 3, unassigned/unknown → 99.
// Lower rank = higher priority (sorts first). A lead may carry multiple tiers;
// the best (lowest-numbered) tier wins.
export function tierRank(lead: Pick<Lead, "tier">): number {
  const tiers = lead.tier ?? [];
  if (tiers.includes("tier_1")) return 1;
  if (tiers.includes("tier_2")) return 2;
  if (tiers.includes("tier_3")) return 3;
  return 99;
}

export type LeadSortKey = "company" | "name" | "industry" | "status" | "priority" | "newest";
export type LeadSortDir = "asc" | "desc";

// Comparator for the Leads workspace "Sort by" control. Predictable secondary
// order is always company name A–Z (independent of direction) so equal primary
// values stay stable.
//   - company:  company name A–Z
//   - name:     contact name A–Z; leads with no contact always sort last
//   - priority: Tier 1 → Tier 2 → Tier 3, then unassigned (always last)
export function compareLeadsForSort(a: Pick<Lead, "company" | "name" | "tier" | "industry" | "status" | "created_at">, b: Pick<Lead, "company" | "name" | "tier" | "industry" | "status" | "created_at">, sortKey: LeadSortKey, sortDir: LeadSortDir): number {
  const dir = sortDir === "asc" ? 1 : -1;
  const companyA = a.company ?? "";
  const companyB = b.company ?? "";
  const tieByCompany = companyA.localeCompare(companyB, undefined, { sensitivity: "base" });

  if (sortKey === "priority") {
    const ra = tierRank(a);
    const rb = tierRank(b);
    // Unassigned leads always sort last, regardless of direction.
    const assignedA = ra !== 99;
    const assignedB = rb !== 99;
    if (assignedA !== assignedB) return assignedA ? -1 : 1;
    if (ra !== rb) return (ra - rb) * dir; // Tier 1 first by default (asc)
    return tieByCompany;
  }

  if (sortKey === "name") {
    const nameA = a.name?.trim() ?? "";
    const nameB = b.name?.trim() ?? "";
    // Leads with no contact always sort after those with one, regardless of direction.
    if (!nameA !== !nameB) return nameA ? -1 : 1;
    const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    return cmp !== 0 ? cmp * dir : tieByCompany;
  }

  if(sortKey==="industry"){const cmp=(a.industry??"").localeCompare(b.industry??"",undefined,{sensitivity:"base"});return cmp!==0?cmp*dir:tieByCompany}
  if(sortKey==="status"){const cmp=normalizeStatus(a.status).localeCompare(normalizeStatus(b.status),undefined,{sensitivity:"base"});return cmp!==0?cmp*dir:tieByCompany}
  if(sortKey==="newest"){const cmp=new Date(b.created_at).getTime()-new Date(a.created_at).getTime();return cmp!==0?(sortDir==="asc"?cmp:-cmp):tieByCompany}

  // company
  return tieByCompany * dir;
}
export const VERTICAL_LABELS: Record<string, string> = Object.fromEntries(VERTICAL_OPTIONS.map((v) => [v.value, v.label]));
export const EVENT_LABELS: Record<string, string> = {
  sent: "Email sent", opened: "Opened", clicked: "Clicked link", replied: "Replied",
  bounced: "Bounced", unsubscribed: "Unsubscribed",
};
export const RELATIONSHIP_OPTIONS = [
  { value: "affiliated", label: "Affiliated" },
  { value: "parent_company", label: "Parent company" },
  { value: "subsidiary", label: "Subsidiary" },
  { value: "vendor", label: "Vendor" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
];
export const RELATIONSHIP_LABELS: Record<string, string> = Object.fromEntries(RELATIONSHIP_OPTIONS.map((r) => [r.value, r.label]));
export const ACTIVITY_TYPE_OPTIONS = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "letter", label: "Letter" },
  { value: "meeting", label: "Meeting" },
  { value: "bill", label: "Bill" },
  { value: "job", label: "Job" },
  { value: "status_change", label: "Status change" },
  { value: "other", label: "Other" },
];
export const ACTIVITY_TYPE_LABELS: Record<string, string> = Object.fromEntries(ACTIVITY_TYPE_OPTIONS.map((a) => [a.value, a.label]));

export const INDUSTRY_OPTIONS = [
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
export const INDUSTRY_LABELS: Record<string, string> = Object.fromEntries(INDUSTRY_OPTIONS.map((i) => [i.value, i.label]));

export const ENGAGEMENT_MODEL_OPTIONS = [
  { value: "direct_project", label: "Direct Project" },
  { value: "subcontracted_project", label: "Subcontracted Project" },
  { value: "joint_project", label: "Joint Project" },
  { value: "staff_augmentation", label: "Staff Augmentation" },
  { value: "white_label_service", label: "White-Label Service" },
  { value: "referral_only", label: "Referral Only" },
  { value: "unknown", label: "Unknown" },
];
export const ENGAGEMENT_MODEL_LABELS: Record<string, string> = Object.fromEntries(ENGAGEMENT_MODEL_OPTIONS.map((e) => [e.value, e.label]));

export const OWNERSHIP_OPTIONS = [
  { value: "dom_owned", label: "DOM-Owned", color: "border-orange-500 bg-orange-500/10 text-orange-700" },
  { value: "partner_owned", label: "Partner-Owned", color: "border-blue-500 bg-blue-500/10 text-blue-700" },
  { value: "shared", label: "Shared", color: "border-purple-500 bg-purple-500/10 text-purple-700" },
  { value: "unknown", label: "Unknown", color: "border-amber-500 bg-amber-500/10 text-amber-700" },
];
export const OWNERSHIP_LABELS: Record<string, string> = Object.fromEntries(OWNERSHIP_OPTIONS.map((o) => [o.value, o.label]));
export const OWNERSHIP_COLORS: Record<string, string> = Object.fromEntries(OWNERSHIP_OPTIONS.map((o) => [o.value, o.color]));

export const DJI_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
  { value: "project_dependent", label: "Project-dependent" },
];

export const DJI_RESTRICTED_COLOR = "border-rose-500 bg-rose-500/10 text-rose-700";

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

export const STATUS_OPTIONS = [
  { value: "new", label: "New", color: "border-slate-500 bg-slate-500/10 text-slate-700" },
  { value: "researching", label: "Researching", color: "border-slate-400 bg-slate-400/10 text-slate-700" },
  { value: "ready_for_outreach", label: "Ready for Outreach", color: "border-sky-500 bg-sky-500/10 text-sky-700" },
  { value: "outreach_scheduled", label: "Outreach Scheduled", color: "border-cyan-500 bg-cyan-500/10 text-cyan-700" },
  { value: "contacted", label: "Contacted", color: "border-blue-500 bg-blue-500/10 text-blue-700" },
  { value: "needs_response", label: "Needs Response", color: "border-amber-500 bg-amber-500/10 text-amber-700" },
  { value: "follow_up", label: "Follow-up", color: "border-orange-500 bg-orange-500/10 text-orange-700" },
  { value: "qualified", label: "Qualified", color: "border-teal-500 bg-teal-500/10 text-teal-700" },
  { value: "proposal", label: "Proposal", color: "border-purple-500 bg-purple-500/10 text-purple-700" },
  { value: "won", label: "Client / Active", color: "border-green-500 bg-green-500/10 text-green-700" },
  { value: "no_response", label: "No Response", color: "border-slate-600 bg-slate-600/10 text-slate-600" },
  { value: "lost", label: "Lost", color: "border-rose-500 bg-rose-500/10 text-rose-700" },
  { value: "do_not_contact", label: "Do Not Contact", color: "border-red-600 bg-red-600/10 text-red-700" },
] as const;

export type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

// A lead in one of these stages is done moving through the pipeline —
// follow-up-due styling and "this also creates a client" hints no longer apply.
export const TERMINAL_STATUSES: readonly string[] = ["won", "lost", "do_not_contact"];

// Statuses that represent deliberate human progress. Automated Smartlead
// webhook events are only ever allowed to move a lead FORWARD out of the
// pre-outreach/outreach statuses below this list — they never downgrade or
// silently overwrite a stage a person put the lead into on purpose.
export const AUTO_TRANSITION_LOCKED_STATUSES: readonly string[] = [
  "won", "lost", "do_not_contact", "proposal", "qualified", "follow_up",
];

// "Ready for outreach approval" means the lead hasn't been touched by
// outreach yet — not "already qualified." Matches the pre-Smartlead stages.
export const OUTREACH_READY_STATUSES: readonly string[] = ["new", "researching", "ready_for_outreach"];

// Legacy (pre-migration) status -> new pipeline status. Mirrors the mapping
// applied by supabase/migrations/20260803004800_leads_pipeline_status_migration.sql
// exactly — kept here too so app code (and a test) can assert they agree,
// and so any lead that somehow still carries a legacy value renders sensibly
// instead of falling through to a raw, unrecognized string.
export const LEGACY_STATUS_MAP: Record<string, StatusValue> = {
  cold: "new",
  contacted: "contacted",
  qualified: "qualified",
  quoted: "proposal",
  scheduled: "outreach_scheduled",
  customer: "won",
  lost: "lost",
};

export function normalizeStatus(status: string): string {
  return LEGACY_STATUS_MAP[status] ?? status;
}

export function statusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  return STATUS_LABELS[normalized] ?? status;
}

// ---------------------------------------------------------------------------
// Saved views (13, matching the pipeline stages + the pipeline funnel shape)
// ---------------------------------------------------------------------------

export type SavedViewKey =
  | "all" | "contact_today" | "needs_response" | "overdue" | "high_priority"
  | "no_activity" | "positive_replies" | "opened_no_reply" | "campaign_active"
  | "sequence_finished" | "proposals" | "bounced" | "unsubscribed";

export const SAVED_VIEWS: { key: SavedViewKey; label: string }[] = [
  { key: "all", label: "All Leads" },
  { key: "contact_today", label: "Contact Today" },
  { key: "needs_response", label: "Needs Response" },
  { key: "overdue", label: "Overdue" },
  { key: "high_priority", label: "High Priority" },
  { key: "no_activity", label: "No Activity" },
  { key: "positive_replies", label: "Positive Replies" },
  { key: "opened_no_reply", label: "Opened — No Reply" },
  { key: "campaign_active", label: "Campaign Active" },
  { key: "sequence_finished", label: "Sequence Finished" },
  { key: "proposals", label: "Proposals" },
  { key: "bounced", label: "Bounced" },
  { key: "unsubscribed", label: "Unsubscribed" },
];

const POSITIVE_REPLY_CATEGORIES = ["Interested", "Meeting Request"];

export function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

export function isDueToday(dueAt: string | null | undefined, today: string): boolean {
  const d = toDateOnly(dueAt);
  return d !== null && d === today;
}

export function isOverdue(dueAt: string | null | undefined, today: string): boolean {
  const d = toDateOnly(dueAt);
  return d !== null && d < today;
}

export function matchesSavedView(ctx: LeadContext, view: SavedViewKey, today: string): boolean {
  const { lead, openNextAction, smartlead, hasActivity } = ctx;
  switch (view) {
    case "all":
      return true;
    case "contact_today":
      return isDueToday(openNextAction?.due_at, today);
    case "needs_response":
      return normalizeStatus(lead.status) === "needs_response";
    case "overdue":
      return isOverdue(openNextAction?.due_at, today);
    case "high_priority":
      return scoreLead(ctx).label === "high";
    case "no_activity":
      return !hasActivity && !smartlead?.last_sent_at;
    case "positive_replies":
      return !!smartlead?.reply_category && POSITIVE_REPLY_CATEGORIES.includes(smartlead.reply_category);
    case "opened_no_reply":
      return !!smartlead?.last_opened_at && !smartlead?.last_replied_at;
    case "campaign_active":
      return smartlead?.outreach_status === "active";
    case "sequence_finished":
      return smartlead?.outreach_status === "completed";
    case "proposals":
      return normalizeStatus(lead.status) === "proposal";
    case "bounced":
      return !!smartlead?.bounce_status;
    case "unsubscribed":
      return !!smartlead?.unsubscribed_at;
    default:
      return true;
  }
}

// The classification views the old 5-item saved-view list used to cover
// (direct/subcontract/partner engagement type, and the DJI-restricted
// compliance flag) aren't pipeline stages, so they don't belong in the 13
// saved views above — but they're real, useful, and shouldn't quietly
// disappear in the rewrite. Exposed as a small "Type" filter instead.
export type OpportunityType = "" | "direct" | "subcontract" | "partner";

export function matchesOpportunityType(lead: Lead, type: OpportunityType): boolean {
  switch (type) {
    case "":
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
    default:
      return true;
  }
}

export function isDjiRestricted(lead: Lead): boolean {
  return lead.dji_permitted === "no" || lead.ndaa_required === true || lead.blue_uas_required === true;
}

// ---------------------------------------------------------------------------
// Filters (search + dropdown filters on the filter bar)
// ---------------------------------------------------------------------------

export interface LeadFilters {
  search: string;
  status: string;
  industry: string;
  engagement: string;
  ownership: string;
}

export function matchesFilters(lead: Lead, filters: LeadFilters): boolean {
  const q = filters.search.trim().toLowerCase();
  return (
    (!filters.status || normalizeStatus(lead.status) === filters.status) &&
    (!filters.industry || lead.industry === filters.industry) &&
    (!filters.engagement || lead.engagement_model === filters.engagement) &&
    (!filters.ownership || lead.opportunity_ownership === filters.ownership) &&
    (!q || (
      (lead.company ?? "").toLowerCase().includes(q) ||
      (lead.name ?? "").toLowerCase().includes(q) ||
      (lead.email ?? "").toLowerCase().includes(q)
      || (lead.phone ?? "").toLowerCase().includes(q)
      || (lead.industry ?? "").toLowerCase().includes(q)
      || normalizeStatus(lead.status).toLowerCase().includes(q)
      || (lead.service_opportunity ?? "").toLowerCase().includes(q)
      || (lead.address ?? "").toLowerCase().includes(q))
    )
  );
}

// ---------------------------------------------------------------------------
// Lead scoring — transparent, capped, explainable. Not persisted anywhere;
// always computed fresh from fields that already exist elsewhere, so there's
// nothing to keep in sync and no "AI certainty" being implied — it's a
// simple additive rubric with a visible reason list.
// ---------------------------------------------------------------------------

const STRONG_INDUSTRIES = ["telecom_towers", "utilities", "refinery_petrochemical", "construction"];

export interface LeadScore {
  score: number;
  label: "high" | "medium" | "low" | null; // null = excluded (disqualified/terminal)
  manual: boolean; // true when priority_override is driving `label`
  reasons: string[];
}

export function scoreLead(ctx: LeadContext): LeadScore {
  const { lead, openNextAction, smartlead } = ctx;
  const normalized = normalizeStatus(lead.status);

  if (lead.priority_override) {
    return { score: 0, label: lead.priority_override, manual: true, reasons: [`Manually set to ${lead.priority_override}`] };
  }

  if (TERMINAL_STATUSES.includes(normalized)) {
    return { score: 0, label: null, manual: false, reasons: [`Excluded — status is "${statusLabel(normalized)}"`] };
  }

  let score = 0;
  const reasons: string[] = [];

  if (lead.industry) {
    if (STRONG_INDUSTRIES.includes(lead.industry)) {
      score += 2; reasons.push("Strong-fit industry for DOM");
    } else {
      score += 1; reasons.push("Industry classified");
    }
  }

  if (lead.opportunity_ownership === "dom_owned" || lead.engagement_model === "direct_project") {
    score += 2; reasons.push("DOM-owned / direct engagement");
  } else if (["partner_owned", "shared"].includes(lead.opportunity_ownership ?? "")) {
    score += 1; reasons.push("Partner or shared opportunity");
  }

  const value = lead.total_project_value ?? lead.expected_dom_revenue ?? null;
  if (value !== null) {
    if (value >= 25000) { score += 2; reasons.push(`Estimated value $${value.toLocaleString()}`); }
    else { score += 1; reasons.push(`Estimated value $${value.toLocaleString()}`); }
  }

  const hasValidEmail = !!lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim());
  if (hasValidEmail) { score += 1; reasons.push("Valid decision-maker email on file"); }
  if (lead.phone) { score += 1; reasons.push("Phone number on file"); }

  // Engagement signals — opens/clicks contribute at most +1 total regardless
  // of count, so a lead someone happened to open five times doesn't outrank
  // a lead with a real reply. Replies are the only strong positive signal.
  if (smartlead?.last_replied_at && POSITIVE_REPLY_CATEGORIES.includes(smartlead.reply_category ?? "")) {
    score += 3; reasons.push("Positive reply received");
  } else if ((smartlead?.open_count ?? 0) > 0 || (smartlead?.click_count ?? 0) > 0) {
    score += 1; reasons.push("Opened or clicked outreach email");
  }

  if (openNextAction) {
    if (isOverdue(openNextAction.due_at, new Date().toISOString().slice(0, 10)) || isDueToday(openNextAction.due_at, new Date().toISOString().slice(0, 10))) {
      score += 1; reasons.push("Next action is due today or overdue");
    }
  } else {
    score -= 1; reasons.push("No open next action");
  }

  const label = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
  return { score, label, manual: false, reasons };
}

// ---------------------------------------------------------------------------
// Duplicate protection — warns, never auto-merges.
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function emailDomain(email: string | null | undefined): string {
  const norm = normalizeEmail(email);
  const at = norm.indexOf("@");
  return at === -1 ? "" : norm.slice(at + 1);
}

function normalizeCompany(company: string | null | undefined): string {
  return (company ?? "").trim().toLowerCase().replace(/[.,]/g, "").replace(/\b(inc|llc|corp|co|company)\b/g, "").trim();
}

export interface DuplicateMatch {
  lead: Lead;
  reason: string;
}

export function findLikelyDuplicates(
  existing: Lead[],
  candidate: { id?: string; email?: string | null; company?: string | null; name?: string | null }
): DuplicateMatch[] {
  const candEmail = normalizeEmail(candidate.email);
  const candCompany = normalizeCompany(candidate.company);
  const candDomain = emailDomain(candidate.email);
  const candName = (candidate.name ?? "").trim().toLowerCase();

  const matches: DuplicateMatch[] = [];
  for (const lead of existing) {
    if (candidate.id && lead.id === candidate.id) continue;

    if (candEmail && normalizeEmail(lead.email) === candEmail) {
      matches.push({ lead, reason: "Same email address" });
      continue;
    }
    if (candCompany && candDomain && normalizeCompany(lead.company) === candCompany && emailDomain(lead.email) === candDomain) {
      matches.push({ lead, reason: "Same company and email domain" });
      continue;
    }
    if (candCompany && candName && normalizeCompany(lead.company) === candCompany && (lead.name ?? "").trim().toLowerCase() === candName) {
      matches.push({ lead, reason: "Same company and contact name" });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Outreach eligibility — the one gate every Smartlead-facing action must pass.
// ---------------------------------------------------------------------------

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export interface EnrollGuardResult {
  ok: boolean;
  reason?: string;
}

export function canEnrollInOutreach(lead: Lead, smartlead: LeadSmartleadStatus | null): EnrollGuardResult {
  const normalized = normalizeStatus(lead.status);
  if (normalized === "do_not_contact") return { ok: false, reason: "This lead is marked Do Not Contact." };
  if (smartlead?.unsubscribed_at) return { ok: false, reason: "This lead has unsubscribed." };
  if (smartlead?.bounce_status) return { ok: false, reason: "This lead's email has bounced." };
  if (!isValidEmail(lead.email)) return { ok: false, reason: "This lead needs a valid email before outreach." };
  if (!OUTREACH_READY_STATUSES.includes(normalized)) {
    return { ok: false, reason: `Leads with status "${statusLabel(normalized)}" aren't eligible for outreach approval.` };
  }
  if (lead.smartlead_campaign_id) return { ok: false, reason: "Already enrolled in a Smartlead campaign." };
  return { ok: true };
}
