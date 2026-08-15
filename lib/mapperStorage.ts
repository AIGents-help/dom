import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Server-only. Resolves a deliverable row to a short-lived download URL,
// branching on storage_provider so the Mapping UI/API never hard-code
// Supabase Storage -- adding a google_drive-backed deliverable later means
// filling in that branch here, not touching any component or route.
// Every non-happy path returns a generic, safe message for the browser
// plus a detailed `log` string for the caller to console.error server-side
// -- the service-role client and any provider error detail never reach
// the client.

export interface StorageBackedDeliverable {
  storage_url: string | null;
  storage_provider?: string | null;
  external_file_id?: string | null;
}

export type DownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message: string; log: string };

const SIGNED_URL_TTL_SECONDS = 300;

export async function getDeliverableDownloadUrl(d: StorageBackedDeliverable): Promise<DownloadUrlResult> {
  const provider = d.storage_provider ?? "supabase";

  if (provider === "google_drive") {
    return getGoogleDriveDownloadUrl(d);
  }
  return getSupabaseDownloadUrl(d);
}

async function getSupabaseDownloadUrl(d: StorageBackedDeliverable): Promise<DownloadUrlResult> {
  if (!d.storage_url) {
    return { ok: false, status: 422, message: "File unavailable.", log: "supabase-backed deliverable has no storage_url" };
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from("mission-deliverables").createSignedUrl(d.storage_url, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    return {
      ok: false,
      status: 502,
      message: "File unavailable.",
      log: `createSignedUrl failed for "${d.storage_url}": ${error?.message ?? "no data returned"}`,
    };
  }
  return { ok: true, url: data.signedUrl };
}

// Not implemented yet -- see MAPPER.md's Google Drive checkpoint. This
// branch exists so a deliverable with storage_provider = 'google_drive'
// fails clearly (visible error) instead of silently, and so the API route
// doesn't need to change again once Drive access is wired in here.
async function getGoogleDriveDownloadUrl(d: StorageBackedDeliverable): Promise<DownloadUrlResult> {
  if (!d.external_file_id) {
    return { ok: false, status: 422, message: "File unavailable.", log: "google_drive-backed deliverable has no external_file_id" };
  }
  return {
    ok: false,
    status: 501,
    message: "This file is stored in Google Drive and isn't downloadable from here yet.",
    log: `google_drive download requested for external_file_id ${d.external_file_id} -- provider not implemented`,
  };
}
