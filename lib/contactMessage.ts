export const CONTACT_CATEGORIES = [
  "general_inquiry",
  "partnership_opportunity",
  "thank_you_feedback",
  "website_feedback",
  "billing",
  "other",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export interface ContactMessageInput {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  category: ContactCategory;
  subject: string;
  message: string;
}

export type ContactMessageParseResult =
  | { ok: true; value: ContactMessageInput }
  | { ok: false; error: string };

const categorySet = new Set<string>(CONTACT_CATEGORIES);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function isContactHoneypotFilled(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return text((body as Record<string, unknown>).website, 1).length > 0;
}

export function parseContactMessage(body: unknown): ContactMessageParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Please complete all required fields." };
  }

  const input = body as Record<string, unknown>;
  const name = text(input.name, 120);
  const email = text(input.email, 320).toLowerCase();
  const phone = text(input.phone, 60) || null;
  const company = text(input.company, 160) || null;
  const category = text(input.category ?? "general_inquiry", 64);
  const subject = text(input.subject, 180);
  const message = text(input.message, 10_000);

  if (!name || !subject || !message || !emailPattern.test(email) || !categorySet.has(category)) {
    return { ok: false, error: "Please complete all required fields with a valid email address." };
  }

  return {
    ok: true,
    value: { name, email, phone, company, category: category as ContactCategory, subject, message },
  };
}
