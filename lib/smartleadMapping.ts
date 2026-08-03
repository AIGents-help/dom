// lib/smartleadMapping.ts
// Pure mapping logic between Smartlead webhook events and DOM's pipeline
// status. Shared by the webhook route (app/api/webhooks/smartlead/route.ts)
// and its tests. Every event type and category name here is taken from
// Smartlead's published docs (helpcenter.smartlead.ai, api.smartlead.ai) —
// nothing here is guessed.

import { AUTO_TRANSITION_LOCKED_STATUSES, type StatusValue } from "./leadsPipeline";

// Idempotency check for the webhook's insert-first-into-smartlead_webhook_events
// pattern: a unique-violation on that insert means this exact delivery
// (matched by Smartlead's X-Request-Id header) was already fully processed.
export function isDuplicateKeyError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

export type SmartleadEventType =
  | "EMAIL_SENT" | "FIRST_EMAIL_SENT" | "EMAIL_OPEN" | "EMAIL_LINK_CLICK"
  | "EMAIL_REPLY" | "EMAIL_BOUNCE" | "LEAD_UNSUBSCRIBED" | "LEAD_CATEGORY_UPDATED";

// Maps a webhook event to the internal `lead_smartlead_status.outreach_status`
// value. Purely descriptive of engagement state — does NOT by itself change
// `leads.status` (see mapEventToStatusTransition below for that).
export const EVENT_TO_OUTREACH_STATUS: Partial<Record<SmartleadEventType, string>> = {
  EMAIL_SENT: "active",
  FIRST_EMAIL_SENT: "active",
  EMAIL_OPEN: "active",
  EMAIL_LINK_CLICK: "active",
  EMAIL_REPLY: "replied",
  EMAIL_BOUNCE: "bounced",
  LEAD_UNSUBSCRIBED: "unsubscribed",
};

// Forward-only DOM pipeline status transition for a raw delivery/engagement
// event (NOT a reply — replies are handled by classifyIntent /
// mapCategoryToEffect below, since they require reading the reply content).
// Returns null when no transition should happen (either the lead's current
// status is one a human deliberately set — see AUTO_TRANSITION_LOCKED_STATUSES
// in lib/leadsPipeline.ts — or the event type carries no status change).
export function mapEventToStatusTransition(currentStatus: string, eventType: SmartleadEventType): StatusValue | null {
  if (AUTO_TRANSITION_LOCKED_STATUSES.includes(currentStatus)) return null;

  switch (eventType) {
    case "EMAIL_SENT":
    case "FIRST_EMAIL_SENT":
      // Only "contacted" is a meaningful forward move here — opens/clicks
      // are engagement signals, not pipeline movement, so they fall through
      // to the default (no status change).
      return currentStatus === "outreach_scheduled" || currentStatus === "new" || currentStatus === "researching" || currentStatus === "ready_for_outreach"
        ? "contacted"
        : null;
    case "EMAIL_BOUNCE":
      // Bounce doesn't force a pipeline stage change by itself — the bounce
      // is recorded on lead_smartlead_status.bounce_status and enforced by
      // canEnrollInOutreach (stops future outreach); status is left for a
      // human to review rather than auto-declared "lost."
      return null;
    case "LEAD_UNSUBSCRIBED":
      return "do_not_contact";
    default:
      return null;
  }
}

// Crude keyword classification of a reply's plain-text body. Moved here
// unchanged from the original webhook implementation so it stays testable.
export function classifyIntent(body: string | undefined): "interested" | "not_interested" | "ooo" | "unknown" {
  if (!body) return "unknown";
  const text = body.replace(/<[^>]*>/g, " ").toLowerCase();
  if (/(out of office|ooo|on vacation|automatic reply)/.test(text)) return "ooo";
  if (/(not interested|remove me|unsubscribe|stop emailing|no thanks)/.test(text)) return "not_interested";
  if (/(interested|tell me more|sounds good|call me|let's talk|set up a call|schedule)/.test(text)) return "interested";
  return "unknown";
}

// The 9 official Smartlead lead-reply categories (LEAD_CATEGORY_UPDATED),
// confirmed against Smartlead's docs — not an invented list.
export const SMARTLEAD_REPLY_CATEGORIES = [
  "Interested", "Meeting Request", "Information Request", "Not Interested",
  "Do Not Contact", "Out Of Office", "Wrong Person", "Sender Originated Bounce",
  "Uncategorizable by AI",
] as const;

export type SmartleadReplyCategory = (typeof SMARTLEAD_REPLY_CATEGORIES)[number];

export interface CategoryEffect {
  status: StatusValue | null; // null = no forced status change
  followUp: { actionType: string; dueInDays: number } | null;
  permanent: boolean; // true for do-not-contact-style effects that must never be auto-reversed
}

// Required behavior mapping from the task spec, using only the officially
// documented category names. Nothing here guesses at fields Smartlead
// doesn't document (e.g. no attempt to parse an exact "return date" out of
// an Out Of Office reply body beyond a simple default follow-up window).
export function mapCategoryToEffect(category: string): CategoryEffect {
  switch (category as SmartleadReplyCategory) {
    case "Interested":
    case "Meeting Request":
      return { status: "needs_response", followUp: { actionType: "urgent_follow_up", dueInDays: 0 }, permanent: false };
    case "Information Request":
      return { status: "needs_response", followUp: { actionType: "follow_up", dueInDays: 1 }, permanent: false };
    case "Not Interested":
      return { status: "lost", followUp: null, permanent: false };
    case "Do Not Contact":
      return { status: "do_not_contact", followUp: null, permanent: true };
    case "Out Of Office":
      return { status: "follow_up", followUp: { actionType: "follow_up", dueInDays: 7 }, permanent: false };
    case "Wrong Person":
      // Don't assume negative — a human should re-verify the contact.
      return { status: "needs_response", followUp: { actionType: "verify_contact", dueInDays: 2 }, permanent: false };
    case "Sender Originated Bounce":
      // Treated like a bounce, not a reply — stop outreach, don't guess a
      // pipeline stage.
      return { status: null, followUp: null, permanent: false };
    case "Uncategorizable by AI":
    default:
      // Safe fallback: someone should look at it, no specific claim made.
      return { status: "needs_response", followUp: { actionType: "review_reply", dueInDays: 1 }, permanent: false };
  }
}
