# DOM Leads Sales Workspace

Operational sales cockpit for `/admin/leads`: discovery → research → outreach
→ reply → follow-up → proposal → won, with a real (optional) Smartlead
outbound integration on top of the existing inbound webhook.

## Architecture

- `components/LeadsWorkspace.tsx` — orchestrator. Loads all data via the
  browser Supabase client (session-gated, same pattern as the rest of the
  admin UI), owns filter/view state, renders the summary strip, saved-view
  pills, filter bar, card list, and the detail drawer.
- `components/leads/SummaryStrip.tsx`, `LeadCard.tsx`, `PriorityBadge.tsx`,
  `DuplicateWarning.tsx`, `LeadDetailDrawer.tsx` — presentational pieces,
  receive data/handlers as props from the orchestrator.
- `lib/leadsPipeline.ts` — all pure logic: pipeline stages, saved views,
  filters, lead scoring, duplicate detection, outreach-eligibility guard.
  Framework-free, unit tested.
- `lib/smartleadMapping.ts` — pure Smartlead event/category → DOM status
  mapping, shared by the webhook route and its tests.
- `lib/smartlead.ts` — server-only outbound Smartlead API client. Never
  import this from a `"use client"` file.
- `app/api/webhooks/smartlead/route.ts` — inbound webhook (existing
  `prospects`/`outreach_events`/reply-creates-lead logic is untouched;
  extended with idempotency, per-lead engagement sync, and category-based
  status transitions).
- `app/api/admin/leads/[id]/smartlead-enroll/route.ts` — real outbound
  enrollment (admin-gated).
- `app/api/admin/leads/campaigns/route.ts` — campaign list for the picker.

## Pipeline stages

13 stages (`leads.status`, DB-enforced via `CHECK` constraint):

`new, researching, ready_for_outreach, outreach_scheduled, contacted, needs_response, follow_up, qualified, proposal, won, no_response, lost, do_not_contact`

Legacy → new mapping (applied once by
`supabase/migrations/20260803004800_leads_pipeline_status_migration.sql`,
also kept in `lib/leadsPipeline.ts`'s `LEGACY_STATUS_MAP` so any lead that
somehow still carries a legacy value still renders correctly):

| Legacy | New |
|---|---|
| cold | new |
| contacted | contacted |
| qualified | qualified |
| quoted | proposal |
| scheduled | outreach_scheduled |
| customer | won |
| lost | lost |

`won` triggers client conversion (creates a `clients` row linked via
`clients.lead_id`, guarded against duplicates — see Conversion below).

## Saved views

`All Leads, Contact Today, Needs Response, Overdue, High Priority, No Activity, Positive Replies, Opened — No Reply, Campaign Active, Sequence Finished, Proposals, Bounced, Unsubscribed`

Implemented in `matchesSavedView()` (`lib/leadsPipeline.ts`), unit tested for
all 13. The summary strip's 6 KPI tiles are shortcuts into a subset of these
— not a separate filtering system.

The old `direct`/`subcontract`/`partner` engagement-type views and the
`DJI Restricted` compliance flag aren't pipeline stages, so they didn't move
into the 13 saved views — they're a small "Type" segmented control + a
standalone DJI toggle chip, in a row under the saved-view pills.

## Lead scoring

Computed live (not persisted) by `scoreLead()` — additive rubric over
industry fit, engagement/ownership fit, estimated value, contact
completeness, engagement signal (opens/clicks capped at +1 total, so opens
alone can never push a lead to "high"), positive reply (+3), and next-action
urgency. `high_priority` is a rubric result, not an AI confidence score —
every card shows the reason list on hover. `leads.priority_override`
(`high`/`medium`/`low`, nullable) always wins when a human sets it, labeled
"manual" in the UI.

## Database migrations

Three files in `supabase/migrations/`, **authored only — not applied**. This
environment has no linked Supabase project or credentials; apply them via
the Supabase dashboard SQL editor or `supabase db push` from a machine that
does, same as the one pre-existing tracked migration.

1. `20260803004800_leads_pipeline_status_migration.sql` — the status
   remap (table above) + `CHECK` constraint. The only migration that
   rewrites existing data; isolated so it can be reviewed independently.
2. `20260803004900_add_lead_pipeline_tables.sql` — `lead_next_actions`,
   `lead_smartlead_status`, `smartlead_webhook_events`, a generic
   `set_updated_at()` trigger (first `updated_at` precedent in this repo),
   indexes, RLS (permissive on the first two tables, matching the apparent
   posture of sibling lead tables; **no policies** on
   `smartlead_webhook_events`, which only the service-role webhook writes to
   — review both against the live policies before applying, since none are
   versioned anywhere in this repo to copy exactly), and an idempotent
   backfill of `lead_next_actions` from the legacy `leads.next_action` /
   `next_follow_up_at` columns (which are kept, not dropped).
3. `20260803005000_add_leads_priority_and_clients_lead_link.sql` —
   `leads.priority_override`, `clients.lead_id` + index.

No generated TypeScript types exist in this repo (interfaces are hand-written
inline, matching the existing convention) — the new tables' shapes live as
`Lead`, `LeadNextAction`, `LeadSmartleadStatus` in `lib/leadsPipeline.ts`.

## Smartlead integration

**The whole workspace works normally with zero Smartlead configuration.**
Outreach actions show a "Smartlead not configured" state instead of an
error; nothing else is blocked.

Environment variables:

- `SMARTLEAD_WEBHOOK_SECRET` — inbound webhook HMAC signing secret (existed
  before this build).
- `SMARTLEAD_API_KEY` — outbound API key (`lib/smartlead.ts`). Server-only,
  never exposed via `NEXT_PUBLIC_*`. New in this build; add it to
  `.env.local` to enable campaign listing + enrollment.

Webhook endpoint (unchanged URL): `POST /api/webhooks/smartlead`. Configure
this in the Smartlead dashboard's webhook settings, subscribed to at least
`EMAIL_SENT, FIRST_EMAIL_SENT, EMAIL_OPEN, EMAIL_LINK_CLICK, EMAIL_REPLY, EMAIL_BOUNCE, LEAD_UNSUBSCRIBED, LEAD_CATEGORY_UPDATED`.
Every real delivery includes an `X-Request-Id` header (per Smartlead's docs)
— the route inserts it into `smartlead_webhook_events` **before** any other
write; a unique-constraint conflict means "already processed," and the route
returns `200 {ok:true, duplicate:true}` without re-running any mutation.

Event/category → DOM mapping (`lib/smartleadMapping.ts`):

| Smartlead event | Effect |
|---|---|
| Added to campaign (enroll succeeds) | `outreach_scheduled` |
| `EMAIL_SENT` / `FIRST_EMAIL_SENT` | `contacted` (only from a pre-outreach status) |
| `EMAIL_OPEN` / `EMAIL_LINK_CLICK` | engagement counters only, no status change |
| `EMAIL_BOUNCE` | `bounce_status` set, outreach blocked — no forced pipeline stage |
| `LEAD_UNSUBSCRIBED` | `do_not_contact`, permanent |
| Category: Interested / Meeting Request | `needs_response` + urgent (due-now) next action |
| Category: Information Request | `needs_response` + next-day follow-up |
| Category: Not Interested | `lost` |
| Category: Do Not Contact | `do_not_contact`, permanent (overrides any lock) |
| Category: Out Of Office | `follow_up` + 7-day follow-up (no return-date parsing — not documented) |
| Category: Wrong Person | `needs_response` (never assumed negative) |
| Category: Sender Originated Bounce | treated like a bounce, no forced status |
| Category: Uncategorizable by AI | `needs_response` fallback, no invented specifics |

Automated transitions never overwrite a status a human deliberately set
(`won`, `lost`, `do_not_contact`, `proposal`, `qualified`, `follow_up` —
`AUTO_TRANSITION_LOCKED_STATUSES`), **except** the permanent Do Not Contact
effect, which always applies.

**Sync model: webhook-driven + manual, no polling cron.** Smartlead's
per-lead statistics endpoint (`GET /campaigns/{id}/leads-statistics`) exists
but its response field shape isn't documented anywhere publicly available —
rather than guess field names, engagement state comes entirely from the
real-time, fully-documented webhook. `lib/smartlead.ts`'s
`getMessageHistory()` is available for an on-demand "pull the full thread"
action from the Outreach tab.

Enrollment (`POST /api/admin/leads/[id]/smartlead-enroll`, body
`{campaign_id}`) is gated by `canEnrollInOutreach()` — blocks
`do_not_contact`, unsubscribed, bounced, invalid-email, and already-enrolled
leads (`leads.smartlead_campaign_id` is the enrolled signal, set
unconditionally once Smartlead's `added_count >= 1`; the numeric
`smartlead_lead_id` is a best-effort follow-up lookup and may stay null even
on a real success — never used to gate re-enrollment). `ignore_duplicate_leads_in_other_campaign`
is left `false` on the Smartlead call so a Smartlead-side duplicate is
visible in the response rather than silently swallowed.

## Duplicate protection

`findLikelyDuplicates()` (normalized email, company+email-domain,
company+contact-name) — warns, never auto-merges. Wired into Add Lead and
into lead→client conversion.

## Conversion

`convertLead()` guards against duplicate client creation three ways: a
client already linked via `clients.lead_id` (re-click protection), an
existing client matching by normalized email (offers to link instead of
duplicating), and the general duplicate warning shown in the drawer's
Convert tab before the button is pressed. The lead row is never deleted —
full activity/note history stays attached after conversion.

## Local testing

First test infra in this repo: `vitest` (`npm test`). Covers all pure logic
in `lib/leadsPipeline.ts` and `lib/smartleadMapping.ts` — saved views,
filters, due/overdue, the legacy status mapping table, scoring, duplicate
detection, the outreach-eligibility guard, the event/category transition
tables, webhook idempotency-check logic, and the missing-credentials error
path. Also run `npx tsc --noEmit`, `npm run build`.

**Not automated:** mobile-layout overflow. `/admin/leads` requires a real
Supabase Auth session (email/password + `admin_users` allowlist), so
scripting it means provisioning a dedicated test credential — new setup
surface, not a quick add. Verified manually via dev server + responsive
DevTools instead. If that credential ever gets provisioned, the low-cost
addition is a single `document.documentElement.scrollWidth` check at 375px.

## Deployment

1. Apply the three migrations above (dashboard SQL editor or `supabase db push`).
2. Set `SMARTLEAD_API_KEY` (optional — workspace works without it).
3. In the Smartlead dashboard, point a webhook at
   `https://<your-domain>/api/webhooks/smartlead` with the events listed
   above, and set `SMARTLEAD_WEBHOOK_SECRET` to match its signing secret.
4. `npm run build && npm start` (or deploy to Vercel as usual).

## Known limitations

- **No Files/attachments system.** None exists anywhere in this repo (no
  Storage bucket convention) — the drawer's "Files and Notes" section is
  just Notes (reusing the existing polymorphic `notes` table). Not invented
  here to avoid a second, incompatible storage system.
- **Email drift.** Inbound webhook events are matched to a `leads` row by
  email. If a lead's email is edited after Smartlead enrollment, future
  webhook events for that outreach stop linking to it. Rare; not solved in
  code (would need an enrollment-time email snapshot).
- **`LEAD_CATEGORY_UPDATED`'s exact category field name** isn't fully
  documented in what's publicly available for this payload — the webhook
  checks a few plausible field names (`category`, `lead_category`,
  `new_category`) defensively and logs (without crashing) if none are
  present, rather than asserting one and silently dropping real events.
- **RLS policies on the new tables are a best-effort match**, not a verified
  copy — no RLS is versioned anywhere in this repo to copy exactly. Review
  against the live policies before applying the migration.
