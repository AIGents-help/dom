export const ADMIN_MESSAGE_STATUSES = ["unread", "read", "in_progress", "replied", "closed", "archived"] as const;
export type AdminMessageStatus = (typeof ADMIN_MESSAGE_STATUSES)[number];
export interface AdminMessageUpdate { id: string; status: AdminMessageStatus; adminNote?: string | null }
export type AdminMessageUpdateResult = { ok: true; value: AdminMessageUpdate } | { ok: false; error: string };
const statusSet = new Set<string>(ADMIN_MESSAGE_STATUSES);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdminMessageUpdate(body: unknown): AdminMessageUpdateResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid message update." };
  const input = body as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const status = typeof input.status === "string" ? input.status : "";
  if (!uuidPattern.test(id) || !statusSet.has(status)) return { ok: false, error: "Invalid message update." };
  const value: AdminMessageUpdate = { id, status: status as AdminMessageStatus };
  if (input.adminNotes !== undefined) value.adminNote = typeof input.adminNotes === "string" ? input.adminNotes.trim().slice(0, 5_000) || null : null;
  return { ok: true, value };
}

export function adminMessageTimestamps(status: AdminMessageStatus, now: string) {
  const timestamps: Record<string, string> = {};
  if (status !== "unread") timestamps.read_at = now;
  if (status === "replied") timestamps.replied_at = now;
  if (status === "closed") timestamps.closed_at = now;
  if (status === "archived") timestamps.archived_at = now;
  return timestamps;
}
