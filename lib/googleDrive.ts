// Server-only Google Drive access for the Next.js app. The worker
// (services/mapper-worker/src/googleDrive.ts) owns folder creation/
// uploads — this side only ever streams a single already-known file id
// back through an authorized proxy route, never lists/creates folders and
// never runs client-side (OAuth credentials must never reach the browser).
//
// Auth: OAuth 2.0 on behalf of the DOM owner's own Google account — the
// same GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET/
// GOOGLE_DRIVE_REFRESH_TOKEN the worker uses (one owner account, one token,
// see services/mapper-worker/README.md). A refresh token's scope is fixed
// at the interactive-consent step that minted it (full `drive`, so the
// worker side can write) — there's no way to further narrow it per call
// site, so this side reuses it as-is for reads. A Workspace service
// account is kept as an optional fallback auth mode, matching the worker.
import { google } from "googleapis";
import type { Readable } from "node:stream";

export type DriveAuthMode = "oauth_user" | "service_account" | "unconfigured";

export function driveAuthMode(): DriveAuthMode {
  if (process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) return "oauth_user";
  if (process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY) return "service_account";
  return "unconfigured";
}

export function isGoogleDriveConfigured(): boolean {
  return driveAuthMode() !== "unconfigured";
}

let cachedDrive: ReturnType<typeof google.drive> | null = null;

function getDrive() {
  if (cachedDrive) return cachedDrive;

  const mode = driveAuthMode();
  if (mode === "oauth_user") {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    cachedDrive = google.drive({ version: "v3", auth });
    return cachedDrive;
  }
  if (mode === "service_account") {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      key: (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    cachedDrive = google.drive({ version: "v3", auth });
    return cachedDrive;
  }
  throw new Error("Google Drive is not configured.");
}

export interface DriveFileStream {
  stream: Readable;
  mimeType: string;
  name: string;
  size: number | null;
}

// Streams a private Drive file's bytes without ever making it public — only
// the DOM owner's own authorized identity (or the fallback service
// account) can read it, and this function is only ever called from a route
// that has already authorized the pilot against the deliverable (see the
// download/file route).
export async function getDriveFileStream(fileId: string): Promise<DriveFileStream> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "name, mimeType, size", supportsAllDrives: true });
  const media = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
  return {
    stream: media.data as unknown as Readable,
    mimeType: meta.data.mimeType || "application/octet-stream",
    name: meta.data.name || "download",
    size: meta.data.size ? Number(meta.data.size) : null,
  };
}
