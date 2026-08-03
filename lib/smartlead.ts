// lib/smartlead.ts
// Server-only Smartlead outbound API client. NEVER import this from a
// "use client" component — SMARTLEAD_API_KEY must not reach the browser.
//
// Every endpoint/field here is taken from Smartlead's published API docs
// (api.smartlead.ai/reference/*, helpcenter.smartlead.ai) — verified before
// writing this file, not guessed. Where the docs don't enumerate a response
// shape (message-history, lead-statistics), the client returns the raw JSON
// unshaped rather than asserting fields that aren't actually documented.

const BASE_URL = "https://server.smartlead.ai/api/v1";

export class SmartleadNotConfiguredError extends Error {
  constructor() {
    super("SMARTLEAD_API_KEY is not set");
    this.name = "SmartleadNotConfiguredError";
  }
}

function getApiKey(): string {
  const key = process.env.SMARTLEAD_API_KEY;
  if (!key) throw new SmartleadNotConfiguredError();
  return key;
}

async function smartleadFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = getApiKey();
  const url = new URL(BASE_URL + path);
  url.searchParams.set("api_key", apiKey);
  return fetch(url.toString(), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

export interface SmartleadCampaign {
  id: number;
  name: string;
  status: "ACTIVE" | "PAUSED" | "STOPPED" | "ARCHIVED" | "DRAFTED";
  client_id: number | null;
}

export async function listCampaigns(): Promise<SmartleadCampaign[]> {
  const res = await smartleadFetch("/campaigns/");
  if (!res.ok) throw new Error(`Smartlead listCampaigns failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as SmartleadCampaign[];
  return data;
}

export interface AddLeadsToCampaignLead {
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  company_name?: string;
  website?: string;
  location?: string;
}

export interface AddLeadsToCampaignResult {
  success: boolean;
  message: string;
  added_count: number;
  skipped_count: number;
  skipped_leads: unknown[];
}

export async function addLeadsToCampaign(
  campaignId: number,
  leads: AddLeadsToCampaignLead[]
): Promise<AddLeadsToCampaignResult> {
  const res = await smartleadFetch(`/campaigns/${campaignId}/leads`, {
    method: "POST",
    body: JSON.stringify({
      lead_list: leads,
      settings: {
        ignore_global_block_list: false,
        ignore_unsubscribe_list: false,
        // Our own canEnrollInOutreach check (lib/leadsPipeline.ts) is the
        // primary duplicate-enrollment defense. Keep Smartlead's own dedupe
        // active (false, not ignored) so a duplicate is visible in
        // `skipped_leads` rather than silently swallowed.
        ignore_duplicate_leads_in_other_campaign: false,
        ignore_community_bounce_list: false,
      },
    }),
  });
  if (!res.ok) throw new Error(`Smartlead addLeadsToCampaign failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as AddLeadsToCampaignResult;
}

// The add-leads response never includes a Smartlead-side lead id, so this
// best-effort lookup is used to fill `leads.smartlead_lead_id` afterward.
// Callers must NOT treat a failure here as an enrollment failure — the
// campaign_id-based enrolled-check in lib/leadsPipeline.ts is authoritative.
export async function findLeadIdByEmail(email: string): Promise<number | null> {
  const res = await smartleadFetch(`/leads/?email=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: number } | { id?: number }[] | null;
  if (!data) return null;
  const record = Array.isArray(data) ? data[0] : data;
  return record?.id ?? null;
}

// Response shape is not documented — returned as opaque JSON. Callers should
// render defensively (e.g. a raw transcript view) rather than assume fields.
export async function getMessageHistory(campaignId: number, leadId: number): Promise<unknown> {
  const res = await smartleadFetch(`/campaigns/${campaignId}/leads/${leadId}/message-history`);
  if (!res.ok) throw new Error(`Smartlead getMessageHistory failed: ${res.status} ${await res.text()}`);
  return res.json();
}
