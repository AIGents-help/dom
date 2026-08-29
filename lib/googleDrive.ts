// Server-only, read-only Google Drive access for the Next.js app. The
// worker (services/mapper-worker/src/googleDrive.ts) owns folder
// creation/uploads — this side only ever streams a single already-known
// file id back through an authorized proxy route, never lists/creates
// folders and never runs client-side (the service account key must never
// reach the browser).
import { google } from "googleapis";
import type { Readable } from "node:stream";

export function isGoogleDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY);
}

let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;

function getDrive() {
  if (!cachedAuth) {
    cachedAuth = new google.auth.JWT({
      email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      key: (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
  }
  return google.drive({ version: "v3", auth: cachedAuth });
}

export interface DriveFileStream {
  stream: Readable;
  mimeType: string;
  name: string;
  size: number | null;
}

// Streams a private Drive file's bytes without ever making it public — the
// service account is the only identity that can read it, and this function
// is only ever called from a route that has already authorized the pilot
// against the deliverable (see the download/file route).
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
