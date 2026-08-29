"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { inputCls, labelCls, Section, Empty, ActionBtn } from "@/components/adminUi";
import {
  type Lead, type LeadNextAction, type LeadSmartleadStatus, type LeadContext, type StatusValue,
  type SavedViewKey, type OpportunityType, type LeadSortKey,
  STATUS_OPTIONS, SAVED_VIEWS, TIER_LABELS, INDUSTRY_OPTIONS, ENGAGEMENT_MODEL_OPTIONS, OWNERSHIP_OPTIONS,
  VERTICAL_OPTIONS, CONTACT_METHOD_OPTIONS, TIER_OPTIONS, ACTIVITY_TYPE_LABELS,
  OUTREACH_READY_STATUSES,
  matchesSavedView, matchesFilters, matchesOpportunityType, isDjiRestricted, isValidEmail,
  findLikelyDuplicates, compareLeadsForSort,
} from "@/lib/leadsPipeline";
import SummaryStrip from "@/components/leads/SummaryStrip";
import LeadCard from "@/components/leads/LeadCard";
import LeadDetailDrawer, { type DrawerTab } from "@/components/leads/LeadDetailDrawer";
import DuplicateWarning from "@/components/leads/DuplicateWarning";

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
interface SmartleadCampaign { id: number; name: string; status: string; }

const emptyLeadForm = {
  name: "", email: "", company: "", phone: "", address: "", source: "", message: "",
  tier: [] as string[], vertical: "", preferred_contact_method: "", next_follow_up_at: "",
  industry: "", engagement_model: "", opportunity_ownership: "unknown", status: "new" as StatusValue, next_action: "",
};

const emptyActivityDraft = { activity_type: "call", summary: "", amount: "", occurred_at: "" };
const emptyContactDraft = { name: "", email: "", phone: "", title: "" };
const emptyLocationDraft = { label: "", address: "", notes: "" };
const emptyRelationshipDraft = { related_lead_id: "", relationship_type: "affiliated" };
const emptyNextActionDraft = { action_type: "", due_at: "", notes: "" };
const emptyEditDraft = { name: "", company: "", email: "", phone: "", address: "", source: "", message: "" };

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
  const [nextActions, setNextActions] = useState<LeadNextAction[]>([]);
  const [smartleadStatuses, setSmartleadStatuses] = useState<LeadSmartleadStatus[]>([]);

  const [campaigns, setCampaigns] = useState<SmartleadCampaign[]>([]);
  const [smartleadConfigured, setSmartleadConfigured] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyEditDraft);

  const [activityDraft, setActivityDraft] = useState<Record<string, typeof emptyActivityDraft>>({});
  const [nextActionDraft, setNextActionDraft] = useState<Record<string, typeof emptyNextActionDraft>>({});

  const [sortKey, setSortKey] = useState<LeadSortKey>("company");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [contactDraft, setContactDraft] = useState<Record<string, typeof emptyContactDraft>>({});
  const [locationDraft, setLocationDraft] = useState<Record<string, typeof emptyLocationDraft>>({});
  const [relationshipDraft, setRelationshipDraft] = useState<Record<string, typeof emptyRelationshipDraft>>({});

  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [busy, setBusy] = useState<string | null>(null);

  // Interaction Log and Contacts/Branches/Related Companies are collapsed by
  // default and reset every time a (possibly different) lead's drawer opens —
  // deliberately not keyed by lead id, since only one lead's drawer is ever
  // open at a time.
  const [interactionLogOpen, setInteractionLogOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  useEffect(() => {
    setInteractionLogOpen(false);
    setContactsOpen(false);
  }, [openLeadId]);

  const [showAddLead, setShowAddLead] = useState(false);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [leadForm, setLeadForm] = useState(emptyLeadForm);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterEngagement, setFilterEngagement] = useState("");
  const [filterOwnership, setFilterOwnership] = useState("");
  const [filterOpportunityType, setFilterOpportunityType] = useState<OpportunityType>("");
  const [filterDjiOnly, setFilterDjiOnly] = useState(false);
  const [activeView, setActiveView] = useState<SavedViewKey>("all");

  const [quickNoteDraft, setQuickNoteDraft] = useState<Record<string, string>>({});
  const [smartleadMessages, setSmartleadMessages] = useState<Record<string, string>>({});

  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" }[]>([]);
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const [leadsRes, notesRes, contactsRes, locationsRes, relationshipsRes, activitiesRes, nextActionsRes, smartleadRes] = await Promise.all([
      sb.from("leads").select("*").order("created_at", { ascending: false }),
      sb.from("notes").select("*").eq("entity_type", "lead").order("created_at", { ascending: false }),
      sb.from("lead_contacts").select("*").order("is_primary", { ascending: false }),
      sb.from("lead_locations").select("*").order("created_at", { ascending: true }),
      sb.from("lead_relationships").select("*").order("created_at", { ascending: true }),
      sb.from("lead_activities").select("*").order("occurred_at", { ascending: false }),
      sb.from("lead_next_actions").select("*").order("due_at", { ascending: true }),
      sb.from("lead_smartlead_status").select("*"),
    ]);
    const leadRows = (leadsRes.data as Lead[]) ?? [];
    setLeads(leadRows);
    setNotes((notesRes.data as NoteRow[]) ?? []);
    setContacts((contactsRes.data as LeadContact[]) ?? []);
    setLocations((locationsRes.data as LeadLocation[]) ?? []);
    setRelationships((relationshipsRes.data as LeadRelationship[]) ?? []);
    setActivities((activitiesRes.data as LeadActivity[]) ?? []);
    setNextActions((nextActionsRes.data as LeadNextAction[]) ?? []);
    setSmartleadStatuses((smartleadRes.data as LeadSmartleadStatus[]) ?? []);

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

      try {
        const res = await fetch("/api/admin/leads/campaigns", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const body = await res.json();
        setSmartleadConfigured(!!body.configured);
        setCampaigns(body.campaigns ?? []);
      } catch {
        // Campaign list is a nice-to-have for the enrollment picker — a
        // failure here just leaves it empty; it doesn't block the workspace.
      }
    })();
  }, [router, load]);

  // Deep-link support: a note or dashboard stat card can send us here with
  // ?lead=<id> and we'll open that lead's drawer once leads have loaded.
  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (leadId && leads.some((l) => l.id === leadId)) {
      setOpenLeadId(leadId);
      setDrawerTab("overview");
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
    if (error) { showToast(`Couldn't save: ${error.message}`, "error"); return; }
    await load();
  }

  async function uploadLeadLogo(lead:Lead,file:File){setBusy(lead.id);const sb=getSupabaseBrowser();const{data}=await sb.auth.getSession();const form=new FormData();form.set("logo",file);const res=await fetch(`/api/admin/leads/${lead.id}/logo`,{method:"POST",headers:{Authorization:`Bearer ${data.session?.access_token??""}`},body:form});const body=await res.json();setBusy(null);if(!res.ok){showToast(body.error??"Logo upload failed.","error");return}showToast("Profile logo updated.");await load()}

  async function setLeadBooleanField(lead: Lead, field: keyof Lead, value: boolean | null) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ [field]: value }).eq("id", lead.id);
    setBusy(null);
    if (error) { showToast(`Couldn't save: ${error.message}`, "error"); return; }
    await load();
  }

  async function setLeadNumberField(lead: Lead, field: keyof Lead, value: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const parsed = value.trim() === "" ? null : parseFloat(value);
    const { error } = await sb.from("leads").update({ [field]: Number.isNaN(parsed) ? null : parsed }).eq("id", lead.id);
    setBusy(null);
    if (error) { showToast(`Couldn't save: ${error.message}`, "error"); return; }
    await load();
  }

  async function toggleLeadTier(lead: Lead, tierValue: string) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const currentTiers = lead.tier ?? [];
    const nextTiers = currentTiers.includes(tierValue) ? currentTiers.filter((t) => t !== tierValue) : [...currentTiers, tierValue];
    const { error } = await sb.from("leads").update({ tier: nextTiers }).eq("id", lead.id);
    if (error) { showToast(`Couldn't save tier: ${error.message}`, "error"); setBusy(null); return; }
    await logActivity(lead.id, "other", `Tier ${currentTiers.includes(tierValue) ? "removed" : "added"}: ${TIER_LABELS[tierValue] ?? tierValue}`);
    await load();
    setBusy(null);
  }

  async function setPriorityOverride(lead: Lead, value: "high" | "medium" | "low" | null) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ priority_override: value }).eq("id", lead.id);
    setBusy(null);
    if (error) { showToast(`Couldn't save priority: ${error.message}`, "error"); return; }
    await load();
  }

  function startEditLead(lead: Lead) {
    setEditingLeadId(lead.id);
    setEditDraft({
      name: lead.name ?? "", company: lead.company ?? "", email: lead.email ?? "",
      phone: lead.phone ?? "", address: lead.address ?? "", source: lead.source ?? "", message: lead.message ?? "",
    });
  }

  async function saveEditLead(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({
      name: editDraft.name || null, company: editDraft.company || null, email: editDraft.email || null,
      phone: editDraft.phone || null, address: editDraft.address || null, source: editDraft.source || null,
      message: editDraft.message || null,
    }).eq("id", lead.id);
    setBusy(null);
    if (error) { showToast(error.message, "error"); return; }
    setEditingLeadId(null);
    await load();
  }

  async function setLeadStatus(lead: Lead, status: StatusValue) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ status }).eq("id", lead.id);
    if (error) { showToast(`Couldn't update status: ${error.message}`, "error"); setBusy(null); return; }
    await logActivity(lead.id, "status_change", `Status changed to "${status}"`);
    await load();
    setBusy(null);
  }

  async function logContactNow(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ last_contacted_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { showToast(`Couldn't log contact: ${error.message}`, "error"); setBusy(null); return; }
    await logActivity(lead.id, "other", "Contact logged");
    await load();
    setBusy(null);
  }

  // Converting is the one place a duplicate customer record could get
  // created twice for the same lead. Guarded three ways: a client already
  // linked to this lead (re-click protection), an existing client matching
  // by normalized email (offer to link instead of duplicating), and the
  // general findLikelyDuplicates warning shown in the drawer's Convert tab
  // before the button is even pressed.
  async function convertLead(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();

    const { data: linked } = await sb.from("clients").select("id").eq("lead_id", lead.id).maybeSingle();
    if (linked) {
      showToast("This lead has already been converted to a client.", "error");
      setBusy(null);
      return;
    }

    if (lead.email) {
      const { data: existingByEmail } = await sb.from("clients").select("id, company_name").ilike("email", lead.email).maybeSingle();
      if (existingByEmail) {
        const proceed = window.confirm(
          `A client already exists with this email (${existingByEmail.company_name ?? lead.email}). Link this lead to that client instead of creating a duplicate?`
        );
        if (!proceed) { setBusy(null); return; }
        await sb.from("clients").update({ lead_id: lead.id }).eq("id", existingByEmail.id);
        await sb.from("leads").update({ status: "won" }).eq("id", lead.id);
        await logActivity(lead.id, "status_change", "Linked to existing client (status: Won)");
        showToast("Linked to existing client.");
        await load();
        setBusy(null);
        return;
      }
    }

    const { error } = await sb.from("clients").insert({
      company_name: lead.company ?? lead.name ?? "Unnamed",
      contact_name: lead.name,
      email: lead.email,
      phone: lead.phone,
      industry: lead.industry,
      lead_id: lead.id,
    });
    if (error) { showToast(error.message, "error"); setBusy(null); return; }
    await sb.from("leads").update({ status: "won" }).eq("id", lead.id);
    await logActivity(lead.id, "status_change", "Converted to client (status: Won)");
    showToast("Converted to client.");
    await load();
    setBusy(null);
  }

  function handleStatusChange(lead: Lead, newStatus: StatusValue) {
    if (newStatus === lead.status) return;
    if (newStatus === "won") convertLead(lead);
    else setLeadStatus(lead, newStatus);
  }

  // --- Smartlead-ready internal workflow -----------------------------------

  async function approveForOutreach(lead: Lead) {
    if (!isValidEmail(lead.email)) {
      showToast("This lead needs a valid email before it can be approved for outreach.", "error");
      return;
    }
    if (!OUTREACH_READY_STATUSES.includes(lead.status)) {
      showToast(`Leads with status "${STATUS_OPTIONS.find((s) => s.value === lead.status)?.label ?? lead.status}" aren't eligible for outreach approval.`, "error");
      return;
    }
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ outreach_approved_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { showToast(`Couldn't approve: ${error.message}`, "error"); setBusy(null); return; }
    await logActivity(lead.id, "other", "Approved for outreach");
    await load();
    setBusy(null);
  }

  async function pauseOutreach(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ outreach_paused_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { showToast(`Couldn't pause: ${error.message}`, "error"); setBusy(null); return; }
    const note = lead.smartlead_campaign_id
      ? "Outreach paused (internal). Smartlead campaign pause was NOT called — pausing mid-campaign requires the Smartlead dashboard."
      : "Outreach paused — this lead was never enrolled in Smartlead.";
    await logActivity(lead.id, "other", note);
    await load();
    setBusy(null);
  }

  async function markReplied(lead: Lead) {
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const preReplyStatuses = ["new", "researching", "ready_for_outreach", "outreach_scheduled", "contacted"];
    const nextStatus = preReplyStatuses.includes(lead.status) ? "needs_response" : lead.status;
    const { error } = await sb.from("leads").update({ status: nextStatus }).eq("id", lead.id);
    if (error) { showToast(`Couldn't update: ${error.message}`, "error"); setBusy(null); return; }
    await logActivity(lead.id, "email", "Marked as replied (manual entry, not from Smartlead webhook)");
    await load();
    setBusy(null);
  }

  async function createOpportunity(lead: Lead) {
    if ((lead.engagement_model ?? "unknown") === "unknown" || !lead.engagement_model) {
      showToast("Set an engagement model before creating an opportunity (Direct, Subcontracted, Joint, etc.).", "error");
      return;
    }
    if (!lead.opportunity_ownership || lead.opportunity_ownership === "unknown") {
      showToast("Set opportunity ownership (DOM-Owned, Partner-Owned, or Shared) before creating an opportunity.", "error");
      return;
    }
    setBusy(lead.id);
    const preQualifiedStatuses = ["new", "researching", "ready_for_outreach", "outreach_scheduled", "contacted", "needs_response", "follow_up"];
    const nextStatus = preQualifiedStatuses.includes(lead.status) ? "qualified" : lead.status;
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ status: nextStatus }).eq("id", lead.id);
    if (error) { showToast(`Couldn't update: ${error.message}`, "error"); setBusy(null); return; }
    await logActivity(lead.id, "other", `Marked as active opportunity (${lead.engagement_model} / ${lead.opportunity_ownership})`);
    await load();
    setBusy(null);
  }

  async function markDoNotContact(lead: Lead) {
    if (!window.confirm("Mark this lead Do Not Contact? This permanently blocks future outreach approval and Smartlead enrollment.")) return;
    setBusy(lead.id);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("leads").update({ status: "do_not_contact", outreach_paused_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { showToast(`Couldn't update: ${error.message}`, "error"); setBusy(null); return; }
    await logActivity(lead.id, "status_change", "Marked Do Not Contact");
    await load();
    setBusy(null);
  }

  async function addToSmartlead(lead: Lead) {
    if (!selectedCampaignId) { showToast("Pick a campaign first.", "error"); return; }
    setBusy(lead.id);
    setSmartleadMessages((s) => ({ ...s, [lead.id]: "Enrolling…" }));
    try {
      const sb = getSupabaseBrowser();
      const { data: session } = await sb.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`/api/admin/leads/${lead.id}/smartlead-enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ campaign_id: selectedCampaignId }),
      });
      const body = await res.json();
      if (body.configured === false) {
        setSmartleadMessages((s) => ({ ...s, [lead.id]: "Smartlead: Pending Configuration" }));
      } else if (res.ok && body.ok) {
        setSmartleadMessages((s) => ({ ...s, [lead.id]: "Enrolled" }));
        await logActivity(lead.id, "other", "Added to Smartlead campaign");
        showToast("Added to Smartlead campaign.");
        await load();
      } else {
        setSmartleadMessages((s) => ({ ...s, [lead.id]: `Failed: ${body.message ?? "unknown error"}` }));
        showToast(body.message ?? "Smartlead enrollment failed.", "error");
      }
    } catch {
      setSmartleadMessages((s) => ({ ...s, [lead.id]: "Failed: network error" }));
      showToast("Network error contacting Smartlead.", "error");
    } finally {
      setBusy(null);
    }
  }

  const addLeadDuplicates = useMemo(
    () => findLikelyDuplicates(leads, { email: leadForm.email, company: leadForm.company, name: leadForm.name }),
    [leads, leadForm.email, leadForm.company, leadForm.name]
  );

  async function addLead() {
    if (!leadForm.company.trim()) { showToast("Company is required.", "error"); return; }
    if (!leadForm.name.trim()) { showToast("Contact name is required.", "error"); return; }
    if (!leadForm.industry) { showToast("Industry is required.", "error"); return; }
    if (!leadForm.engagement_model) { showToast("Engagement model is required.", "error"); return; }
    if (!leadForm.opportunity_ownership) { showToast("Opportunity ownership is required.", "error"); return; }
    if (!leadForm.status) { showToast("Status is required.", "error"); return; }
    if (leadForm.status !== "won" && !leadForm.next_action.trim()) { showToast("Next action is required unless this is already an active client.", "error"); return; }
    if (addLeadDuplicates.length > 0) {
      const proceed = window.confirm(
        `This looks like it might be a duplicate of ${addLeadDuplicates.map((m) => m.lead.company ?? m.lead.name).join(", ")}. Add it anyway?`
      );
      if (!proceed) return;
    }

    setBusy("add-lead");
    const sb = getSupabaseBrowser();
    const { data: inserted, error } = await sb.from("leads").insert({
      name: leadForm.name || null, email: leadForm.email || null, company: leadForm.company || null,
      phone: leadForm.phone || null, address: leadForm.address || null, source: leadForm.source || null,
      message: leadForm.message || null, tier: leadForm.tier, vertical: leadForm.vertical || null,
      preferred_contact_method: leadForm.preferred_contact_method || null, next_follow_up_at: leadForm.next_follow_up_at || null,
      industry: leadForm.industry, engagement_model: leadForm.engagement_model, opportunity_ownership: leadForm.opportunity_ownership,
      status: leadForm.status, next_action: leadForm.next_action,
    }).select("id").single();
    if (error || !inserted) { showToast(error?.message ?? "Couldn't save lead.", "error"); setBusy(null); return; }

    if (leadForm.status === "won") {
      const { error: clientError } = await sb.from("clients").insert({
        lead_id: inserted.id, company_name: leadForm.company, contact_name: leadForm.name,
        email: leadForm.email || null, phone: leadForm.phone || null, industry: leadForm.industry || null,
      });
      if (clientError) { await sb.from("leads").delete().eq("id", inserted.id); showToast(clientError.message, "error"); setBusy(null); return; }
    } else if (leadForm.next_action.trim()) {
      await sb.from("lead_next_actions").insert({
        lead_id: inserted.id, action_type: leadForm.next_action, status: "open",
        due_at: leadForm.next_follow_up_at || null,
      });
    }

    setBusy(null);
    setLeadForm(emptyLeadForm);
    setShowAddLead(false);
    setShowMoreFields(false);
    showToast(leadForm.status === "won" ? "Active client added." : "Lead added.");
    await load();
  }

  async function addQuickNote(leadId: string) {
    const body = (quickNoteDraft[leadId] ?? "").trim();
    if (!body) return;
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { data: session } = await sb.auth.getSession();
    const { error } = await sb.from("notes").insert({ entity_type: "lead", entity_id: leadId, author: session.session?.user.email ?? null, body });
    setBusy(null);
    if (error) { showToast(error.message, "error"); return; }
    setQuickNoteDraft((d) => ({ ...d, [leadId]: "" }));
    await load();
  }

  async function addContact(leadId: string) {
    const draft = contactDraft[leadId];
    if (!draft || (!draft.name && !draft.email && !draft.phone)) {
      showToast("Add at least a name, email, or phone for this contact.", "error");
      return;
    }
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("lead_contacts").insert({ lead_id: leadId, name: draft.name || null, email: draft.email || null, phone: draft.phone || null, title: draft.title || null, is_primary: false });
    setBusy(null);
    if (error) { showToast(error.message, "error"); return; }
    setContactDraft((d) => ({ ...d, [leadId]: emptyContactDraft }));
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
      if (nextPrimary) await sb.from("lead_contacts").update({ is_primary: true }).eq("id", nextPrimary.id);
    }
    await load();
    setBusy(null);
  }

  async function addLocation(leadId: string) {
    const draft = locationDraft[leadId];
    if (!draft || !draft.label) {
      showToast('A branch/location needs at least a label (e.g. "HQ", "Newark Branch").', "error");
      return;
    }
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("lead_locations").insert({ lead_id: leadId, label: draft.label, address: draft.address || null, notes: draft.notes || null });
    setBusy(null);
    if (error) { showToast(error.message, "error"); return; }
    setLocationDraft((d) => ({ ...d, [leadId]: emptyLocationDraft }));
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
    if (!draft || !draft.related_lead_id) { showToast("Pick a lead to link to.", "error"); return; }
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("lead_relationships").insert({ lead_id: leadId, related_lead_id: draft.related_lead_id, relationship_type: draft.relationship_type || "affiliated" });
    setBusy(null);
    if (error) { showToast(error.message, "error"); return; }
    setRelationshipDraft((d) => ({ ...d, [leadId]: emptyRelationshipDraft }));
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
    if (!draft || !draft.summary) { showToast("Add a description for this interaction.", "error"); return; }
    setBusy(leadId);
    await logActivity(leadId, draft.activity_type || "other", draft.summary, draft.amount ? parseFloat(draft.amount) : null, draft.occurred_at ? new Date(draft.occurred_at).toISOString() : undefined);
    setBusy(null);
    setActivityDraft((d) => ({ ...d, [leadId]: emptyActivityDraft }));
    await load();
  }

  async function deleteActivity(activityId: string, leadId: string) {
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    await sb.from("lead_activities").delete().eq("id", activityId);
    await load();
    setBusy(null);
  }

  async function addNextAction(leadId: string) {
    const draft = nextActionDraft[leadId];
    if (!draft || !draft.action_type.trim()) { showToast("Add an action description.", "error"); return; }
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    const { error } = await sb.from("lead_next_actions").insert({
      lead_id: leadId, action_type: draft.action_type.trim(),
      due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null,
      notes: draft.notes || null, status: "open",
    });
    setBusy(null);
    if (error) { showToast(error.message, "error"); return; }
    setNextActionDraft((d) => ({ ...d, [leadId]: emptyNextActionDraft }));
    showToast("Next action scheduled.");
    await load();
  }

  async function completeNextAction(id: string, leadId: string) {
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    await sb.from("lead_next_actions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
    await load();
    setBusy(null);
  }

  async function cancelNextAction(id: string, leadId: string) {
    setBusy(leadId);
    const sb = getSupabaseBrowser();
    await sb.from("lead_next_actions").update({ status: "cancelled" }).eq("id", id);
    await load();
    setBusy(null);
  }

  function openDrawer(leadId: string, tab: DrawerTab = "overview") {
    setOpenLeadId(leadId);
    setDrawerTab(tab);
    setSelectedCampaignId(null);
    setEditingLeadId(null);
  }

  const contexts: LeadContext[] = useMemo(() => {
    return leads.map((lead) => {
      const leadOpenActions = nextActions
        .filter((n) => n.lead_id === lead.id && n.status === "open")
        .sort((a, b) => (a.due_at ?? "9999-99-99").localeCompare(b.due_at ?? "9999-99-99"));
      return {
        lead,
        openNextAction: leadOpenActions[0] ?? null,
        smartlead: smartleadStatuses.find((s) => s.lead_id === lead.id) ?? null,
        hasActivity: activities.some((a) => a.lead_id === lead.id),
      };
    });
  }, [leads, nextActions, smartleadStatuses, activities]);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return contexts
      .filter((ctx) => matchesSavedView(ctx, activeView, today))
      .filter((ctx) => matchesOpportunityType(ctx.lead, filterOpportunityType))
      .filter((ctx) => !filterDjiOnly || isDjiRestricted(ctx.lead))
      .filter((ctx) => matchesFilters(ctx.lead, { search, status: filterStatus, industry: filterIndustry, engagement: filterEngagement, ownership: filterOwnership }))
      .sort((a, b) => compareLeadsForSort(a.lead, b.lead, sortKey, sortDir));
  }, [contexts, activeView, filterOpportunityType, filterDjiOnly, search, filterStatus, filterIndustry, filterEngagement, filterOwnership, sortKey, sortDir, today]);

  if (loading) return <p className="text-muted">Loading CRM files…</p>;

  const anyFilterActive = !!(filterStatus || filterIndustry || filterEngagement || filterOwnership || search || filterOpportunityType || filterDjiOnly);

  // Deliberately not built on `inputCls` (which is `w-full`) — the filter
  // bar needs compact, independently-sized controls on one row, and mixing
  // a `w-full` base with width overrides here is what caused each control
  // to render at full container width and stack one-per-row.
  const filterInputCls =
    "min-w-[150px] flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent/60 focus:outline-none sm:w-52 sm:flex-none lg:w-56";
  const filterSelectCls =
    "min-w-[110px] flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent/60 focus:outline-none sm:w-32 sm:flex-none lg:w-32";

  const openLead = openLeadId ? leads.find((l) => l.id === openLeadId) ?? null : null;
  const openCtx = openLeadId ? contexts.find((c) => c.lead.id === openLeadId) ?? null : null;

  return (
    <div className="leads-mission-theme rounded-2xl border border-[#D8DEE8] bg-white p-6 text-[#0F172A] lg:p-8">
      <Section
        title="CRM Files"
        desc="Prospects and clients share one continuous customer record. Open a file to manage details, documents, contact history, and next actions."
        action={<ActionBtn onClick={() => setShowAddLead((s) => !s)}>{showAddLead ? "Cancel" : "+ Add CRM File"}</ActionBtn>}
      >
        <SummaryStrip contexts={contexts} today={today} activeView={activeView} onSelectView={setActiveView} />

        {/* Saved views — the 13 pipeline-stage views. Horizontal scroll on
            mobile (no wrap) keeps this from stacking into many rows on a
            small screen; wraps freely from sm: up where there's room. */}
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {SAVED_VIEWS.map((v) => {
            const count = contexts.filter((ctx) => matchesSavedView(ctx, v.key, today)).length;
            const active = activeView === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setActiveView(v.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface2 text-muted hover:text-ink"}`}
              >
                {v.label} <span className="text-muted">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Type + DJI-restricted — the old direct/subcontract/partner and
            DJI saved views, kept (not deleted) as a lighter secondary row so
            they don't crowd the 13 pipeline-stage pills above. */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Type</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {([
              { value: "", label: "All" }, { value: "direct", label: "Direct" },
              { value: "subcontract", label: "Subcontract" }, { value: "partner", label: "Partner" },
            ] as { value: OpportunityType; label: string }[]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterOpportunityType(opt.value)}
                className={`px-2.5 py-1 font-medium transition ${filterOpportunityType === opt.value ? "bg-accent/10 text-accent" : "bg-surface2 text-muted hover:text-ink"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFilterDjiOnly((v) => !v)}
            className={`rounded-full border px-3 py-1 font-medium transition ${filterDjiOnly ? "border-rose-500 bg-rose-500/10 text-rose-400" : "border-border bg-surface2 text-muted hover:text-ink"}`}
          >
            DJI Restricted only
          </button>
        </div>

        {showAddLead && (
          <div className="mb-4 rounded-lg border border-border bg-surface2 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Quick Add — company, contact, industry, engagement model, ownership, status, and next action are required.
            </p>
            <DuplicateWarning matches={addLeadDuplicates} />
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
                <select className={inputCls} value={leadForm.status} onChange={(e) => setLeadForm((f) => ({ ...f, status: e.target.value as StatusValue }))}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelCls}>Next action {leadForm.status === "won" ? "(optional for active clients)" : "*"}</label>
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
                  <label className={labelCls}>Vertical <span className="text-muted">(legacy)</span></label>
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
                  <label className={labelCls}>Tier <span className="text-muted">(a client can require more than one)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {TIER_OPTIONS.map((t) => {
                      const active = leadForm.tier.includes(t.value);
                      return (
                        <button key={t.value} type="button" onClick={() => setLeadForm((f) => ({ ...f, tier: active ? f.tier.filter((v) => v !== t.value) : [...f.tier, t.value] }))}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-muted hover:text-ink"}`}>
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
          <input className={filterInputCls} placeholder="Search company, contact, industry, status, location…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              className="text-xs text-muted underline"
              onClick={() => { setSearch(""); setFilterStatus(""); setFilterIndustry(""); setFilterEngagement(""); setFilterOwnership(""); setFilterOpportunityType(""); setFilterDjiOnly(false); }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Sort by — compact row directly below the filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Sort by</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["company", "name", "industry", "status", "priority", "newest"] as const).map((key) => (
              <button
                key={key}
                onClick={() => { if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("asc"); } }}
                className={`px-3 py-1.5 text-xs font-medium transition ${sortKey === key ? "bg-accent/10 text-accent" : "bg-surface2 text-muted hover:text-ink"}`}
              >
                {{company:"Company",name:"Contact",industry:"Industry",status:"Status",priority:"Priority",newest:"Newest"}[key]} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>
        </div>

        {leads.length === 0 && <Empty>No leads yet.</Empty>}
        {leads.length > 0 && filtered.length === 0 && <Empty>No leads match this view/filters.</Empty>}

        <div className="space-y-3">
          {filtered.map((ctx) => {
            const lead = ctx.lead;
            const leadActivities = activities.filter((a) => a.lead_id === lead.id);
            const lastActivity = leadActivities[0];
            const leadLocations = locations.filter((l) => l.lead_id === lead.id);
            const location = leadLocations[0]?.address ?? leadLocations[0]?.label ?? lead.address ?? null;
            return (
              <LeadCard
                key={lead.id}
                ctx={ctx}
                today={today}
                busy={busy === lead.id}
                smartleadConfigured={smartleadConfigured}
                lastActivitySummary={lastActivity ? `${ACTIVITY_TYPE_LABELS[lastActivity.activity_type] ?? lastActivity.activity_type}: ${lastActivity.summary} (${new Date(lastActivity.occurred_at).toLocaleDateString()})` : null}
                location={location}
                onOpen={(tab) => openDrawer(lead.id, tab)}
                onLogContactNow={() => logContactNow(lead)}
                onStatusChange={(status) => handleStatusChange(lead, status)}
                onAddToSmartlead={() => openDrawer(lead.id, "outreach")}
                onConvert={() => convertLead(lead)}
                onDoNotContact={() => markDoNotContact(lead)}
                onApproveForOutreach={() => approveForOutreach(lead)}
                onListingColorChange={(color) => setLeadField(lead,"listing_color",color)}
              />
            );
          })}
        </div>
      </Section>

      {openLead && openCtx && (
        <LeadDetailDrawer
          lead={openLead}
          ctx={openCtx}
          allLeads={leads}
          initialTab={drawerTab}
          busy={busy === openLead.id}
          onClose={() => setOpenLeadId(null)}
          editingLead={editingLeadId === openLead.id}
          editDraft={editDraft}
          setEditDraft={setEditDraft}
          onStartEdit={() => startEditLead(openLead)}
          onSaveEdit={() => saveEditLead(openLead)}
          onCancelEdit={() => setEditingLeadId(null)}
          onSetLeadField={(field, value) => setLeadField(openLead, field, value)}
          onSetLeadBooleanField={(field, value) => setLeadBooleanField(openLead, field, value)}
          onSetLeadNumberField={(field, value) => setLeadNumberField(openLead, field, value)}
          onToggleTier={(v) => toggleLeadTier(openLead, v)}
          onSetPriorityOverride={(v) => setPriorityOverride(openLead, v)}
          onStatusChange={(status) => handleStatusChange(openLead, status)}
          onLogContactNow={() => logContactNow(openLead)}
          nextActions={nextActions.filter((n) => n.lead_id === openLead.id)}
          nextActionDraft={nextActionDraft[openLead.id] ?? emptyNextActionDraft}
          setNextActionDraft={(update) => setNextActionDraft((d) => ({ ...d, [openLead.id]: typeof update === "function" ? update(d[openLead.id] ?? emptyNextActionDraft) : update }))}
          onAddNextAction={() => addNextAction(openLead.id)}
          onCompleteNextAction={(id) => completeNextAction(id, openLead.id)}
          onCancelNextAction={(id) => cancelNextAction(id, openLead.id)}
          activities={activities.filter((a) => a.lead_id === openLead.id)}
          interactionLogOpen={interactionLogOpen}
          setInteractionLogOpen={setInteractionLogOpen}
          activityDraft={activityDraft[openLead.id] ?? emptyActivityDraft}
          setActivityDraft={(update) => setActivityDraft((d) => ({ ...d, [openLead.id]: typeof update === "function" ? update(d[openLead.id] ?? emptyActivityDraft) : update }))}
          onAddActivity={() => addActivity(openLead.id)}
          onDeleteActivity={(id) => deleteActivity(id, openLead.id)}
          smartleadConfigured={smartleadConfigured}
          smartleadStatusMessage={smartleadMessages[openLead.id]}
          campaigns={campaigns}
          selectedCampaignId={selectedCampaignId}
          setSelectedCampaignId={setSelectedCampaignId}
          onApproveForOutreach={() => approveForOutreach(openLead)}
          onPauseOutreach={() => pauseOutreach(openLead)}
          onMarkReplied={() => markReplied(openLead)}
          onCreateOpportunity={() => createOpportunity(openLead)}
          onAddToSmartlead={() => addToSmartlead(openLead)}
          onMarkDoNotContact={() => markDoNotContact(openLead)}
          outreachEvents={openLead.external_prospect_id ? eventsByProspect[openLead.external_prospect_id] ?? [] : []}
          notes={notes.filter((n) => n.entity_id === openLead.id)}
          quickNoteDraft={quickNoteDraft[openLead.id] ?? ""}
          setQuickNoteDraft={(v) => setQuickNoteDraft((d) => ({ ...d, [openLead.id]: v }))}
          onAddQuickNote={() => addQuickNote(openLead.id)}
          contacts={contacts.filter((c) => c.lead_id === openLead.id)}
          contactDraft={contactDraft[openLead.id] ?? emptyContactDraft}
          setContactDraft={(update) => setContactDraft((d) => ({ ...d, [openLead.id]: typeof update === "function" ? update(d[openLead.id] ?? emptyContactDraft) : update }))}
          onAddContact={() => addContact(openLead.id)}
          onDeleteContact={deleteContact}
          locations={locations.filter((l) => l.lead_id === openLead.id)}
          locationDraft={locationDraft[openLead.id] ?? emptyLocationDraft}
          setLocationDraft={(update) => setLocationDraft((d) => ({ ...d, [openLead.id]: typeof update === "function" ? update(d[openLead.id] ?? emptyLocationDraft) : update }))}
          onAddLocation={() => addLocation(openLead.id)}
          onDeleteLocation={(id) => deleteLocation(id, openLead.id)}
          relationships={relationships.filter((r) => r.lead_id === openLead.id)}
          relationshipDraft={relationshipDraft[openLead.id] ?? emptyRelationshipDraft}
          setRelationshipDraft={(update) => setRelationshipDraft((d) => ({ ...d, [openLead.id]: typeof update === "function" ? update(d[openLead.id] ?? emptyRelationshipDraft) : update }))}
          onAddRelationship={() => addRelationship(openLead.id)}
          onDeleteRelationship={(id) => deleteRelationship(id, openLead.id)}
          contactsOpen={contactsOpen}
          setContactsOpen={setContactsOpen}
          onConvert={() => convertLead(openLead)}
          onUploadLogo={(file) => uploadLeadLogo(openLead,file)}
        />
      )}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg border px-4 py-2 text-sm shadow-lg ${t.type === "error" ? "border-rose-500 bg-rose-950 text-rose-200" : "border-emerald-500 bg-emerald-950 text-emerald-200"}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
