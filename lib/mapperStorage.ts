import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isGoogleDriveConfigured } from "@/lib/googleDrive";
import { signDownloadToken } from "@/lib/downloadToken";

// Server-only. Resolves a deliverable row to a short-lived download URL,
// branching on storage_provider so the Mapping UI/API never hard-code
// Supabase Storage -- adding a google_drive-backed deliverable later means
// filling in that branch here, not touching any component or route.
// Every non-happy path returns a generic, safe message for the browser
// plus a detailed `log` string for the caller to console.error server-side
// -- the service-role client and any provider error detail never reach
// the client.

export interface StorageBackedDeliverable {
  id: string;
  storage_url: string | null;
  storage_provider?: string | null;
  external_file_id?: string | null;
}

export type DownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message: string; log: string };

const SIGNED_URL_TTL_SECONDS = 300;

export async function getDeliverableDownloadUrl(d: StorageBackedDeliverable, projectId: string): Promise<DownloadUrlResult> {
  const provider = d.storage_provider ?? "supabase";

  if (provider === "google_drive") {
    return getGoogleDriveDownloadUrl(d, projectId);
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

// Drive files are private (never made public — see googleDrive.ts), so a
// direct Drive link isn't usable from the browser. Instead this mints a
// short-lived signed token for the sibling streaming-proxy route
// (download/file/route.ts), which fetches the file server-side with the
// service account and pipes the bytes through -- the service account
// credentials never reach the browser, and window.open() (which can't
// carry an Authorization header) still works because the token travels in
// the query string instead.
async function getGoogleDriveDownloadUrl(d: StorageBackedDeliverable, projectId: string): Promise<DownloadUrlResult> {
  if (!d.external_file_id) {
    return { ok: false, status: 422, message: "File unavailable.", log: "google_drive-backed deliverable has no external_file_id" };
  }
  if (!isGoogleDriveConfigured()) {
    return {
      ok: false,
      status: 501,
      message: "This file is stored in Google Drive and Drive access isn't configured on this deployment yet.",
      log: "google_drive download requested but GOOGLE_DRIVE_CLIENT_EMAIL/GOOGLE_DRIVE_PRIVATE_KEY are not set",
    };
  }
  const { exp, sig } = signDownloadToken(d.id);
  return { ok: true, url: `/api/pilot/mapping/projects/${projectId}/deliverables/${d.id}/download/file?exp=${exp}&sig=${sig}` };
}
